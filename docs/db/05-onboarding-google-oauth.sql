-- ============================================================
-- ✅ SQL JÁ EXECUTADO — 29/07/2026. NÃO RODE DE NOVO.
--
-- O estado resultante está em 01-schema.sql (evolution_instance/apikey
-- nullable) e 02-functions-triggers.sql (registrar_clinica). Este arquivo
-- é REGISTRO do que foi feito + os passos manuais que ainda faltam fora
-- do banco (Google Cloud Console e Supabase Dashboard).
-- ============================================================
--
-- Cliniflow — LOGIN COM GOOGLE + ONBOARDING SELF-SERVICE
-- Decisão: docs/DECISIONS.md D-OPEN-4 (reabre a D-6, ver texto lá).
--
-- Contexto: D-6 fechou "uma conta por clínica, criada à mão pelo dono no
-- painel do Supabase, sem autocadastro". Este trabalho reverte a parte de
-- autocadastro porque o usuário decidiu, em 29/07/2026, implementar as duas
-- partes juntas (botão Google + onboarding), não só o botão.
-- ============================================================


-- ════════════════════════════════════════════════════════════
-- PARTE A — BANCO (já aplicado, migração onboarding_clinica_google_oauth)
-- ════════════════════════════════════════════════════════════

-- A1. evolution_instance/evolution_apikey passam a aceitar NULL.
--     Motivo: uma clínica auto-cadastrada nasce sem Evolution provisionada;
--     os NOT NULL originais quebrariam o INSERT feito pela RPC abaixo.
--     UNIQUE em evolution_instance continua valendo — Postgres permite
--     múltiplos NULL numa coluna UNIQUE, então isso não colide entre si.
ALTER TABLE public.clinics ALTER COLUMN evolution_instance DROP NOT NULL;
ALTER TABLE public.clinics ALTER COLUMN evolution_apikey DROP NOT NULL;

-- A2. RPC registrar_clinica(p_nome) — ver definição completa e comentada
--     em 02-functions-triggers.sql. Resumo do que ela garante:
--       - exige auth.uid() (só authenticated pode chamar — REVOKE de anon)
--       - gera o clinic_id no servidor (gen_random_uuid() do DEFAULT)
--       - recusa se a conta já tiver linha em clinic_users
--       - insere clinics + clinic_users na mesma função (SECURITY DEFINER
--         bypassa a ausência de policy de INSERT nas duas tabelas)


-- ════════════════════════════════════════════════════════════
-- PARTE B — FORA DO BANCO (passos manuais, ainda pendentes)
-- ════════════════════════════════════════════════════════════
-- Nada abaixo é SQL. Sem isso, o botão "Entrar com o Google" aparece no CRM
-- mas falha ao clicar — o provider não está configurado no Supabase Auth.

-- B1. Google Cloud Console:
--     APIs & Services → Credentials → Create OAuth client ID (Web application)
--     Authorized redirect URI: https://mxvaufkqijdkapvtkvee.supabase.co/auth/v1/callback

-- B2. Supabase Dashboard:
--     Authentication → Providers → Google → ativar, colar Client ID e Client Secret do B1.

-- B3. Supabase Dashboard → Authentication → URL Configuration → Redirect URLs:
--     adicionar a origem que o CRM usa. Hoje é local (servir-local.bat, ex.
--     http://localhost:5500 ou o que o navegador mostrar) — troque/adicione a
--     URL real quando o CRM for publicado. O código usa
--     redirectTo: window.location.origin, então cada origem usada precisa
--     estar na allowlist ou o redirect do OAuth falha.

-- Sem B1-B3, o clique no botão do CRM mostra a mensagem de erro traduzida
-- em supabase-client.js (traduzErroLogin) — não trava a tela, mas não loga.
