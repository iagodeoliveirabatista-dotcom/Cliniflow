-- 09-config-automacao-multi-tenant.sql
-- Aplicado em 15/08/2026 (migration `config_automacao_multi_tenant`).
--
-- POR QUE ISTO EXISTE
-- `config_automacao` era a única tabela de dado operacional SEM `clinic_id`.
-- As 5 linhas eram globais: valiam para todas as clínicas ao mesmo tempo.
-- Com uma clínica isso é invisível; na segunda vira três problemas de uma vez:
--
--   1. VAZAMENTO. A policy era `config_automacao_rw ALL TO authenticated
--      USING (true) WITH CHECK (true)`. Qualquer usuário logado de qualquer
--      clínica lia E ESCREVIA a config de todas — inclusive desligar o lembrete
--      da concorrente. Mesmo padrão do buraco que o D-13 fechou nas outras
--      tabelas; esta ficou para trás porque ninguém tinha olhado para ela.
--
--   2. TEMPLATE É POR WABA, NÃO GLOBAL. `meta_template_nome` guarda o nome de um
--      template aprovado na WABA de UMA clínica. A clínica B não tem
--      `consulta_amanha` aprovado na WABA dela — o envio seria recusado. Uma
--      config global obriga todas as clínicas a fingirem ter os mesmos
--      templates, o que é falso por construção.
--
--   3. ANTECEDÊNCIA COMPARTILHADA. Clínica B não conseguia escolher a própria
--      janela nem desligar o lembrete sem desligar o da clínica A.
--
-- O envio em si JÁ era por clínica: `enviar-whatsapp` resolve `clinic_id` pela
-- consulta/paciente e usa `meta_access_token`/`meta_phone_number_id` daquela
-- clínica. O buraco era só a configuração.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. A coluna
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.config_automacao
  ADD COLUMN IF NOT EXISTS clinic_id uuid REFERENCES public.clinics(id) ON DELETE CASCADE;

-- Backfill: existe exatamente uma clínica hoje, então as 5 linhas são dela.
-- Não é `limit 1` arbitrário — é o único valor possível. Se um dia rodar de
-- novo com N clínicas, o NOT NULL abaixo falha e obriga a decidir na mão,
-- que é o comportamento certo.
UPDATE public.config_automacao
   SET clinic_id = (SELECT id FROM public.clinics)
 WHERE clinic_id IS NULL;

ALTER TABLE public.config_automacao ALTER COLUMN clinic_id SET NOT NULL;

-- Mesmo raciocínio do 08-clinic-id-default.sql: um ponto de estrangulamento no
-- banco em vez de N telas lembrando de preencher o campo.
ALTER TABLE public.config_automacao ALTER COLUMN clinic_id SET DEFAULT public.auth_clinic_id();

CREATE INDEX IF NOT EXISTS config_automacao_clinic_idx
  ON public.config_automacao (clinic_id);

-- Uma config de cada tipo por clínica. Sem isto, dois lembretes do mesmo tipo
-- na mesma clínica fazem o paciente receber a mesma mensagem duas vezes — e o
-- dedupe da `disparar-lembretes` não protege, porque ele é por
-- (consulta_id, tipo) e os dois teriam o MESMO tipo.
CREATE UNIQUE INDEX IF NOT EXISTS config_automacao_clinic_tipo_uniq
  ON public.config_automacao (clinic_id, tipo_lembrete);

COMMENT ON COLUMN public.config_automacao.clinic_id IS
  'Dono da configuração. NOT NULL: config sem clínica não é enviável, porque o template da Meta pertence à WABA de uma clínica específica.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. RLS de verdade
-- ─────────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS config_automacao_rw ON public.config_automacao;

CREATE POLICY config_automacao_rw ON public.config_automacao
  FOR ALL TO authenticated
  USING      (clinic_id = public.auth_clinic_id())
  WITH CHECK (clinic_id = public.auth_clinic_id());

-- `anon` tinha SELECT e UPDATE nesta tabela. Hoje o RLS já barra (não existe
-- policy para anon), mas o GRANT é superfície morta: basta alguém criar uma
-- policy permissiva no futuro para a chave anon — que é PÚBLICA, vai no
-- config.js servido ao browser — passar a escrever aqui. Ver ARMADILHAS §17:
-- neste projeto o Supabase concede a `anon` por fora, então conferir o `proacl`
-- depois de revogar faz parte do trabalho.
REVOKE ALL ON public.config_automacao FROM anon;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. O que este script DELIBERADAMENTE não faz
-- ─────────────────────────────────────────────────────────────────────────────
-- NÃO cria configs padrão para clínica nova. Ver DECISIONS.md D-24.
-- Resumo: seed automático apontaria para `consulta_amanha`, que só existe na
-- WABA da clínica atual. A clínica nova receberia um painel com dois lembretes
-- "ligados" que a Meta recusa — exatamente a falha silenciosa do ARMADILHAS §39,
-- só que de fábrica. Clínica nova começa com zero lembretes e o CRM diz isso.

-- ─────────────────────────────────────────────────────────────────────────────
-- Verificado depois de aplicar (15/08/2026):
--   5 linhas, todas com clinic_id = 7936105a-b198-419f-bad7-a65e2e60725b
--   clinic_id NOT NULL, DEFAULT auth_clinic_id(), FK ON DELETE CASCADE
--   policy config_automacao_rw com clinic_id = auth_clinic_id() nos dois lados
--   anon sem privilégio na tabela
-- ─────────────────────────────────────────────────────────────────────────────
