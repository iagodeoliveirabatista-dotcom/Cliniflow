// supabase/functions/enviar-whatsapp/index.ts
// Wrapper server-side para disparo de mensagens WhatsApp via n8n
// Deploy: supabase functions deploy enviar-whatsapp

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// logs_erro é o destino único de erro dos três componentes (n8n, edge, frontend).
// workflow_name/node_name são NOT NULL e mapeados ao nó do n8n; aqui viram slug da
// função e ponto de falha. Nunca deixa a falha de log derrubar o envio.
async function logErro(supabase: any, ponto: string, mensagem: string) {
  try {
    await supabase.from('logs_erro').insert({
      origem: 'edge',
      workflow_name: 'enviar-whatsapp',
      node_name: ponto,
      error_message: String(mensagem).slice(0, 2000),
    });
  } catch (_) { /* logar erro não pode gerar erro */ }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS });
  }

  try {
    const { 
      telefone, 
      mensagem, 
      tipo, 
      consulta_id, 
      nome_paciente,
      conversation_id,
      patient_id 
    } = await req.json();

    if (!telefone || !mensagem) {
      return new Response(
        JSON.stringify({ ok: false, error: 'telefone e mensagem são obrigatórios' }),
        { status: 400, headers: { ...CORS, 'Content-Type': 'application/json' } },
      );
    }

    // Inicializar Supabase com service role para gravar logs
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    const cleanPhone = telefone.replace(/\D/g, '');

    // Se for uma consulta com lembrete (não manual), abre a sessão de 16h no Supabase
    if (consulta_id) {
      const expiraEm = new Date(Date.now() + 16 * 60 * 60 * 1000); // 16 horas
      const telefoneFormatado = cleanPhone.startsWith('55') ? cleanPhone : '55' + cleanPhone;

      const { error: sessaoErr } = await supabase
        .from('sessoes_ativas')
        .upsert({
          telefone: telefoneFormatado,
          nome_paciente: nome_paciente || null,
          consulta_id: consulta_id,
          expira_em: expiraEm.toISOString(),
        });

      // Sem isto o erro é engolido: o lembrete sai, a sessão de 16h não abre, e o
      // "CONFIRMAR" do paciente cai no fluxo do agente em vez do de confirmação.
      if (sessaoErr) await logErro(supabase, 'abre_sessao_16h', sessaoErr.message);
    }

    // 1. Localiza ou cria o paciente no banco por telefone
    let resolvedPatientId = patient_id || null;
    let resolvedClinicId = 'd3b07384-ad6b-4f5c-9ab4-66e2854d88ad'; // Clínica Principal default

    if (!resolvedPatientId) {
      const { data: patData } = await supabase
        .from('patients')
        .select('id, clinic_id')
        .eq('telefone', cleanPhone)
        .maybeSingle();

      if (patData) {
        resolvedPatientId = patData.id;
        resolvedClinicId = patData.clinic_id || resolvedClinicId;
      } else {
        // Criar paciente
        const { data: newPatData } = await supabase
          .from('patients')
          .insert({
            nome: nome_paciente || 'Paciente',
            telefone: cleanPhone,
            clinic_id: resolvedClinicId,
            status: 'novo',
          })
          .select('id')
          .single();
        if (newPatData) {
          resolvedPatientId = newPatData.id;
        }
      }
    } else {
      const { data: patData } = await supabase
        .from('patients')
        .select('clinic_id')
        .eq('id', resolvedPatientId)
        .maybeSingle();
      if (patData) {
        resolvedClinicId = patData.clinic_id || resolvedClinicId;
      }
    }

    // 2. Localiza ou cria uma conversa ativa (open) para o paciente
    let resolvedConversationId = conversation_id || null;
    if (resolvedPatientId) {
      if (!resolvedConversationId) {
        const { data: convData } = await supabase
          .from('conversations')
          .select('id')
          .eq('patient_id', resolvedPatientId)
          .eq('status', 'open')
          .maybeSingle();

        if (convData) {
          resolvedConversationId = convData.id;
        } else {
          // Criar uma nova conversa aberta
          const { data: newConvData } = await supabase
            .from('conversations')
            .insert({
              patient_id: resolvedPatientId,
              clinic_id: resolvedClinicId,
              status: 'open',
            })
            .select('id')
            .single();
          if (newConvData) {
            resolvedConversationId = newConvData.id;
          }
        }
      }
    }

    // Registrar log como 'sending'
    const { data: logRow } = await supabase
      .from('mensagem_logs')
      .insert({
        conversation_id: resolvedConversationId,
        patient_id: resolvedPatientId,
        telefone: cleanPhone,
        mensagem,
        tipo: tipo || 'manual',
        direcao: 'saida',
        consulta_id: consulta_id || null,
        status: 'sending',
      })
      .select()
      .single();

    // Chamar webhook do n8n
    const n8nUrl = Deno.env.get('N8N_BASE_URL')!.replace(/\/$/, '');
    const n8nToken = Deno.env.get('N8N_TOKEN') || '';

    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (n8nToken) headers['Authorization'] = `Bearer ${n8nToken}`;

    const n8nRes = await fetch(`${n8nUrl}/webhook/enviar-mensagem`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ telefone: cleanPhone, mensagem, tipo }),
    });

    const n8nData = await n8nRes.json().catch(() => ({}));
    const evoMessageId = n8nData?.evo_message_id || n8nData?.key?.id || null;

    // Atualizar status do log
    const newStatus = n8nRes.ok ? 'sent' : 'failed';
    if (!n8nRes.ok) {
      await logErro(supabase, 'webhook_n8n', `HTTP ${n8nRes.status} ao enviar para ${n8nUrl}`);
    }
    if (logRow?.id) {
      await supabase
        .from('mensagem_logs')
        .update({ status: newStatus, evo_message_id: evoMessageId })
        .eq('id', logRow.id);
    }

    // Atualiza a data de atividade na conversa para subir no painel
    if (resolvedConversationId) {
      await supabase
        .from('conversations')
        .update({ last_activity_at: new Date().toISOString() })
        .eq('id', resolvedConversationId);
    }

    return new Response(
      JSON.stringify({ ok: n8nRes.ok, evo_message_id: evoMessageId, log_id: logRow?.id }),
      { status: n8nRes.ok ? 200 : 502, headers: { ...CORS, 'Content-Type': 'application/json' } },
    );
  } catch (err) {
    // Cliente próprio: o do bloco try está fora de escopo aqui.
    await logErro(
      createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!),
      'excecao',
      String(err),
    );
    return new Response(
      JSON.stringify({ ok: false, error: String(err) }),
      { status: 500, headers: { ...CORS, 'Content-Type': 'application/json' } },
    );
  }
});
