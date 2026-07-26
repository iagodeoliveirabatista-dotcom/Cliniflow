-- ============================================================
-- Cliniflow — Tabela sessoes_ativas
-- Execute no SQL Editor do Supabase (complementa supabase-schema.sql)
-- Usada pelo n8n para controlar a janela de 16h de conversa WhatsApp
-- ============================================================

CREATE TABLE IF NOT EXISTS public.sessoes_ativas (
    telefone        text PRIMARY KEY,
    nome_paciente   text,
    google_event_id text,
    criado_em       timestamptz DEFAULT now(),
    expira_em       timestamptz NOT NULL
);

-- Índice para buscas por expiração (limpeza de sessões antigas)
CREATE INDEX IF NOT EXISTS sessoes_ativas_expira_idx ON public.sessoes_ativas (expira_em);

-- RLS permissivo (fase 1 — sem auth)
ALTER TABLE public.sessoes_ativas ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE policyname = 'sessoes_ativas_allow_all' AND tablename = 'sessoes_ativas'
  ) THEN
    CREATE POLICY sessoes_ativas_allow_all
      ON public.sessoes_ativas
      FOR ALL USING (true) WITH CHECK (true);
  END IF;
END $$;
