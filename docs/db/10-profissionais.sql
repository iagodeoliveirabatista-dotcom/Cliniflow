-- 10-profissionais.sql
-- Aplicado em 15/08/2026 (migration `cadastro_profissionais`).
--
-- POR QUE ISTO EXISTE
-- O campo "Médico(a)" no agendamento do CRM usava uma lista fixa e fictícia
-- hardcoded no frontend. Não existia tabela de profissionais no banco.
-- Esta tabela permite cadastrar médicos e dentistas reais da clínica.
--
-- REGRAS E DECISÕES DE ESCOPO (ver DECISIONS.md D-30 e spec de 15/08/2026):
-- 1. Campos: apenas nome e ativo (booleano). Sem especialidade/cor/CRM/horário por ora.
-- 2. Multi-tenant: clinic_id herda default auth_clinic_id().
-- 3. RLS fechado para authenticated desde o nascimento (mesmo padrão do 09-config-automacao).
-- 4. Sem FK em consultas.medico por ora: consultas.medico segue text com o nome.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Tabela e Índices
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.profissionais (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id  uuid NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE
               DEFAULT public.auth_clinic_id(),
  nome       text NOT NULL,
  ativo      boolean NOT NULL DEFAULT true,
  criado_em  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS profissionais_clinic_idx
  ON public.profissionais (clinic_id);

COMMENT ON TABLE public.profissionais IS
  'Profissionais (médicos, dentistas, terapeutas) atendentes da clínica para agendamento.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. RLS e Permissões
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.profissionais ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS profissionais_rw ON public.profissionais;

CREATE POLICY profissionais_rw ON public.profissionais
  FOR ALL TO authenticated
  USING      (clinic_id = public.auth_clinic_id())
  WITH CHECK (clinic_id = public.auth_clinic_id());

-- Revoga explicitamente de anon e PUBLIC (conforme ARMADILHAS.md §17)
REVOKE ALL ON public.profissionais FROM anon, PUBLIC;
