-- 08-clinic-id-default.sql
-- Aplicado em 15/08/2026 (migration `clinic_id_default_auth_clinic_id`).
--
-- POR QUE ISTO EXISTE
-- Cadastrar paciente pelo CRM estava QUEBRADO, e ninguém tinha percebido porque
-- ninguém tinha cadastrado paciente pela tela ainda — os 2 pacientes do banco
-- foram os dois criados pelo bot, que passa `clinic_id` explícito.
--
-- A conta que não fecha:
--   1. `createPaciente()` (cliniflow-export/supabase-client.js) não mandava clinic_id
--   2. a coluna era nullable e SEM default
--   3. a policy é `WITH CHECK (clinic_id = auth_clinic_id())`
--   4. nenhum trigger preenchia (só o de `atualizado_em`)
-- `NULL = auth_clinic_id()` nunca é verdadeiro, então o INSERT era recusado
-- pelo RLS. Não é lentidão nem permissão de usuário: é a linha nascendo órfã.
--
-- POR QUE NO BANCO E NÃO NO FRONTEND
-- Mesmo motivo da normalização de telefone dentro de `process_secretary_message`
-- (ver ARMADILHAS.md §31): um ponto de estrangulamento por onde todo mundo passa
-- é melhor que N telas lembrando de mandar o campo. Qualquer insert autenticado
-- que omitir a coluna passa a herdar a clínica da sessão.
--
-- POR QUE NÃO QUEBRA O n8n
-- O n8n usa `service_role` e já manda `clinic_id` explícito — valor explícito
-- sempre vence o default. E se algum dia omitir, `auth.uid()` é NULL para
-- service_role, `auth_clinic_id()` devolve NULL sem erro, e o comportamento
-- fica idêntico ao de hoje. A função é STABLE SECURITY DEFINER e faz só um
-- SELECT em `clinic_users` — não levanta exceção quando não acha nada.

ALTER TABLE public.patients      ALTER COLUMN clinic_id SET DEFAULT public.auth_clinic_id();
ALTER TABLE public.consultas     ALTER COLUMN clinic_id SET DEFAULT public.auth_clinic_id();
ALTER TABLE public.conversations ALTER COLUMN clinic_id SET DEFAULT public.auth_clinic_id();

-- As três tinham exatamente o mesmo buraco (nullable + sem default + RLS
-- exigindo a coluna no WITH CHECK). `clinic_users.clinic_id` é NOT NULL e a
-- policy dela não filtra por clinic_id, então ficou de fora de propósito.

-- ─────────────────────────────────────────────────────────────────────────────
-- CONFERÊNCIA (rodada depois de aplicar, resultado: as 3 com auth_clinic_id())
-- ─────────────────────────────────────────────────────────────────────────────
-- select table_name, column_default
-- from information_schema.columns
-- where table_schema='public' and column_name='clinic_id'
--   and table_name in ('patients','consultas','conversations')
-- order by table_name;

-- ⚠️ AINDA NÃO VERIFICADO COM CADASTRO REAL PELA TELA. A semântica de SQL é
-- fechada, mas ninguém criou paciente pelo CRM autenticado depois disto.
