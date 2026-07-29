-- ============================================================
-- Cliniflow — Políticas RLS (estado REAL em 2026-07-28, pós-fechamento)
-- Projeto: mxvaufkqijdkapvtkvee
--
-- Reconstruído por introspecção de pg_policy. Este arquivo descreve o que
-- ESTÁ no banco. Se você mudar policy, REGRAVE ESTE ARQUIVO.
--
-- ✅ O fechamento foi concluído e verificado em 28/07/2026:
--    a chave anon pública (config.js) não alcança mais dado de paciente.
--    O roteiro que foi executado está em 04-fechamento-rls.sql (já rodado).
--
-- ⚠️⚠️ RLS DE TABELA NÃO É A HISTÓRIA TODA. Antes de concluir que algo está
-- protegido, cheque também views e funções SECURITY DEFINER — elas passam por
-- cima do RLS por definição. Duas passagens assim já vazaram aqui.
-- Ver ARMADILHAS.md §16 e §17.
-- ============================================================


-- ── TABELAS SEM POLICY (RLS on, ninguém além de service_role acessa) ──
-- É o estado mais fechado possível. O n8n opera nelas com service_role,
-- que ignora RLS. NÃO crie policy aqui sem um motivo forte.
ALTER TABLE public.clinics            ENABLE ROW LEVEL SECURITY;  -- guarda evolution_apikey
ALTER TABLE public.documentos_clinica ENABLE ROW LEVEL SECURITY;  -- base RAG
ALTER TABLE public.whatsapp_buffer    ENABLE ROW LEVEL SECURITY;  -- via RPC SECURITY DEFINER
ALTER TABLE public.n8n_chat_histories ENABLE ROW LEVEL SECURITY;  -- memória do agente
ALTER TABLE public.pagina_captura     ENABLE ROW LEVEL SECURITY;  -- landing page


-- ── ISOLAMENTO POR CLÍNICA ──────────────────────────────────
-- Todas usam public.auth_clinic_id() (SECURITY DEFINER — ver 02-functions).
-- Todas são FOR ALL TO authenticated: a role anon não tem policy nenhuma,
-- logo não lê nem escreve.

ALTER TABLE public.clinic_users ENABLE ROW LEVEL SECURITY;
CREATE POLICY clinic_users_self ON public.clinic_users
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());
-- Usa auth.uid(), NUNCA consulta clinic_users — senão o Postgres entra em
-- recursão infinita (plano §3.1).

ALTER TABLE public.patients ENABLE ROW LEVEL SECURITY;
CREATE POLICY patients_por_clinica ON public.patients
  FOR ALL TO authenticated
  USING      (clinic_id = public.auth_clinic_id())
  WITH CHECK (clinic_id = public.auth_clinic_id());

ALTER TABLE public.consultas ENABLE ROW LEVEL SECURITY;
CREATE POLICY consultas_por_clinica ON public.consultas
  FOR ALL TO authenticated
  USING      (clinic_id = public.auth_clinic_id())
  WITH CHECK (clinic_id = public.auth_clinic_id());

ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;
CREATE POLICY conversations_por_clinica ON public.conversations
  FOR ALL TO authenticated
  USING      (clinic_id = public.auth_clinic_id())
  WITH CHECK (clinic_id = public.auth_clinic_id());

-- mensagem_logs NÃO tem clinic_id: isola por join com conversations.
-- ⚠️ Linha com conversation_id NULL fica invisível para todo mundo.
--    Conferido em 28/07: zero linhas nessa situação.
ALTER TABLE public.mensagem_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY mensagem_logs_por_clinica ON public.mensagem_logs
  FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.conversations c
    WHERE c.id = mensagem_logs.conversation_id
      AND c.clinic_id = public.auth_clinic_id()
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.conversations c
    WHERE c.id = mensagem_logs.conversation_id
      AND c.clinic_id = public.auth_clinic_id()
  ));
-- Esta policy é o que fecha "qualquer um com a chave pública faz o WhatsApp da
-- clínica mandar mensagem": o trigger secretary_message_trigger dispara em
-- INSERT com tipo='manual' AND direcao='saida'. Sem INSERT anônimo, a porta some.

-- sessoes_ativas NÃO tem clinic_id, e patient_id não é preenchido pelo n8n.
-- O join é por telefone porque os formatos não casam (11 vs 13 díg — §3).
ALTER TABLE public.sessoes_ativas ENABLE ROW LEVEL SECURITY;
CREATE POLICY sessoes_ativas_por_clinica ON public.sessoes_ativas
  FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.patients p
    WHERE p.clinic_id = public.auth_clinic_id()
      AND right(regexp_replace(sessoes_ativas.telefone, '\D', '', 'g'), 11)
        = right(regexp_replace(p.telefone, '\D', '', 'g'), 11)
  ))
  WITH CHECK (true);
-- Se um dia o n8n gravar patient_id, troque por join direto e mate a
-- comparação por string.


-- ── OPERACIONAIS (sem clinic_id — liberadas para qualquer authenticated) ──
-- ⚠️ NÃO as deixe sem policy. O plano original mandava só dropar, e isso
-- QUEBRA o CRM: fetchSaudeSistema() lê logs_erro (é o único lugar onde erro
-- aparece hoje) e a aba Automações lê/escreve config_automacao.
-- Com uma clínica só (D-6) liberar para authenticated é suficiente.
-- Revisar quando entrar a 2ª clínica.

ALTER TABLE public.logs_erro ENABLE ROW LEVEL SECURITY;
CREATE POLICY logs_erro_leitura ON public.logs_erro
  FOR SELECT TO authenticated USING (true);

ALTER TABLE public.config_automacao ENABLE ROW LEVEL SECURITY;
CREATE POLICY config_automacao_rw ON public.config_automacao
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

ALTER TABLE public.historico_confirmacoes ENABLE ROW LEVEL SECURITY;
CREATE POLICY historico_leitura ON public.historico_confirmacoes
  FOR SELECT TO authenticated USING (true);


-- ── VIEWS: os KPIs respeitam o RLS desde 28/07/2026 ─────────
-- Eram SECURITY DEFINER (default do Postgres para views), então ignoravam o
-- RLS de consultas/patients. A kpi_retencao entregava nome + telefone +
-- convenio + histórico de sessões para a chave anon. Ver ARMADILHAS.md §16.
ALTER VIEW public.kpi_comparecimento     SET (security_invoker = on);
ALTER VIEW public.kpi_resumo_mensal      SET (security_invoker = on);
ALTER VIEW public.kpi_sessoes_dia_semana SET (security_invoker = on);
ALTER VIEW public.kpi_retencao           SET (security_invoker = on);

-- Segunda tranca (defesa em profundidade): anon não tem mais SELECT nelas.
REVOKE ALL ON public.kpi_comparecimento     FROM anon;
REVOKE ALL ON public.kpi_resumo_mensal      FROM anon;
REVOKE ALL ON public.kpi_sessoes_dia_semana FROM anon;
REVOKE ALL ON public.kpi_retencao           FROM anon;


-- ── GRANTS DE FUNÇÃO ────────────────────────────────────────
-- Estão em 02-functions-triggers.sql, e importam tanto quanto as policies:
-- process_secretary_message devolvia clinics.evolution_apikey para quem
-- chamasse, contornando o fato de clinics não ter policy nenhuma.


-- ============================================================
-- CONFERÊNCIA (rode isto antes de acreditar neste arquivo)
-- ============================================================
-- SELECT c.relname, c.relrowsecurity,
--        coalesce(string_agg(p.polname, ' | '), 'SEM POLICY')
-- FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
-- LEFT JOIN pg_policy p ON p.polrelid = c.oid
-- WHERE n.nspname = 'public' AND c.relkind = 'r' GROUP BY 1,2 ORDER BY 1;
--
-- E o teste que importa de verdade — sem login, com a chave pública:
--   curl "https://mxvaufkqijdkapvtkvee.supabase.co/rest/v1/patients?select=*" \
--     -H "apikey: <ANON_KEY do config.js>"
--   esperado: []
