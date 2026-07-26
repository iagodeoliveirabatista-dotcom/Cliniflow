-- ============================================================
-- Cliniflow — Migração e Atualização de Banco (Fase 1)
-- Execute no SQL Editor do seu Supabase para criar as novas tabelas
-- Seguro para re-executar (DO/IF NOT EXISTS em tudo)
-- ============================================================

-- ── 1. HABILITAR EXTENSÕES ─────────────────────────────────
CREATE EXTENSION IF NOT EXISTS vector;

-- ── 2. TABELA DE CLÍNICAS (MULTI-TENANT FOUNDATION) ─────────
CREATE TABLE IF NOT EXISTS public.clinics (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name text NOT NULL,
    cnpj text,
    evolution_instance text NOT NULL UNIQUE, -- Nome da instância vinculada da Evolution API
    evolution_apikey text NOT NULL,
    rules_config jsonb DEFAULT '{}'::jsonb,  -- Regras de negócio da IA (horários, restrições)
    criado_em timestamptz DEFAULT now()
);

-- Inserir clínica padrão inicial (Dra. Ana Ruthe)
INSERT INTO public.clinics (id, name, evolution_instance, evolution_apikey)
VALUES ('d3b07384-ad6b-4f5c-9ab4-66e2854d88ad', 'Clínica Principal', 'Pessoal', 'SUA_KEY_AQUI')
ON CONFLICT (evolution_instance) DO NOTHING;

-- ── 3. COLUNAS MULTI-TENANT E PAUSA NAS TABELAS EXISTENTES ──
DO $$
BEGIN
  -- patients (clinic_id)
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='patients' AND column_name='clinic_id') THEN
    ALTER TABLE public.patients ADD COLUMN clinic_id uuid REFERENCES public.clinics(id) ON DELETE SET NULL;
  END IF;

  -- patients (bot_pausado)
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='patients' AND column_name='bot_pausado') THEN
    ALTER TABLE public.patients ADD COLUMN bot_pausado boolean DEFAULT false;
  END IF;

  -- consultas (clinic_id)
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='consultas' AND column_name='clinic_id') THEN
    ALTER TABLE public.consultas ADD COLUMN clinic_id uuid REFERENCES public.clinics(id) ON DELETE SET NULL;
  END IF;

  -- sessoes_ativas (atendimento_humano)
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='sessoes_ativas' AND column_name='atendimento_humano') THEN
    ALTER TABLE public.sessoes_ativas ADD COLUMN atendimento_humano boolean DEFAULT false;
  END IF;
END $$;

-- Associar dados atuais à clínica padrão (caso existam)
UPDATE public.patients SET clinic_id = 'd3b07384-ad6b-4f5c-9ab4-66e2854d88ad' WHERE clinic_id IS NULL;
UPDATE public.consultas SET clinic_id = 'd3b07384-ad6b-4f5c-9ab4-66e2854d88ad' WHERE clinic_id IS NULL;

-- ── 4. TABELA DE CONVERSAS (CICLO DE VIDA DO CHAT) ─────────
CREATE TABLE IF NOT EXISTS public.conversations (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    display_id bigserial NOT NULL,
    clinic_id uuid REFERENCES public.clinics(id) ON DELETE CASCADE,
    patient_id uuid REFERENCES public.patients(id) ON DELETE CASCADE,
    status text NOT NULL DEFAULT 'open', -- 'open' (ativa), 'resolved' (resolvida), 'snoozed' (silenciada)
    assignee_id uuid REFERENCES auth.users(id) ON DELETE SET NULL, -- Atendente humano atribuído
    last_activity_at timestamptz DEFAULT now(),
    criado_em timestamptz DEFAULT now()
);

-- Índices para otimizar a busca do painel
CREATE INDEX IF NOT EXISTS conv_clinic_idx ON public.conversations(clinic_id);
CREATE INDEX IF NOT EXISTS conv_patient_idx ON public.conversations(patient_id);
CREATE INDEX IF NOT EXISTS conv_status_idx ON public.conversations(status);

-- ── 5. ADAPTAR TABELA DE LOG DE MENSAGENS (MESSAGES) ───────
DO $$
BEGIN
  -- Vinculo com a conversa
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='mensagem_logs' AND column_name='conversation_id') THEN
    ALTER TABLE public.mensagem_logs ADD COLUMN conversation_id uuid REFERENCES public.conversations(id) ON DELETE CASCADE;
  END IF;

  -- Flag de Nota Interna (privada para atendentes)
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='mensagem_logs' AND column_name='private') THEN
    ALTER TABLE public.mensagem_logs ADD COLUMN private boolean DEFAULT false;
  END IF;

  -- Atendente que enviou (NULL se foi o paciente ou a IA)
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='mensagem_logs' AND column_name='sender_id') THEN
    ALTER TABLE public.mensagem_logs ADD COLUMN sender_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;
  END IF;

  -- URL de anexos (mídia, arquivos, áudios)
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='mensagem_logs' AND column_name='attachment_url') THEN
    ALTER TABLE public.mensagem_logs ADD COLUMN attachment_url text;
  END IF;
END $$;

-- ── 6. ATIVAR VÍNCULOS REALTIME DO SUPABASE ───────────────
-- Certifica-se de que a publicação supabase_realtime existe e adiciona as tabelas
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    CREATE PUBLICATION supabase_realtime;
  END IF;
  
  -- Adiciona as tabelas (trata erros caso já estejam vinculadas)
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.conversations;
  EXCEPTION WHEN others THEN
    -- Já estava na publicação
  END;

  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.mensagem_logs;
  EXCEPTION WHEN others THEN
    -- Já estava na publicação
  END;
END $$;
