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


-- ============================================================
-- 6. DETECTOR DE SILÊNCIO (observabilidade)
--
-- Existe porque o modo de falha dominante deste sistema NÃO gera exceção:
-- o paciente escreve e ninguém responde. Nenhum nó falha, nenhum log aparece,
-- e você só descobre quando o paciente desiste.
--
-- Roda a cada 10 min via pg_cron. Grava em logs_erro com origem='cron'.
-- Deduplica numa janela de 1h para não inundar a tabela com a mesma queixa.
-- ============================================================

CREATE OR REPLACE FUNCTION public.detectar_silencio()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'cron'
AS $function$
declare
  v_gravados integer := 0;
  v_janela   interval := interval '1 hour';  -- janela de dedup
begin
  -- 1) Jobs do pg_cron que falharam na ultima hora.
  --    Teria pego o bug dos lembretes em 08/06 em vez de 48 dias depois.
  insert into public.logs_erro (origem, workflow_name, node_name, error_message)
  select distinct
         'cron',
         'pg_cron',
         coalesce(j.jobname, 'jobid ' || d.jobid::text),
         left(coalesce(d.return_message, 'falha sem mensagem'), 500)
  from cron.job_run_details d
  left join cron.job j on j.jobid = d.jobid
  where d.status = 'failed'
    and d.start_time > now() - interval '1 hour'
    and not exists (
      select 1 from public.logs_erro e
      where e.workflow_name = 'pg_cron'
        and e.node_name = coalesce(j.jobname, 'jobid ' || d.jobid::text)
        and e.error_message = left(coalesce(d.return_message, 'falha sem mensagem'), 500)
        and e.criado_em > now() - v_janela
    );
  get diagnostics v_gravados = row_count;

  -- 2) Mensagem de saida presa (ARMADILHAS.md 5c): a RPC process_secretary_message marca
  --    'sending' para travar duplicata; se o envio falha depois disso ninguem reverte, e a
  --    trava so libera com status != 'sending'. A mensagem fica presa para sempre.
  --    Filtra direcao='saida' de proposito: linhas de ENTRADA nascem 'pending' por default
  --    da coluna e nada as atualiza - sem o filtro o detector nasce com 16 alarmes falsos.
  if exists (
    select 1 from public.mensagem_logs
    where direcao = 'saida'
      and status in ('pending', 'sending')
      and enviado_em < now() - interval '5 minutes'
  ) and not exists (
    select 1 from public.logs_erro
    where workflow_name = 'detector-silencio'
      and node_name = 'envio_preso'
      and criado_em > now() - v_janela
  ) then
    insert into public.logs_erro (origem, workflow_name, node_name, error_message)
    values ('cron', 'detector-silencio', 'envio_preso',
            'Mensagem de saida presa em pending/sending ha mais de 5 min');
    v_gravados := v_gravados + 1;
  end if;

  -- 3) Paciente falou e ninguem respondeu. E o modo de falha dominante de um bot de
  --    WhatsApp e o unico que nao gera excecao em lugar nenhum.
  --    Janela de 15 min a 2 h: o limite inferior da tempo para o debounce (15s) + IA
  --    responderem; o superior evita que a conversa historica vire alarme retroativo.
  --    Exclui quem esta em atendimento humano - ali o silencio da IA e proposital.
  if exists (
    select 1
    from public.mensagem_logs entrada
    where entrada.direcao = 'entrada'
      and entrada.enviado_em between now() - interval '2 hours' and now() - interval '15 minutes'
      and not exists (
        select 1 from public.mensagem_logs saida
        where saida.telefone = entrada.telefone
          and saida.direcao = 'saida'
          and saida.enviado_em > entrada.enviado_em
      )
      and not exists (
        select 1 from public.sessoes_ativas s
        where s.telefone = entrada.telefone
          and s.atendimento_humano is true
      )
  ) and not exists (
    select 1 from public.logs_erro
    where workflow_name = 'detector-silencio'
      and node_name = 'sem_resposta'
      and criado_em > now() - v_janela
  ) then
    insert into public.logs_erro (origem, workflow_name, node_name, error_message)
    values ('cron', 'detector-silencio', 'sem_resposta',
            'Mensagem de entrada sem resposta ha mais de 15 min (IA nao esta pausada)');
    v_gravados := v_gravados + 1;
  end if;

  return v_gravados;
end;
$function$;


-- ============================================================
-- AGENDAMENTOS pg_cron  (jobs ATIVOS em 27/07/2026)
--
-- Não estão em arquivo em lugar nenhum além deste. `cron.job` é o registro real.
-- ============================================================
--
--  jobid 2 · disparar-lembretes · '0 * * * *'  (de hora em hora)
--    net.http_post para /functions/v1/disparar-lembretes, com a chave ANON no
--    header Authorization (a edge function tem verify_jwt=true; internamente ela
--    usa service_role, então o RLS não a afeta).
--
--  jobid 4 · detector-silencio · '*/10 * * * *'  (a cada 10 min)
--    select public.detectar_silencio()
--
-- ⚠️ Ao editar o `command` de um job, cuidado com as aspas: em 26/07/2026 uma
--    edição deixou o JWT fora das aspas do jsonb e o job passou a falhar com
--    `syntax error at or near "eyJhbGci..."`. Foram 2 execuções perdidas antes
--    de voltar ao normal — e foi o próprio detector_silencio que registrou.


-- ── EXTENSÕES NECESSÁRIAS ───────────────────────────────────
-- vector   → documentos_clinica.embedding
-- pg_net   → trigger_secretary_webhook() e os jobs do cron
-- pg_cron  → disparar-lembretes, detector-silencio
