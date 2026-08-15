// supabase/functions/disparar-lembretes/index.ts
// Scheduler de lembretes automáticos de consulta.
// Chamada via Supabase Cron (pg_cron), de hora em hora.
// Deploy: supabase functions deploy disparar-lembretes
//
// Não passa pelo n8n: o envio é feito por `enviar-whatsapp`, que fala direto
// com a Graph API usando o TEMPLATE aprovado da Meta. Lembrete acontece
// sempre fora da janela de 24h, e ali a Cloud API recusa texto livre.
// O de-para lembrete -> template mora em `config_automacao`
// (`meta_template_nome`/`meta_template_idioma`/`meta_template_params`).
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

      // Buscar consultas na janela que ainda não receberam este tipo de lembrete.
      // O filtro por `clinic_id` é obrigatório: esta função roda com
      // service_role, que ATRAVESSA o RLS. Sem ele, a config de uma clínica
      // dispararia lembretes para as consultas de todas — com o template
      // aprovado só na WABA dela, que a Meta recusaria para as outras.
      // Ver docs/db/09-config-automacao-multi-tenant.sql.
      const { data: consultas } = await supabase
        .from('consultas')
        .select(`
          id, data_hora, tipo, medico, status, preco, clinic_id,
          patient:patients (id, nome, telefone, email)
        `)
        .eq('clinic_id', config.clinic_id)
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

          // Valores que alimentam TANTO o texto legível gravado no histórico
          // QUANTO os parâmetros do template aprovado na Meta — os dois têm
          // que contar a mesma história, senão o CRM mostra uma coisa e o
          // paciente recebe outra.
          const valores: Record<string, string> = {
            nome: paciente.nome,
            data: dataFormatada,
            hora: horaFormatada,
            medico: consulta.medico || 'seu médico',
            tipo: consulta.tipo || 'consulta',
          };

          const mensagem = (config.template_mensagem || '')
            .replace(/{nome}/g, valores.nome)
            .replace(/{data}/g, valores.data)
            .replace(/{hora}/g, valores.hora)
            .replace(/{medico}/g, valores.medico)
            .replace(/{tipo}/g, valores.tipo);

          // Lembrete é sempre fora da janela de 24h, e aí a Cloud API só
          // aceita template aprovado. Sem `meta_template_nome` configurado o
          // envio seria recusado pela Meta (131047), então nem tentamos:
          // falha explícita aqui é melhor que mensagem sumindo em silêncio.
          if (!config.meta_template_nome) {
            erros.push(
              `clinica ${config.clinic_id} / config ${config.tipo_lembrete}: sem meta_template_nome — lembrete fora da janela de 24h exige template aprovado`,
            );
            return;
          }

          // Só os parâmetros que ESTE template declara. Mandar a mais (ou a
          // menos) faz a Meta recusar por contagem de parâmetros (132000).
          const nomesParams: string[] = config.meta_template_params
            || Object.keys(valores).filter((k) => (config.template_mensagem || '').includes(`{${k}}`));
          const params: Record<string, string> = {};
          for (const k of nomesParams) params[k] = valores[k] ?? '';

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
                patient_id: (consulta.patient as any)?.id || null,
                clinic_id: consulta.clinic_id || null,
                template: {
                  nome: config.meta_template_nome,
                  idioma: config.meta_template_idioma || 'pt_BR',
                  params,
                },
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
