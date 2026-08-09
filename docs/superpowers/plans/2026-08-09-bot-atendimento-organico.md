# Bot de Atendimento Orgânico — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **Antes de tocar em qualquer coisa aqui:** leia `docs/superpowers/specs/2026-08-09-bot-atendimento-organico-design.md` inteiro. Este plano assume que o spec já foi lido — ele explica o *porquê* de cada mudança (o bug do agendamento fantasma, a escolha de balões separados em vez de quebra de parágrafo, os momentos-chave). Aqui só está o *como*, passo a passo.

**Goal:** Substituir o `systemMessage` do nó `AI Agent` (workflow `ZAQ6I2CiBGh8swye`) pelo prompt orgânico do spec — que corrige o bug de agendamento fantasma (a IA nunca chamava `criar_pre_agendamento`) e introduz momentos-chave para o CTA — e construir o pipeline de envio em múltiplos balões de WhatsApp que esse prompt agora pode produzir.

**Architecture:** Uma mudança de texto (prompt) + cinco nós novos no n8n, inseridos entre `Veio do Webhook?` e o que hoje é o envio único (`Envia Resposta do Agent`), formando um loop `Split In Batches` que envia cada balão, loga em `mensagem_logs`, espera ~1.5s, e repete até acabar. As duas mudanças (prompt + pipeline) são aplicadas no mesmo rascunho e publicadas juntas — nunca uma sem a outra (ver Global Constraints).

**Tech Stack:** n8n (via MCP `mcp__n8n-mcp__*`), Supabase (via MCP, só para verificação — nenhuma migração de banco nesta mudança).

## Global Constraints

- **Nunca publique o prompt novo sem o pipeline novo, nem vice-versa.** O prompt instrui a IA a usar `|||` para separar balões; sem o pipeline, esse `|||` apareceria literalmente na mensagem do paciente. O pipeline sem o prompt não quebra nada, mas não tem uso (a IA nunca vai produzir `|||`). Aplicar as duas mudanças no mesmo `update_workflow` (Task 1) evita esse estado intermediário por completo.
- **`update_workflow` só afeta o rascunho** — toda verificação termina lendo `activeVersion`, não só `nodes` (mesma armadilha de sempre, `ARMADILHAS.md` §5d).
- **Nunca reimporte o JSON do workflow por cima do vivo** (`ARMADILHAS.md` §5 / R-1). Toda mudança é via MCP.
- **Não toque em `Prepara Log Saída` nem em `Log Mensagem Saída`.** Esses nós continuam servindo os fluxos de confirmação/cancelamento/remarcação (`MSG - CONFIRM`, `MSG - CANCEL`, `MSG - REMARCAÇÃO`, `MSG EDUCADA`), que não passam pelo pipeline de balões. O novo nó `Loga Balão` é uma cópia adaptada, não uma reforma do existente — mudança cirúrgica.
- **Corpo de mensagem sempre via `JSON.stringify`** dentro da expressão do `HTTP Request` (mesmo padrão já usado em `Envia Resposta do Agent`) — nunca interpolação direta de texto livre no JSON.
- **Referências entre nós dentro do loop usam `$('Nó').item.json.campo`, não `.first()`.** Dentro de um `Split In Batches`, `.first()` sempre pega o primeiro item que aquele nó já processou (não o item da iteração atual) — usar `.first()` ali logaria o texto do balão errado. Fora do loop (nós que rodam uma vez só, como `Centraliza Dados` e `Parse AI Response`), `.first()` continua correto.
- **`Divide em Lotes` (`Split In Batches`) tem 2 saídas: `main[0]` = "done" (dispara uma vez, no fim), `main[1]` = "loop" (dispara por balão).** Inverter os dois quebra o fluxo em silêncio — confirmado via a skill `n8n-workflow-patterns` desta sessão, não é suposição.

## Receita de verificação

Ao final de cada task de workflow:
1. `validate_workflow` (MCP n8n) sem erros novos (os 4 avisos pré-existentes em nós não relacionados — `Append Buffer (RPC)`, `Send a message2`, `Google Drive Trigger` — são esperados e não são desta mudança).
2. `update_workflow` aplicado → `get_workflow_details` → conferir que o **rascunho** tem a mudança exata.
3. `publish_workflow` → `get_workflow_details` de novo → conferir `activeVersionId === versionId` **e** que o conteúdo lido é o mesmo do rascunho (não confiar que publicar "deu certo" só pelo `success: true` da resposta).
4. Teste funcional com dado real (não simulado) — `get_execution` da próxima conversa real, olhando especificamente `ai.agent.tool_calls.requested` e a tabela `consultas`.

---

## Task 1: Aplicar prompt novo + pipeline de balões no rascunho (atômico)

**Nós afetados (workflow `ZAQ6I2CiBGh8swye`):**
- Modify: `AI Agent` (`options.systemMessage`)
- Modify: `Envia Resposta do Agent` (`jsonBody`)
- Modify (rewire only, sem mudar parâmetros): `Veio do Webhook?`
- Create: `Divide Blocos de Resposta` (Code)
- Create: `Divide em Lotes` (Split In Batches)
- Create: `Loga Balão` (Supabase)
- Create: `Aguarda Próximo Balão` (Wait)
- Create: `Limite 1 Balão` (Limit)

**Depends on:** nada — pode ser aplicado direto.

- [ ] **Step 1: Montar a lista de operações e aplicar num único `update_workflow`**

Um `update_workflow` só, com as operações abaixo na ordem (a ferramenta aplica tudo atomicamente — se uma falhar, nenhuma é salva):

**1a. `setNodeParameter` no `AI Agent`** — `path: "/options/systemMessage"`, `value` = o texto completo e literal da seção 4 do spec (`docs/superpowers/specs/2026-08-09-bot-atendimento-organico-design.md`, bloco de código entre ` ```  ` logo após "Texto completo que substitui..."). Copie o texto exatamente como está no spec — ele já inclui `[REGISTRAR O AGENDAMENTO]` e `[MENSAGENS SEPARADAS]`.

**1b. `addNode` — `Divide Blocos de Resposta`:**
```json
{
  "name": "Divide Blocos de Resposta",
  "type": "n8n-nodes-base.code",
  "typeVersion": 2,
  "position": [12680, 8720],
  "parameters": {
    "jsCode": "const raw = ($json.output || \"\").toString();\nconst partes = raw.split('|||').map(p => p.trim()).filter(p => p.length > 0).slice(0, 3);\nconst lista = partes.length > 0 ? partes : [raw];\nreturn lista.map((texto, i) => ({\n  json: { texto, indice: i, total: lista.length }\n}));"
  }
}
```

**1c. `addNode` — `Divide em Lotes`:**
```json
{
  "name": "Divide em Lotes",
  "type": "n8n-nodes-base.splitInBatches",
  "typeVersion": 3,
  "position": [12900, 8720],
  "parameters": { "batchSize": 1, "options": {} }
}
```

**1d. `addNode` — `Loga Balão`:**
```json
{
  "name": "Loga Balão",
  "type": "n8n-nodes-base.supabase",
  "typeVersion": 1,
  "position": [13100, 8720],
  "parameters": {
    "useCustomSchema": true,
    "tableId": "mensagem_logs",
    "fieldsUi": {
      "fieldValues": [
        { "fieldId": "conversation_id", "fieldValue": "={{ $('Centraliza Dados').first().json.conversation_id }}" },
        { "fieldId": "patient_id", "fieldValue": "={{ $('Centraliza Dados').first().json.patient_id }}" },
        { "fieldId": "telefone", "fieldValue": "={{ $('Centraliza Dados').first().json.telefone }}" },
        { "fieldId": "mensagem", "fieldValue": "={{ $('Divide Blocos de Resposta').item.json.texto }}" },
        { "fieldId": "direcao", "fieldValue": "saida" },
        { "fieldId": "tipo", "fieldValue": "auto" },
        { "fieldId": "status", "fieldValue": "sent" },
        { "fieldId": "intencao_detectada", "fieldValue": "={{ $('Parse AI Response').first().json.intencao }}" },
        { "fieldId": "procedimento_interesse", "fieldValue": "={{ $('Parse AI Response').first().json.procedimento_interesse }}" },
        { "fieldId": "tipo_objecao", "fieldValue": "={{ $('Parse AI Response').first().json.tipo_objecao }}" }
      ]
    }
  }
}
```
(Mesma forma exata do `Log Mensagem Saída` já em produção — só troca `mensagem` para ler do balão em vez do texto inteiro, e fixa `direcao`/`tipo`/`status` como valores literais porque aqui já sabemos que é sempre saída automática.)

**1e. `addNode` — `Aguarda Próximo Balão`:**
```json
{
  "name": "Aguarda Próximo Balão",
  "type": "n8n-nodes-base.wait",
  "typeVersion": 1,
  "position": [13320, 8720],
  "parameters": { "amount": 1.5, "unit": "seconds" }
}
```

**1f. `addNode` — `Limite 1 Balão`:**
```json
{
  "name": "Limite 1 Balão",
  "type": "n8n-nodes-base.limit",
  "typeVersion": 1,
  "position": [13100, 8880],
  "parameters": { "maxItems": 1, "keep": "firstItems" }
}
```

**1g. `setNodeParameter` no `Envia Resposta do Agent`** — `path: "/jsonBody"`, trocar `$json.output` por `$json.texto`:
```
={
  "messaging_product": "whatsapp",
  "to": "{{ $('Normalizar Dados v2').first().json.telefone_whatsapp }}",
  "type": "text",
  "text": { "body": {{ JSON.stringify($json.texto.replace(/\[.*?\]/g, '').trim()) }} }
}
```
(Como string de uma linha só na chamada — sem quebras de linha literais dentro do `value`, seguindo o padrão dos outros `jsonBody` do workflow.)

**1h. Rewiring — `removeConnection` (2) e `addConnection` (8):**

Remove:
- `Veio do Webhook?` → `Envia Resposta do Agent`
- `Envia Resposta do Agent` → `Prepara Log Saída`

Adiciona:
- `Veio do Webhook?` → `Divide Blocos de Resposta`
- `Divide Blocos de Resposta` → `Divide em Lotes`
- `Divide em Lotes` (sourceIndex **0**, "done") → `Limite 1 Balão`
- `Divide em Lotes` (sourceIndex **1**, "loop") → `Envia Resposta do Agent`
- `Envia Resposta do Agent` → `Loga Balão`
- `Loga Balão` → `Aguarda Próximo Balão`
- `Aguarda Próximo Balão` → `Divide em Lotes` (fecha o loop)
- `Limite 1 Balão` → `Limpa Buffer (Fim)`

- [ ] **Step 2: Ler o rascunho de volta e conferir manualmente**

`get_workflow_details` (workflowId `ZAQ6I2CiBGh8swye`) → salvar em arquivo (o retorno estoura o limite de tokens) → conferir com Python/jq:
- `AI Agent.parameters.options.systemMessage` contém `"REGISTRAR O AGENDAMENTO"` e `"MENSAGENS SEPARADAS"`.
- Os 5 nós novos existem com os `type`/`typeVersion` acima.
- `connections["Veio do Webhook?"]` aponta só para `Divide Blocos de Resposta` (não mais para `Envia Resposta do Agent`).
- `connections["Envia Resposta do Agent"]` aponta só para `Loga Balão` (não mais para `Prepara Log Saída`).
- `connections["Divide em Lotes"]["main"][0][0]["node"] == "Limite 1 Balão"` e `[1][0]["node"] == "Envia Resposta do Agent"` (ordem das saídas — o erro mais fácil de cometer aqui).
- `Prepara Log Saída` e `Log Mensagem Saída` continuam exatamente como antes (nenhuma operação os tocou).

- [ ] **Step 3: `validate_workflow`**

Rodar `validate_workflow` (MCP n8n) sobre o workflow. Esperado: os mesmos 4 avisos pré-existentes (nós não relacionados a esta mudança) e nenhum erro novo. Se aparecer erro nos nós novos, corrigir antes de publicar — não publicar com erro de validação.

---

## Task 2: Publicar e confirmar na versão ativa

**Depends on:** Task 1 (rascunho verificado e validado).

- [ ] **Step 1: `publish_workflow`** (workflowId `ZAQ6I2CiBGh8swye`).

- [ ] **Step 2: Ler de volta e confirmar que é a versão ativa, não só o rascunho**

`get_workflow_details` de novo → conferir `activeVersionId === versionId` (o padrão já usado nas 3 correções desta sessão) → reconferir os mesmos 5 pontos do Step 2 da Task 1, desta vez sobre a versão publicada.

- [ ] **Step 3: Registrar em `AGENTS.md` e `docs/ARMADILHAS.md`**

Seguindo o padrão já usado nesta sessão para as outras 3 correções: "Estado atual" novo em `AGENTS.md` com a `activeVersionId` resultante, e uma entrada em `ARMADILHAS.md` (próximo número sequencial) documentando o bug do agendamento fantasma — sintoma (IA disse "agendei" sem chamar a tool), causa (prompt nunca mencionava a tool), correção (seção `[REGISTRAR O AGENDAMENTO]` + verificação via `tool_calls.requested`). Não commitar ainda — só ao final da Task 3, com o resultado do teste real incluído.

---

## Task 3: Verificação com conversa real

**Depends on:** Task 2 (já publicado).

Diferente das mudanças anteriores desta sessão, este pipeline tem uma pegadinha de fiação (loop, ordem das saídas do `Split In Batches`) que só um teste com execução real prova — leitura de código não é suficiente aqui.

- [ ] **Step 1: Aguardar ou provocar uma conversa real** que chegue a um momento-chave de agendamento (ex: pedir para marcar uma avaliação e confirmar um turno) — combinar com o usuário quando/como testar, já que a decisão registrada no spec foi "publica direto e acompanha pelo CRM", não simular antes.

- [ ] **Step 2: `get_execution`** da execução correspondente, `includeData: true`, `nodeNames: ["AI Agent", "Divide Blocos de Resposta", "Envia Resposta do Agent", "Loga Balão"]`. Conferir:
  - `ai.agent.tool_calls.requested >= 1` no turno em que o paciente confirma o agendamento (a correção do bug).
  - `Divide Blocos de Resposta` produziu o número certo de itens (1 se a resposta não usou `|||`, 2-3 se usou).
  - `Envia Resposta do Agent` e `Loga Balão` rodaram uma vez por item, nessa ordem.

- [ ] **Step 3:** `SELECT * FROM consultas ORDER BY criado_em DESC LIMIT 1` (MCP supabase) — confirmar que a tool realmente criou a linha com `status = 'solicitado'`.

- [ ] **Step 4:** Conferir no WhatsApp (ou no painel Atendimentos do CRM) que, se a resposta tinha `|||`, os balões chegaram como mensagens separadas, na ordem certa, sem `|||` visível em nenhuma.

- [ ] **Step 5:** Se tudo passou — atualizar a entrada da Task 2/Step 3 em `ARMADILHAS.md`/`AGENTS.md` de "corrigido, não testado" para "corrigido e verificado com execução `<id>`", e commitar. Se algo falhou, **não marcar como resolvido** — documentar o que quebrou e voltar à Task 1.
