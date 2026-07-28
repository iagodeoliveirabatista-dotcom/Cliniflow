-- ============================================================
-- Cliniflow — Políticas RLS (estado REAL em 2026-07-28)
-- Projeto: mxvaufkqijdkapvtkvee
--
-- ⚠️ ESTE É O ESTADO ATUAL, NÃO O ESTADO DESEJADO.
-- Oito tabelas continuam abertas para a chave anon (que é pública: está no
-- config.js servido ao browser e hardcoded em nós do n8n).
-- Verificado empiricamente com a anon key: patients e mensagem_logs
-- retornaram linhas reais de paciente.
--
-- ⚠️⚠️ RLS DE TABELA NÃO É A HISTÓRIA TODA. Antes de concluir que algo está
-- protegido, cheque também views e funções SECURITY DEFINER — elas passam por
-- cima do RLS por definição. Duas passagens assim foram fechadas em 28/07/2026
-- (seção no fim deste arquivo). Ver ARMADILHAS.md §16 e §17.
--
-- O roteiro de fechamento, pronto para colar, está em 04-fechamento-rls.sql.
-- ============================================================


-- ── TABELAS FECHADAS (RLS on, nenhuma policy = anon não acessa) ──
-- Estas dependem da credencial Supabase do n8n (service_role) para funcionar.
ALTER TABLE public.clinics            ENABLE ROW LEVEL SECURITY;  -- protege evolution_apikey ✅
ALTER TABLE public.documentos_clinica ENABLE ROW LEVEL SECURITY;  -- ✅
ALTER TABLE public.whatsapp_buffer    ENABLE ROW LEVEL SECURITY;  -- acessada via RPC SECURITY DEFINER ✅
ALTER TABLE public.n8n_chat_histories ENABLE ROW LEVEL SECURITY;  -- ✅
ALTER TABLE public.pagina_captura     ENABLE ROW LEVEL SECURITY;  -- ✅


-- ── TABELAS ABERTAS PARA anon (RISCO LGPD) ──────────────────
-- ❌ Dados de saúde acessíveis por qualquer um com a chave pública.

ALTER TABLE public.patients ENABLE ROW LEVEL SECURITY;
CREATE POLICY patients_allow_all ON public.patients
  FOR ALL USING (true) WITH CHECK (true);

ALTER TABLE public.consultas ENABLE ROW LEVEL SECURITY;
CREATE POLICY consultas_allow_all ON public.consultas
  FOR ALL USING (true) WITH CHECK (true);

ALTER TABLE public.mensagem_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY mensagem_logs_allow_all ON public.mensagem_logs
  FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow anon insert mensagem_logs" ON public.mensagem_logs
  FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow anon select mensagem_logs" ON public.mensagem_logs
  FOR SELECT USING (true);

ALTER TABLE public.sessoes_ativas ENABLE ROW LEVEL SECURITY;
CREATE POLICY sessoes_ativas_allow_all ON public.sessoes_ativas
  FOR ALL USING (true) WITH CHECK (true);

ALTER TABLE public.historico_confirmacoes ENABLE ROW LEVEL SECURITY;
CREATE POLICY hist_conf_allow_all ON public.historico_confirmacoes
  FOR ALL USING (true) WITH CHECK (true);

ALTER TABLE public.logs_erro ENABLE ROW LEVEL SECURITY;
CREATE POLICY logs_erro_allow_all ON public.logs_erro
  FOR ALL USING (true) WITH CHECK (true);

ALTER TABLE public.config_automacao ENABLE ROW LEVEL SECURITY;
CREATE POLICY config_auto_allow_all ON public.config_automacao
  FOR ALL USING (true) WITH CHECK (true);

ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow anon select conversations" ON public.conversations
  FOR SELECT USING (true);
CREATE POLICY "Allow anon update conversations" ON public.conversations
  FOR UPDATE USING (true);
CREATE POLICY "Allow anon insert conversations" ON public.conversations
  FOR INSERT WITH CHECK (true);


-- ── APLICADO EM 28/07/2026 ──────────────────────────────────

-- Vínculo conta ↔ clínica. A policy usa a função, NUNCA a própria tabela
-- (senão o Postgres entra em recursão infinita — plano §3.1).
ALTER TABLE public.clinic_users ENABLE ROW LEVEL SECURITY;
CREATE POLICY clinic_users_self ON public.clinic_users
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());


-- ── VAZAMENTOS QUE NÃO PASSAVAM PELO RLS (fechados em 28/07/2026) ──
--
-- 1) As 4 views kpi_* eram SECURITY DEFINER (default do Postgres para views),
--    então ignoravam o RLS de `consultas` e `patients`. A kpi_retencao entregava
--    nome + telefone + convenio + histórico de sessões para a chave anon.
ALTER VIEW public.kpi_comparecimento     SET (security_invoker = on);
ALTER VIEW public.kpi_resumo_mensal      SET (security_invoker = on);
ALTER VIEW public.kpi_sessoes_dia_semana SET (security_invoker = on);
ALTER VIEW public.kpi_retencao           SET (security_invoker = on);
-- No-op enquanto as policies forem USING(true); fecha sozinho no dia do
-- fechamento. Escolhido em vez de revogar o SELECT de anon porque revogar
-- quebraria a aba de Relatórios hoje (sem login). Ver DECISIONS.md D-10.
--
-- 2) A RPC process_secretary_message devolvia clinics.evolution_apikey para
--    quem chamasse. Grants corrigidos em 02-functions-triggers.sql.
--    `clinics` estar com RLS e zero policy NÃO impedia isso.


-- ============================================================
-- ALVO (Tarefa 2 do roadmap — NÃO aplicado ainda)
-- Depende de Supabase Auth no CRM, mapeando cada usuário a um clinic_id.
-- Enquanto isso não existir, o CRM não tem como se autenticar e as
-- policies acima não podem ser fechadas sem derrubar o frontend.
-- Esboço:
--
--   CREATE POLICY patients_por_clinica ON public.patients
--     FOR ALL TO authenticated
--     USING (clinic_id = (auth.jwt() -> 'app_metadata' ->> 'clinic_id')::uuid);
--
-- e revogar o acesso da role anon.
-- ============================================================
