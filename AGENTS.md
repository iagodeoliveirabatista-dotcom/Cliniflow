# AGENTS.md — mapa do Cliniflow (leia isto primeiro)

> Para qualquer agente de IA: este é o índice. Leia inteiro (é curto de propósito) e depois
> abra só o doc/arquivo que a tarefa exige. **NÃO releia o código todo para se situar.**

## O que é
Atendimento automatizado de clínica via WhatsApp. Paciente escreve → n8n intercepta o webhook da
Evolution Go → agente de IA (Gemini + RAG) responde ou o script de confirmação atua → tudo é
gravado no Supabase → um CRM em React mostra e deixa a recepção assumir a conversa.
Multi-clínica por `clinic_id`.

## 🛑 LEIA ANTES DE TOCAR EM QUALQUER COISA

| Armadilha | Por quê |
|---|---|
| **Sistema "parou"? Cheque se o Supabase pausou** | Free tier pausa sozinho e o DNS some. Parece problema de rede/instância. `ARMADILHAS.md` §1 |
| **`update_workflow` NÃO vai para produção** | Escreve no rascunho. Sem `publish_workflow` nada muda. §5d |
| **Telefone tem 2 formatos** | `patients` = 11 díg · `sessoes_ativas`/`mensagem_logs` = 13 díg. Não casam sozinhos. §3 |
| **Não reimporte o JSON do workflow** | O export não tem credenciais. Use o MCP do n8n. §5 |
| **Nó Supabase usa `create`, não `insert`** | `insert` é PostgREST, não n8n. §5e |
| **`cron.schedule` não valida o comando** | Aceita SQL quebrado e só falha ao rodar. Custou 48 dias de lembretes mortos. §10 |
| **Fechar RLS de `consultas` quebra a IA em silêncio** | A tool de agendamento usa chave anon. `docs/plano-auth-rls.md` §3.2 |
| **Tabela nova nasce com RLS ligado e SEM policy** | Event trigger `ensure_rls`. Anon lê `[]` com HTTP 200. §13 |
| **Não tire o TTL do buffer de debounce** | Sem ele, falha de envio gruda a conversa velha na nova. §12 |

## Estado atual (27/07/2026)

- ✅ **Funciona (verificado):**
  - Supabase `mxvaufkqijdkapvtkvee` **ACTIVE_HEALTHY** (estava pausado; restaurado em 26/07).
    Dados intactos: 3 pacientes, 22 mensagens, 7 docs RAG, 1 clínica.
  - Os dois workflows do n8n estão **ativos**, e as 5 correções de 26/07 estão na `activeVersion`
    (li de volta da instância depois de publicar).
  - `cliniflow-export/supabase-client.js` passa em `node --check`.
  - Edge function `enviar-whatsapp` **v8 ACTIVE** — grava `consulta_id` (antes gravava
    `google_event_id`, coluna inexistente, e o erro era engolido). Junto veio o helper
    `logErro()` e a coluna `logs_erro.origem` (`NOT NULL DEFAULT 'n8n'`).
  - **Lembretes funcionando de verdade, não só testado à mão:** confirmado em 27/07 que
    `cron.job_run_details` tem **26 execuções `succeeded` seguidas** do job `disparar-lembretes`
    desde a correção do §10 (`ARMADILHAS.md`) — não é mais só o comando manual, o cron agendado
    está rodando limpo.
  - **Detector de silêncio no ar:** `public.detectar_silencio()`, job `detector-silencio`
    a cada 10 min. Testado: 1ª execução gravou 1 (pegou a última falha real do cron das 19:00),
    2ª gravou 0 — provando a dedup por assinatura na janela de 1 h.
  - Os 5 `.jsx` transpilam com `@babel/preset-react`, o mesmo preset que o navegador usa.
  - **CRM rodou de verdade no browser (27/07/2026, via Playwright):** carrega dados reais do
    Supabase sem erro de console. Confirmado ao vivo: D-2 (sem UI de nota interna na conversa),
    toggle "Controle do Agente IA" aparece, painel **"Saúde do sistema" renderizou pela primeira
    vez** com dados reais (o erro de cron mostrado é histórico, de antes do fix — não recorreu).
    **Não testei enviar mensagem pelo CRM** — dispararia uma mensagem real de WhatsApp a um
    paciente de verdade; não fiz isso sem autorização explícita.
  - **Widget "Status do bot" corrigido e verificado (27/07/2026):** chamava um webhook n8n
    (`status-evo`) que nunca existiu. Criada a Edge Function `status-evolution` (segue D-7,
    guarda a `evolution_apikey` no servidor). Achei e corrigi de quebra um mismatch de
    maiúscula/minúscula (`Connected` vs `connected`) entre `evolution_api_reference.md` e a API
    real. Ver `ARMADILHAS.md` §11. Verificado: painel mostra "Bot online" / "Conectado" contra a
    Evolution real.

  - 🎉 **O FLUXO INBOUND FUNCIONA PONTA A PONTA — provado em 27/07/2026.**
    Execução n8n **79158**, `status: success`, modo `webhook`, 22:53:34 → 22:53:58 (24s).
    Mensagem real de WhatsApp entrou, passou pelo debounce de 15s, o AI Agent respondeu e a
    Evolution entregou (`mensagem_logs` gravou a saída com `status='sent'`).
    **Isto derruba o "zero execuções" que este doc afirmou até 26/07.**

- ⚠️ **Verificado com ressalva / ainda não exercitado:**
  - **O RAG não foi exercitado nem uma vez.** Na execução 79158 o agente fez
    `tool_calls.requested: 0` — não chamou `Consulta na database`. Ou seja: a IA respondeu
    **sem tocar na base de conhecimento**. Para uma saudação isso até é o comportamento
    desejado, mas significa que o caminho do RAG segue **sem prova de vida**. Ver o ponto
    cego #1 abaixo — há risco real dele estar mudo por RLS.
  - `Pausa IA (Urgência)` e `AVISO URGÊNCIA`: a credencial Supabase foi **escolhida por
    inferência** (`hJIcCVPmy1j9Vjq1`) porque o MCP redige credenciais.
    ❌ **CORREÇÃO AO QUE ESTE DOC AFIRMAVA:** eu havia escrito que os dois tinham
    `onError: continueRegularOutput`. **Não têm.** Li a `activeVersion` em 27/07: os únicos
    nós com tratamento de erro no workflow inteiro são `Cancela evento - RED`,
    `Confirma evento - GREEN`, `Busca Paciente` e `Update an event`. Consequência real no
    ponto cego #2.
  - As checagens 2 e 3 do detector (envio preso, paciente sem resposta) **nunca dispararam de
    verdade**. Só a checagem 1 (cron) foi vista funcionando.

- ⛔ **Não existe:** login no CRM · RLS por clínica · toggle `bot_ativo` por clínica.

- 🚫 **Removido de propósito:** notas internas privadas no CRM (decisão do usuário — ver
  `docs/DECISIONS.md` D-2). Não reintroduza sem antes corrigir o trigger (`ARMADILHAS.md` §2).

## 🕳️ Pontos cegos conhecidos (auditoria de 27/07/2026)

Ordenados por risco. Nenhum destes gera erro — é por isso que estão aqui.

1. **RAG pode estar mudo por RLS e ninguém saberia.** `documentos_clinica` tem RLS ligado e
   **zero policies** (culpa do event trigger `ensure_rls` — `ARMADILHAS.md` §13).
   `match_documentos_clinica()` é SECURITY INVOKER, então respeita o RLS do chamador.
   **Testado com a chave anon: devolve `[]`.** Se a credencial do nó `Consulta na database`
   for a anon, a IA responde sem base de conhecimento, sempre, em silêncio. O MCP não
   revela credenciais — **só um teste real com pergunta específica ("qual o preço de X?")
   resolve isso.** É o teste mais importante pendente.
2. **Urgência (`[ACIONAR_HUMANO]`) é um campo minado.** `Pausa IA (Urgência)` usa
   `operation: create` (INSERT) em `sessoes_ativas`, cuja PK é `telefone`. Se já existir
   sessão para aquele telefone → violação de chave → o nó falha → **como não tem `onError`,
   o workflow inteiro aborta**. Num pedido de urgência, o pior resultado possível: o
   paciente não recebe resposta nenhuma. Precisa virar upsert.
3. **`Envia Resposta do Agent` não tem retry** e já falhou **15 vezes** (25/06 a 02/07) com
   "The service was not able to process your request". Era a origem da corrupção de buffer
   (`ARMADILHAS.md` §12, já corrigida na raiz) — mas o paciente continua ficando sem resposta
   quando a Evolution dá soluço.
4. **Mensagem de entrada nunca sai de `status='pending'`** (17 linhas). Não quebra nada, mas
   o painel do CRM mostra "pending" para tudo que o paciente escreveu, o que confunde.
5. **`callN8nWebhook()` e `config.js:n8nBaseUrl` viraram código morto** no CRM depois que o
   status do bot passou para a Edge Function. Nada mais chama. Não removi (não foi pedido).

## 🎯 Próximos passos (comece por aqui)

1. **Provar o RAG.** Mande pelo WhatsApp uma pergunta que **só** a base responde
   ("quanto custa o clareamento?", "qual o horário de sábado?"). Se a IA inventar ou desviar,
   é o ponto cego #1 — a credencial do nó `Consulta na database` é a chave anon e o RLS está
   comendo os 7 documentos. É o teste mais barato com maior valor de informação hoje.
2. **Consertar o caminho de urgência** (ponto cego #2): `create` → upsert em
   `Pausa IA (Urgência)`, mais `onError: continueRegularOutput` nele e no `AVISO URGÊNCIA`.
   Hoje um pedido de urgência repetido derruba a resposta ao paciente.
3. **Retry no `Envia Resposta do Agent`** (ponto cego #3) — 15 falhas transitórias já
   registradas.
4. **Envio travado em `sending`**: mensagem que falha nunca mais é reenviável. `ARMADILHAS.md` §5c.
5. **Login + RLS** — plano pronto em `docs/plano-auth-rls.md` (delegado ao Gemini, D-3 e D-6).
   É o que eu considero impeditivo para atender paciente real.

## Como rodar
- **CRM:** `cliniflow-export/servir-local.bat` (HTML + React via CDN, sem build step).
  Config em `cliniflow-export/config.js`.
- **n8n:** via MCP. `update_workflow` → conferir rascunho → `publish_workflow` → conferir
  `activeVersion`. Token em `.mcp.json` (fora do git).
- **Supabase:** MCP ou Management API. Se der timeout, cheque se o projeto pausou.

## Mapa de arquivos

| Preciso mexer em… | Vá para |
|---|---|
| O que já custou horas | `docs/ARMADILHAS.md` |
| Decisões e o que foi rejeitado | `docs/DECISIONS.md` |
| Schema, funções, triggers, RLS | `docs/db/` |
| Login e fechamento do RLS | `docs/plano-auth-rls.md` |
| Como o sistema funciona (visão geral) | `DOCUMENTACAO.md` |
| Histórico entre sessões de agentes | `SYNC_STATUS.md` |
| Frontend do CRM | `cliniflow-export/` |
| Workflow principal (referência, não deploy) | `Projeto Clínica - Evo Go ....json` |
| Dados puxados do n8n vivo | `docs/n8n-evidencia/` |

**IDs úteis:** n8n `ZAQ6I2CiBGh8swye` (Evo-Go, 71 nós) · `snHQtmgTKLgQEpqk` (Enviar Mensagem CRM) ·
Supabase `mxvaufkqijdkapvtkvee` · Evolution `https://n8n-evolution-evo-go.1qkdsj.easypanel.host`

## Regras para agentes (CONTRATO)
1. **Antes de codar:** leia `docs/DECISIONS.md` (o que já foi rejeitado) e `docs/ARMADILHAS.md`.
2. **Confira a realidade:** `git log --oneline -10` e `git status --short`. Se houver trabalho solto
   de outro agente, **PARE e pergunte ao usuário**.
3. **Nunca commite segredos.** `.mcp.json` tem o PAT do Supabase e o JWT do n8n — está no
   `.gitignore`. Nunca exiba o valor.
4. **Ao terminar (obrigatório):** commite · atualize "Estado atual" e "Próximos passos" aqui ·
   grave armadilhas/decisões novas nos docs.
5. **Honestidade:** "configurei" ≠ "funciona". Só marque ✅ o que você **viu rodando**.
6. **Mudanças cirúrgicas:** não refatore o que não foi pedido.
