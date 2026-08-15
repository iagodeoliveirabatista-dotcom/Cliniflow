# Plano de execução — Login no CRM + RLS por clínica

**Para:** o agente que for implementar (Gemini / Codex / outro)
**Escrito em:** 26/07/2026, após auditoria do sistema em execução
**Projeto Supabase:** `mxvaufkqijdkapvtkvee`

Leia este documento inteiro antes de escrever a primeira linha. As armadilhas da
seção 3 derrubam a implementação se forem descobertas no meio do caminho.

---

## ⚠️ ERRATA — 28/07/2026 (leia antes do resto)

Este plano foi parcialmente executado em 28/07. **Quatro coisas nele estão erradas ou
incompletas.** O roteiro corrigido, pronto para colar, é
[`db/04-fechamento-rls.sql`](db/04-fechamento-rls.sql) — use aquele, não os SQLs daqui.

| Onde | O que o plano diz | O que é verdade |
|---|---|---|
| §2 | "a credencial do n8n **é** `service_role`" (inferência) | ✅ **Confirmado por medição** em 28/07, nos dois workflows. Não é mais suposição. |
| §4.2 | `REVOKE ALL ON FUNCTION ... FROM public;` | **Insuficiente sozinho.** O Supabase concede `EXECUTE` a `anon` por fora, via `ALTER DEFAULT PRIVILEGES`. São duas concessões. `ARMADILHAS.md` §17 |
| §4.3 | dropar as policies de `logs_erro`, `config_automacao`, `historico_confirmacoes` e não criar nada | **Quebra o CRM.** `fetchSaudeSistema()` lê `logs_erro` (é o único lugar onde erro aparece), a aba Automações lê e escreve `config_automacao`. Precisam de policy para `authenticated`. |
| §5 | "hoje isso só não estoura porque a tabela está vazia" | **Falso.** `consultas.data_hora` é `NOT NULL` sem default e o nó nunca mandava o campo: a ferramenta já falhava com `23502`, independente de RLS. `ARMADILHAS.md` §18 |

**E o que o plano não cobre:** fechar a tabela não fecha o dado. Havia duas passagens
`SECURITY DEFINER` alcançáveis pela chave anon — a view `kpi_retencao` e a RPC
`process_secretary_message`, que devolvia a `evolution_apikey`. Ambas fechadas em 28/07,
mas **nada neste plano teria pego isso**. Ver `ARMADILHAS.md` §16.

---

## 1. Objetivo

Hoje o CRM não tem login. Por causa disso, sete tabelas estão com política
`FOR ALL USING (true)` — ou seja, a chave `anon` (que é pública, está no
`cliniflow-export/config.js` servido ao browser) lê e escreve dados de paciente.

**Verificado em 26/07/2026:** um `GET /rest/v1/patients` com a chave anon devolveu
pacientes reais. O mesmo em `mensagem_logs` devolveu conversas.

### Critério de sucesso (verificável, não "achismo")

Ao final, estes quatro comandos devem se comportar assim:

```bash
# 1. Sem login, com a chave anon pública → DEVE voltar vazio
curl "https://mxvaufkqijdkapvtkvee.supabase.co/rest/v1/patients?select=*" \
  -H "apikey: <ANON_KEY>"
# esperado: []

# 2. Logado como usuário da Clínica A → DEVE ver só os pacientes da Clínica A
# 3. Logado como usuário da Clínica A → NÃO pode ver pacientes da Clínica B
# 4. O fluxo do n8n continua funcionando ponta a ponta (mensagem entra, IA responde)
```

O item 4 é o que costuma quebrar. Ver seção 3.

---

## 2. Situação atual (fatos apurados, não suposições)

### Tabelas e estado do RLS

| Tabela | RLS | Política atual | Ação |
|---|---|---|---|
| `patients` | on | `allow_all` | **fechar** |
| `consultas` | on | `allow_all` | **fechar** ⚠️ ver 3.2 |
| `mensagem_logs` | on | `allow_all` + anon select/insert | **fechar** |
| `conversations` | on | anon select/update/insert | **fechar** |
| `sessoes_ativas` | on | `allow_all` | **fechar** |
| `historico_confirmacoes` | on | `allow_all` | fechar |
| `logs_erro` | on | `allow_all` | fechar |
| `config_automacao` | on | `allow_all` | fechar |
| `clinics` | on | **nenhuma** | já fechada — não mexer |
| `documentos_clinica` | on | **nenhuma** | já fechada — não mexer |
| `whatsapp_buffer` | on | **nenhuma** | já fechada — não mexer |

Schema completo em [`docs/db/01-schema.sql`](db/01-schema.sql).
Políticas atuais em [`docs/db/03-rls-policies.sql`](db/03-rls-policies.sql).

### Quais tabelas têm `clinic_id`

`patients`, `consultas`, `conversations` têm a coluna. **`mensagem_logs` e
`sessoes_ativas` NÃO têm** — o isolamento delas precisa ser por join. Ver 4.3.

### Como o n8n acessa o banco hoje

Duas vias diferentes, e isso importa muito:

1. **Nós Supabase nativos** (`Busca Clinica`, `Cria Paciente`, `Grava Mensagem Inbound`, etc.)
   usam uma credencial do n8n. **Ela é `service_role`** — dá para afirmar porque esses nós
   leem `clinics` e `documentos_clinica`, que já estão fechadas sem nenhuma política. Se
   fosse `anon`, o fluxo já estaria quebrado hoje. `service_role` **ignora RLS**, então
   esses nós continuarão funcionando depois do fechamento.

2. **Nós HTTP crus** com a chave `anon` hardcoded:
   - `Append Buffer (RPC)` → chama `append_whatsapp_buffer`, que é `SECURITY DEFINER`.
     Funciona mesmo com a tabela fechada. **Não precisa mexer.**
   - `criar_pre_agendamento` (ferramenta da IA) → faz `POST /rest/v1/consultas` **direto
     na tabela**, com a chave anon. **Isto vai quebrar** quando `consultas` for fechada.
     Ver 3.2.

---

## 3. Armadilhas — leia antes de começar

### 3.1. Recursão infinita na política da tabela de vínculo

Se a política de `clinic_users` consultar `clinic_users`, o Postgres entra em recursão e
devolve erro. **Sempre** resolva o `clinic_id` do usuário por uma função
`SECURITY DEFINER`, que roda fora do RLS. Está previsto na seção 4.2 — não improvise.

### 3.2. A ferramenta de pré-agendamento da IA vai parar

`criar_pre_agendamento` insere em `consultas` com a chave anon. Fechando a tabela, a IA
perde a capacidade de criar pré-agendamentos — e vai falhar **silenciosamente**, porque o
código do nó captura a exceção e devolve `{success: false}` para o modelo, que provavelmente
dirá ao paciente que agendou.

**Solução:** criar uma RPC `SECURITY DEFINER` e trocar a chamada do nó. Seção 5.

### 3.3. Telefone tem dois formatos

- `patients.telefone` → **11 dígitos** (`DDD9XXXXXXXX`)
- `sessoes_ativas.telefone` e `mensagem_logs.telefone` → **13 dígitos** (`55DDD9XXXXXXXX`)

Qualquer join ou política que cruze essas tabelas por telefone precisa converter.
Existe o helper `telefoneSessao()` em `cliniflow-export/supabase-client.js`.
Detalhes em [`docs/ARMADILHAS.md`](ARMADILHAS.md) §3.

### 3.4. O Realtime também respeita RLS

O CRM depende de WebSocket (`subscribeToMensagens`, `subscribeToPacientes`,
`subscribeToConversas`). Depois de fechar as tabelas, **as inscrições só entregam eventos
das linhas que a política permite** — e só se o cliente estiver autenticado. Se o login
não estiver propagando a sessão para o client do supabase-js, o chat simplesmente para de
atualizar sem erro no console. Teste isso explicitamente.

### 3.5. Não feche tudo de uma vez

Feche **uma tabela por vez**, testando o fluxo do n8n e o CRM entre cada uma. Fechar as
oito de uma vez e depois debugar é como este projeto já se enrolou antes.

---

## 4. Etapa 1 — Banco

### 4.1. Tabela de vínculo usuário ↔ clínica

```sql
CREATE TABLE public.clinic_users (
  user_id   uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  clinic_id uuid NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  nome      text,
  papel     text NOT NULL DEFAULT 'recepcao',  -- 'recepcao' | 'admin'
  criado_em timestamptz DEFAULT now()
);
CREATE INDEX clinic_users_clinic_idx ON public.clinic_users(clinic_id);
ALTER TABLE public.clinic_users ENABLE ROW LEVEL SECURITY;
```

### 4.2. Função que resolve a clínica do usuário logado

`SECURITY DEFINER` é obrigatório aqui — é o que evita a recursão da armadilha 3.1.

```sql
CREATE OR REPLACE FUNCTION public.auth_clinic_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT clinic_id FROM public.clinic_users WHERE user_id = auth.uid();
$$;

REVOKE ALL ON FUNCTION public.auth_clinic_id() FROM public;
GRANT EXECUTE ON FUNCTION public.auth_clinic_id() TO authenticated;
```

Política da própria `clinic_users` (usa a função, não a tabela):

```sql
CREATE POLICY clinic_users_self ON public.clinic_users
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());
```

### 4.3. Políticas por tabela

**Tabelas com `clinic_id` direto:**

```sql
DROP POLICY IF EXISTS patients_allow_all ON public.patients;
CREATE POLICY patients_por_clinica ON public.patients
  FOR ALL TO authenticated
  USING (clinic_id = public.auth_clinic_id())
  WITH CHECK (clinic_id = public.auth_clinic_id());

DROP POLICY IF EXISTS consultas_allow_all ON public.consultas;
CREATE POLICY consultas_por_clinica ON public.consultas
  FOR ALL TO authenticated
  USING (clinic_id = public.auth_clinic_id())
  WITH CHECK (clinic_id = public.auth_clinic_id());

DROP POLICY IF EXISTS "Allow anon select conversations" ON public.conversations;
DROP POLICY IF EXISTS "Allow anon update conversations" ON public.conversations;
DROP POLICY IF EXISTS "Allow anon insert conversations" ON public.conversations;
CREATE POLICY conversations_por_clinica ON public.conversations
  FOR ALL TO authenticated
  USING (clinic_id = public.auth_clinic_id())
  WITH CHECK (clinic_id = public.auth_clinic_id());
```

**`mensagem_logs` — não tem `clinic_id`,** isola por join com `conversations`:

```sql
DROP POLICY IF EXISTS mensagem_logs_allow_all ON public.mensagem_logs;
DROP POLICY IF EXISTS "Allow anon insert mensagem_logs" ON public.mensagem_logs;
DROP POLICY IF EXISTS "Allow anon select mensagem_logs" ON public.mensagem_logs;
CREATE POLICY mensagem_logs_por_clinica ON public.mensagem_logs
  FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.conversations c
    WHERE c.id = mensagem_logs.conversation_id
      AND c.clinic_id = public.auth_clinic_id()
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.conversations c
    WHERE c.id = mensagem_logs.conversation_id
      AND c.clinic_id = public.auth_clinic_id()
  ));
```

> ⚠️ Linhas com `conversation_id IS NULL` ficam invisíveis para todo mundo.
> Antes de aplicar, rode `SELECT count(*) FROM mensagem_logs WHERE conversation_id IS NULL;`
> e decida o que fazer com elas (backfill ou aceitar a perda de visibilidade).

**`sessoes_ativas` — não tem `clinic_id`,** isola por join com `patients` **convertendo o
telefone** (armadilha 3.3):

```sql
DROP POLICY IF EXISTS sessoes_ativas_allow_all ON public.sessoes_ativas;
CREATE POLICY sessoes_ativas_por_clinica ON public.sessoes_ativas
  FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.patients p
    WHERE p.clinic_id = public.auth_clinic_id()
      AND right(regexp_replace(sessoes_ativas.telefone, '\D', '', 'g'), 11)
        = right(regexp_replace(p.telefone, '\D', '', 'g'), 11)
  ))
  WITH CHECK (true);
```

> Alternativa mais limpa e recomendada: a tabela **já tem** a coluna `patient_id`
> (hoje não preenchida pelo n8n). Se você fizer o n8n gravá-la, a política vira um join
> direto por `patient_id` e você elimina a comparação por string. Prefira este caminho
> se tiver como mexer no n8n.

**Tabelas operacionais** (`historico_confirmacoes`, `logs_erro`, `config_automacao`):
não têm `clinic_id` nem vínculo claro. O mais simples e seguro é **remover o acesso da
role anon e não criar política para `authenticated`** — só `service_role` (n8n) acessa:

```sql
DROP POLICY IF EXISTS hist_conf_allow_all ON public.historico_confirmacoes;
DROP POLICY IF EXISTS logs_erro_allow_all ON public.logs_erro;
DROP POLICY IF EXISTS config_auto_allow_all ON public.config_automacao;
```

> ⚠️ Confira antes se o CRM lê `config_automacao` (a aba de Automação lê). Se ler,
> crie uma política de SELECT para `authenticated` nessa tabela.

---

## 5. Etapa 2 — Destravar a ferramenta de pré-agendamento da IA

Sem isto, fechar `consultas` quebra a IA (armadilha 3.2).

```sql
CREATE OR REPLACE FUNCTION public.criar_pre_agendamento(
  p_patient_id uuid,
  p_clinic_id  uuid,
  p_tipo       text DEFAULT 'consulta',
  p_notas      text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_id uuid;
BEGIN
  -- valida que o paciente realmente pertence à clínica informada
  IF NOT EXISTS (
    SELECT 1 FROM public.patients
    WHERE id = p_patient_id AND clinic_id = p_clinic_id
  ) THEN
    RAISE EXCEPTION 'paciente % nao pertence a clinica %', p_patient_id, p_clinic_id;
  END IF;

  INSERT INTO public.consultas (patient_id, clinic_id, status, tipo, notas, data_hora)
  VALUES (p_patient_id, p_clinic_id, 'solicitado', p_tipo, p_notas, now())
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.criar_pre_agendamento(uuid,uuid,text,text) TO anon;
```

> `consultas.data_hora` é `NOT NULL`. O código atual do nó não manda data — hoje isso
> só não estoura porque a tabela está vazia. Usei `now()` como placeholder, já que a
> recepção define o horário real ao aprovar. Confirme se é o comportamento desejado.

**Depois:** no n8n, no nó `criar_pre_agendamento`, trocar o `POST /rest/v1/consultas`
por `POST /rest/v1/rpc/criar_pre_agendamento` com o corpo
`{p_patient_id, p_clinic_id, p_tipo, p_notas}`. A chave anon continua servindo.

---

## 6. Etapa 3 — Frontend

Arquivos: `cliniflow-export/supabase-client.js` e `cliniflow-export/cliniflow-components.jsx`.
É JS puro com React via CDN, **sem build step** — não introduza bundler, não introduza
router. O app inteiro é uma SPA que já existe; você só está colocando um portão na frente.

### 6.1. A tela

Card centralizado na viewport, fundo `var(--supabase-bg-studio)`. Combine com o visual que já
existe no CRM (tema escuro, `#161616` nos inputs, `1px solid var(--supabase-border)`,
`borderRadius: 8`, o `accent` como cor do botão). **Não invente um sistema visual novo.**

Conteúdo, e só isto:
- Nome da clínica / "Cliniflow"
- Campo e-mail (`type="email"`, `autoComplete="username"`)
- Campo senha (`type="password"`, `autoComplete="current-password"`)
- Botão **Entrar** (estado `disabled` enquanto envia, texto vira `"..."`)
- Uma linha de erro, em vermelho, abaixo dos campos

**Sem** link de criar conta. **Sem** "esqueci minha senha". Ver decisão 6.4.

Mensagens de erro — traduza, não vaze o erro cru do Supabase:
- `Invalid login credentials` → "E-mail ou senha incorretos."
- falha de rede → "Sem conexão com o servidor. Verifique a internet."
- qualquer outro → "Não foi possível entrar. Tente de novo."

### 6.2. Sessão

O supabase-js v2 já persiste em `localStorage` e renova o token sozinho — **os defaults
estão certos, não os desabilite** e não construa header `Authorization` manualmente.

```js
// no boot, antes de renderizar o app
const { data: { session } } = await supabase.auth.getSession();

// e reagir a mudanças (logout, token revogado)
supabase.auth.onAuthStateChange((_event, session) => { /* re-render */ });
```

Sem sessão → renderiza a tela de login. Com sessão → renderiza o CRM.
Botão **Sair** no cabeçalho, chamando `supabase.auth.signOut()`.

> ⚠️ **Cuidado com o Realtime.** As inscrições WebSocket precisam ser criadas **depois** de
> haver sessão, e refeitas se a sessão mudar. Se você assinar antes do login, o canal sobe
> sem JWT e, com o RLS fechado, não entrega evento nenhum — silenciosamente. Ver armadilha 3.4.

### 6.3. `sender_id` e `assignee_id` com login compartilhado

A decisão foi **um login por clínica** (ver 6.4). Isso muda o significado dessas colunas:

- **`mensagem_logs.sender_id`** → deixe **NULL**. Com uma conta só, gravar o uid não diz quem
  escreveu; é dado sem informação, e dado sem informação engana quem for ler depois.
- **`conversations.assignee_id`** → **continue usando**, mas o significado degrada de
  *"quem assumiu"* para *"se alguém assumiu"*. Isso ainda é útil: é o que faz a conversa
  aparecer como `Humano` no cabeçalho e alimenta as abas *minhas / não atribuídas / resolvidas*.
  Grave `session.user.id` quando a recepção assumir.

**Remova o hack do uuid fantasma.** Hoje existem comparações contra
`'d3b07384-ad6b-4f5c-9ab4-66e2854d88ad'` (que é o **id da clínica**, usado como se fosse um
usuário) em `updateConversa` e `enviarMensagemCRM`, zerando os campos. Troque por
`session.user.id` no `assignee_id` e `null` fixo no `sender_id`.

### 6.4. Decisões já tomadas — não reabra

| Decisão | Escolha | Consequência para você |
|---|---|---|
| Identidade | **Um login por clínica** | Não construa gestão de usuários. Uma conta só. |
| Quem cria contas | **O dono, pelo painel do Supabase** | Não construa autocadastro nem convite por e-mail. |
| Sessão | **Não expira** | Mantenha os defaults do supabase-js. Não implemente timeout de inatividade. |

Recuperação de senha é feita pelo painel do Supabase (Authentication → o usuário →
*Send password recovery*). Por isso não há link de "esqueci a senha" na tela.

**Não substitua isso por "algo melhor".** São escolhas conscientes para uma clínica só;
a ampliação vem depois, se vier.

### 6.5. `config.js`

A chave anon continua no arquivo, e **tudo bem**: com o RLS fechado ela deixa de dar acesso a
dado nenhum sem login. Esse é justamente o objetivo do trabalho — não tente escondê-la.

---

## 7. Etapa 4 — Criar a conta da clínica e vincular

No painel: **Authentication → Add user → Create new user**. Marque
*Auto Confirm User* (não há fluxo de confirmação por e-mail neste projeto).
Use um e-mail que a clínica controle, ex. `recepcao@<clinica>.com.br`.

```sql
-- vincula a conta à clínica (uma linha por clínica, decisão 6.4)
INSERT INTO public.clinic_users (user_id, clinic_id, nome, papel)
VALUES ('<uuid-do-usuario>', '<uuid-da-clinica>', 'Recepção', 'admin');
```

Confira que o vínculo funciona **antes** de fechar qualquer tabela — logado como esse
usuário, `SELECT public.auth_clinic_id();` tem que devolver o uuid da clínica, não NULL.
Se devolver NULL, todas as políticas vão negar tudo e você vai debugar a tela achando que
é o frontend.

Conferir que todo dado existente tem dono antes de fechar:

```sql
SELECT count(*) FROM patients      WHERE clinic_id IS NULL;
SELECT count(*) FROM consultas     WHERE clinic_id IS NULL;
SELECT count(*) FROM conversations WHERE clinic_id IS NULL;
```

Se qualquer um for > 0, faça backfill **antes** — senão essas linhas somem da tela.

---

## 8. Ordem de execução e teste

Uma etapa por vez. Depois de **cada** fechamento, rodar os dois testes:

- **Teste A (n8n):** mandar mensagem no WhatsApp da instância de teste → confirmar que
  o paciente é criado/encontrado, a IA responde, e a resposta aparece no CRM.
- **Teste B (CRM):** logado, ver conversas e pacientes; enviar mensagem manual;
  confirmar que a bolha atualiza sozinha (WebSocket) e que a IA fica muda depois.

| # | Ação | Teste |
|---|---|---|
| 1 | `clinic_users` + `auth_clinic_id()` | função devolve o uuid certo |
| 2 | RPC `criar_pre_agendamento` + trocar nó no n8n | A |
| 3 | Login no frontend | B |
| 4 | Fechar `patients` | A + B |
| 5 | Fechar `conversations` | A + B |
| 6 | Fechar `mensagem_logs` | A + B |
| 7 | Fechar `consultas` | A + B |
| 8 | Fechar `sessoes_ativas` | A + B |
| 9 | Fechar as operacionais | A + B |
| 10 | Rodar os 4 critérios da seção 1 | todos |

---

## 9. Rollback

Se algo quebrar e for preciso voltar rápido, reabrir uma tabela é uma linha:

```sql
CREATE POLICY <nome>_allow_all ON public.<tabela>
  FOR ALL USING (true) WITH CHECK (true);
```

O estado original completo está em [`docs/db/03-rls-policies.sql`](db/03-rls-policies.sql).
Reabrir é uma medida de emergência, não um final aceitável.

---

## 10. Ao terminar

Contrato de handoff deste projeto (ver `CLAUDE.md`):

1. Atualizar o `AGENTS.md` ("Estado atual" e "Próximos passos") com o que foi feito e o que
   ficou pela metade. *(Era o `SYNC_STATUS.md`, removido em 15/08/2026 — D-29.)*
2. Regravar `docs/db/03-rls-policies.sql` com o estado novo.
3. Registrar em `docs/ARMADILHAS.md` qualquer coisa que tenha custado tempo.
4. Marcar ✅ **apenas** o que você viu funcionando. "Aplicou sem erro" não é "funciona".
