// supabase/functions/enviar-whatsapp/index.ts
// Envio de mensagem WhatsApp saindo do lado do Supabase.
// Deploy: supabase functions deploy enviar-whatsapp
//
// DOIS CAMINHOS, de propósito:
//
//   1. LEMBRETE (recebe `template`): fala DIRETO com a Graph API da Meta.
//      Fora da janela de 24h do atendimento a Cloud API recusa texto livre
//      (erro 131047) — só template aprovado passa, e lembrete é sempre fora
//      da janela. Não passa pelo n8n: o trigger `secretary_message_trigger`
//      só dispara para tipo='manual', então o lembrete nunca chegaria lá.
//
//   2. MANUAL (sem `template`): apenas grava em `mensagem_logs` com
//      tipo='manual'. O envio é feito pelo trigger do banco -> n8n
//      (`Cliniflow - Enviar Mensagem CRM`), que já resolve credenciais e
//      trava atômica via `process_secretary_message`. Esta função NÃO chama
//      esse webhook por fora: a versão antiga chamava sem `message_id`, a
//      RPC recebia NULL, devolvia vazio, e o envio ia para
//      `graph.facebook.com/v20.0/undefined/messages`. O efeito colateral era
//      pior que a falha: o trigger entregava a mensagem e esta função
//      marcava o log como 'failed' logo depois.

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const GRAPH_VERSION = 'v20.0';

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

// A Graph API exige o número internacional completo em "to".
// patients.telefone guarda 11 dígitos (DDD + número), sem o 55.
function telefoneE164(telefone: string): string {
  const d = String(telefone || '').replace(/\D/g, '');
  if (!d) return d;
  return d.startsWith('55') ? d : '55' + d;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS });
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  try {
    const {
      telefone,
      mensagem,
      tipo,
      consulta_id,
      nome_paciente,
      conversation_id,
      patient_id,
      clinic_id,
      // { nome, idioma, params: { nome: 'Iago', data: '11/8/2026', ... } }
      template,
    } = await req.json();

    if (!telefone || !mensagem) {
      return new Response(
        JSON.stringify({ ok: false, error: 'telefone e mensagem são obrigatórios' }),
        { status: 400, headers: { ...CORS, 'Content-Type': 'application/json' } },
      );
    }

    const cleanPhone = telefoneE164(telefone);

    // Se for uma consulta com lembrete (não manual), abre a sessão de 16h no Supabase
    if (consulta_id) {
      const expiraEm = new Date(Date.now() + 16 * 60 * 60 * 1000); // 16 horas

      const { error: sessaoErr } = await supabase
        .from('sessoes_ativas')
        .upsert({
          telefone: cleanPhone,
          nome_paciente: nome_paciente || null,
          consulta_id: consulta_id,
          expira_em: expiraEm.toISOString(),
        });

      // Sem isto o erro é engolido: o lembrete sai, a sessão de 16h não abre, e o
      // "CONFIRMAR" do paciente cai no fluxo do agente em vez do de confirmação.
      if (sessaoErr) await logErro(supabase, 'abre_sessao_16h', sessaoErr.message);
    }

    // 1. Localiza o paciente e, com ele, a clínica dona da conversa.
    // O telefone é gravado em `patients` com 11 dígitos, então a busca usa os
    // 11 finais — cleanPhone já está normalizado para 13.
    const telefoneCurto = cleanPhone.replace(/^55/, '');
    let resolvedPatientId = patient_id || null;
    let resolvedClinicId = clinic_id || null;

    if (!resolvedPatientId) {
      const { data: patData } = await supabase
        .from('patients')
        .select('id, clinic_id')
        .eq('telefone', telefoneCurto)
        .maybeSingle();

      if (patData) {
        resolvedPatientId = patData.id;
        resolvedClinicId = resolvedClinicId || patData.clinic_id;
      }
    } else {
      const { data: patData } = await supabase
        .from('patients')
        .select('clinic_id')
        .eq('id', resolvedPatientId)
        .maybeSingle();
      if (patData) resolvedClinicId = resolvedClinicId || patData.clinic_id;
    }

    // A versão antiga tinha um clinic_id fixo no código como fallback
    // ('d3b07384-…'), de uma clínica que não existe mais. Paciente criado por
    // esse caminho nascia apontando para o nada e sumia do CRM (o RLS filtra
    // por clínica). Agora: só cai no fallback se existir exatamente UMA
    // clínica; havendo dúvida, falha explícita em vez de inventar vínculo.
    if (!resolvedClinicId) {
      const { data: clinicas } = await supabase.from('clinics').select('id').limit(2);
      if (clinicas && clinicas.length === 1) {
        resolvedClinicId = clinicas[0].id;
      } else {
        const detalhe = `telefone ${cleanPhone} não tem paciente cadastrado e a clínica não foi informada (${clinicas?.length ?? 0} clínicas no banco)`;
        await logErro(supabase, 'resolve_clinica', detalhe);
        return new Response(
          JSON.stringify({ ok: false, error: detalhe }),
          { status: 422, headers: { ...CORS, 'Content-Type': 'application/json' } },
        );
      }
    }

    if (!resolvedPatientId) {
      const { data: newPatData, error: patErr } = await supabase
        .from('patients')
        .insert({
          nome: nome_paciente || 'Paciente',
          telefone: telefoneCurto,
          clinic_id: resolvedClinicId,
          status: 'novo',
        })
        .select('id')
        .single();
      if (patErr) await logErro(supabase, 'cria_paciente', patErr.message);
      if (newPatData) resolvedPatientId = newPatData.id;
    }

    // 2. Localiza ou cria uma conversa ativa (open) para o paciente
    let resolvedConversationId = conversation_id || null;
    if (resolvedPatientId && !resolvedConversationId) {
      const { data: convData } = await supabase
        .from('conversations')
        .select('id')
        .eq('patient_id', resolvedPatientId)
        .eq('status', 'open')
        .maybeSingle();

      if (convData) {
        resolvedConversationId = convData.id;
      } else {
        const { data: newConvData } = await supabase
          .from('conversations')
          .insert({
            patient_id: resolvedPatientId,
            clinic_id: resolvedClinicId,
            status: 'open',
          })
          .select('id')
          .single();
        if (newConvData) resolvedConversationId = newConvData.id;
      }
    }

    // 3. Grava o log. tipo='manual' faz o trigger do banco assumir o envio;
    // qualquer outro tipo (lembrete) é enviado aqui mesmo, logo abaixo.
    const tipoFinal = tipo || 'manual';
    const { data: logRow } = await supabase
      .from('mensagem_logs')
      .insert({
        conversation_id: resolvedConversationId,
        patient_id: resolvedPatientId,
        telefone: cleanPhone,
        mensagem,
        tipo: tipoFinal,
        direcao: 'saida',
        consulta_id: consulta_id || null,
        status: template ? 'sending' : 'pending',
      })
      .select()
      .single();

    if (resolvedConversationId) {
      await supabase
        .from('conversations')
        .update({ last_activity_at: new Date().toISOString() })
        .eq('id', resolvedConversationId);
    }

    // ── CAMINHO MANUAL ────────────────────────────────────────────────────
    // Nada mais a fazer: o trigger `secretary_message_trigger` já disparou no
    // INSERT acima e o n8n atualiza o status para 'sent'/'failed'.
    if (!template) {
      return new Response(
        JSON.stringify({ ok: true, log_id: logRow?.id, via: 'trigger' }),
        { headers: { ...CORS, 'Content-Type': 'application/json' } },
      );
    }

    // ── CAMINHO LEMBRETE (TEMPLATE) ───────────────────────────────────────
    const { data: clinica } = await supabase
      .from('clinics')
      .select('meta_access_token, meta_phone_number_id')
      .eq('id', resolvedClinicId)
      .maybeSingle();

    if (!clinica?.meta_access_token || !clinica?.meta_phone_number_id) {
      const detalhe = `clínica ${resolvedClinicId} está sem meta_access_token/meta_phone_number_id`;
      await logErro(supabase, 'credenciais_meta', detalhe);
      if (logRow?.id) {
        await supabase.from('mensagem_logs').update({ status: 'failed' }).eq('id', logRow.id);
      }
      return new Response(
        JSON.stringify({ ok: false, error: detalhe }),
        { status: 422, headers: { ...CORS, 'Content-Type': 'application/json' } },
      );
    }

    // Os templates aprovados usam parâmetros NOMEADOS, então cada parâmetro
    // vai com `parameter_name` — posicional seria recusado pela Meta.
    const parametros = Object.entries(template.params || {}).map(([nome, valor]) => ({
      type: 'text',
      parameter_name: nome,
      text: String(valor ?? ''),
    }));

    const payload: Record<string, unknown> = {
      messaging_product: 'whatsapp',
      to: cleanPhone,
      type: 'template',
      template: {
        name: template.nome,
        // Idioma do template NA META, que não é necessariamente o idioma do
        // texto: `consulta_amanha` foi aprovado como "en" com corpo em
        // português. Mandar pt_BR nele devolve erro 132001.
        language: { code: template.idioma || 'pt_BR' },
        ...(parametros.length > 0
          ? { components: [{ type: 'body', parameters: parametros }] }
          : {}),
      },
    };

    const metaRes = await fetch(
      `https://graph.facebook.com/${GRAPH_VERSION}/${clinica.meta_phone_number_id}/messages`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${clinica.meta_access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      },
    );

    const metaData = await metaRes.json().catch(() => ({}));
    const wamid = metaData?.messages?.[0]?.id || null;

    if (!metaRes.ok) {
      // O corpo do erro da Meta é o que diz o motivo real (template errado,
      // idioma errado, janela de 24h) — sem ele o diagnóstico vira adivinhação.
      await logErro(
        supabase,
        'envio_template_meta',
        `HTTP ${metaRes.status} template=${template.nome} idioma=${template.idioma}: ${JSON.stringify(metaData).slice(0, 1200)}`,
      );
    }

    if (logRow?.id) {
      await supabase
        .from('mensagem_logs')
        .update({ status: metaRes.ok ? 'sent' : 'failed', evo_message_id: wamid })
        .eq('id', logRow.id);
    }

    return new Response(
      JSON.stringify({
        ok: metaRes.ok,
        wamid,
        log_id: logRow?.id,
        via: 'template',
        ...(metaRes.ok ? {} : { meta_error: metaData }),
      }),
      { status: metaRes.ok ? 200 : 502, headers: { ...CORS, 'Content-Type': 'application/json' } },
    );
  } catch (err) {
    await logErro(supabase, 'excecao', String(err));
    return new Response(
      JSON.stringify({ ok: false, error: String(err) }),
      { status: 500, headers: { ...CORS, 'Content-Type': 'application/json' } },
    );
  }
});
