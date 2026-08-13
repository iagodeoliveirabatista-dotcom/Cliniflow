-- 07-triagem-pre-agendamento.sql
-- Aplicado em 10/08/2026 (migration `triagem_pre_agendamento_dedupe_e_aviso`).
-- Spec das decisões: ver "Estado atual" do AGENTS.md e docs/DECISIONS.md.
--
-- POR QUE ISTO EXISTE
-- O bot passou a criar o pedido de agendamento, mas a recepção não conseguia
-- transformá-lo em consulta: o botão "Aprovar e Definir Horário" no CRM não
-- abria formulário nenhum (só marcava como confirmada), e o pedido nascia
-- ocupando um horário real na agenda porque `data_hora` é NOT NULL e recebia
-- now() como placeholder.
-- Esta migration cobre a parte de banco; o resto é CRM.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Saber se o paciente já foi avisado do horário definido
-- ─────────────────────────────────────────────────────────────────────────────
-- Avisar o paciente é MANUAL (decisão do usuário): a recepção clica um botão
-- com o texto pronto. Para o botão sumir depois de usado — e continuar
-- cobrando enquanto não foi — precisamos registrar o envio.
-- Não dá para inferir de `mensagem_logs`: o lembrete automático também grava
-- com o mesmo consulta_id, então "existe mensagem com esse consulta_id" não
-- distingue "a recepção avisou" de "o cron mandou o lembrete".
ALTER TABLE public.consultas
  ADD COLUMN IF NOT EXISTS paciente_avisado_em timestamptz;

COMMENT ON COLUMN public.consultas.paciente_avisado_em IS
  'Quando a recepção avisou o paciente do horário definido na aprovação. NULL = ainda não avisado (o CRM mostra o botão "Avisar paciente" enquanto for NULL).';

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Um pedido aberto por paciente
-- ─────────────────────────────────────────────────────────────────────────────
-- A regra no n8n grava um pré-agendamento sempre que a IA preencher
-- `periodo_preferencia`. Como ela tende a repetir esse campo nos turnos
-- seguintes ("de manhã" -> "na segunda" -> "pode ser 9h"), cada turno virava um
-- pedido novo.
--
-- Isto NÃO era hipótese: em 10/08/2026 o banco tinha dois pedidos idênticos do
-- mesmo paciente ("quinta de manhã"), criados com 69 segundos de diferença.
--
-- O paciente refinando o horário está detalhando O MESMO pedido. Então
-- atualizamos em vez de inserir.
--
-- Resolvido na RPC, e não no n8n, porque assim vale para qualquer caminho que
-- chame esta função — inclusive os que ainda não existem.
--
-- Janela de 60h: é a borda externa do prazo em que a recepção confirma o
-- pedido (decisão do usuário: "confirma em até 48/60 horas"). Passado isso, um
-- pedido novo é um pedido de verdade, não uma repetição.
-- Note que a condição exige status = 'solicitado': assim que a recepção aprova
-- (vira 'pendente') ou recusa (vira 'recusado'), o pedido deixa de estar aberto
-- e o paciente pode pedir outra consulta normalmente.
--
-- ⚠️ Assinatura inalterada de propósito: mudar o RETURNS exigiria DROP+CREATE,
-- e isso apagaria os REVOKEs desta função (ARMADILHAS.md §23). Conferido depois
-- de aplicar que o ACL seguiu com anon (o nó do n8n usa a chave anon):
--   {postgres=X/postgres,anon=X/postgres,service_role=X/postgres}

CREATE OR REPLACE FUNCTION public.criar_pre_agendamento(
  p_patient_id uuid,
  p_clinic_id uuid,
  p_tipo text DEFAULT 'consulta'::text,
  p_notas text DEFAULT NULL::text
)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_id uuid;
BEGIN
  -- o paciente precisa pertencer mesmo a clinica informada
  IF NOT EXISTS (
    SELECT 1 FROM public.patients
    WHERE id = p_patient_id AND clinic_id = p_clinic_id
  ) THEN
    RAISE EXCEPTION 'paciente % nao pertence a clinica %', p_patient_id, p_clinic_id;
  END IF;

  -- Ja existe pedido aberto recente deste paciente? Entao e a mesma conversa
  -- refinando o pedido: atualiza e devolve o id existente.
  SELECT id INTO v_id
  FROM public.consultas
  WHERE patient_id = p_patient_id
    AND clinic_id  = p_clinic_id
    AND status     = 'solicitado'
    AND criado_em > now() - interval '60 hours'
  ORDER BY criado_em DESC
  LIMIT 1;

  IF v_id IS NOT NULL THEN
    UPDATE public.consultas
    SET tipo  = COALESCE(NULLIF(p_tipo, ''), tipo),
        notas = COALESCE(p_notas, notas),
        atualizado_em = now()
    WHERE id = v_id;

    RETURN v_id;
  END IF;

  -- data_hora e NOT NULL. now() e placeholder: quem define o horario real e a
  -- recepcao, ao aprovar o 'solicitado'. A preferencia de turno vem em p_notas.
  -- O CRM nao mostra pedido 'solicitado' na grade da agenda justamente porque
  -- esse horario e mentira ate a aprovacao.
  INSERT INTO public.consultas (patient_id, clinic_id, status, tipo, notas, data_hora)
  VALUES (p_patient_id, p_clinic_id, 'solicitado', p_tipo, p_notas, now())
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$function$;

-- ─────────────────────────────────────────────────────────────────────────────
-- Verificado rodando (10/08/2026), não só aplicado:
--   3 chamadas seguidas para o mesmo paciente -> MESMO uuid nas 3, 1 linha em
--   `consultas`, com o `tipo` e as `notas` da última chamada.
--   Depois de mudar o status para 'pendente' (simulando a aprovação), uma nova
--   chamada criou um pedido NOVO — que é o comportamento certo para o paciente
--   que volta semanas depois.
-- ─────────────────────────────────────────────────────────────────────────────

-- Status do ciclo de vida de `consultas.status` depois desta mudança:
--   solicitado -> pedido do bot, aguardando triagem. Fora da grade da agenda.
--   pendente   -> a recepção definiu o horário. ENTRA na agenda e no lembrete
--                 de 24h (disparar-lembretes filtra exatamente 'pendente').
--   confirmado -> o PACIENTE confirmou (respondendo o lembrete). Nunca é o
--                 estado imediato da aprovação: quem escolheu o horário foi a
--                 recepção, o paciente ainda não sabe.
--   recusado   -> a recepção descartou o pedido. Serve só para tirar da fila;
--                 a conversa com o paciente sobre a recusa é humana.
--   cancelado / remarcado -> fluxo normal de consulta já marcada.
