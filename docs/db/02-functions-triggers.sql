-- ============================================================
-- Cliniflow — Funções e Triggers (estado REAL do banco)
-- Projeto: mxvaufkqijdkapvtkvee  |  Extraído em: 2026-07-26
--
-- ⚠️ ESTE ARQUIVO É O MAIS IMPORTANTE DO DUMP.
-- Até 2026-07-26 nada disto existia em arquivo: só dentro do banco.
-- Se o projeto for pausado e deletado, esta lógica se perde.
-- ============================================================


-- ── 1. BUFFER DE DEBOUNCE (append atômico) ──────────────────
-- Chamada pelo n8n em "Append Buffer (RPC)" com a chave ANON.
-- É SECURITY DEFINER, por isso funciona mesmo com whatsapp_buffer sem policy.
CREATE OR REPLACE FUNCTION public.append_whatsapp_buffer(p_telefone text, p_novo_texto text)
 RETURNS TABLE(updated_at timestamp with time zone, mensagem_acumulada text)
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
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
$function$;


-- ── 2. BUSCA VETORIAL RAG ───────────────────────────────────
-- Usada pelo nó "Consulta na database" (queryName = match_documentos_clinica).
-- documentos_clinica.embedding tem 3072 dimensões (Gemini gemini-embedding-2).
CREATE OR REPLACE FUNCTION public.match_documentos_clinica(
  query_embedding vector,
  match_count integer DEFAULT NULL::integer,
  filter jsonb DEFAULT '{}'::jsonb
)
 RETURNS TABLE(id bigint, content text, metadata jsonb, similarity double precision)
 LANGUAGE plpgsql
AS $function$
#variable_conflict use_column
begin
  return query
  select
    id,
    content,
    metadata,
    1 - (documentos_clinica.embedding <=> query_embedding) as similarity
  from documentos_clinica
  where metadata @> filter
  order by documentos_clinica.embedding <=> query_embedding
  limit match_count;
end;
$function$;


-- ── 3. TRAVA ATÔMICA DE ENVIO PELO CRM ──────────────────────
-- Chamada pelo workflow n8n "Cliniflow - Enviar Mensagem CRM".
-- Impede envio duplicado: só devolve a linha se conseguir travar em 'sending'.
CREATE OR REPLACE FUNCTION public.process_secretary_message(p_message_id uuid)
 RETURNS TABLE(telefone text, mensagem text, evolution_apikey text, evolution_instance text)
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
    v_locked_id uuid;
BEGIN
    -- 1. Trava Atômica: tenta mudar o status para 'sending'
    UPDATE public.mensagem_logs
    SET status = 'sending'
    WHERE id = p_message_id
      AND evo_message_id IS NULL
      AND status != 'sending'
    RETURNING id INTO v_locked_id;

    -- 2. Se a trava falhou (outra thread pegou ou já foi enviada), retorna vazio.
    IF v_locked_id IS NULL THEN
        RETURN;
    END IF;

    -- 3. Trava OK: busca telefone, mensagem e credenciais da clínica.
    RETURN QUERY
    SELECT
        m.telefone,
        m.mensagem,
        c.evolution_apikey,
        c.evolution_instance
    FROM public.mensagem_logs m
    JOIN public.conversations conv ON m.conversation_id = conv.id
    JOIN public.clinics c ON conv.clinic_id = c.id
    WHERE m.id = v_locked_id;
END;
$function$;


-- ── 4. DISPARO pg_net PARA O n8n ────────────────────────────
-- É isto que substituiu a chamada direta do React ao webhook.
-- A DOCUMENTACAO.md §3.2 ainda descreve o modelo antigo.
CREATE OR REPLACE FUNCTION public.trigger_secretary_webhook()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
    PERFORM net.http_post(
        url := 'https://n8n.iagobatista.cloud/webhook/enviar-mensagem',
        headers := '{"Content-Type": "application/json"}'::jsonb,
        body := jsonb_build_object(
            'message_id', NEW.id
        )
    );
    RETURN NEW;
END;
$function$;


-- ── 5. TIMESTAMP DE ATUALIZAÇÃO ─────────────────────────────
CREATE OR REPLACE FUNCTION public.update_atualizado_em()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  NEW.atualizado_em = now();
  RETURN NEW;
END;
$function$;


-- ============================================================
-- TRIGGERS
-- ============================================================

CREATE TRIGGER patients_atualizado_em
  BEFORE UPDATE ON public.patients
  FOR EACH ROW EXECUTE FUNCTION update_atualizado_em();

CREATE TRIGGER consultas_atualizado_em
  BEFORE UPDATE ON public.consultas
  FOR EACH ROW EXECUTE FUNCTION update_atualizado_em();

CREATE TRIGGER config_automacao_atualizado_em
  BEFORE UPDATE ON public.config_automacao
  FOR EACH ROW EXECUTE FUNCTION update_atualizado_em();

-- ⚠️ ATENÇÃO — ESTE TRIGGER TEM UM BUG DE PRIVACIDADE (ver docs/ARMADILHAS.md)
-- A condição não exclui notas internas (private = true). Uma nota privada
-- gravada pelo CRM entra como tipo='manual' + direcao='saida' e é DISPARADA
-- para o WhatsApp do paciente.
-- Correção sugerida: acrescentar  AND new.private IS NOT TRUE
CREATE TRIGGER secretary_message_trigger
  AFTER INSERT ON public.mensagem_logs
  FOR EACH ROW
  WHEN (((new.tipo = 'manual'::text) AND (new.direcao = 'saida'::text)))
  EXECUTE FUNCTION trigger_secretary_webhook();


-- ── EXTENSÕES NECESSÁRIAS ───────────────────────────────────
-- vector  → documentos_clinica.embedding
-- pg_net  → trigger_secretary_webhook()
