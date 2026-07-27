// supabase/functions/status-evolution/index.ts
// Verifica o status da instância Evolution direto do servidor (evita expor a
// evolution_apikey no browser e evita CORS de um webhook n8n que não existe).
// Deploy: supabase functions deploy status-evolution

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Mesmo host usado pelo n8n no nó "Enviar via Evolution API1" (workflow
// snHQtmgTKLgQEpqk) — não é segredo, só a apikey da instância é.
const EVOLUTION_BASE_URL = 'https://n8n-evolution-evo-go.1qkdsj.easypanel.host';

async function logErro(supabase: any, ponto: string, mensagem: string) {
  try {
    await supabase.from('logs_erro').insert({
      origem: 'edge',
      workflow_name: 'status-evolution',
      node_name: ponto,
      error_message: String(mensagem).slice(0, 2000),
    });
  } catch (_) { /* logar erro não pode gerar erro */ }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS });
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  try {
    const { data: clinic, error: clinicErr } = await supabase
      .from('clinics')
      .select('evolution_instance, evolution_apikey')
      .limit(1)
      .maybeSingle();

    if (clinicErr || !clinic?.evolution_apikey) {
      await logErro(supabase, 'busca_clinica', clinicErr?.message || 'clínica sem evolution_apikey');
      return new Response(
        JSON.stringify({ ok: false, connected: false, error: 'Clínica/instância não configurada' }),
        { status: 200, headers: { ...CORS, 'Content-Type': 'application/json' } },
      );
    }

    const evoRes = await fetch(`${EVOLUTION_BASE_URL}/instance/status`, {
      headers: { apikey: clinic.evolution_apikey },
    });
    const evoData = await evoRes.json().catch(() => ({}));

    if (!evoRes.ok) {
      await logErro(supabase, 'evolution_status', `HTTP ${evoRes.status} de ${EVOLUTION_BASE_URL}/instance/status`);
    }

    // A doc registra a chave como "connected", mas a instância viva devolve "Connected"
    // (maiúsculo) — checa as duas para não repetir o erro.
    const connected = Boolean(evoData?.data?.Connected ?? evoData?.data?.connected);

    return new Response(
      JSON.stringify({
        ok: evoRes.ok,
        connected,
        instance: clinic.evolution_instance || null,
      }),
      { status: 200, headers: { ...CORS, 'Content-Type': 'application/json' } },
    );
  } catch (err) {
    await logErro(supabase, 'excecao', String(err));
    return new Response(
      JSON.stringify({ ok: false, connected: false, error: String(err) }),
      { status: 200, headers: { ...CORS, 'Content-Type': 'application/json' } },
    );
  }
});
