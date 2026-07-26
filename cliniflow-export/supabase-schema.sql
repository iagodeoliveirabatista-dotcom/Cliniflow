-- ============================================================
-- Cliniflow — Schema Completo para Integração
-- Execute no SQL Editor do Supabase
-- Seguro para re-executar (IF NOT EXISTS em tudo)
-- ============================================================

-- ── 1. TABELA DE PACIENTES ─────────────────────────────────
-- Se já existe, adiciona colunas faltantes

CREATE TABLE IF NOT EXISTS patients (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome          text NOT NULL,
  telefone      text NOT NULL,
  email         text,
  convenio      text DEFAULT 'Particular',
  data_nasc     date,
  status        text DEFAULT 'ativo',   -- 'ativo' | 'novo' | 'inativo'
  criado_em     timestamptz DEFAULT now(),
  atualizado_em timestamptz DEFAULT now()
);

-- Colunas que podem faltar se a tabela já existia
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='patients' AND column_name='email') THEN
    ALTER TABLE patients ADD COLUMN email text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='patients' AND column_name='convenio') THEN
    ALTER TABLE patients ADD COLUMN convenio text DEFAULT 'Particular';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='patients' AND column_name='data_nasc') THEN
    ALTER TABLE patients ADD COLUMN data_nasc date;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='patients' AND column_name='status') THEN
    ALTER TABLE patients ADD COLUMN status text DEFAULT 'ativo';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='patients' AND column_name='atualizado_em') THEN
    ALTER TABLE patients ADD COLUMN atualizado_em timestamptz DEFAULT now();
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS patients_telefone_idx ON patients (telefone);
CREATE INDEX IF NOT EXISTS patients_status_idx ON patients (status);

-- ── 2. TABELA DE CONSULTAS (PRINCIPAL) ─────────────────────
-- Fonte primária de agendamentos (substitui Google Calendar)

CREATE TABLE IF NOT EXISTS consultas (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id      uuid REFERENCES patients(id) ON DELETE SET NULL,
  data_hora       timestamptz NOT NULL,
  duracao_min     int DEFAULT 30,
  tipo            text DEFAULT 'Consulta de rotina',
  medico          text,
  status          text DEFAULT 'pendente',  -- 'pendente'|'confirmado'|'cancelado'|'no_show'|'remarcado'
  convenio        text DEFAULT 'Particular',
  preco           numeric(10,2),
  whatsapp_ativo  boolean DEFAULT true,     -- se o paciente tem WhatsApp
  google_event_id text,                     -- ID do evento espelhado no Google Calendar
  notas           text,
  criado_em       timestamptz DEFAULT now(),
  atualizado_em   timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS consultas_data_hora_idx ON consultas (data_hora);
CREATE INDEX IF NOT EXISTS consultas_status_idx ON consultas (status);
CREATE INDEX IF NOT EXISTS consultas_patient_id_idx ON consultas (patient_id);

-- ── 3. TABELA DE LOG DE MENSAGENS ──────────────────────────
-- Registro de todas as mensagens WhatsApp (Evolution API)

CREATE TABLE IF NOT EXISTS mensagem_logs (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  consulta_id           uuid REFERENCES consultas(id) ON DELETE SET NULL,
  patient_id            uuid REFERENCES patients(id) ON DELETE SET NULL,
  telefone              text NOT NULL,
  tipo                  text NOT NULL,       -- 'reminder_24h'|'reminder_2h'|'confirmation'|'cancellation'|'reschedule'|'outlier'|'manual'
  canal                 text DEFAULT 'whatsapp',
  direcao               text DEFAULT 'saida', -- 'entrada'|'saida'
  mensagem              text,
  evo_message_id        text,                -- ID retornado pela Evolution API
  intencao_detectada    text,                -- 'CONFIRMADO'|'CANCELADO'|'REMARCAR'|'DESCONHECIDO'|etc
  confianca_percentual  int DEFAULT 0,
  status                text DEFAULT 'sent', -- 'sending'|'sent'|'delivered'|'read'|'failed'
  enviado_em            timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS mensagem_logs_consulta_idx ON mensagem_logs (consulta_id);
CREATE INDEX IF NOT EXISTS mensagem_logs_telefone_idx ON mensagem_logs (telefone);
CREATE INDEX IF NOT EXISTS mensagem_logs_enviado_idx ON mensagem_logs (enviado_em);

-- ── 4. TABELA DE HISTÓRICO DE CONFIRMAÇÕES ─────────────────
-- Substitui Google Sheets "Histórico de sessões"

CREATE TABLE IF NOT EXISTS historico_confirmacoes (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  telefone              text NOT NULL,
  nome_paciente         text NOT NULL,
  acao                  text NOT NULL,        -- 'Confirmação'|'Cancelamento'|'Remarcação'
  mensagem_usuario      text,
  intencao_detectada    text,
  confianca_percentual  int DEFAULT 0,
  consulta_id           uuid REFERENCES consultas(id) ON DELETE SET NULL,
  criado_em             timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS hist_conf_criado_idx ON historico_confirmacoes (criado_em);

-- ── 5. TABELA DE LOGS DE ERRO ──────────────────────────────
-- Substitui Google Sheets "Log de Erros"

CREATE TABLE IF NOT EXISTS logs_erro (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_name   text NOT NULL,
  node_name       text NOT NULL,
  error_message   text NOT NULL,
  execution_id    text,
  criado_em       timestamptz DEFAULT now()
);

-- ── 6. TABELA DE CONFIGURAÇÃO DE AUTOMAÇÃO ─────────────────
-- Configurações editáveis pelo Cliniflow

CREATE TABLE IF NOT EXISTS config_automacao (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tipo_lembrete       text NOT NULL UNIQUE,   -- 'reminder_24h'|'reminder_2h'|'reminder_custom'
  ativo               boolean DEFAULT true,
  horario_envio       time,                   -- Ex: '14:00' (horário do disparo diário)
  antecedencia_horas  int DEFAULT 24,         -- Horas antes da consulta
  template_mensagem   text NOT NULL,
  webhook_url         text,                   -- URL do webhook n8n para disparo
  criado_em           timestamptz DEFAULT now(),
  atualizado_em       timestamptz DEFAULT now()
);

-- Inserir configurações padrão se não existem
INSERT INTO config_automacao (tipo_lembrete, ativo, horario_envio, antecedencia_horas, template_mensagem)
VALUES
  ('reminder_24h', true, '14:00', 24,
   'Olá {nome}! 😊 Lembramos que você tem uma consulta amanhã ({data}) às {hora} com {medico}. Por favor, confirme sua presença respondendo: ✅ CONFIRMAR ou ❌ CANCELAR'),
  ('reminder_2h', false, NULL, 2,
   'Olá {nome}! Sua consulta é daqui a 2 horas ({hora}) com {medico}. Te esperamos! 😊'),
  ('reminder_custom', false, NULL, 48,
   'Olá {nome}! Você tem uma consulta marcada para {data} às {hora}. Confirme sua presença!')
ON CONFLICT (tipo_lembrete) DO NOTHING;

-- ── 7. VIEWS DE KPI ────────────────────────────────────────

-- 7a. Taxa de comparecimento (últimos 30 dias)
CREATE OR REPLACE VIEW kpi_comparecimento AS
SELECT
  count(*)                                                       AS total,
  count(*) FILTER (WHERE status = 'confirmado')                  AS confirmados,
  count(*) FILTER (WHERE status = 'no_show')                     AS no_shows,
  count(*) FILTER (WHERE status = 'cancelado')                   AS cancelados,
  count(*) FILTER (WHERE status = 'pendente')                    AS pendentes,
  ROUND(
    count(*) FILTER (WHERE status = 'confirmado')::numeric /
    NULLIF(count(*) FILTER (WHERE status != 'pendente'), 0) * 100, 1
  )                                                              AS taxa_comparecimento
FROM consultas
WHERE data_hora >= now() - interval '30 days';

-- 7b. Resumo mensal (últimos 6 meses)
CREATE OR REPLACE VIEW kpi_resumo_mensal AS
SELECT
  TO_CHAR(date_trunc('month', data_hora), 'Mon YY')              AS mes,
  date_trunc('month', data_hora)                                  AS mes_date,
  count(*)                                                        AS total,
  count(*) FILTER (WHERE status = 'confirmado')                   AS confirmados,
  count(*) FILTER (WHERE status = 'cancelado')                    AS cancelados,
  count(*) FILTER (WHERE status = 'no_show')                      AS no_shows,
  COALESCE(SUM(preco) FILTER (WHERE status = 'confirmado'), 0)    AS receita
FROM consultas
WHERE data_hora >= now() - interval '6 months'
GROUP BY date_trunc('month', data_hora)
ORDER BY date_trunc('month', data_hora);

-- 7c. Sessões por dia da semana
CREATE OR REPLACE VIEW kpi_sessoes_dia_semana AS
SELECT
  CASE EXTRACT(DOW FROM data_hora)
    WHEN 0 THEN 'Dom'
    WHEN 1 THEN 'Seg'
    WHEN 2 THEN 'Ter'
    WHEN 3 THEN 'Qua'
    WHEN 4 THEN 'Qui'
    WHEN 5 THEN 'Sex'
    WHEN 6 THEN 'Sáb'
  END                                                             AS dia,
  EXTRACT(DOW FROM data_hora)::int                                AS dia_num,
  count(*)                                                        AS sessoes,
  count(*) FILTER (WHERE status = 'confirmado')                   AS confirmados
FROM consultas
WHERE data_hora >= now() - interval '30 days'
GROUP BY EXTRACT(DOW FROM data_hora)
ORDER BY EXTRACT(DOW FROM data_hora);

-- 7d. Retenção de pacientes (retornaram >1 vez)
CREATE OR REPLACE VIEW kpi_retencao AS
SELECT
  p.nome,
  p.telefone,
  p.convenio,
  count(*)                       AS sessoes,
  MIN(c.data_hora)               AS primeira_sessao,
  MAX(c.data_hora)               AS ultima_sessao
FROM consultas c
JOIN patients p ON p.id = c.patient_id
WHERE c.status = 'confirmado'
GROUP BY p.id, p.nome, p.telefone, p.convenio
HAVING count(*) > 1
ORDER BY count(*) DESC;

-- ── 8. FUNÇÕES ÚTEIS ───────────────────────────────────────

-- Função para atualizar atualizado_em automaticamente
CREATE OR REPLACE FUNCTION update_atualizado_em()
RETURNS TRIGGER AS $$
BEGIN
  NEW.atualizado_em = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Triggers de atualizado_em
DROP TRIGGER IF EXISTS patients_atualizado_em ON patients;
CREATE TRIGGER patients_atualizado_em
  BEFORE UPDATE ON patients
  FOR EACH ROW EXECUTE FUNCTION update_atualizado_em();

DROP TRIGGER IF EXISTS consultas_atualizado_em ON consultas;
CREATE TRIGGER consultas_atualizado_em
  BEFORE UPDATE ON consultas
  FOR EACH ROW EXECUTE FUNCTION update_atualizado_em();

DROP TRIGGER IF EXISTS config_automacao_atualizado_em ON config_automacao;
CREATE TRIGGER config_automacao_atualizado_em
  BEFORE UPDATE ON config_automacao
  FOR EACH ROW EXECUTE FUNCTION update_atualizado_em();

-- ── 9. ROW LEVEL SECURITY (Fase 1: Permissivo) ────────────
-- Por enquanto, RLS permissivo para anon key (1 clínica, sem auth)
-- Na fase 2, adicionar auth e policies restritivas

ALTER TABLE patients ENABLE ROW LEVEL SECURITY;
ALTER TABLE consultas ENABLE ROW LEVEL SECURITY;
ALTER TABLE mensagem_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE historico_confirmacoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE logs_erro ENABLE ROW LEVEL SECURITY;
ALTER TABLE config_automacao ENABLE ROW LEVEL SECURITY;

-- Policies permissivas (fase 1)
DO $$
BEGIN
  -- patients
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'patients_allow_all' AND tablename = 'patients') THEN
    CREATE POLICY patients_allow_all ON patients FOR ALL USING (true) WITH CHECK (true);
  END IF;
  -- consultas
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'consultas_allow_all' AND tablename = 'consultas') THEN
    CREATE POLICY consultas_allow_all ON consultas FOR ALL USING (true) WITH CHECK (true);
  END IF;
  -- mensagem_logs
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'mensagem_logs_allow_all' AND tablename = 'mensagem_logs') THEN
    CREATE POLICY mensagem_logs_allow_all ON mensagem_logs FOR ALL USING (true) WITH CHECK (true);
  END IF;
  -- historico_confirmacoes
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'hist_conf_allow_all' AND tablename = 'historico_confirmacoes') THEN
    CREATE POLICY hist_conf_allow_all ON historico_confirmacoes FOR ALL USING (true) WITH CHECK (true);
  END IF;
  -- logs_erro
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'logs_erro_allow_all' AND tablename = 'logs_erro') THEN
    CREATE POLICY logs_erro_allow_all ON logs_erro FOR ALL USING (true) WITH CHECK (true);
  END IF;
  -- config_automacao
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'config_auto_allow_all' AND tablename = 'config_automacao') THEN
    CREATE POLICY config_auto_allow_all ON config_automacao FOR ALL USING (true) WITH CHECK (true);
  END IF;
END $$;

-- ============================================================
-- FIM DO SCHEMA
-- Próximo passo: copie e cole este SQL no Supabase SQL Editor
-- ============================================================
