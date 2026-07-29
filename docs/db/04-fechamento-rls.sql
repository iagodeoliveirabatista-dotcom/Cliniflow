-- ============================================================
-- ✅ JÁ EXECUTADO — 28/07/2026. NÃO RODE DE NOVO.
--
-- Este roteiro foi aplicado e verificado no mesmo dia em que foi escrito.
-- O estado resultante está em 03-rls-policies.sql, que é o arquivo a ler
-- para saber como as policies estão HOJE.
--
-- Rodar de novo dá erro (as policies já existem) e o PASSO 0 duplicaria o
-- vínculo em clinic_users. Mantido no repo como REGISTRO do que foi feito,
-- e como modelo para quando entrar a 2ª clínica.
-- ============================================================
--
-- Cliniflow — ROTEIRO DE FECHAMENTO DO RLS
-- Escrito em 28/07/2026. Projeto: mxvaufkqijdkapvtkvee
--
-- Este arquivo era para EXECUTAR, um passo por vez, testando entre cada um.
-- NÃO cole o arquivo inteiro de uma vez. Fechar as oito de uma vez e depois
-- debugar é como este projeto já se enrolou antes (plano §3.5).
--
-- As etapas 1 e 2 do docs/plano-auth-rls.md JÁ ESTÃO APLICADAS:
--   ✅ clinic_users + auth_clinic_id()          (01-schema, 02-functions)
--   ✅ RPC criar_pre_agendamento                (02-functions)
--   ✅ views kpi_* com security_invoker         (03-rls-policies)
--   ✅ process_secretary_message fechada        (02-functions)
--
-- FALTA, e sem isso NADA abaixo funciona:
--   ⛔ a conta da clínica no Supabase Auth (PASSO 0)
--   ⛔ publicar o nó criar_pre_agendamento no n8n (ficou no rascunho — §5d)
-- ============================================================


-- ════════════════════════════════════════════════════════════
-- PASSO 0 — A CONTA. Nada disso funciona sem ela.
-- ════════════════════════════════════════════════════════════
-- No painel: Authentication → Add user → Create new user.
-- MARQUE "Auto Confirm User" (não há fluxo de confirmação por e-mail aqui).
-- Use um e-mail que a clínica controle, ex. recepcao@<clinica>.com.br
--
-- Depois, vincule (uma linha por clínica — DECISIONS.md D-6):

INSERT INTO public.clinic_users (user_id, clinic_id, nome, papel)
VALUES (
  '<COLE-O-UUID-DO-USUARIO-AQUI>',
  'baac9449-81fb-4432-92b9-bb10038147ac',  -- única clínica em 28/07/2026
  'Recepção',
  'admin'
);

-- CONFIRA ANTES DE SEGUIR — logado como esse usuário:
--   SELECT public.auth_clinic_id();
-- Tem que devolver baac9449-... Se devolver NULL, TODAS as policies abaixo
-- negam tudo e você vai debugar a tela achando que é o frontend.


-- ════════════════════════════════════════════════════════════
-- PRÉ-VOO — dado sem dono some da tela ao fechar.
-- Medido em 28/07/2026: TUDO ZERO. Nada a fazer de backfill.
-- Rode de novo mesmo assim, porque o sistema está recebendo tráfego real.
-- ════════════════════════════════════════════════════════════
SELECT
  (SELECT count(*) FROM public.patients      WHERE clinic_id IS NULL)       AS patients_orfaos,
  (SELECT count(*) FROM public.consultas     WHERE clinic_id IS NULL)       AS consultas_orfas,
  (SELECT count(*) FROM public.conversations WHERE clinic_id IS NULL)       AS conversas_orfas,
  (SELECT count(*) FROM public.mensagem_logs WHERE conversation_id IS NULL) AS msgs_sem_conversa;
-- Qualquer valor > 0 → faça o backfill ANTES. Linhas órfãs ficam invisíveis.


-- ════════════════════════════════════════════════════════════
-- OS DOIS TESTES. Rode os dois DEPOIS DE CADA PASSO abaixo.
-- ════════════════════════════════════════════════════════════
-- TESTE A (n8n / paciente):  mandar mensagem no WhatsApp da instância de teste
--   → o paciente é criado/encontrado, a IA responde, a resposta chega no CRM.
--   Em 28/07 isto foi observado funcionando, RAG inclusive. É a linha de base.
--
-- TESTE B (CRM / recepção):  logado, ver conversas e pacientes; mandar mensagem
--   manual; a bolha atualiza sozinha (WebSocket) e a IA fica muda depois.
--
-- ⚠️ O Realtime também respeita RLS. Se o chat parar de atualizar sem erro no
--    console, é a inscrição subindo sem JWT — plano §3.4.


-- ════════════════════════════════════════════════════════════
-- PASSO 1 — patients
-- ════════════════════════════════════════════════════════════
DROP POLICY IF EXISTS patients_allow_all ON public.patients;
CREATE POLICY patients_por_clinica ON public.patients
  FOR ALL TO authenticated
  USING      (clinic_id = public.auth_clinic_id())
  WITH CHECK (clinic_id = public.auth_clinic_id());
-- ROLLBACK: CREATE POLICY patients_allow_all ON public.patients FOR ALL USING (true) WITH CHECK (true);
-- → TESTE A + B


-- ════════════════════════════════════════════════════════════
-- PASSO 2 — conversations
-- ════════════════════════════════════════════════════════════
DROP POLICY IF EXISTS "Allow anon select conversations" ON public.conversations;
DROP POLICY IF EXISTS "Allow anon update conversations" ON public.conversations;
DROP POLICY IF EXISTS "Allow anon insert conversations" ON public.conversations;
CREATE POLICY conversations_por_clinica ON public.conversations
  FOR ALL TO authenticated
  USING      (clinic_id = public.auth_clinic_id())
  WITH CHECK (clinic_id = public.auth_clinic_id());
-- → TESTE A + B


-- ════════════════════════════════════════════════════════════
-- PASSO 3 — mensagem_logs  (não tem clinic_id: isola por join)
-- ════════════════════════════════════════════════════════════
DROP POLICY IF EXISTS mensagem_logs_allow_all ON public.mensagem_logs;
DROP POLICY IF EXISTS "Allow anon insert mensagem_logs" ON public.mensagem_logs;
DROP POLICY IF EXISTS "Allow anon select mensagem_logs" ON public.mensagem_logs;
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
-- ⚠️ Este passo é o que FECHA a porta de "qualquer um com a chave pública faz o
--    WhatsApp da clínica mandar mensagem": o trigger secretary_message_trigger
--    dispara em INSERT com tipo='manual' AND direcao='saida'. Sem o INSERT
--    anônimo, a porta some. Ver ARMADILHAS.md §16.
-- → TESTE A + B (mande uma mensagem manual pelo CRM — é o caminho que usa isto)


-- ════════════════════════════════════════════════════════════
-- PASSO 4 — consultas
-- ⚠️ NÃO FAÇA ESTE PASSO antes de publicar o nó criar_pre_agendamento no n8n.
--    Com o nó ainda apontando para /rest/v1/consultas com a chave anon, fechar
--    aqui mata a ferramenta da IA — e ela falha em SILÊNCIO. Ver ARMADILHAS §18.
-- ════════════════════════════════════════════════════════════
DROP POLICY IF EXISTS consultas_allow_all ON public.consultas;
CREATE POLICY consultas_por_clinica ON public.consultas
  FOR ALL TO authenticated
  USING      (clinic_id = public.auth_clinic_id())
  WITH CHECK (clinic_id = public.auth_clinic_id());
-- → TESTE A + B, e além disso: peça um agendamento pelo WhatsApp e confirme
--   que aparece uma linha 'solicitado' em consultas.


-- ════════════════════════════════════════════════════════════
-- PASSO 5 — sessoes_ativas  (não tem clinic_id; patient_id não é preenchido)
-- ════════════════════════════════════════════════════════════
DROP POLICY IF EXISTS sessoes_ativas_allow_all ON public.sessoes_ativas;
CREATE POLICY sessoes_ativas_por_clinica ON public.sessoes_ativas
  FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.patients p
    WHERE p.clinic_id = public.auth_clinic_id()
      AND right(regexp_replace(sessoes_ativas.telefone, '\D', '', 'g'), 11)
        = right(regexp_replace(p.telefone, '\D', '', 'g'), 11)
  ))
  WITH CHECK (true);
-- O join é por telefone porque os dois formatos não casam (11 vs 13 díg —
-- ARMADILHAS.md §3). A coluna patient_id EXISTE mas o n8n não preenche.
-- Se um dia o n8n gravar patient_id, troque por join direto e mate a
-- comparação por string.
-- → TESTE A + B (confirme que "IA Pausada" ainda acende ao assumir a conversa)


-- ════════════════════════════════════════════════════════════
-- PASSO 6 — operacionais
-- ⚠️ AQUI O PLANO ORIGINAL (§4.3) ESTÁ ERRADO. Ele manda só dropar as policies.
--    Isso QUEBRA o CRM: fetchSaudeSistema() lê logs_erro, a aba Automações lê e
--    escreve config_automacao, e há a aba de histórico. Sem policy para
--    authenticated, o painel "Saúde do sistema" — hoje o ÚNICO lugar onde erro
--    aparece (D-OPEN-3) — fica em branco e ninguém percebe.
--
-- Nenhuma das três tem clinic_id. Com uma clínica só (D-6), liberar para
-- qualquer authenticated é honesto e suficiente. Revisar quando entrar a 2ª.
-- ════════════════════════════════════════════════════════════
DROP POLICY IF EXISTS logs_erro_allow_all ON public.logs_erro;
CREATE POLICY logs_erro_leitura ON public.logs_erro
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS config_auto_allow_all ON public.config_automacao;
CREATE POLICY config_automacao_rw ON public.config_automacao
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS hist_conf_allow_all ON public.historico_confirmacoes;
CREATE POLICY historico_leitura ON public.historico_confirmacoes
  FOR SELECT TO authenticated USING (true);
-- → TESTE B, abrindo Automações → Status e a aba de histórico.


-- ════════════════════════════════════════════════════════════
-- PASSO 7 — limpeza final (defesa em profundidade)
-- Só depois que os 6 passos acima estiverem testados e estáveis.
-- ════════════════════════════════════════════════════════════
-- As views kpi_* já respeitam o RLS (security_invoker). Revogar o SELECT de
-- anon é a segunda tranca — agora é barato, porque o CRM está autenticado.
REVOKE ALL ON public.kpi_comparecimento     FROM anon;
REVOKE ALL ON public.kpi_resumo_mensal      FROM anon;
REVOKE ALL ON public.kpi_sessoes_dia_semana FROM anon;
REVOKE ALL ON public.kpi_retencao           FROM anon;
-- → TESTE B na aba Relatórios. Se quebrar, o login não está propagando o JWT.


-- ════════════════════════════════════════════════════════════
-- CRITÉRIOS DE SUCESSO — os 4 do plano §1. Rode TODOS no fim.
-- ════════════════════════════════════════════════════════════
-- 1) Sem login, com a chave anon pública → DEVE voltar vazio:
--    curl "https://mxvaufkqijdkapvtkvee.supabase.co/rest/v1/patients?select=*" \
--      -H "apikey: <ANON_KEY do config.js>"
--    esperado: []
--
-- 2) Logado como a conta da clínica → vê os pacientes daquela clínica.
-- 3) Uma conta de outra clínica NÃO vê os pacientes desta.
--    (com uma clínica só, dá para simular criando uma 2ª clínica + 2ª conta,
--     conferindo, e apagando as duas depois)
-- 4) O fluxo do n8n continua ponta a ponta: mensagem entra, IA responde com RAG.
--
-- Item 4 é o que costuma quebrar. Se quebrar, a suspeita nº 1 NÃO é a policy —
-- é a credencial do nó. Em 28/07/2026 ficou medido que os dois workflows usam
-- service_role (que ignora RLS), então nenhum deles deveria ser afetado.


-- ════════════════════════════════════════════════════════════
-- CONFERÊNCIA FINAL DO ESTADO
-- ════════════════════════════════════════════════════════════
SELECT c.relname AS tabela,
       c.relrowsecurity AS rls,
       coalesce(string_agg(p.polname, ' | '), '⛔ SEM POLICY') AS policies
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
LEFT JOIN pg_policy p ON p.polrelid = c.oid
WHERE n.nspname = 'public' AND c.relkind = 'r'
GROUP BY 1, 2 ORDER BY 1;

-- E os grants das funções SECURITY DEFINER (lembre: PUBLIC aparece como "=X"):
SELECT proname, coalesce(array_to_string(proacl, ' | '), 'sem ACL') AS acl
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.prosecdef ORDER BY 1;
