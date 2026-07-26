-- ============================================================
-- Cliniflow — Migração e Atualização de Banco (Fase 2)
-- Execute no SQL Editor do seu Supabase para criar as novas tabelas
-- Seguro para re-executar
-- ============================================================

-- ── 1. TABELA DE DEBOUNCE / BUFFER ───────────────────────────
CREATE TABLE IF NOT EXISTS public.whatsapp_buffer (
    telefone text PRIMARY KEY,
    mensagem_acumulada text NOT NULL,
    updated_at timestamptz DEFAULT now()
);

-- ── 2. FUNÇÃO RPC PARA APPEND ATÔMICO ────────────────────────
CREATE OR REPLACE FUNCTION public.append_whatsapp_buffer(
  p_telefone text,
  p_novo_texto text
)
RETURNS TABLE (
  updated_at timestamptz,
  mensagem_acumulada text
)
LANGUAGE plpgsql
AS $$
DECLARE
  v_updated_at timestamptz;
  v_mensagem text;
BEGIN
  INSERT INTO public.whatsapp_buffer (telefone, mensagem_acumulada, updated_at)
  VALUES (p_telefone, p_novo_texto, now())
  ON CONFLICT (telefone) DO UPDATE
  SET 
    mensagem_acumulada = public.whatsapp_buffer.mensagem_acumulada || ' ' || p_novo_texto,
    updated_at = now()
  RETURNING public.whatsapp_buffer.updated_at, public.whatsapp_buffer.mensagem_acumulada 
  INTO v_updated_at, v_mensagem;

  RETURN QUERY SELECT v_updated_at, v_mensagem;
END;
$$;

-- ── 3. CONSTRAINT DE UNIQUE PARA TELEFONE (PACIENTES) ────────
-- Isso evita definitivamente duplicação de pacientes
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'patients_telefone_key'
  ) THEN
    ALTER TABLE public.patients ADD CONSTRAINT patients_telefone_key UNIQUE (telefone);
  END IF;
END $$;
