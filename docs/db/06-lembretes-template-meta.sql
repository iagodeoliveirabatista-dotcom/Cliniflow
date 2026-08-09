-- 06-lembretes-template-meta.sql
-- Aplicado em 09/08/2026 (migration `corrige_envio_meta_telefone_e_templates_lembrete`).
-- Contexto completo: docs/ARMADILHAS.md §31 e §32.
--
-- POR QUE ISTO EXISTE
-- O caminho de lembrete (pg_cron -> disparar-lembretes -> enviar-whatsapp) nunca
-- entregou uma mensagem. Três quebras em série, todas silenciosas. Duas eram de
-- código (corrigidas nas Edge Functions v9); as duas abaixo são de banco.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Telefone internacional no envio manual
-- ─────────────────────────────────────────────────────────────────────────────
-- patients.telefone guarda 11 dígitos (DDD + número, sem o 55). A Graph API exige
-- o número internacional completo no campo "to" — sem o 55 na frente, todo envio
-- da recepção falha.
--
-- Corrigido AQUI, e não no frontend, porque `process_secretary_message` é o ponto
-- por onde TODO envio manual passa (chat do CRM e botão da Agenda). Um ajuste no
-- frontend teria que ser repetido em cada chamador.
--
-- ⚠️ A assinatura (RETURNS TABLE) fica inalterada de propósito: mudá-la exigiria
-- DROP+CREATE, e isso apagaria os REVOKEs desta função (ARMADILHAS §23). Com
-- CREATE OR REPLACE o ACL é preservado — conferido depois de aplicar:
--   {postgres=X/postgres,service_role=X/postgres}

CREATE OR REPLACE FUNCTION public.telefone_e164(p_telefone text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
 SET search_path = public
AS $function$
  SELECT CASE
    WHEN d = '' THEN d
    WHEN left(d, 2) = '55' THEN d
    ELSE '55' || d
  END
  FROM (SELECT regexp_replace(coalesce(p_telefone, ''), '\D', '', 'g') AS d) s;
$function$;

REVOKE ALL ON FUNCTION public.telefone_e164(text) FROM PUBLIC, anon;

CREATE OR REPLACE FUNCTION public.process_secretary_message(p_message_id uuid)
 RETURNS TABLE(telefone text, mensagem text, meta_access_token text, meta_phone_number_id text)
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
    v_locked_id uuid;
BEGIN
    -- Trava atômica: só pega a mensagem se ninguém pegou antes e se ela nunca
    -- foi enviada com sucesso. Impede envio duplicado.
    UPDATE public.mensagem_logs
    SET status = 'sending'
    WHERE id = p_message_id
      AND evo_message_id IS NULL
      AND status != 'sending'
    RETURNING id INTO v_locked_id;

    IF v_locked_id IS NULL THEN
        RETURN;
    END IF;

    RETURN QUERY
    SELECT
        public.telefone_e164(m.telefone),   -- <- a correção
        m.mensagem,
        c.meta_access_token,
        c.meta_phone_number_id
    FROM public.mensagem_logs m
    JOIN public.conversations conv ON m.conversation_id = conv.id
    JOIN public.clinics c ON conv.clinic_id = c.id
    WHERE m.id = v_locked_id;
END;
$function$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. De-para lembrete -> template aprovado na Meta
-- ─────────────────────────────────────────────────────────────────────────────
-- Fora da janela de 24h a Cloud API recusa texto livre (131047), e lembrete é
-- sempre fora da janela. `template_mensagem` continua existindo, mas agora só
-- como o texto legível gravado no histórico do CRM — quem vai pro paciente é o
-- template.

ALTER TABLE public.config_automacao
  ADD COLUMN IF NOT EXISTS meta_template_nome   text,
  ADD COLUMN IF NOT EXISTS meta_template_idioma text NOT NULL DEFAULT 'pt_BR',
  ADD COLUMN IF NOT EXISTS meta_template_params text[];

COMMENT ON COLUMN public.config_automacao.meta_template_idioma IS
  'Código de idioma do template NA META, não o idioma do texto. consulta_amanha foi aprovado como "en" apesar do corpo em português — enviar pt_BR nele dá erro 132001.';

-- Configs em uso (criadas em 09/08/2026, casadas com os templates APROVADOS na
-- WABA I2B). meta_template_params lista exatamente os parâmetros que AQUELE
-- template declara: mandar a mais ou a menos dá erro 132000.
--
--   lembrete_24h -> consulta_amanha        (idioma 'en'!)  nome, data, hora, medico
--   lembrete_4h  -> confirmao_horas_antes  (pt_BR)         nome, hora, medico
--
-- INSERT não versionado aqui de propósito: é dado, não schema. Para recriar,
-- ver o "Estado atual" do AGENTS.md de 09/08/2026.

-- As 3 configs originais (04/06/2026) foram DESATIVADAS, não apagadas: nunca
-- tiveram template aprovado e duplicavam antecedência com as novas, o que faria
-- o paciente receber o mesmo lembrete duas vezes. A volta é um UPDATE.
--
--   UPDATE public.config_automacao SET ativo = false
--   WHERE tipo_lembrete IN ('reminder_custom','reminder_24h','reminder_2h');
