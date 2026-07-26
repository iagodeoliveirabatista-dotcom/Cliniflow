// supabase/functions/disparar-lembretes/index.ts
// Scheduler de lembretes automáticos via n8n
// Chamada via Supabase Cron (pg_cron) ou n8n Schedule Trigger
// Deploy: supabase functions deploy disparar-lembretes
//
// Configurar cron no Supabase SQL Editor:
//   select cron.schedule('disparar-lembretes', '0 * * * *', $$
//     select net.http_post(
//       url := '<SUPABASE_URL>/functions/v1/disparar-lembretes',
//       headers := '{"Authorization": "Bearer <ANON_KEY>"}'::jsonb
//     );
//   $$);

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    // Buscar configurações ativas de lembrete
    const { data: configs } = await supabase
      .from('config_automacao')
      .select('*')
      .eq('ativo', true);

    if (!configs || configs.length === 0) {
      return new Response(JSON.stringify({ ok: true, disparados: 0, motivo: 'nenhuma config ativa' }), {
        headers: { ...CORS, 'Content-Type': 'application/json' },
      });
    }

    const agora = new Date();
    let totalDisparados = 0;
    const erros: string[] = [];

    for (const config of configs) {
      // Calcular janela de envio baseada na antecedência configurada
      const horasAntes = config.antecedencia_horas || 24;
      const inicioJanela = new Date(agora.getTime() + horasAntes * 60 * 60 * 1000);
      const fimJanela = new Date(inicioJanela.getTime() + 60 * 60 * 1000); // +1h de tolerância

      // Buscar consultas na janela que ainda não receberam este tipo de lembrete
      const { data: consultas } = await supabase
        .from('consultas')
        .select(`
          id, data_hora, tipo, medico, status, preco,
          patient:patients (id, nome, telefone, email)
        `)
        .eq('whatsapp_ativo', true)
        .eq('status', 'pendente')
        .gte('data_hora', inicioJanela.toISOString())
        .lte('data_hora', fimJanela.toISOString());

      if (!consultas || consultas.length === 0) continue;

      // Filtrar as que já receberam lembrete deste tipo
      const { data: logsExistentes } = await supabase
        .from('mensagem_logs')
        .select('consulta_id')
        .eq('tipo', config.tipo_lembrete)
        .in('consulta_id', consultas.map(c => c.id));

      const jaEnviadas = new Set((logsExistentes || []).map(l => l.consulta_id));

      const disparos = consultas
        .filter(c => !jaEnviadas.has(c.id) && (c.patient as any)?.telefone)
        .map(async (consulta) => {
          const paciente = consulta.patient as { nome: string; telefone: string };
          
          const dataConsulta = new Date(consulta.data_hora);
          const dataFormatada = `${dataConsulta.getDate()}/${dataConsulta.getMonth() + 1}/${dataConsulta.getFullYear()}`;
          const horaFormatada = `${String(dataConsulta.getHours()).padStart(2,'0')}:${String(dataConsulta.getMinutes()).padStart(2,'0')}`;

          const mensagem = (config.template_mensagem || '')
            .replace(/{nome}/g, paciente.nome)
            .replace(/{data}/g, dataFormatada)
            .replace(/{hora}/g, horaFormatada)
            .replace(/{medico}/g, consulta.medico || 'seu médico')
            .replace(/{tipo}/g, consulta.tipo || 'consulta');

          const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
          const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

          try {
            const res = await fetch(`${supabaseUrl}/functions/v1/enviar-whatsapp`, {
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${serviceRoleKey}`,
                'apikey': serviceRoleKey,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                telefone: paciente.telefone,
                mensagem,
                tipo: config.tipo_lembrete,
                consulta_id: consulta.id,
                nome_paciente: paciente.nome,
              }),
            });

            if (res.ok) {
              totalDisparados++;
            } else {
              const bodyText = await res.text().catch(() => '');
              erros.push(`consulta ${consulta.id}: HTTP ${res.status} - ${bodyText}`);
            }
          } catch (err) {
            erros.push(`consulta ${consulta.id}: ${String(err)}`);
          }
        });

      await Promise.all(disparos);
    }

    return new Response(
      JSON.stringify({ ok: true, disparados: totalDisparados, erros }),
      { headers: { ...CORS, 'Content-Type': 'application/json' } },
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ ok: false, error: String(err) }),
      { status: 500, headers: { ...CORS, 'Content-Type': 'application/json' } },
    );
  }
});
