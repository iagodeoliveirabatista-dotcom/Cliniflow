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
| **Tabela fechada ≠ dado protegido** | View/função `SECURITY DEFINER` passa por cima do RLS. `clinics` estava "fechada" e vazava a `evolution_apikey`. §16 |
| **`REVOKE ... FROM PUBLIC` não basta** | O Supabase concede a `anon` por fora. São duas concessões — leia o `proacl` depois. §17 |
| **Tabela nova nasce com RLS ligado e SEM policy** | Event trigger `ensure_rls`. Anon lê `[]` com HTTP 200. §13 |
| **Não tire o TTL do buffer de debounce** | Sem ele, falha de envio gruda a conversa velha na nova. §12 |
| **1º login por Google pode cair no onboarding em vez da clínica real** | Só teste com `iagodeoliveirabatista@gmail.com`; se aparecer "Cadastre sua clínica", PARE. §19 |

## Estado atual (05/08/2026)

- 🚀 **Amanhã (06/08) é o primeiro deploy em clínicas reais** (da irmã e da tia do usuário),
  ainda 100% em cima da Evolution API. Migração para Meta WhatsApp Cloud API foi
  deliberadamente adiada — ver `DECISIONS.md` D-13 (a Cloud API exige template aprovado para
  mensagem fora da janela de 24h, o que quebraria `disparar-lembretes` sem reprojeto).
- ✅ **Polimento visual "premium" aplicado hoje, verificado rodando:** camada de CSS global em
  `Cliniflow.html` (tokens `--shadow-sm/md/lg`, `--shadow-brand`, `--ease-premium`) +
  feedback tátil universal (`button:hover/active`, `input:focus`) que se aplica a **todo**
  botão/campo dos 5 arquivos sem precisar editar cada componente. Tela de Login e de
  Onboarding ganharam cartão com sombra/animação de entrada — conferido via
  `getComputedStyle` no navegador real (borderRadius 16px, boxShadow, animationName
  aplicados; sem erro de console). As telas autenticadas (Agenda/Kanban/Pacientes/
  Relatórios/Automações) herdam a mesma camada global mas **não foram abertas com login
  real** nesta sessão — eram já um design consistente antes de hoje; não confie em "ficou
  mais bonito" ali sem abrir e olhar.
  **Screenshot não disponível nesta sessão** (a aba do navegador não compositava frame) —
  a verificação foi por DOM/computed style e pela árvore de acessibilidade, não visual.
  Recomendado: dar uma olhada rápida no CRM de verdade antes de amanhã.

## Estado atual (29/07/2026)

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
  - **O RAG tem retrieval torto para preço.** Funciona (ver abaixo), mas na pergunta
    "Quanto custa o clareamento?" os 4 documentos retornados **não incluíram** o que contém
    a tabela de valores. `ARMADILHAS.md` §15 — precisa de decisão sua se é bug ou estratégia.
  - **Tratamento de erro é quase inexistente.** Li a `activeVersion` em 27/07: os únicos
    nós com `onError`/`retryOnFail` no workflow inteiro são `Cancela evento - RED`,
    `Confirma evento - GREEN`, `Busca Paciente` e `Update an event`. Todos os outros ~26 nós
    de I/O externo abortam o fluxo se falharem.
    (Este doc já afirmou que os nós de urgência tinham `onError: continueRegularOutput` —
    era **falso**; os nós foram removidos em 27/07, ver `DECISIONS.md` D-9.)
  - As checagens 2 e 3 do detector (envio preso, paciente sem resposta) **nunca dispararam de
    verdade**. Só a checagem 1 (cron) foi vista funcionando.

### 🔒 Fechamento do RLS Concluído e Verificado (28/07/2026)

- ✅ **TODAS AS TABELAS DE PACIENTES TRANCADAS COM RLS E TESTADAS:**
  - `patients`, `conversations`, `mensagem_logs`, `consultas`, `sessoes_ativas`, `config_automacao`, `logs_erro`, `historico_confirmacoes` e `clinic_users`.
  - Acesso público anônimo (`anon`) via REST API retorna `[]` (HTTP 200) em todas as tabelas sensíveis e `permission denied` nas views `kpi_*`.
  - Verificado via `curl.exe` contra a API real do Supabase `mxvaufkqijdkapvtkvee`.
- ✅ **Conta da clínica criada e PASSO 0 vinculado:** `auth_clinic_id()` funcionando e associando sessões autenticadas à clínica `baac9449-81fb-4432-92b9-bb10038147ac`.
- ✅ **Workflow n8n `criar_pre_agendamento` publicado:** usa `service_role` e a nova RPC, preservando o funcionamento da IA sem furar o RLS.
- ✅ **CRM autenticado:** LoginScreen e sessão do Supabase operando com RLS por clínica.

- 🚫 **Removido de propósito:** notas internas privadas no CRM (decisão do usuário — ver
  `docs/DECISIONS.md` D-2). Não reintroduza sem antes corrigir o trigger (`ARMADILHAS.md` §2).

### 🔑 Login com Google + onboarding self-service (29/07/2026) — código pronto, config externa pendente

- ✅ **Banco:** migração `onboarding_clinica_google_oauth` aplicada. `clinics.evolution_instance`/
  `evolution_apikey` agora nullable. RPC `public.registrar_clinica(p_nome)` criada,
  `SECURITY DEFINER`, `EXECUTE` só para `authenticated` (confirmado via advisor — `anon` não
  aparece na lista de quem pode chamar). **Testada de verdade**, não só lida: simulando o
  `auth.uid()` da conta existente via `set_config('request.jwt.claims', ...)`, a RPC recusou
  criar uma segunda clínica com a mensagem esperada, e nenhuma linha foi gravada. O caminho
  "cria clínica nova" não pôde ser testado (só existe 1 usuário no projeto hoje).
- ✅ **Frontend:** `LoginScreen` tem botão "Entrar com o Google"; novo componente
  `OnboardingClinica`; `Root` busca `auth_clinic_id()` junto da sessão e decide entre
  App/Onboarding/Login. JSX verificado com `@babel/preset-react` (transpila sem erro).
  **Não testado no navegador** — depende dos passos externos abaixo para ter algo a testar.
- ⛔ **Faltam 3 passos manuais fora do banco/código** (não automatizáveis por aqui): Google
  Cloud Console (OAuth Client ID) → Supabase Providers (colar Client ID/Secret) → Supabase
  Redirect URLs (adicionar a origem do CRM). Roteiro em `docs/db/05-onboarding-google-oauth.sql`.
- ⚠️ **Ver `ARMADILHAS.md` §19 antes do primeiro login real.** A conta existente
  (`iagodeoliveirabatista@gmail.com`) tem e-mail confirmado, então o Supabase deveria linkar a
  identidade Google à mesma conta — mas isso não foi observado rodando. Se o primeiro login
  mostrar "Cadastre sua clínica" em vez do CRM com os dados reais, **não crie a clínica** —
  é sinal de que o link automático falhou.
- Decisão registrada em `docs/DECISIONS.md` D-12 (reabre a D-6).

## 🕳️ Pontos cegos (auditoria 27/07 · revisada 28/07/2026)

Nenhum destes gera erro — é por isso que estão aqui. **3 dos 5 já caíram**; os riscados
ficam registrados para ninguém reabrir a investigação do zero.

1. ~~RAG pode estar mudo por RLS~~ → ✅ **RESOLVIDO em 28/07/2026. O RAG FUNCIONA.**
   Execução **79160** é a prova: o nó `Consulta na database` foi chamado com o termo
   `"clareamento"` e devolveu **4 documentos reais** da `documentos_clinica`. Logo, a
   credencial daquele nó atravessa o RLS (não é a chave anon).
   ⚠️ A métrica `tool_calls.requested` **mente** — nessa mesma execução ela marcou `0`
   enquanto `completed` marcou `1`. Ver `ARMADILHAS.md` §14 antes de auditar execução de
   AI Agent, ou você repete o erro de concluir que a tool não foi chamada.
   Resta o §15: a recuperação não traz a tabela de preços.
2. ~~Urgência é um campo minado~~ → **RESOLVIDO em 27/07/2026 removendo o recurso**
   (decisão do usuário, `DECISIONS.md` D-9). O switch `Filtra urgência` ficou como
   passa-tudo inerte de propósito — **não "conserte" isso.**
3. ~~`Envia Resposta do Agent` não tem retry~~ → ✅ **RESOLVIDO em 28/07/2026.**
   Aplicado pelo usuário na UI e publicado. Conferido na `activeVersion`:
   `retryOnFail: true`, `waitBetweenTries: 2000`, `onError` no padrão (*stop*) —
   intencional, para o `Error Trigger` continuar gravando em `logs_erro`.
   (`maxTries` ficou sem valor explícito → n8n usa o default, 3.)
4. **Mensagem de entrada nunca sai de `status='pending'`** (17 linhas). Não quebra nada, mas
   o painel do CRM mostra "pending" para tudo que o paciente escreveu, o que confunde.
5. **`callN8nWebhook()` e `config.js:n8nBaseUrl` viraram código morto** no CRM depois que o
   status do bot passou para a Edge Function. Nada mais chama. Não removi (não foi pedido).

## 🎯 Próximos passos (comece por aqui)

1. **Decidir o que fazer com preço no RAG** (`ARMADILHAS.md` §15). Hoje a busca não traz a
   tabela de valores, e a IA desvia para "depende de avaliação". Se isso é a estratégia
   comercial, ótimo — feche em `DECISIONS.md` e considere tirar o documento 22 do RAG.
   Se a IA deveria dar preço, é bug de chunking: quebrar a tabela em uma frase por
   procedimento resolve.
2. **Terminar a config externa do Google OAuth** (código e banco já prontos — `DECISIONS.md`
   D-12). Falta: criar o OAuth Client ID no Google Cloud, colar Client ID/Secret no Supabase
   → Providers, e registrar a origem do CRM em Redirect URLs. Roteiro em
   `docs/db/05-onboarding-google-oauth.sql`. Depois, testar o primeiro login real com
   `iagodeoliveirabatista@gmail.com` e conferir `ARMADILHAS.md` §19 antes de mais nada.
3. **Envio travado em `sending`**: mensagem que falha nunca mais é reenviável. `ARMADILHAS.md` §5c.
4. **LGPD além do RLS** — fechar o RLS resolve o art. 46, não a lei toda. Continuam
   inexistentes: aviso de privacidade na 1ª mensagem do bot, base legal para dado sensível
   (art. 11), prazo de retenção + rotina de expurgo (arts. 15-16), e via de exclusão de
   paciente (art. 18). O bot pergunta "o que mais te incomoda" e grava a resposta — isso é
   dado de saúde. Nenhum desses depende de código: dependem de você decidir o prazo e o texto.

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
| Login e fechamento do RLS | `docs/plano-auth-rls.md` (o **roteiro para executar** é `docs/db/04-fechamento-rls.sql`) |
| Login com Google + onboarding de clínica | `docs/db/05-onboarding-google-oauth.sql` (passos externos pendentes) |
| Como o sistema funciona (visão geral) | `DOCUMENTACAO.md` |
| Histórico entre sessões de agentes | `SYNC_STATUS.md` |
| Frontend do CRM | `cliniflow-export/` |
| Workflow principal (referência, não deploy) | `Projeto Clínica - Evo Go ....json` |
| Dados puxados do n8n vivo | `docs/n8n-evidencia/` |

**IDs úteis:** n8n `ZAQ6I2CiBGh8swye` (Evo-Go, **69 nós** após a remoção da urgência, D-9) ·
`snHQtmgTKLgQEpqk` (Enviar Mensagem CRM) ·
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
