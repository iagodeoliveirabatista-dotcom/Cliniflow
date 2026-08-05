-- ============================================================
-- Cliniflow — Schema (estado REAL do banco, não o planejado)
-- Projeto: mxvaufkqijdkapvtkvee  |  Extraído em: 2026-07-26
--
-- Reconstruído por introspecção (information_schema + pg_constraint).
-- Difere dos arquivos supabase-schema-fase1/fase2.sql, que são migrações
-- históricas e já não refletem o banco.
-- ============================================================

CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS pg_net;


-- ── MULTI-TENANT ────────────────────────────────────────────
CREATE TABLE public.clinics (
    id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name                 text NOT NULL,
    cnpj                 text,
    evolution_instance   text UNIQUE,     -- NULL até alguém provisionar a Evolution (onboarding, D-OPEN-4)
    evolution_apikey     text,            -- idem — clínica auto-cadastrada nasce sem isso
    rules_config         jsonb DEFAULT '{}'::jsonb,
    criado_em            timestamptz DEFAULT now(),
    telefone_notificacao text            -- usada pelo nó "AVISO SECRETÁRIA"
);


-- Vínculo conta ↔ clínica. Um login por clínica (DECISIONS.md D-6).
-- Criada em 28/07/2026, etapa 1 do docs/plano-auth-rls.md.
CREATE TABLE public.clinic_users (
    user_id   uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    clinic_id uuid NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
    nome      text,
    papel     text NOT NULL DEFAULT 'recepcao',   -- 'recepcao' | 'admin'
    criado_em timestamptz DEFAULT now()
);
CREATE INDEX clinic_users_clinic_idx ON public.clinic_users(clinic_id);


-- ── PACIENTES ───────────────────────────────────────────────
-- ⚠️ telefone aqui é gravado com 11 DÍGITOS (DDD+9+número), sem o DDI 55.
--    Já sessoes_ativas.telefone e mensagem_logs.telefone usam 13 dígitos.
CREATE TABLE public.patients (
    id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    nome           text NOT NULL,
    telefone       text NOT NULL UNIQUE,
    email          text,
    convenio       text DEFAULT 'Particular'::text,
    data_nasc      date,
    status         text DEFAULT 'ativo'::text,
    criado_em      timestamptz DEFAULT now(),
    atualizado_em  timestamptz DEFAULT now(),
    clinic_id      uuid REFERENCES public.clinics(id) ON DELETE SET NULL,
    bot_pausado    boolean DEFAULT false,
    origem_lead    text
);


-- ── AGENDA ──────────────────────────────────────────────────
-- status: 'pendente' | 'confirmado' | 'cancelado' | 'no_show' | 'remarcado' | 'solicitado'
--   'solicitado' = criado pela IA (tool criar_pre_agendamento), aguarda aprovação.
CREATE TABLE public.consultas (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    patient_id      uuid REFERENCES public.patients(id) ON DELETE SET NULL,
    data_hora       timestamptz NOT NULL,
    duracao_min     integer DEFAULT 30,
    tipo            text DEFAULT 'Consulta de rotina'::text,
    medico          text,
    status          text DEFAULT 'pendente'::text,
    convenio        text DEFAULT 'Particular'::text,
    preco           numeric,
    whatsapp_ativo  boolean DEFAULT true,
    google_event_id text,
    notas           text,
    criado_em       timestamptz DEFAULT now(),
    atualizado_em   timestamptz DEFAULT now(),
    clinic_id       uuid REFERENCES public.clinics(id) ON DELETE SET NULL
);


-- ── CONVERSAS (CRM) ─────────────────────────────────────────
CREATE TABLE public.conversations (
    id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    display_id       bigserial NOT NULL,
    clinic_id        uuid REFERENCES public.clinics(id) ON DELETE CASCADE,
    patient_id       uuid REFERENCES public.patients(id) ON DELETE CASCADE,
    status           text NOT NULL DEFAULT 'open'::text,   -- 'open' | 'resolved' | 'snoozed'
    assignee_id      uuid REFERENCES auth.users(id) ON DELETE SET NULL,
    last_activity_at timestamptz DEFAULT now(),
    criado_em        timestamptz DEFAULT now()
);


-- ── MENSAGENS ───────────────────────────────────────────────
-- ⚠️ INSERT com tipo='manual' + direcao='saida' DISPARA o envio real
--    ao WhatsApp via trigger secretary_message_trigger. Ver 02-functions-triggers.sql.
CREATE TABLE public.mensagem_logs (
    id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    consulta_id            uuid REFERENCES public.consultas(id) ON DELETE SET NULL,
    patient_id             uuid REFERENCES public.patients(id) ON DELETE SET NULL,
    telefone               text NOT NULL,          -- 13 dígitos (55+DDD+9+número)
    tipo                   text NOT NULL,          -- 'manual' (humano) | 'auto' (IA)
    canal                  text DEFAULT 'whatsapp'::text,
    direcao                text DEFAULT 'saida'::text,   -- 'entrada' | 'saida'
    mensagem               text,
    evo_message_id         text,
    intencao_detectada     text,
    confianca_percentual   integer DEFAULT 0,
    status                 text DEFAULT 'pending'::text, -- 'pending'|'sending'|'sent'|'failed'
    enviado_em             timestamptz DEFAULT now(),
    conversation_id        uuid REFERENCES public.conversations(id) ON DELETE CASCADE,
    private                boolean DEFAULT false,  -- nota interna, NÃO deveria ir ao paciente
    sender_id              uuid REFERENCES auth.users(id) ON DELETE SET NULL,
    attachment_url         text,
    procedimento_interesse text,
    tipo_objecao           text
);


-- ── SESSÕES (janela de 16h / controle da IA) ────────────────
-- atendimento_humano = true  →  a IA fica muda para este telefone.
-- ⚠️ A coluna google_event_id FOI REMOVIDA. A edge function enviar-whatsapp
--    ainda tenta gravá-la (ver docs/ARMADILHAS.md).
CREATE TABLE public.sessoes_ativas (
    telefone           text PRIMARY KEY,           -- 13 dígitos (55+DDD+9+número)
    nome_paciente      text,
    criado_em          timestamptz,
    expira_em          timestamptz NOT NULL,
    patient_id         uuid REFERENCES public.patients(id) ON DELETE SET NULL,
    status             text DEFAULT 'pending'::text,
    doctor             text,
    tipo               text,
    duracao_min        integer DEFAULT 30,
    preco              numeric,
    convenio           text DEFAULT 'Particular'::text,
    atendimento_humano boolean DEFAULT false,
    consulta_id        uuid
);


-- ── DEBOUNCE DE MENSAGENS PICADAS ───────────────────────────
CREATE TABLE public.whatsapp_buffer (
    telefone           text PRIMARY KEY,
    mensagem_acumulada text NOT NULL,
    updated_at         timestamptz DEFAULT now()
);


-- ── BASE DE CONHECIMENTO (RAG) ──────────────────────────────
-- embedding: vector(3072) — Gemini models/gemini-embedding-2.
CREATE TABLE public.documentos_clinica (
    id        bigserial PRIMARY KEY,
    content   text,
    metadata  jsonb,
    embedding vector(3072)
);


-- ── HISTÓRICO / OBSERVABILIDADE ─────────────────────────────
CREATE TABLE public.historico_confirmacoes (
    id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    telefone             text NOT NULL,
    nome_paciente        text NOT NULL,
    acao                 text NOT NULL,
    mensagem_usuario     text,
    intencao_detectada   text,
    confianca_percentual integer DEFAULT 0,
    consulta_id          uuid REFERENCES public.consultas(id) ON DELETE SET NULL,
    criado_em            timestamptz DEFAULT now()
);

-- Destino único de erro dos três componentes (n8n, edge functions, frontend).
-- workflow_name/node_name nasceram mapeados ao nó do n8n; nas edge functions viram
-- slug da função e ponto de falha.
CREATE TABLE public.logs_erro (
    id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    workflow_name text NOT NULL,
    node_name     text NOT NULL,
    error_message text NOT NULL,
    execution_id  text,
    criado_em     timestamptz DEFAULT now(),
    origem        text NOT NULL DEFAULT 'n8n'::text   -- 'n8n' | 'edge' | 'frontend'
);
-- O DEFAULT 'n8n' é o que mantém o nó `LOG DE ERRO` do n8n funcionando sem alteração:
-- ele não mapeia `origem`, e a coluna é NOT NULL. Não remova o default.


-- ── AUTOMAÇÃO DE LEMBRETES ──────────────────────────────────
CREATE TABLE public.config_automacao (
    id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tipo_lembrete      text NOT NULL UNIQUE,
    ativo              boolean DEFAULT true,
    horario_envio      time,
    antecedencia_horas integer DEFAULT 24,
    template_mensagem  text NOT NULL,
    webhook_url        text,
    criado_em          timestamptz DEFAULT now(),
    atualizado_em      timestamptz DEFAULT now()
);


-- ── MEMÓRIA DO AGENTE (gerada pelo n8n) ─────────────────────
CREATE TABLE public.n8n_chat_histories (
    id         serial PRIMARY KEY,
    session_id varchar(255) NOT NULL,   -- = patient_id
    message    jsonb NOT NULL
);


-- ── LANDING PAGE (fora do fluxo principal) ──────────────────
CREATE TABLE public.pagina_captura (
    nmr       bigint NOT NULL,
    nome      text NOT NULL,
    "queixa(s)" text,
    email     text NOT NULL,
    idade     bigint,
    PRIMARY KEY (nmr, email)
);


-- ── VIEWS DE KPI ────────────────────────────────────────────
-- kpi_comparecimento, kpi_resumo_mensal, kpi_retencao, kpi_sessoes_dia_semana
-- (definições em cliniflow-export/supabase-schema.sql)
