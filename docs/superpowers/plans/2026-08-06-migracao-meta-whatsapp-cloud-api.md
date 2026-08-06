# Migração Evolution API → Meta WhatsApp Cloud API — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **Antes de tocar em qualquer coisa aqui:** leia `docs/superpowers/specs/2026-08-06-migracao-meta-whatsapp-cloud-api-design.md` inteiro, `docs/DECISIONS.md` (D-13 a D-18) e `docs/ARMADILHAS.md` §20-22. Este plano assume que o spec já foi lido.

**Goal:** Migrar o canal de WhatsApp do Cliniflow (uma clínica em produção hoje) de Evolution API (self-hosted, não oficial) para Meta WhatsApp Cloud API (oficial), preservando 100% da lógica conversacional (RAG, debounce, detector de silêncio, RLS) e sem tráfego real de paciente passando pelo canal novo antes de um corte único e testado.

**Architecture:** n8n (workflows separados por canal para o recebimento, branch por `canal_whatsapp` para o envio — ver Task 1) + Supabase (novas colunas em `clinics`, nenhuma mudança nas tabelas de mensagem/paciente) + Meta Graph API (chamada via nó HTTP Request genérico, nunca o nó nativo "WhatsApp" do n8n — D-17).

**Tech Stack:** n8n (via MCP), PostgreSQL/Supabase (via MCP), Meta Graph API v20, Edge Functions (Deno/TypeScript).

## Global Constraints

- **Nenhuma tarefa deste plano envia mensagem a paciente real** até a Task 8 (corte), que só acontece com aprovação explícita do usuário no momento — não é uma tarefa "automática" do plano.
- **Nunca reimporte o JSON do workflow por cima do vivo** (`ARMADILHAS.md` §5 / R-1). Toda mudança em workflow existente é via MCP (`update_workflow` + `publish_workflow`) ou criação de workflow novo isolado.
- **`update_workflow` só afeta o rascunho** — toda tarefa que mexe em workflow termina conferindo `activeVersion`, não só `nodes` (`ARMADILHAS.md` §5d).
- **`retryOnFail`/`onError` não são alcançáveis pelo MCP** (`ARMADILHAS.md` §5f) — se alguma tarefa precisar disso, é passo manual pela UI, documentado explicitamente na tarefa.
- **Token de sistema Meta não é global entre BMs** (`ARMADILHAS.md` §22) — antes de testar contra um WABA, confirmar em Business Settings que o usuário de sistema tem esse ativo atribuído.
- **Nó HTTP Request da Graph API:** sem `=` duplicado dentro de campo já em modo expressão; header `Authorization` (nome) com valor `Bearer <token>` — não inverter (`ARMADILHAS.md` §21).
- **Corpo da mensagem sempre via `JSON.stringify`** dentro da expressão do `HTTP Request`, nunca interpolação direta de texto livre no JSON (mesmo risco do §5b, genérico a qualquer JSON montado por expressão).
- **Colunas novas em `clinics` são sempre nullable** (mesmo padrão de `evolution_instance`/`evolution_apikey`) — uma clínica sem Meta configurado continua funcionando no canal que já tinha.
- **Nenhuma decisão aberta é implementada sem confirmação do usuário** (`DECISIONS.md`, regra do topo do arquivo) — Task 0 existe exatamente para isso.
- ⚠️ **Verificado em 06/08/2026 via MCP:** os workflows temporários citados no `AGENTS.md` (`Meta WhatsApp - Verificação de Webhook (temporário)`, `Meta WhatsApp - Teste de Envio (temporário)`) **não aparecem mais pelo nome** na instância n8n (`search_workflows` sem filtro lista só 5 workflows). Existe um `Teste http` (id `Zv2sEDDE1uQkt5s0`, inativo, criado 05/08, atualizado 06/08 04:42) que pode ser um dos dois renomeado — mas está com `availableInMCP: false`, então não dá para confirmar o conteúdo sem o usuário habilitar acesso MCP nele primeiro (card do workflow → toggle MCP). **Não assuma que dá pra copiar configuração de um workflow temporário vivo** — se ele não existir mais, reconstrua a partir do que `ARMADILHAS.md` §20/§21 já documentam campo a campo (é detalhado o suficiente para isso).

## Receita de verificação (adaptada — não há browser/jsx aqui)

Cada tarefa de workflow n8n termina com:
1. `validate_workflow` (MCP n8n) sem erros.
2. `update_workflow` aplicado → reler o workflow → conferir que o **rascunho** tem a mudança.
3. `publish_workflow` → reler de novo → conferir `activeVersion.nodes` (não só `nodes`) → `versionId === activeVersionId`.
4. Teste funcional isolado (número de teste Meta, nunca paciente real) usando `test_workflow` do MCP ou disparo manual, conforme a tarefa.

Cada tarefa de banco (Supabase) termina com:
1. `apply_migration` (MCP supabase) com nome descritivo.
2. `list_tables`/`execute_sql` para conferir a coluna/constraint existe com o tipo certo.
3. `get_advisors` para checar que a mudança não abriu brecha de RLS nova (relevante por causa de `ARMADILHAS.md` §13 — toda tabela nova nasce com RLS e sem policy; colunas em tabela existente não disparam isso, mas checar não custa).

---

## Task 0: Decisões abertas — RESOLVIDA em 06/08/2026

- [x] **Step 1:** `clinics.canal_whatsapp` — **não** criar. Migração é substituição direta, não alternância permanente (D-19).
- [x] **Step 2:** Nome do workflow de produção — `Meta WhatsApp - Producao` (D-21).
- [x] **Step 3:** Evolution é removida do código assim que o corte for confirmado funcionando, sem período de fallback estendido (D-20).
- [ ] **Step 4 (ainda pendente):** path do webhook de produção — o usuário vai entregar isso junto com a URL própria da Meta (previsto 07/08/2026). Bloqueia só o Step 1 da Task 3, não bloqueia Tasks 1-2.

Decisões registradas em `docs/DECISIONS.md` (D-19, D-20, D-21). Pode prosseguir para a Task 1.

---

## Task 1: Colunas Meta em `clinics`

**Files:**
- Modify (via migration, MCP supabase): `public.clinics`
- Modify: `docs/db/01-schema.sql` (documentar o schema real, mesmo padrão das migrações anteriores)

**Depends on:** Task 0 (resolvida — sem `canal_whatsapp`, D-19).

- [ ] **Step 1: Aplicar a migração**

```sql
ALTER TABLE public.clinics
  ADD COLUMN meta_access_token    text,
  ADD COLUMN meta_phone_number_id text,
  ADD COLUMN meta_waba_id         text;
```

Use `apply_migration` (MCP supabase), nome `meta_whatsapp_colunas_clinics`.

- [ ] **Step 2: Verificar**

`list_tables` (MCP supabase) ou `execute_sql`:
```sql
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'clinics'
  AND column_name IN ('meta_access_token','meta_phone_number_id','meta_waba_id');
```
Expected: as 3 colunas, todas nullable, sem default.

- [ ] **Step 3: Atualizar `docs/db/01-schema.sql`** com as colunas novas na definição de `clinics`, seguindo o comentário inline já usado ali para `evolution_instance`/`evolution_apikey`.

- [ ] **Step 4: `get_advisors`** (tipo `security`) — confirmar que nada novo apareceu. Commit dos docs.

- [ ] **Step 5: Estender `process_secretary_message`** (`docs/db/02-functions-triggers.sql:79-112`) — **confirmado por leitura direta do banco em 06/08/2026, não é suposição:** esta RPC (`SECURITY DEFINER`, chamada pelo nó `Busca Credenciais e Trava (RPC)1` no workflow `Cliniflow - Enviar Mensagem CRM`, `snHQtmgTKLgQEpqk`) tem assinatura **explícita e fixa**:
  ```sql
  RETURNS TABLE(telefone text, mensagem text, evolution_apikey text, evolution_instance text)
  ```
  Adicionar as colunas em `clinics` **não basta** para o envio manual do CRM enxergar as credenciais Meta — essa função precisa ser recriada com a assinatura estendida:
  ```sql
  CREATE OR REPLACE FUNCTION public.process_secretary_message(p_message_id uuid)
   RETURNS TABLE(telefone text, mensagem text, evolution_apikey text, evolution_instance text,
                 meta_access_token text, meta_phone_number_id text)
  ...
  SELECT m.telefone, m.mensagem, c.evolution_apikey, c.evolution_instance,
         c.meta_access_token, c.meta_phone_number_id
  FROM ...
  ```
  Mantém a trava atômica (`UPDATE ... SET status = 'sending'`) e o resto do corpo inalterados — só o `SELECT`/`RETURNS TABLE` crescem. **Nota:** o outro consumidor de credencial (`Busca Clinica`, dentro do workflow `Evo-Go`, usado para a resposta do AI Agent) é um nó Supabase `get` genérico, não uma RPC com assinatura fixa — ele já devolve todas as colunas de `clinics` automaticamente, incluindo as novas, sem precisar de mudança.

---

## Task 2: Recriar a branch `meta-api-migration`

**Files:** nenhum arquivo — operação de git.

A branch existente é obsoleta (diverge do master antes do fechamento de RLS e do tema claro — confirmado em 06/08/2026 via `git diff master meta-api-migration --stat`, que mostra a branch tentando *remover* trabalho que já está no master).

- [x] **Step 1:** Confirmado com o usuário em 06/08/2026.
- [x] **Step 2:** Branch recriada a partir do master (`ba06632`).
- [x] **Step 3:** Trabalho das Tasks 3-7 acontece nesta branch.

**Achado no caminho:** a branch antiga estava presa a um **worktree** (`Cliniflow-meta-api`), por isso `git branch -D` falhava com `cannot delete branch used by worktree`. O worktree foi removido (`git worktree remove --force`). Dentro dele estava o plano de 04/08 não commitado que o `AGENTS.md` dava como perdido — descartado por decisão do usuário, por usar a arquitetura `canal_whatsapp` rejeitada em D-19.

---

## Task 3: Workflow n8n de recebimento (inbound) em produção

**Files:** n8n — workflow `Meta WhatsApp - Producao`, criado por **Duplicate do `Evo-Go` na UI** (D-22)

**Interfaces:**
- Consumes: payload de webhook da Meta (formato `entry[].changes[].value.messages[]` — confirmar contra a documentação oficial da Graph API antes de escrever o nó de normalização, não assumir de memória).
- Produces: mesmo formato interno que `Centraliza Dados`/debounce/AI Agent do workflow `Evo-Go` já esperam — para não duplicar a lógica de RAG/debounce/detector de silêncio.

**⚠️ Correção ao Step 4 da Task 0:** o path do webhook **não** é entregue pela Meta — é escolha nossa (é a URL do n8n que a Meta chama, não o contrário). Esclarecido com o usuário em 06/08/2026. **A Task 3 nunca esteve bloqueada.**

- [ ] **Step 0 (PRIMEIRO DE TODOS — antes de qualquer ativação): desativar os gatilhos que vieram junto na duplicata.** O `Evo-Go` tem **três** pontos de entrada independentes e a cópia traz os três: `Webhook` (mensagem via Evolution), `Google Drive Trigger` (ingestão do RAG) e `Error Trigger` (grava em `logs_erro`). Se a cópia for ativada com os dois últimos vivos, **todo documento novo no Drive é ingerido duas vezes** no RAG (embeddings duplicados, piorando a recuperação já torta do §15) e todo erro vira duas linhas em `logs_erro`. Use `setNodeDisabled` em `Google Drive Trigger` e `Error Trigger`. Ver D-22.
- [ ] **Step 1: Trocar o gatilho de entrada.** O `Webhook` herdado usa `authentication: "basicAuth"` e path `conta-pessoal` — os dois errados para a Meta. Path sugerido: `meta-whatsapp-inbound` (escolha nossa, ver correção acima). Config de handshake conforme `ARMADILHAS.md` §20: método `GET` aceito, `Respond` = "Using Respond to Webhook Node", resposta `{{$json.query['hub.challenge']}}` em `text/plain`, **sem** `basicAuth`.
- [ ] **Step 2: Nó de normalização** — mapear o payload da Meta para o formato que `Normalizar Dados v2` produz hoje (telefone, texto, nome do contato). **Não assumir simetria total com a Evolution** — o payload da Meta é estruturalmente diferente (array `entry`/`changes`, não um objeto plano).

  **Achado ao ler o `Evo-Go` de verdade (06/08/2026):** o nó `Busca Clinica` de lá identifica a clínica filtrando `clinics` por `evolution_instance = {{ Normalizar Dados v2.instancia }}` — o equivalente Meta filtra por **`meta_phone_number_id`**, lido de `entry[].changes[].value.metadata.phone_number_id` no payload recebido (esse campo identifica pra qual número da clínica a mensagem chegou, papel equivalente ao `instancia` da Evolution).

  **Também confirmado:** o `Webhook` de produção do `Evo-Go` usa `authentication: "basicAuth"`. **Não copiar esse padrão** para o webhook Meta — a Meta não envia credenciais básicas, a autenticação do lado dela é o handshake `hub.verify_token` (§20); o webhook de produção Meta fica sem `basicAuth`.
- [x] **Step 3: Reaproveitar debounce + AI Agent + RAG** — **RESOLVIDO por D-22 (06/08/2026): duplicata da UI.** Os nós vêm junto com credenciais e sub-nós preservados, nada a reconstruir nem acoplar. Descartadas as duas opções originais: `Execute Workflow` exigiria adicionar um trigger novo ao `Evo-Go` **em produção** (viola o isolamento do D-15), e reconstruir por código exigiria reconectar credencial em ~60 nós à mão. A "duplicação de manutenção" não é custo real porque o `Evo-Go` perde a parte de WhatsApp no corte (D-20).
- [ ] **Step 4: `validate_workflow`**, corrigir erros/avisos (consultar skill `n8n-validation-expert` para diferenciar falso-positivo de erro real).
- [ ] **Step 5: Publicar** (workflow fica `Active` mas isolado — nenhuma clínica em produção aponta pra ele até a Task 8).
- [ ] **Step 6: Teste isolado** — mandar mensagem do número de teste Meta, confirmar que chega em `mensagem_logs` com os campos certos e que o AI Agent responde (sem paciente real envolvido).

---

## Task 4: Envio (outbound) via Meta — construir e testar ISOLADO, sem tocar produção ainda

**Files:**
- n8n — workflow de teste (extensão do temporário `Meta WhatsApp - Teste de Envio (temporário)`, ou nós equivalentes dentro de `Meta WhatsApp - Producao`).
- **Não tocar ainda:** `Envia Resposta do Agent` (workflow `ZAQ6I2CiBGh8swye`) nem `Enviar via Evolution API1` (`Enviar Mensagem CRM`) — por D-19 (substituição direta, não branch), a troca desses nós de produção só acontece no corte (Task 8), não antes. Tocar neles agora significaria produção rodando código não testado em produção real.

**Depends on:** Task 1 (colunas em `clinics` disponíveis para os nós lerem).

- [ ] **Step 1: Buscar credenciais Meta** (`meta_access_token`, `meta_phone_number_id`) a partir de `clinics`, no mesmo padrão de busca já usado para `evolution_apikey`.
- [ ] **Step 2: Montar/confirmar o nó `HTTP Request` para a Graph API**, replicando exatamente o nó já provado no workflow temporário de teste (`ARMADILHAS.md` §21) — copiar a configuração validada, não reescrever do zero. Este nó é o que será colado em `Envia Resposta do Agent` e `Enviar via Evolution API1` na Task 8 — deixá-lo pronto e testado aqui evita montar isso sob pressão no dia do corte.
- [ ] **Step 3: `validate_workflow` + publish** no workflow de teste.
- [ ] **Step 4: Teste isolado** — com o número de teste Meta (nunca a clínica real), confirmar que o envio sai pela Graph API com `wamid` de volta, incluindo o caso de mensagem com aspas/quebra de linha (`JSON.stringify`, ver Global Constraints).

---

## Task 5: Lembretes fora da janela de 24h (template) — BLOQUEADO até aprovação

**Files:** Edge Function `enviar-whatsapp`.

**Depends on:** template aprovado pela Meta (dependência externa, já submetida pelo usuário em 06/08/2026) + usuário colar o texto final e os nomes das variáveis (Task 0 não cobre isso — só é possível saber depois da aprovação).

- [ ] **Step 1 (ao ser desbloqueado):** confirmar com o usuário o texto exato aprovado e os nomes/ordem das variáveis do template.
- [ ] **Step 2:** implementar o branch "fora da janela de 24h → `type: "template"`" descrito na seção 3.5 do spec, mantendo o branch "dentro da janela → texto livre" como está hoje.
- [ ] **Step 3:** testar contra o número de teste, forçando os dois casos (dentro/fora da janela) sem paciente real.
- [ ] **Step 4:** deploy da Edge Function (`deploy_edge_function`, MCP supabase), versão nova, conferir logs (`get_logs`) na primeira chamada real de teste.

**Esta tarefa não bloqueia as Tasks 1-4 e 6-7** — pode rodar em paralelo, gated só pela aprovação externa.

---

## Task 6: Status do bot por canal (prioridade menor)

**Files:** Edge Function `status-evolution` (ou nova `status-whatsapp`).

- [ ] **Step 1:** decidir (com o usuário, é escolha de escopo) entre generalizar a função existente ou criar uma nova — não é uma decisão técnica, é "vale o esforço agora ou fica pendente".
- [ ] **Step 2 (se sim):** ler `canal_whatsapp`, consultar o endpoint de saúde correspondente (Evolution: `instance/status`, já existente; Meta: endpoint de saúde do número via Graph API — pesquisar qual é antes de implementar, não assumir).
- [ ] **Step 3:** testar contra as duas clínicas/canais disponíveis no momento.

**Pode ficar para depois do corte** (Task 8) sem bloquear nada — é observabilidade, não funcionalidade crítica (confirmado no spec §3.6).

---

## Task 7: Teste ponta a ponta isolado (checklist da seção 4 do spec)

**Files:** nenhum novo — é execução dos workflows das Tasks 3-4 contra o número de teste.

- [ ] **Step 1:** handshake de webhook revalidado no path de **produção** (não só no temporário) — repetir a verificação da Meta.
- [ ] **Step 2:** mensagem real do número de teste → recebida → debounce → AI Agent responde → chega de volta no WhatsApp.
- [ ] **Step 3:** envio manual (simulando o CRM) → trigger → Graph API → `wamid`.
- [ ] **Step 4 (se Task 5 já desbloqueada):** pelo menos uma execução do branch de template fora da janela.
- [ ] **Step 5:** confirmar que `logs_erro`/`detectar_silencio()` enxergam esse canal sem assumir Evolution implicitamente em algum lugar esquecido (grep por `evolution` nos nós novos, por garantia).

**Só depois de Steps 1-3 passarem (4 se aplicável) é que a Task 8 pode ser cogitada.**

---

## Task 8: Corte de produção — REQUER AUTORIZAÇÃO EXPLÍCITA DO USUÁRIO NO MOMENTO

**Files:** workflows n8n (`ZAQ6I2CiBGh8swye`, `snHQtmgTKLgQEpqk`, `Meta WhatsApp - Producao`).

**Esta tarefa não é executada como parte normal do plano.** Mesmo com todas as tarefas anteriores prontas e testadas, o corte em si — o momento em que tráfego real de paciente passa a depender do canal novo — precisa de confirmação explícita do usuário na hora, não antecipada aqui. Por D-19/D-20, é substituição direta com remoção rápida do lado Evolution, não uma alternância reversível por bandeira — por isso o cuidado extra nos steps abaixo.

Quando o usuário autorizar:

- [ ] **Step 1:** em `Envia Resposta do Agent` (workflow `ZAQ6I2CiBGh8swye`) e em `Enviar via Evolution API1` (`Enviar Mensagem CRM`), substituir o nó de chamada Evolution pelo nó Meta já validado na Task 4 (`update_workflow`, depois `publish_workflow` — conferir `activeVersion` nos dois, não só o rascunho, `ARMADILHAS.md` §5d).
- [ ] **Step 2:** desativar o trigger/webhook de recebimento Evolution (`Active: false`).
- [ ] **Step 3:** ativar `Meta WhatsApp - Producao` (recebimento), se ainda não estava.
- [ ] **Step 4:** observar `mensagem_logs`/`logs_erro` nas primeiras interações reais — ficar de prontidão, não só disparar e sair. **Este é o único momento de rollback barato** (reverter Steps 1-3): depois do Step 5, não é mais.
- [ ] **Step 5 (só depois do Step 4 confirmar que está funcionando — D-20):** remover os nós/config específicos da Evolution dos workflows de outbound e o trigger de recebimento desativado. Não deixar "desligado só por via das dúvidas" — é para tirar mesmo.

  **⚠️ NÃO DELETE O `Evo-Go` INTEIRO (achado de 06/08/2026, D-22).** Ele hospeda três fluxos independentes, e só um é de WhatsApp: `Webhook`→Evolution (esse morre), mas também `Google Drive Trigger`→ingestão do RAG e `Error Trigger`→`logs_erro` (esses dois **não têm substituto em lugar nenhum**). Deletar o workflow mata a ingestão da base de conhecimento e a gravação de erros em silêncio — nada acusa, o RAG só vai parando de receber documento novo. O caminho correto é **stripar** o `Evo-Go`: remover só o ramo do `Webhook`/Evolution e renomeá-lo para algo como `Cliniflow - RAG e Erros`. Conferir depois que o `Google Drive Trigger` continua `Active` e que um erro de teste ainda cai em `logs_erro`.
- [ ] **Step 6 (rollback, só possível antes do Step 5):** reverter os Steps 1-3 e reativar o trigger Evolution. Documentar o que quebrou em `docs/ARMADILHAS.md` antes de tentar de novo.

Depois do corte: merge de `meta-api-migration` para `master`, atualizar `AGENTS.md` ("Estado atual" + IDs úteis com o novo workflow), e mover qualquer pendência restante da seção 7 do spec para 🟢 Tomadas em `docs/DECISIONS.md`. Avaliar separadamente (não faz parte do corte em si, é limpeza posterior) se vale remover `evolution_instance`/`evolution_apikey` de `clinics` — `DROP COLUMN` é irreversível sem backup, então essa é uma decisão própria, não automática.
