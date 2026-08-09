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
| **Mudar o `RETURNS TABLE` de uma RPC reabre o ACL dela** | Exige `DROP`+`CREATE`, e isso apaga os REVOKEs. Reaplique no mesmo script. §23 |
| **Webhook da Meta reenvia a própria mensagem do bot** | `statuses[]` no mesmo endpoint. Sem filtrar, o bot responde a si mesmo em loop. §24 |
| **Nó Supabase que não acha nada mata o ramo** | Execução fica `success` e para no meio. O `If` seguinte nunca roda. `alwaysOutputData`. §25 |
| **`Busca Paciente` casa só por telefone** | Sem `clinic_id` no filtro, a 2ª clínica pega paciente da 1ª. §26 |
| **`DROP COLUMN` quebra função em silêncio** | plpgsql só valida na execução. E a sonda com UUID falso diz "funciona". §27 |
| **Apagar clínica desloga o usuário** | CASCADE em `clinic_users` → CRM cai no onboarding e você cria clínica vazia. §28 |
| **Tabela nova nasce com RLS ligado e SEM policy** | Event trigger `ensure_rls`. Anon lê `[]` com HTTP 200. §13 |
| **Não tire o TTL do buffer de debounce** | Sem ele, falha de envio gruda a conversa velha na nova. §12 |
| **1º login por Google pode cair no onboarding em vez da clínica real** | Só teste com `iagodeoliveirabatista@gmail.com`; se aparecer "Cadastre sua clínica", PARE. §19 |

## Estado atual (09/08/2026 — bug crítico do toggle "IA Pausada" corrigido em produção)

- 🐛→✅ **Bug crítico achado e corrigido ao vivo, com paciente real em conversa:** o toggle
  "IA Pausada" do CRM (`patients.bot_pausado`) nunca era lido pelo n8n — o bot continuava
  respondendo mesmo com o toggle desligado. Causa e correção completas em
  `docs/ARMADILHAS.md` §29. Corrigido no nó `Valida Expiração`, publicado e conferido na
  `activeVersion` (`a6288890-aebe-458b-a6db-613235ffe3b1`). Mitigação imediata: linha manual
  em `sessoes_ativas` pro telefone `5588981458633` (paciente "iago de oliveira" nos dados de
  teste) com `atendimento_humano=true` por 24h, pra conter a conversa em andamento antes da
  correção definitiva. **Pendência:** nenhum teste de ponta a ponta rodou depois da correção
  — o próximo agente deve confirmar com uma conversa real que o toggle agora silencia o bot.

## Estado atual (09/08/2026 — bug do placeholder corrigido, tom do bot ajustado)

- 🐛→✅ **Bug achado e corrigido nesta sessão:** o `systemMessage` do nó `AI Agent`
  (`ZAQ6I2CiBGh8swye`) tinha `"Você é a assistente virtual de atendimento da [NOME DA
  CLÍNICA]"` como texto **estático** — nunca foi substituído. Nenhum teste anterior pegou
  isso porque a única mensagem real (07/08, execução 82615) foi uma saudação curta que não
  chegou nessa frase. Trocado por `{{ $('Busca Clinica').first().json.name }}` (o node
  `Busca Clinica` já roda antes do `AI Agent` no fluxo, e essa mesma referência já era usada
  em `Envia Resposta do Agent`). **Publicado e conferido na `activeVersion`**
  (`a2493700-388b-42ea-9d02-61d7e59b162b`) — não fica só no rascunho.
- ✅ **Tom do prompt ajustado a pedido do usuário** (opção escolhida: só tom/vocabulário, sem
  relaxar as regras de conversão). Adicionada regra 7 pedindo pra variar a linguagem em vez
  de repetir sempre a mesma frase-modelo ("Perfeito!", "Entendo perfeitamente!"), e os
  exemplos das 4 fases reescritos com tom mais natural/menos "script de vendas". Regras
  estruturais mantidas de propósito (1 parágrafo, pergunta obrigatória no fim de toda
  mensagem, CTA de escolha forçada, proibido justificar) — o usuário decidiu não mexer
  nelas por ora.
- ⛔ **Decisão do usuário: NÃO tornar a personalidade do bot configurável por clínica agora**
  (rejeitaria mover `[IDENTIDADE E PAPEL]`/regras para `clinics.rules_config`, que existe no
  schema mas está vazio `{}`). Foco é só a clínica de amanhã. Se um 2º negócio entrar depois,
  isso volta à mesa — ver a pergunta feita ao usuário nesta sessão antes de reabrir sozinho.
- **Ainda não confirmado pelo usuário:** status atual de `consulta_amanha` e
  `confirmao_horas_antes` na WABA I2B (estavam `PENDING` em 07/08). Bloqueia lembretes fora
  da janela de 24h. Não dá pra consultar isso pelo MCP disponível nesta sessão.

## Estado anterior (07/08/2026, madrugada — MIGRAÇÃO META CONCLUÍDA E PROVADA PONTA A PONTA)

- 🎉 **O canal Meta funciona de verdade.** Mensagem real do WhatsApp pessoal do usuário → número
  I2B (+55 88 8169-8181) → webhook → debounce → AI Agent → resposta entregue. Execução **82615**
  (04:28:39 → 04:29:02, 22s). `mensagem_logs` tem entrada e saída com `status='sent'`.
- ✅ **Anti-loop provado em produção:** logo após a resposta, as execuções 82616 e 82617 (30ms cada)
  são a Meta devolvendo os recibos da nossa própria mensagem — as duas foram cortadas pelo filtro.
  Sem isso o bot teria respondido a si mesmo (§24).
- ✅ **Zero Evolution nos dois workflows.** O principal (`ZAQ6I2CiBGh8swye`) e o de envio manual do CRM
  (`snHQtmgTKLgQEpqk` — nó agora `Enviar via Meta (Graph API)`) foram migrados, publicados e
  conferidos na `activeVersion`. Isso cobre os **dois** caminhos de saída, porque lembretes
  (`pg_cron` → `disparar-lembretes` → `enviar-whatsapp`) passam pelo mesmo webhook do CRM.
- ✅ **Indicador "Bot online/offline" removido do CRM** a pedido do usuário (badge, cartão
  "Conexão Evolution API", estado e a função `verificarStatusEvo()` que ficou sem chamador).
- ⚠️ **Duas quebras silenciosas causadas por limpeza manual do usuário, achadas e corrigidas:**
  - Ele removeu `clinics.evolution_instance`, mas `process_secretary_message` ainda fazia `SELECT`
    dessa coluna → **todo envio pelo CRM falharia**. `plpgsql` só valida na execução, então nada
    acusou. Ver §27 — inclui a sonda que **mente** (UUID inexistente diz "FUNCIONA").
  - Ele apagou a clínica antiga e o `CASCADE` em `clinic_users` levou junto o vínculo do login →
    o CRM abriria em "Cadastre sua clínica". Religado e verificado via `auth_clinic_id()`. Ver §28.
- **Estado do banco hoje:** UMA clínica (`7936105a-…`, **"Clinica Anaruthe"**, renomeada da antiga
  "Cliniflow - Teste Meta") com as credenciais Meta e o login vinculado. A clínica `baac9449` foi
  apagada pelo usuário.
- **Números da Meta:** WABA `1869932994448266` (`I2B Workflows`) → phone_number_id
  **`1294131403774736`** (+55 88 8169-8181, VERIFIED). O `1333235713195741` é o número de teste da
  **Meta** (+1 555) e manda webhook para o app da própria Meta, não para o nosso — nunca funcionaria.
- **Webhook:** `https://n8n.iagobatista.cloud/webhook/meta-whatsapp-inbound`, verify token
  `cliniflow_meta_2026_i2b`, campo `messages` assinado (⚠️ **não assine `message_status`** — §24).

### 🎯 Próximos passos (pedidos do usuário em 07/08, para a próxima sessão)

1. **Criar uma conta de login própria para a tia (dona da clínica).** Esclarecido com o usuário em
   07/08/2026 — **não** é CRM no celular nem login por SMS; é uma conta de acesso para ela.
   ⚠️ **Isto REABRE a D-6**, que decidiu explicitamente "um login compartilhado por clínica, não por
   pessoa". Antes de implementar, fechar com o usuário:
   - Duas contas na **mesma** clínica (`clinic_users` já suporta: PK é `user_id`, então basta uma
     segunda linha com o mesmo `clinic_id`). O RLS por `auth_clinic_id()` já funciona para isso.
   - Se ela tiver conta própria, `assignee_id` volta a significar **"quem assumiu"** de verdade — o
     que muda a conversa do item 2 abaixo ("Atribuir a Mim" deixa de ser inútil e passa a fazer
     sentido). **Decidir os dois juntos, não em separado.**
   - `mensagem_logs.sender_id` é sempre NULL hoje (consequência assumida da D-6). Com duas pessoas,
     vale gravar quem escreveu.
   - Caminho de criação: pelo painel do Supabase (como foi feito o PASSO 0) **ou** pelo Google OAuth —
     mas os **3 passos externos da D-12 seguem pendentes** (Google Cloud Console → Supabase Providers
     → Redirect URLs). Sem eles o botão "Entrar com o Google" aparece e falha.
   - ⚠️ Ler a **§19** antes do primeiro login dela, e a **§28** (não criar clínica pelo onboarding).
2. **Simplificar a aba Atendimentos.** O usuário quer menos botões e função mais clara. Hoje o painel
   tem: toggle IA Ativa/Pausada, "🙋‍♂️ Atribuir a Mim", "✓ Marcar como Resolvida"/"Reabrir".
   **Candidato óbvio ao corte:** "Atribuir a Mim" — com uma conta só por clínica (D-6), ele não
   distingue ninguém; a própria D-6 já registra que `assignee_id` degradou para "se alguém assumiu".
3. **Tema claro sem contraste** — o usuário revisou visualmente (a olhada humana que a sessão de 05/08
   deixou pendente) e disse "parece só um branquelo". Diagnóstico medido:

   | par | claro | escuro |
   |---|---|---|
   | borda contra painel recuado | **1.13:1** | 1.41:1 |
   | card vs painel recuado | **1.09:1** | 1.15:1 |

   As três camadas do tema claro (`--supabase-bg-main #fbfcfd`, `bg-studio #f4f5f7`, `bg-card
   #ffffff`) estão praticamente no mesmo tom, e `--supabase-border #e6e8eb` some sobre elas.
   **Não é simetria com o escuro:** borda mais clara sobre fundo escuro cria contorno que o olho lê;
   borda quase branca sobre branco não. O tema claro precisa de **mais** separação, não da mesma.

### Pendências menores (não bloqueiam nada)

- Edge Function `status-evolution`: sem chamador **e** quebrada (lê coluna removida). Apagar.
- `clinics.evolution_apikey`: coluna ainda existe, toda NULL. `DROP` é irreversível — decisão do dono.
- Workflow `Teste http` (`Zv2sEDDE1uQkt5s0`): token antigo em texto puro, descartável.
- `Busca Paciente` sem `clinic_id` (§26) — **corrigir antes da segunda clínica**.
- Templates `consulta_amanha` e `confirmao_horas_antes`: PENDING na WABA I2B. O `consulta_amanha` está
  com idioma **`en`** e texto em português — corrigir enquanto está na fila, senão perde a vez.
- Mensagem de entrada fica em `status='pending'` para sempre (ponto cego antigo, cosmético).

## Estado anterior (06/08/2026, noite — workflow migrado para Meta, EM PRODUÇÃO)

- ✅ **O workflow principal não fala mais com a Evolution.** `ZAQ6I2CiBGh8swye` (renomeado pelo usuário
  para `Project Clinica - Migração para Meta`) foi **transformado no lugar**, não duplicado — o usuário
  decidiu assim e revisou a D-22. Publicado e **conferido na `activeVersion`**: zero nós chamando
  `easypanel`/`evolution_apikey`, 7 nós chamando `graph.facebook.com`.
- ✅ **Por que transformar no lugar foi seguro:** `mensagem_logs` tem **zero mensagens nos últimos 7
  dias** (última em 28/07) e o usuário confirmou que nenhum paciente usa o bot ainda. Isso derrubou a
  necessidade da cerimônia de corte com rollback (D-15/Task 8) — não havia o que derrubar.
- **O que mudou (12 nós):** `Webhook` (POST `/meta-whatsapp-inbound`, sem basicAuth) · novo
  `Meta - Verificacao (GET)` + `Meta - Responde Challenge` (handshake §20) · `FILTRO ANTI-LOOP` e
  `Normalizar Dados v2` reescritos para o payload da Meta · `Busca Clinica` agora filtra por
  `meta_phone_number_id` · e os **7** nós de envio (`Envia Resposta do Agent`, `MSG - CONFIRM`,
  `MSG - CANCEL`, `MSG - REMARCAÇÃO`, `MSG EDUCADA`, `AVISO SECRETÁRIA`, `ENCAMINHAR MENSAGEM`).
- ⚠️ **Armadilha nova e séria: `ARMADILHAS.md` §24.** A Meta reenvia a própria mensagem do bot como
  `statuses[]` no mesmo webhook. Sem filtrar, o bot responde a si mesmo em loop. Tratado no
  `FILTRO ANTI-LOOP` e testado.
- ✅ **Verificado, não só aplicado:** `node --check` nos dois nós Code + **13 testes funcionais** rodando
  payloads reais da Meta pelos dois nós (texto passa · `statuses` bloqueia · payload sem `entry`
  bloqueia · áudio vira marcador · legenda de imagem · número sem 9º dígito vira 13 · contrato de saída
  completo). Todos passaram.
- 🔧 **Números da Meta, resolvido por consulta à Graph API (não por suposição):**
  - Usar: WABA `1869932994448266` (`I2B Workflows`) → número **`1294131403774736`** = +55 88 8169-8181,
    **VERIFIED**.
  - **NÃO** usar `1333235713195741` — é o número de teste da Meta (+1 555…), apesar de ter sido ele o
    usado no teste de ontem. O usuário achava que era um número I2B; não é.
  - WABA `1380929087338465` (segunda `I2B Workflows`) está **vazia**, criada por engano. Ignorável.
- ⚠️ **Templates: os aprovados estão na WABA errada.** `confirmacao_horas_antes` e
  `confirmao_no_dia_anterior` estão APROVADOS na WABA **de teste da Meta** — inúteis, porque template é
  por WABA. Na WABA I2B, `consulta_amanha` e `confirmao_horas_antes` seguem **PENDING**. Além disso
  `consulta_amanha` está cadastrado com idioma **`en`** mas o texto é português — provável rejeição.
- ⛔ **Pendente do usuário para funcionar de ponta a ponta:** (1) configurar o webhook no painel da Meta
  — URL `https://n8n.iagobatista.cloud/webhook/meta-whatsapp-inbound`, verify token
  `cliniflow_meta_2026_i2b`, assinar **só** o campo `messages` (§24); (2) gravar o
  `meta_access_token` na clínica de teste `7936105a-b198-419f-bad7-a65e2e60725b` (os dois IDs já estão
  lá). **Nada foi testado contra a Meta de verdade ainda** — só contra payloads simulados.
- 🔴 **Token exposto:** o workflow `Teste http` guarda um token de usuário de sistema em texto puro num
  nó Set. Recomendado revogar e gerar outro. O valor entrou no histórico de uma sessão de agente.
- **Ainda com Evolution (fora do workflow principal):** `Cliniflow - Enviar Mensagem CRM`
  (`snHQtmgTKLgQEpqk`, envio manual da recepção), Edge Function `enviar-whatsapp` (lembretes, depende de
  template) e `status-evolution` (widget do CRM). São os próximos alvos.
- **Nota menor:** `Cria Paciente` grava `origem_lead` = `instancia`, que agora é o `phone_number_id`
  numérico em vez de um nome legível. Nenhuma lógica depende disso — decidir depois se vale trocar.

## Estado anterior (06/08/2026, tarde — spec e plano da migração Meta escritos)

- ✅ **Spec formal escrito:** `docs/superpowers/specs/2026-08-06-migracao-meta-whatsapp-cloud-api-design.md`.
  Consolida D-13 a D-18, o que já foi provado (App, webhook, envio via HTTP Request) e fecha a
  arquitetura alvo: colunas `meta_access_token`/`meta_phone_number_id`/`meta_waba_id` em `clinics`
  (D-17/D-18), fluxo inbound/outbound, branch de template para lembretes fora da janela de 24h (D-16).
- ✅ **Plano de implementação escrito:** `docs/superpowers/plans/2026-08-06-migracao-meta-whatsapp-cloud-api.md`.
  8 tarefas, a primeira (Task 0) é **bloqueante**: confirmar com o usuário 3 decisões abertas antes de
  qualquer código — (1) criar `clinics.canal_whatsapp` para o corte por clínica, (2) path do webhook de
  produção, (3) nome do workflow n8n de produção. Task 8 (corte real) exige autorização explícita do
  usuário no momento, não é executada automaticamente mesmo com o resto pronto.
- ✅ **Prazo confirmado como não-rígido** pelo usuário (06/08/2026) — o corte só acontece quando o
  template estiver aprovado **e** o teste ponta a ponta passar. O "até amanhã" citado abaixo não é mais
  o alvo.
- ✅ **Template de lembrete já submetido pelo usuário à aprovação da Meta** (06/08/2026) — dependência
  externa mais lenta, já em andamento, fora do controle deste projeto quanto ao tempo.
- ✅ **Task 0 do plano resolvida nesta sessão** — decisões D-19 (sem `clinics.canal_whatsapp`,
  substituição direta), D-20 (Evolution removida do código assim que o corte funcionar, sem fallback
  estendido) e D-21 (workflow de produção `Meta WhatsApp - Producao`) registradas em `DECISIONS.md`.
  Falta só o path do webhook — usuário entrega junto da URL própria da Meta (previsto 07/08/2026).
- ✅ **Spec e plano verificados contra o banco/n8n reais (MCP), não só contra a documentação:**
  achados que corrigiram o plano original —
  - `process_secretary_message` (RPC usada pelo envio manual do CRM) tem `RETURNS TABLE` explícito
    sem os campos Meta — precisa ser recriada, não basta adicionar coluna em `clinics` (spec §3.1).
  - Inbound identifica a clínica filtrando por `evolution_instance`; o equivalente Meta é
    `meta_phone_number_id` do payload, não um campo simétrico por acaso (spec §3.3).
  - O webhook de produção do `Evo-Go` usa `authentication: basicAuth` — o webhook Meta **não** deve
    copiar isso (autenticação é o handshake `hub.verify_token`).
  - ⚠️ **Os workflows temporários `Meta WhatsApp - Verificação de Webhook (temporário)` e
    `Meta WhatsApp - Teste de Envio (temporário)` não aparecem mais pelo nome no n8n** (`search_workflows`
    sem filtro lista só 5 workflows). Existe um `Teste http` (`Zv2sEDDE1uQkt5s0`, inativo,
    `availableInMCP: false`) que pode ser um dos dois renomeado — não confirmado, precisa o usuário
    habilitar acesso MCP nesse workflow antes de uma sessão futura conseguir ler o conteúdo. Se ele não
    existir mais, reconstruir a partir de `ARMADILHAS.md` §20/§21 (documentado campo a campo).
- **Nesta sessão:** escopo combinado com o usuário foi spec+plano (documentação) + resolver as decisões
  da Task 0 — nenhum código, banco ou branch foi tocado (só leitura via MCP para verificar o plano).
  Branch `meta-api-migration` continua obsoleta (Task 2 do plano cobre recriá-la, com confirmação do
  usuário antes de descartar a antiga).
- **Próximo passo aqui:** Task 1 do plano (migração de banco — colunas `meta_*` em `clinics` +
  extensão de `process_secretary_message`), quando o usuário autorizar a próxima sessão de implementação.
  Path do webhook (pendente) só bloqueia a Task 3.

## Estado anterior (06/08/2026, manhã — prova de envio via Graph API confirmada; design de coexistência fechado)

- ✅ **Fase 1.3 concluída: envio real via n8n/API provado** (faltava desde a sessão de 05/08). Workflow
  `Meta WhatsApp - Teste de Envio (temporário)` (isolado, não toca produção): nó HTTP Request chamando
  `POST /{phone-number-id}/messages` da Graph API com token de usuário do sistema, respondeu com
  `messages[0].id` real (`wamid...`). Não é mais só via assistente da Meta — é via workflow próprio.
- ⚠️ **Correção de fato:** as "clínicas da irmã e da tia" citadas no `Estado anterior (05/08, manhã)` e em
  `DECISIONS.md` D-13 **são a mesma clínica**, não duas. Não reabra a busca por uma segunda clínica.
- ⚠️ **Correção de fato:** o App `Agente_Wpp` e o número de teste do Meta vivem numa BM **pessoal do
  usuário** (não a Grangeiro001). A Grangeiro001 é dona só do número **atual/manual** da clínica
  (D-14) — ver `ARMADILHAS.md` §22: token de usuário de sistema não atravessa BM sozinho.
- ✅ **Design da coexistência Evolution/Meta fechado** (retomado do brainstorming que travou em 05/08):
  testar tudo isolado no número/workflow novo, corte único no dia, sem tráfego real de paciente passando
  pelos dois canais ao mesmo tempo. Ver `DECISIONS.md` D-15.
- ✅ **Decisão sobre lembretes fora da janela de 24h** (motivo original do adiamento em D-13): vão ser
  submetidos templates para aprovação da Meta como parte do trabalho, não fica em aberto. Ver D-16.
- ✅ **Decisão sobre multi-tenant:** envio via nó **HTTP Request** (não o nó oficial "WhatsApp" do n8n,
  que amarra a credencial no editor e quebraria multi-tenant), com token/phone-number-id vindos de
  colunas novas em `clinics` (`meta_access_token`, `meta_phone_number_id`, `meta_waba_id`), lidas por
  execução — mesmo padrão que já existe pra `evolution_apikey`/`evolution_instance`. Ver D-17.
- ✅ **Decisão sobre isolamento de token entre clínicas:** por ora, token compartilhado entre clínicas
  (mais simples, proporcional ao tamanho atual), mas guardado **por clínica** no banco desde já, pra não
  exigir migração de dado se isolar por clínica depois. Ver D-18.
- 🚧 **Usuário pediu migrar o Cliniflow inteiro pra infraestrutura Meta "pronto pra rodar até amanhã"
  (07/08/2026).** Sinalizado como prazo muito apertado pro escopo: aprovação de template é dependência
  externa (não controlamos o tempo da Meta), tem reescrita de workflow inteiro e teste ponta a ponta
  antes de arriscar mensagem real de paciente. Usuário disse que vai tratar/planejar isso na próxima
  interação — **não comece a implementar migração total sem antes fechar o spec e o plano.**
- **Próximo passo aqui:** escrever o spec formal (`docs/superpowers/specs/`) e o plano
  (`docs/superpowers/plans/`) com as decisões acima. Depois: submeter template(s) de lembrete pra
  aprovação Meta (início já, é a dependência mais lenta) e recriar a branch `meta-api-migration` a
  partir do master atual (a existente hoje é obsoleta). Nenhum código foi tocado nesta sessão — só
  configuração manual na plataforma da Meta (feita pelo usuário) e documentação.

## Estado anterior (05/08/2026 — exploração da migração Meta)

- 🚧 **Migração Evolution → Meta WhatsApp Cloud API: ainda em design, nada em produção.**
  Branch `meta-api-migration` existe mas está obsoleta (idêntica ao master); o plano de 04/08
  (`docs/superpowers/plans/2026-08-04-migracao-meta-whatsapp-cloud-api.md`) segue não commitado,
  será revisado e a branch recriada quando o spec fechar.
- ✅ **Checkpoint 1 (parcial) — envio provado.** App Meta for Developers `Agente_Wpp` criado
  (App ID `1653660183429533`), produto WhatsApp adicionado, número de teste gratuito mandou
  mensagem real para o número reserva do usuário — via o assistente da própria Meta, ainda não
  via n8n.
- ✅ **Webhook de recebimento confirmado funcionando.** A Meta validou o handshake
  `hub.challenge` contra o workflow n8n `Meta WhatsApp - Verificação de Webhook (temporário)`
  (isolado do fluxo Evolution, não toca `ZAQ6I2CiBGh8swye`). Verificado ao vivo, não só
  configurado. Ver `ARMADILHAS.md` §20 para a pegadinha que apareceu no caminho (já corrigida).
  **Falta provar envio via n8n/API** — o envio só foi testado até agora pelo assistente da
  própria Meta, não pelo seu próprio workflow.
- ✅ **Acesso recuperado à BM que já tinha o número da clínica da tia** (criada por um gestor
  de tráfego antigo, portfólio `Grangeiro001`). **Decisão:** não migrar esse número — ver
  `docs/DECISIONS.md` D-14.
- **Próximo passo aqui:** System User + token permanente na BM (Fase 1.3 do plano de 04/08),
  depois provar envio real via n8n/API. Design de migração (coexistência Evolution/Meta) segue
  em aberto — brainstorming não fechou o spec ainda.

## Estado anterior (05/08/2026 — fim do dia)

- ✅ **Projeto "tema claro + motion + drag-and-drop" CONCLUÍDO** (spec
  `docs/superpowers/specs/2026-08-05-ui-tema-claro-e-motion-design.md`, plano
  `docs/superpowers/plans/2026-08-05-ui-tema-claro-e-motion.md`, 7 tarefas, commits
  `977d163..` até o fechamento):
  - **Tema claro utilizável nas 5 telas autenticadas.** ~300 cores hex fixas traduzidas para
    tokens (`--supabase-*`) em `cliniflow-components.jsx`, `patients-components.jsx`,
    `reports-components.jsx`, `automation-components.jsx`. Novos tokens: `--supabase-bg-hover`,
    `--supabase-bg-input`, `--supabase-icon-inactive`. Vocabulário de mapeamento: `bg-studio`
    para painel recuado, `bg-card` para superfície elevada, `bg-hover` só para hover real,
    `border` para divisores E trilhas sem borda (toggle, track de gráfico).
  - **⚠️ ARMADILHA para próximos agentes:** várias cores são consumidas por concatenação
    `${cor}18`/`cor+'70'` (hex+alfa) — essas NUNCA podem virar `var(...)`; quebra silenciosa,
    sem erro de console. Sempre grep por `` `${ `` antes de tokenizar qualquer cor nesses
    arquivos. `getStatusStyle()` devolve hex literal de propósito.
  - **Drag-and-drop da Agenda reescrito** com ponteiro customizado (estilo Google Calendar):
    limiar de 4px, card fantasma seguindo o cursor, slot de destino ao vivo, animação de
    encaixe, Esc cancela. `onMove(id, day, min)` inalterado. Testado por PointerEvents
    sintéticos contra o DOM real (5 cenários) na Task 3 e re-smoke-testado na Task 7.
  - **Motion:** fadeIn na troca lista/calendário/kanban, nas abas de Automações e easing
    unificado (`--ease-premium`) no Modal.
  - **Verificação:** manual via cópia demo isolada (config vazio), `getComputedStyle` nos dois
    temas, zero erros de console. Screenshot indisponível na sessão — verificação foi por
    DOM/computed style. **Vale uma olhada humana rápida nos dois temas antes de usar o claro
    em produção.** Achados menores deixados registrados no ledger `.git/sdd/progress.md`
    (listeners de drag sem cleanup se o componente desmontar no meio do arraste; hit-test do
    slot só limita eixo X).

## Estado anterior (05/08/2026, manhã)

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
