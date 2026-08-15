# DECISIONS.md — decisões do projeto

> Decisões EM ABERTO no topo (é o que precisa de escolha). Ao fechar uma, mova para "Tomadas"
> com data e o porquê. **Nunca implemente uma decisão aberta sem confirmar com o usuário.**

---

## 🟡 Em aberto

### D-OPEN-1 — Quando fechar o acesso aos dados de paciente
**Contexto:** `patients`, `consultas` e `mensagem_logs` estão com RLS `USING (true)`. A chave anon
é pública (está no `config.js` servido ao browser). Verificado em 26/07/2026: um `GET
/rest/v1/patients` com essa chave devolveu pacientes reais.

Fechar exige login no CRM, que não existe. Fechar antes do login derruba a tela.

| Opção | Prós | Contras |
|---|---|---|
| Login antes da clínica | Fecha de verdade | Atrasa a implantação |
| Implantar e fechar depois | Não atrasa | Dados reais de paciente expostos no intervalo |

**Recomendação:** login antes de atender paciente real. O plano está pronto
(`docs/plano-auth-rls.md`), a execução foi delegada (D-3).
**Status:** aguardando o usuário definir a data de corte.

### D-OPEN-3 — Por onde o alerta de erro chega até você
**Contexto:** o detector de silêncio já grava tudo em `logs_erro` e o painel da aba
**Automações → Status** mostra. Falta o *push* — hoje ninguém é avisado sem abrir a tela.

Restrição descoberta em 26/07/2026: `enviar-whatsapp` **não fala com a Evolution direto**,
ele chama o webhook do n8n. Alertar por esse caminho faz uma queda do n8n silenciar
justamente o alerta de que o n8n caiu.

| Opção | Prós | Contras |
|---|---|---|
| Evolution API direto da função | Contorna o n8n; credenciais já estão em `clinics` | Mais um lugar que fala com a Evolution |
| E-mail (Resend) | Independente de tudo | Precisa de chave nova |
| Só o painel (estado atual) | Zero dependência | Você só sabe se abrir a tela |

**Recomendação:** Evolution direto, gravando a linha no banco de qualquer forma para o
painel não depender do push. **Status:** aguardando o usuário.

### D-OPEN-2 — A pasta `apify/` pertence a este projeto?
`apify/blueoceansem-posts.json` e `captions-ranked.txt` não têm relação com o Cliniflow.
Parecem de outro trabalho. Foram **mantidos** na limpeza de 26/07/2026 por precaução.
**Status:** aguardando o usuário confirmar se pode remover.

---

## 🟢 Tomadas

### D-28 — Antecedência do lembrete é valor livre em horas inteiras, não lista fixa · 15/08/2026
**Decisão:** o campo "Antecedência" do card de lembrete virou entrada numérica livre (1 a 720
horas inteiras), no lugar do `select` com 2/4/12/24/48. Pedido do dono: "tem que ser maleável,
de acordo com o horário que eu definir, e fluido".

**Por que só horas inteiras:** o `pg_cron` chama a `disparar-lembretes` de hora em hora
(`0 * * * *`) e a janela de busca é `agora + antecedencia_horas` até `+1h`. Uma antecedência de
2,5h não teria como ser respeitada — o disparo ia arredondar sozinho e a tela mentiria de novo,
que é a família de erro do §39. A coluna no banco também é `integer`. O teto de 720 (30 dias) é
só guarda contra estourar o `int4` com o que for digitado.

**O que NÃO foi feito, e é o limite real desta mudança:** o texto entregue ao paciente **não
acompanha** a antecedência. Ele vem do template aprovado na Meta, e o `confirmao_horas_antes`
tem **"4 horas" cravado no corpo** (§41). Mudar a antecedência muda *quando* o lembrete sai, não
*o que* está escrito. O card avisa isso ao lado do campo.

**Quem cuida disso:** o dono assumiu a gestão dos templates da Meta ("eu resolvo questões de
template"). Enquanto o `confirmao_horas_antes` for o template ligado, **manter a antecedência
em 4h** — qualquer outro valor faz a mensagem mentir para o paciente.

**Rejeitado:** liberar a antecedência e ajustar o texto local (`template_mensagem`) junto. Não
resolve — esse campo alimenta só o histórico do CRM; o WhatsApp entrega o template da Meta.
Ajustar só ele criaria CRM e paciente contando histórias diferentes.

### D-27 — Consultar o RAG por especificidade da mensagem, não por fase da conversa · 15/08/2026
**Status: DECIDIDO, NÃO IMPLEMENTADO.** Bloqueado por §40 — só aplicar junto com os documentos
reais da Anaruthe, **na mesma publicação**.

**Decisão:** substituir as seções `[COMO RESPONDER - SONDAGEM E CONVERSA GERAL]` e
`[COMO RESPONDER - PERGUNTA ESPECÍFICA]` do `systemMessage` por uma só, ancorada em **se a
mensagem nomeia algo que um documento consegue responder** — não na fase da conversa.

**O problema com a regra atual:** ela bloqueia o RAG durante "sondagem". Mas *"tenho manchas nos
dentes"* é classificado como sondagem e **nomeia uma condição concreta com resposta na base**.
O paciente recebe acolhimento vazio. É isso que faz o bot soar raso — não o limite de parágrafo,
que o dono suspeitava (e que já permite 2 parágrafos em pergunta específica).

**Por que não liberar geral:** desejo genérico ("quero melhorar meu sorriso") não tem resposta
determinada — mapeia para N procedimentos. Responder ali vira escolha arbitrária ou lista que
afoga. E cada consulta ao RAG é uma chamada a mais num caminho que já derrubou execução inteira
com 503 do Gemini (§33).

**Texto pronto para colar (não re-derive):**

> **[QUANDO CONSULTAR A BASE DE DOCUMENTOS]**
> O que decide não é a fase da conversa, é se a mensagem nomeia alguma coisa que um documento
> consegue responder.
>
> CONSULTE quando o paciente nomear um procedimento ("vocês têm Invisalign?"), uma condição ou
> sintoma ("tenho manchas nos dentes", "meu dente está sensível", "tenho rugas na testa"), ou
> perguntar algo operacional determinado — preço de um procedimento, convênio, quem atende, como
> é o pós. Responda com o que o documento realmente traz, em até 2 parágrafos curtos, só o que
> foi perguntado.
>
> NÃO CONSULTE em saudação ("oi", "bom dia") nem em desejo genérico sem alvo ("quero melhorar
> meu sorriso"). Isso não tem resposta determinada. Seja breve (1 parágrafo, 2-3 frases),
> acolha, e faça UMA pergunta que transforme o desejo genérico em algo concreto ("o que mais te
> incomoda hoje?").
>
> Na dúvida entre os dois, trate como genérico e pergunte: uma pergunta a mais custa menos que
> uma resposta errada.

**Efeito de segunda ordem que justifica o desenho:** no caso vago o bot não fica raso *nem*
consulta à toa — ele converte o vago em específico com uma pergunta, e o turno seguinte já cai
no ramo que consulta.

⚠️ `"tenho rugas"` sai da lista de exemplos genéricos: sob esta regra é específico. É intencional.

### D-26 — Dia e turno na mesma pergunta, com o turno fechado · 15/08/2026
**Decisão:** o bot pergunta dia e turno **numa mensagem só** — *"Tem algum dia da semana que fica
melhor pra você? E prefere de manhã ou à tarde?"*. O turno é sempre escolha fechada
(manhã/tarde); só o dia pode ficar aberto. Publicado na `activeVersion 96f84442`.

**Por quê:** o bot **não marca nada** — ele coleta uma preferência em texto livre que vira nota
num pedido `solicitado`, e quem escolhe a hora exata é a recepção. Logo o alvo não é precisão
máxima, é sinal suficiente com o mínimo de fricção. Segmentar em duas trocas gastava um
round-trip para obter precisão que a recepção descarta.

**Por que o turno fica fechado:** o prompt já proibia pergunta aberta e vaga, e por bom motivo —
"que dia você prefere?" puxa "qualquer dia", que é nota ruim. A proposta original do dono era
abrir os dois; manter o turno binário preserva a qualidade da nota sem custar troca.

**O que torna seguro responder pela metade:** §35 exige `intencao = quer_agendar` junto com
`periodo_preferencia`, então resposta parcial não cria pedido fantasma; e o dedupe de 60h da
`criar_pre_agendamento` faz o complemento **atualizar a mesma linha** em vez de criar um segundo
pedido. Sem esse dedupe esta decisão geraria fila duplicada.

⚠️ **Não "conserte" isso voltando para duas perguntas.** Foi medido contra o custo do
round-trip, não é descuido.

### D-25 — Prompt por cliente (persona em tabela) fica para o segundo cliente · 15/08/2026
**Decisão:** **não** construir agora configuração de persona/prompt por clínica no Supabase. O
prompt segue como texto no nó `AI Agent`. Adiado a pedido do dono, e nada foi começado.

**Por quê:** com um cliente não se sabe o que varia de verdade — abstrair agora garante abstrair
errado e pagar duas vezes. É o mesmo raciocínio já fechado no **D-22**: neste projeto workflow
não se reconstrói, se duplica. Duplicar para o cliente 2 é barato e ensina o que difere.

**Onde está o acoplamento real (para quando chegar a hora):** não é o nome da clínica — esse já é
dinâmico via `{{ $('Busca Clinica').first().json.name }}`. É o **domínio**: os exemplos do prompt
estão cravados em odontologia/estética ("Invisalign", "botox", "rugas", "sorriso"), espalhados por
quatro seções. Em outro nicho isso é reescrita, não substituição de variável. É isso que vira
campo configurável.

### D-24 — Clínica nova nasce com ZERO lembretes, sem seed automático · 15/08/2026
**Decisão:** ao criar uma clínica, o sistema **não** cria configs em
`config_automacao`. A aba Lembretes aparece vazia, com um aviso explicando o que falta.

**Por quê:** template do WhatsApp é aprovado **por WABA**, não globalmente.
`consulta_amanha` e `confirmao_horas_antes` existem na WABA da clínica atual. Semear essas
linhas para uma clínica nova entregaria um painel com dois lembretes "ligados" apontando para
templates que a WABA dela não tem — a Meta recusaria cada envio e ninguém veria, porque o
painel diria que está tudo ativo. É exatamente a falha do ARMADILHAS §39, só que de fábrica.

**A alternativa considerada e rejeitada:** semear com `ativo = false`. Rejeitada porque um
toggle desligado convida a ser ligado, e ligar não faz funcionar — o que faltava era o
template, não o toggle. Vazio com explicação é mais honesto que desligado sem explicação.

**Consequência aceita:** onboarding de clínica tem um passo manual (registrar templates na
Meta e cadastrá-los). Isso é inerente à Cloud API, não é dívida nossa.

**Quando revisar:** se um dia existir cadastro de template pelo CRM via Graph API, o seed
passa a fazer sentido — porque aí dá para criar o template junto com a config.

### D-23 — Aprovar um pré-agendamento desliga a IA daquele paciente · 15/08/2026
**Decisão:** aprovar um pedido (`solicitado` → `pendente`) grava
`patients.bot_pausado = true`. Quem já tem horário marcado passa a ser atendido por gente.
Implementado em `aprovarPedido` (`Cliniflow.html`).

**Pré-requisito que teve de existir antes (não pule isto):** a decisão só é segura com o n8n
na `activeVersion dea36506` ou posterior. Antes dela, `bot_pausado` descartava **toda**
mensagem do telefone, inclusive a resposta ao lembrete de 24h — ver ARMADILHAS §37. Se o
workflow for revertido para uma versão anterior, esta decisão vira bug: o paciente aprovado
não consegue mais confirmar consulta.

**Por que é seguro (os dois fatos que sustentam a decisão, os dois verificados no fluxo):**
1. **A mensagem não some.** `Grava Mensagem Inbound` (→ `mensagem_logs`) e `Cria Conversa`
   (→ `conversations`) rodam **antes** do gate em `Valida Expiração`. O paciente pausado que
   escreve aparece no painel Atendimentos com badge "IA Inativa", sem resposta automática.
   Isso é handoff para humano, não buraco negro.
2. **Confirmar continua funcionando.** O roteiro de confirmação é 100% determinístico
   (`Valida contexto` regex → `Análise de evento - Claude`, que apesar do nome é um nó
   `n8n-nodes-base.code` sem IA → `Switch` → `UPDATE consultas`). O §37 abriu exceção no gate
   para sessão viva com `consulta_id`, então confirmar/cancelar/remarcar sobrevive à IA
   inativa.

**Por quê:** é a política de atendimento do dono ("paciente da clínica sempre fala com
gente"), e o bot hoje **não tem contexto nenhum sobre consultas existentes** — isso só chega
no spec B. Um bot solto conversando com quem já tem horário marcado tem mais chance de
constranger do que de ajudar. Mesmo raciocínio que já valia para `createPaciente` nascer com
`bot_pausado = true` desde `3324bc0`.

⚠️ **Consequências que o dono aceitou de olhos abertos:**
- **É catraca.** Todo paciente que tiver uma consulta aprovada vira IA Inativa **para sempre**.
  Agendamento automático passa a servir só lead de primeira viagem. Reverter depois é um
  `UPDATE public.patients SET bot_pausado = false WHERE ...` — mas alguém precisa lembrar.
- **Não há notificação.** A conversa aparece no painel, mas ninguém é avisado por push. De
  madrugada ela fica lá até alguém abrir o CRM.
- **Quando o spec B entregar contexto de consulta para a IA, reavaliar.** Aí o bot saberá que
  a pessoa tem horário marcado, e a catraca deixa de ser necessária.

**Histórico honesto desta decisão (para não repetirem meu caminho):** eu recomendei primeiro o
**oposto** — não desligar — com dois argumentos, e **os dois estavam errados**:
- *"Quebra a confirmação por WhatsApp."* Quebrava, mas era consertável. Era restrição de
  ordem de implementação, não impedimento. Virou o §37.
- *"A falha é silenciosa."* **Não é.** Eu não tinha verificado que o log da mensagem e a
  criação da conversa acontecem antes do gate. Verificado depois: acontecem.

**Descartado no caminho:** deduplicar `criar_pre_agendamento` também contra consulta
`pendente`, para o paciente que pede alteração depois da aprovação. **Não é necessário:** a
primeira mensagem cria um `solicitado` e as refinações seguintes caem no dedupe de 60h contra
esse mesmo `solicitado` (`07-triagem-pre-agendamento.sql`). O resultado — consulta `pendente`
real + pedido de alteração na fila de triagem — é a representação correta. Não mexer.

### D-22 — `Meta WhatsApp - Producao` nasce de uma duplicata do `Evo-Go`, não de reconstrução · 06/08/2026
**Decisão:** o workflow de produção do canal Meta é criado pela função **Duplicate da interface do
n8n** sobre o `Evo-Go` (`ZAQ6I2CiBGh8swye`), e depois modificado cirurgicamente via MCP — não é
reconstruído nó a nó a partir de código.

**Por quê:** o `Evo-Go` tem 69 nós, e a duplicata da UI preserva **credenciais e sub-nós**
(AI Agent, modelo Gemini, memória Postgres, vector store). Reconstruir por código exigiria
reconectar credencial em cada nó Supabase/Gemini à mão — muito mais trabalho e muito mais chance
de divergir em silêncio do que já está provado funcionando (execução 79158/79160). É o mesmo
raciocínio do D-4 e do R-1: neste projeto não se reconstrói workflow, modifica-se o vivo.

**Descoberta que motivou a decisão:** o `Evo-Go` **não é só o bot de WhatsApp**. Tem três pontos de
entrada independentes: `Webhook` (mensagem do paciente via Evolution), `Google Drive Trigger`
(ingestão de documento no RAG) e `Error Trigger` (grava em `logs_erro`). Só o primeiro tem a ver
com a migração.

**Consequência prática (dupla, as duas perigosas se esquecidas):**
1. **Na duplicata:** o `Google Drive Trigger` e o `Error Trigger` vêm junto. Se a cópia for ativada
   sem desativá-los, todo documento novo no Drive é ingerido **duas vezes** no RAG (embeddings
   duplicados, piorando a recuperação já torta do §15) e todo erro vira duas linhas em `logs_erro`.
   Desativar os dois é o **primeiro** passo depois de duplicar, antes de qualquer ativação.
2. **No corte (D-20):** o `Evo-Go` **não pode simplesmente ser deletado** quando a Evolution sair —
   a ingestão do RAG e o log de erro moram nele. O caminho é ele sobreviver **stripado**, só com
   esses dois fluxos, renomeado para algo como `Cliniflow - RAG e Erros`. Isso entra na Task 8.

### D-21 — Nome do workflow n8n de produção do canal Meta · 06/08/2026
**Decisão:** o workflow de produção que recebe/processa mensagens via Meta Cloud API se chama
`Meta WhatsApp - Producao`.
**Por quê:** confirmado pelo usuário, segue o padrão de nome já usado nos workflows temporários
(`Meta WhatsApp - Verificação de Webhook (temporário)`, `Meta WhatsApp - Teste de Envio (temporário)`).
**Consequência prática:** nenhuma além de nomenclatura — usado nas Tasks 3/8 do plano de implementação.

### D-20 — Remover o código da Evolution assim que o corte for confirmado funcionando, sem período de segurança estendido · 06/08/2026
**Decisão:** assim que o corte de produção (D-15) for confirmado funcionando, remover os nós/config da
Evolution dos workflows n8n, em vez de deixá-los desligados por um tempo como plano B.
**Por quê:** decisão explícita do usuário (06/08/2026) — o objetivo declarado é "não vai existir mais
Evolution no meu sistema". Não é para ficar como fallback permanente nem temporário longo.
**Consequência prática:** o rollback rápido (reativar um workflow desligado) só existe **antes** dessa
limpeza. Depois de removido, reverter significa reconstruir a integração Evolution, não reativar algo
pronto — o que aumenta o peso dos testes isolados (Task 7 do plano) antes do corte. Colunas
`evolution_instance`/`evolution_apikey` em `clinics` não são derrubadas automaticamente por esta decisão
(`DROP COLUMN` é destrutivo/irreversível sem backup) — a remoção delas, se quiser, é uma limpeza
separada e deliberada, não parte do corte em si.

### D-19 — Sem coluna de canal por clínica: migração é substituição direta, não alternância permanente · 06/08/2026
**Decisão:** não criar `clinics.canal_whatsapp` (proposta original do spec, seção 3.2). O corte
continua sendo a nível de workflow/infra (ativar Meta, desativar Evolution), não um campo lido por
execução para escolher canal por clínica.
**Por quê:** o usuário confirmou que a Evolution deixará de existir no sistema — o objetivo não é
coexistência de longo prazo entre dois provedores, é substituição completa. Um seletor de canal
permanente resolveria um problema (rodar múltiplos provedores ao mesmo tempo) que não existe aqui.
**Consequência prática:** o outbound não ganha um `Switch`/`If` por canal — o nó de envio é
substituído diretamente (Evolution → Meta) no dia do corte (Task 8 do plano), não convive com os dois
lados ativos. **Reabrir quando:** se um dia fizer sentido rodar clínicas em provedores diferentes ao
mesmo tempo (não é o cenário de hoje, uma clínica só), essa decisão volta à mesa.

### D-15 — Coexistência Evolution/Meta: número/workflow isolado até corte único, sem tráfego real simultâneo · 06/08/2026
**Decisão:** validar o canal Meta inteiramente isolado (número de teste dedicado, workflow separado da
produção), sem nenhum paciente real passando por ele antes do corte. No dia do corte, desliga-se o bot
na Evolution e liga-se o do Meta de uma vez só, para essa clínica.

**Por quê:** descartadas as outras duas abordagens levantadas no brainstorming — rodar os dois em
paralelo com pacientes reais (exigiria guardar por paciente qual canal atende, reabrindo a necessidade
de uma flag já descartada) e ambiente espelhado totalmente separado (infraestrutura duplicada sem
necessidade, quebra o padrão de uma instância só do projeto). Com uma clínica só, rollout gradual não
compensa o custo.

**Consequência prática:** o corte "sem flag" (regra já registrada pra branch `meta-api-migration`) só
faz sentido porque nunca existe um momento em que uma mensagem real precisa escolher entre os dois
canais.

### D-16 — Lembretes no Meta: submeter templates para aprovação, não deixar em aberto · 06/08/2026
**Decisão:** como parte deste trabalho, submeter ao menos um template de lembrete de consulta para
aprovação no Business Manager, e trocar `disparar-lembretes` para chamar esse template (em vez de texto
livre) quando a mensagem for fora da janela de 24h.

**Por quê:** esse requisito da Cloud API foi exatamente o motivo do adiamento em D-13. Sem essa decisão,
a migração ficaria bloqueada de novo na mesma parede.

**Consequência prática:** a aprovação de template é externa (a Meta revisa) e pode demorar — entra no
cronograma como dependência de terceiro, não como tarefa de tempo fixo.

### D-17 — Envio ao Meta via nó HTTP Request + colunas em `clinics`, não o nó oficial "WhatsApp" do n8n · 06/08/2026
**Decisão:** montar as chamadas à Graph API com o nó genérico **HTTP Request**, puxando
`meta_access_token`/`meta_phone_number_id` de colunas novas (nullable) em `clinics`, lidas por execução
via expressão — não usar o nó nativo "WhatsApp account" do n8n.

**Por quê:** a credencial do nó oficial é fixa, escolhida no editor — não muda por linha/clínica em
tempo de execução. Isso quebraria o multi-tenant na primeira clínica nova: seria preciso editar o
workflow a cada clínica. O HTTP Request com dado vindo do banco segue o padrão que já existe hoje pra
`evolution_apikey`/`evolution_instance`.

**Consequência prática:** mais setup manual no nó (comparado ao nó oficial), zero retrabalho quando a
segunda clínica precisar do canal Meta.

### D-18 — Token do Meta: compartilhado entre clínicas por ora, mas já guardado por clínica no banco · 06/08/2026
**Decisão:** por enquanto, um único usuário do sistema/token da Meta pode ser reaproveitado entre
clínicas (mais simples de configurar), mas o valor efetivo é sempre lido de uma coluna **por clínica**
em `clinics`, nunca de uma credencial fixa do n8n.

**Por quê:** um token de usuário do sistema só age nos ativos (WABAs) explicitamente atribuídos a ele —
não é global. Isolar um token por clínica (usuário de sistema dentro da própria BM de cada clínica) é
mais seguro, mas dá mais trabalho de configuração por clínica nova. Proporcional ao tamanho atual (uma
clínica), mesmo raciocínio de custo/benefício já usado em D-6.

**Consequência prática:** guardar o token por clínica desde já evita migração de dado se um dia isolar
tokens de verdade. **Reabrir quando:** a plataforma tiver clínicas com BM própria e não quiser depender
de compartilhar ativo com a BM do operador.

### D-14 — Migração Meta: número novo dedicado, não migrar o número existente da clínica da tia · 05/08/2026
**Decisão:** o canal Meta Cloud API da clínica da tia vai usar um **chip/número novo**,
registrado na mesma WABA (`Clínica Integrada Dra Anaruthe Grangeiro`, BM `Grangeiro001`) que já
existe. O número atual, hoje ativo no aplicativo comum do WhatsApp Business, **não é tocado** —
continua sendo usado manualmente como está.

**Por quê:** migrar o número existente do app comum para Cloud API desativaria o WhatsApp
Business App naquele celular (um número não fica nos dois ao mesmo tempo) — risco demais para
decidir sob pressão de teste. Um número novo desacopla completamente o teste/lançamento do canal
Meta de qualquer impacto no atendimento manual que já funciona.

**Consequência prática:** a arquitetura deixa de ser "trocar o número da clínica" e passa a ser
"a clínica ganha um segundo número, dedicado ao bot". Isso ajusta a Task 2.1 do plano de 04/08
(`docs/superpowers/plans/2026-08-04-migracao-meta-whatsapp-cloud-api.md`) — `meta_phone_number_id`
aponta para um número novo, não para uma migração do `evolution_instance` existente.

**Reabrir quando:** se um dia fizer sentido consolidar num único número, isso volta a ser uma
migração de número dentro da própria Meta — não depende mais deste projeto.

### D-13 — Migração Evolution API → Meta WhatsApp Cloud API fica para depois, não hoje · 05/08/2026
**↳ Correção (06/08/2026):** "clínica da irmã" e "clínica da tia", citadas aqui e no `AGENTS.md`
(Estado anterior 05/08, manhã), são **a mesma clínica** — não duas. Não planeje assumindo duas clínicas
distintas nesse deploy.
**Decisão:** o lançamento de amanhã (clínicas da irmã e da tia do usuário) sobe com a Evolution
API, como está hoje, provada ponta a ponta. A migração para a API oficial da Meta vira um
projeto separado, sem pressa de deploy.

**Por quê:** o usuário não tem nenhuma configuração da Meta WhatsApp Cloud API ainda (sem
Business Manager, sem App, sem número verificado). Além do tempo de setup (que depende de
aprovação da Meta, não só de código), a Cloud API exige **template pré-aprovado** para qualquer
mensagem enviada fora da janela de 24h da última mensagem do paciente — e é exatamente isso que
`disparar-lembretes` faz hoje (texto livre, fora da janela). Trocar de provedor às vésperas do
primeiro atendimento real em duas clínicas novas arriscava derrubar o único canal de WhatsApp
delas sem necessidade.

**Consequência prática:** ao planejar a migração, ela não é "trocar o endpoint" — é reprojetar
o fluxo de lembretes/mensagens proativas em cima de templates aprovados pela Meta, e prever o
tempo de aprovação de Business Manager/número/templates antes de qualquer corte de produção.

### D-1 — Restaurar o Supabase e versionar o schema · 26/07/2026
**Decisão:** restaurar o projeto pausado e extrair schema, funções, triggers e RLS para `docs/db/`.
**Por quê:** funções e triggers (incluindo o disparo `pg_net` que envia as mensagens do CRM)
**só existiam dentro do banco**. Um projeto pausado que fosse deletado levaria a lógica junto.

### D-2 — Remover as notas internas privadas do CRM · 26/07/2026
**Decisão:** remover o recurso inteiro do frontend (estado, seletor de canal, balão amarelo,
parâmetro na função de envio).
**Por quê:** o usuário avaliou que era cosmético no momento. Efeito colateral positivo: o trigger
`secretary_message_trigger` não filtra `private`, então uma nota interna seria **enviada ao
paciente** pelo WhatsApp. Sem o recurso, nada grava `private=true` e o vazamento não tem como
ocorrer. **O trigger continua sem o filtro** — ver `ARMADILHAS.md` §2 antes de reintroduzir.

### D-3 — O login (Auth + RLS) será executado por outro agente · 26/07/2026
### ↳ REABERTA E REVERTIDA em 28/07/2026 — voltou para o Claude
**Decisão original:** escrever o plano de execução em `docs/plano-auth-rls.md` e passar para o
Gemini implementar, em vez de implementar aqui.
**Por quê:** decisão do usuário, para economizar tokens da sessão de 26/07. O plano é
autocontido: inclui as armadilhas, a ordem de fechamento tabela por tabela com teste entre
cada passo, e o rollback.

**Reversão (28/07/2026):** o usuário escolheu "eu assumo o login + RLS inteiro" durante a
auditoria de LGPD. A execução voltou para esta sessão.
⚠️ **O Gemini precisa ser avisado** — se ele estiver com o plano em mãos, dois agentes vão
escrever nas mesmas tabelas. As etapas 1 e 2 do plano já estão aplicadas no banco.

### D-4 — Aplicar correções do n8n via MCP, não pela interface · 26/07/2026
**Decisão:** usar `update_workflow` + `publish_workflow` do MCP do n8n.
**Por quê:** a orientação anterior era "aplique pela UI", porque o export local não carrega
credenciais e reimportar quebraria o workflow. O MCP resolve isso: opera sobre o workflow vivo,
preserva credenciais e sub-nós, e as operações são atômicas. Validado em 5 correções.

### D-5 — Limpeza de arquivos: apagar o regenerável, preservar o irrecuperável · 26/07/2026
**Decisão:** removidos os dois executáveis do Supabase CLI (212 MB), `scratch/` e `graphify-out/`.
Antes de apagar o `scratch/`, os 19 arquivos puxados do n8n vivo foram movidos para
`docs/n8n-evidencia/`. SQL histórico e workflow morto foram para `docs/legado/`.
**Por quê:** critério = apagar o que se regenera, preservar o que não se regenera.
Resultado: 220 MB / 620 arquivos → 3,8 MB / ~100 arquivos.

### D-6 — Formato do login: uma conta por clínica, criada à mão · 26/07/2026
**Decisão:** (a) **um login compartilhado por clínica**, não por pessoa; (b) contas criadas
pelo dono no painel do Supabase, sem autocadastro nem tela de admin; (c) sessão **não expira**.
**Por quê:** o alvo agora é uma clínica só. Gestão de usuários e timeout de inatividade são
complexidade que não se paga nesse tamanho, e sessão que expira no meio do expediente derruba
o Realtime — a recepção lê isso como "o sistema travou".

**Consequência assumida:** `mensagem_logs.sender_id` fica sempre NULL (com uma conta só, gravar
o uid não informa quem escreveu). `conversations.assignee_id` continua em uso, mas seu
significado degrada de *"quem assumiu"* para *"se alguém assumiu"* — ainda alimenta o rótulo
`Humano` no cabeçalho e as abas de filtro do CRM.

**Reabrir quando:** entrar a segunda clínica, ou quando a recepção tiver mais de uma pessoa e
alguém perguntar "quem respondeu esse paciente?".

**↳ Parte (b) REABERTA E REVERTIDA em 29/07/2026 — ver D-12.** O usuário optou por implementar
autocadastro via Google agora, não esperar a 2ª clínica. Partes (a) e (c) continuam valendo.

---

### D-7 — O n8n é executor, não observador · 26/07/2026
**Decisão:** o n8n fica **só** com o fluxo conversacional inbound (AI Agent + RAG + memória +
debounce). Agendamento e observabilidade passam para o Supabase (`pg_cron` + funções SQL +
Edge Functions). O `Error Trigger` continua, mas rebaixado a **escritor** em `logs_erro` — o
cérebro do alerta sai de dentro do workflow de 71 nós.

**Por quê:** o `Error Trigger` só enxerga exceção do próprio n8n. Já era cego para as duas
Edge Functions, para o frontend e — o que mais importa num bot de WhatsApp — para o modo de
falha dominante, que é o **silêncio** (webhook não chega, envio preso, cron morto). Nada
disso lança exceção. Somado a isso, o n8n é instância única: usá-lo como vigia faz o vigia
morrer junto com o paciente. O Supabase não adiciona ponto único novo, já que é dependência
dura de tudo.

**Consequência prática:** ao criar automação nova neste projeto, o default é função SQL ou
Edge Function agendada por `pg_cron` — não workflow n8n.

### D-9 — Remover o handoff de urgência do workflow · 27/07/2026
**Decisão:** removidos os nós `Pausa IA (Urgência)` e `AVISO URGÊNCIA` do workflow
`ZAQ6I2CiBGh8swye`. Publicado e conferido na `activeVersion` (71 → 69 nós).
**Por quê:** decisão do usuário — o recurso era "praticamente cosmético". Somado a isso, a
auditoria de 27/07 mostrou que ele era **ativamente perigoso**: `Pausa IA (Urgência)` fazia
`INSERT` em `sessoes_ativas`, cuja PK é o telefone. Na segunda urgência do mesmo paciente
daria violação de chave e, como o nó não tinha `onError`, **derrubaria o workflow inteiro** —
justamente no caso em que o paciente mais precisa de resposta.

**O que ficou:** o switch `Filtra urgência` continua no fluxo, mas agora as duas saídas vão
para `Veio do Webhook?` — ou seja, **é um passa-tudo inerte**, o mesmo estado de antes de
26/07. Isso é intencional, **não é bug**: mantê-lo custa zero e evitou cirurgia de conexão
num workflow que tinha acabado de provar que funciona.

⚠️ **Ao próximo agente:** se você notar que `[ACIONAR_HUMANO]` "não faz nada", **isso é de
propósito**. Não reintroduza os nós — foi exatamente esse o ciclo que aconteceu em 26/07
(alguém viu o marcador decorativo, "consertou", e criou o bug de chave duplicada).
Se um dia o handoff voltar, ele precisa ser **upsert**, não insert, e ter
`onError: continueRegularOutput`.

### D-8 — O detector de silêncio é função SQL, não Edge Function · 26/07/2026
**Decisão:** `public.detectar_silencio()` em plpgsql, agendada direto por `pg_cron`
(`select public.detectar_silencio()`), em vez da Edge Function + `net.http_post` que eu
havia planejado.

**Por quê:** `cron.job_run_details` não é exposto via PostgREST, então uma Edge Function
precisaria de uma RPC de qualquer jeito — a chamada HTTP só somava peças que podem quebrar.
Do jeito escolhido o detector não depende de HTTP, de JWT, nem das Edge Functions estarem no
ar. E elimina de vez a classe de bug da `ARMADILHAS.md` §10, que nasceu justamente de montar
header com chave dentro de um comando de cron.

### D-10 — Views `kpi_*`: `security_invoker`, não revogar o `SELECT` de anon · 28/07/2026
**Decisão:** aplicar `ALTER VIEW ... SET (security_invoker = on)` nas 4 views de KPI, em vez
de revogar o `SELECT` da role `anon`.

**Por quê:** as duas opções fecham o mesmo vazamento (`kpi_retencao` entregava nome +
telefone + convênio + histórico por fora do RLS — `ARMADILHAS.md` §16). Mas revogar o
`SELECT` **quebraria a aba de Relatórios hoje**, porque o CRM ainda não tem login e lê as
views com a chave anon. Já o `security_invoker` é **no-op enquanto as policies forem
`USING (true)`** e fecha sozinho, automaticamente, no dia em que as tabelas forem fechadas.

**Consequência:** a correção não precisou esperar o login — e não existe um intervalo em que
alguém "esqueça" de voltar para fechar a view. Verificado: consultadas como role `anon` as 4
views continuam respondendo.

**Reabrir quando:** depois do login estar no ar, revogar o `SELECT` de `anon` nas 4 views
vira uma limpeza barata e vale fazer (defesa em profundidade). Está na etapa 9 do
`docs/db/04-fechamento-rls.sql`.

### D-11 — `data_hora` do pré-agendamento fica `now()` como placeholder · 28/07/2026
**Decisão:** a RPC `criar_pre_agendamento` grava `data_hora = now()`.

**Por quê:** a coluna é `NOT NULL` sem default e a IA não negocia horário — ela captura só
turno de preferência ("manhã"/"tarde"), que vai para `notas`. Quem define o horário real é a
recepção, ao aprovar o `solicitado`.

**Consequência assumida:** um pré-agendamento aparece na agenda no instante em que foi pedido,
não no horário desejado. Se a aba de agenda ordenar por `data_hora`, ele aparece "agora".
**Confirme isso na primeira vez que um `solicitado` real cair na tela** — se incomodar, a
alternativa é tornar `data_hora` nullable e a agenda tratar `solicitado` como lista separada.

### D-12 — Login com Google + onboarding self-service, os dois juntos · 29/07/2026
**Decisão:** implementar as duas partes do D-OPEN-4 de uma vez: o botão "Entrar com o Google"
e o fluxo de onboarding ("Cadastre sua clínica") para quem loga sem `clinic_id` vinculado.
**Reabre a parte (b) da D-6** ("sem autocadastro").

**Por quê:** o usuário escolheu esse escopo explicitamente quando perguntado se queria só o
botão (recomendação original do D-OPEN-4) ou as duas partes — preferiu não esperar a 2ª clínica.

**O que foi feito (banco, migração `onboarding_clinica_google_oauth`):**
- `clinics.evolution_instance` e `clinics.evolution_apikey` viraram nullable (UNIQUE permanece).
- RPC `public.registrar_clinica(p_nome text)`, `SECURITY DEFINER`, `GRANT` só para
  `authenticated` (verificado via advisor — `anon` não pode chamar). Gera o `clinic_id` no
  servidor, recusa se `auth.uid()` já tiver linha em `clinic_users` — cobre a aresta afiada
  descrita no D-OPEN-4 original (usuário não pode escolher nem reutilizar um `clinic_id`).
  Definição comentada em `docs/db/02-functions-triggers.sql`; roteiro completo em
  `docs/db/05-onboarding-google-oauth.sql`.

**O que foi feito (frontend, `cliniflow-export/`):**
- `supabase-client.js`: `signInWithGoogle()`, `getClinicId()` (chama `auth_clinic_id()` via
  RPC), `registrarClinica(nome)` (chama a RPC acima).
- `Cliniflow.html`: botão "Entrar com o Google" na `LoginScreen`; novo componente
  `OnboardingClinica`; `Root` agora busca `clinicId` junto da sessão e mostra o onboarding
  quando há sessão mas `clinicId` é `NULL`.
- Correção ao texto que o usuário colou como referência: `signInWithOAuth` do supabase-js v2
  espera `{ provider, options: { redirectTo } }` — `redirectTo` no nível raiz (como no exemplo)
  é ignorado silenciosamente pela lib.

**Pendente, fora do banco/código (não pode ser feito por aqui):**
1. Google Cloud Console — criar OAuth Client ID, redirect URI
   `https://mxvaufkqijdkapvtkvee.supabase.co/auth/v1/callback`.
2. Supabase Dashboard → Authentication → Providers → Google — colar Client ID/Secret do passo 1.
3. Supabase Dashboard → Authentication → URL Configuration → Redirect URLs — adicionar a origem
   real do CRM (o código usa `redirectTo: window.location.origin`, que muda de `localhost` para
   o domínio publicado).
Sem os 3 passos, o botão aparece mas falha ao clicar (erro tratado, não trava a tela).

**Consequência assumida:** uma clínica que se autocadastra nasce sem `evolution_apikey`/
`evolution_instance` — uma casca que não atende ninguém até alguém provisionar a Evolution à
mão. Isso é esperado, não um bug.

**Não testado ainda:** o fluxo completo depende dos passos 1-3 acima, que exigem acesso a
consoles externos. `registrar_clinica` foi verificado só por leitura de metadados
(`pg_proc`/advisors), não por uma chamada real via RPC.

## 🚫 Rejeitadas (NÃO reintroduza)

### R-1 — Reimportar o JSON do workflow por cima do n8n · 26/07/2026
`Projeto Clínica - Evo Go ....json` **não contém o bloco `credentials`** em nenhum dos 71 nós.
Reimportar deixaria todo nó Supabase/Gemini/Gmail desconectado da credencial. O arquivo é
**referência**, não fonte de deploy. Use o MCP (D-4).

### R-2 — Tratar a chave anon exposta como não sendo problema · 26/07/2026
O registro de 23/06 em `SYNC_STATUS.md` afirmava que a chave anon exposta "não representa falha de
segurança de produção". **Isso é incorreto** e foi corrigido. Chave anon só é segura sob RLS
restritivo; aqui o RLS é `USING (true)`. Testado: devolve dados reais de paciente.

### R-3 — Culpar a instância Evolution pelo sistema fora do ar · 26/07/2026
A hipótese inicial era de que a instância de teste do Evolution Go estava com problema.
A causa real era o **projeto Supabase pausado**. A instância e o n8n estavam no ar o tempo todo.
Antes de trocar de instância, cheque o status do Supabase (`ARMADILHAS.md` §1).
