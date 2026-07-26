-- ============================================================
-- Cliniflow — Políticas RLS (estado REAL em 2026-07-26)
-- Projeto: mxvaufkqijdkapvtkvee
--
-- ⚠️ ESTE É O ESTADO ATUAL, NÃO O ESTADO DESEJADO.
-- Sete tabelas estão abertas para a chave anon (que é pública: está no
-- config.js servido ao browser e hardcoded em nós do n8n).
-- Verificado empiricamente com a anon key: patients e mensagem_logs
-- retornaram linhas reais de paciente.
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
