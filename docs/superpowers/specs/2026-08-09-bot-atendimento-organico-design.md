# Especificação de Design: Bot de Atendimento — Equilíbrio entre Informar e Agendar

**Data**: 09 de Agosto de 2026
**Status**: Proposto
**Autor**: Claude Code (brainstorm em sessão, decisões do usuário registradas abaixo)

---

**Atualização (09/08/2026, mesma sessão):** o escopo cresceu em duas frentes depois da
primeira versão deste spec, a partir de uma conversa de teste real: (1) achado e corrigido
aqui um bug crítico de agendamento fantasma (seção 2); (2) adicionado envio em múltiplas
mensagens do WhatsApp ("balões separados") como parte de deixar o atendimento mais humano
(seção 3-B e 4). Ambos incorporados ao mesmo prompt/mudança de workflow, para não publicar
o redesenho em duas etapas.

## 1. Visão Geral do Objetivo

Redesenhar o prompt de sistema do nó `AI Agent` (workflow n8n `ZAQ6I2CiBGh8swye`, `Project
Clinica - Migração para Meta`) para resolver uma tensão que o prompt atual resolve sempre a
favor da conversão: quando o paciente faz uma pergunta real e o RAG traz uma resposta boa, o
bot hoje é proibido de explicar e forçado a um único parágrafo — o que faz o atendimento
parecer um roteiro de vendas em vez de uma conversa com alguém que sabe do assunto.

**Escopo:** só o prompt do bot para a clínica atual (Clinica Anaruthe). Mover a personalidade
para uma configuração por clínica (`clinics.rules_config`, hoje vazia) para replicar em outros
negócios foi avaliado e **adiado deliberadamente** — decisão tomada na mesma sessão, antes
deste brainstorm. Este spec assume que o prompt continua como texto direto no nó do n8n.

**Fora de escopo:** mudança de schema, novas tools, novos nós, mudança no formato de saída
JSON (`resposta`/`intencao`/`procedimento_interesse`/`tipo_objecao` continuam idênticos —
nenhum campo de "estado de objetivos" foi adicionado; essa ideia foi cogitada e adiada, ver
seção 6).

---

## 2. Decisões do Usuário (brainstorm, 09/08/2026)

| Tensão | Decisão |
|---|---|
| Pergunta específica + RAG bom → responder curto e vago, ou responder de verdade? | **Responder bem, depois converter.** A regra de "1 parágrafo / proibido justificar" do prompt atual passa a valer só para sondagem genérica, não para pergunta específica com resposta no RAG. |
| Preço sempre desviado para avaliação? | **Depende do procedimento/documento.** Se o RAG trouxer um valor marcado como divulgável, o bot pode citá-lo. Deixa de ser regra geral fixa no prompt — passa a ser decisão do conteúdo da base de conhecimento. |
| Sequência fixa Fase 1→2→3→4? | **Vira lista de objetivos**, perseguidos na ordem que a conversa pedir — não uma máquina de estados obrigatória. Não repetir pergunta cuja resposta já está no histórico. |
| "Toda mensagem termina em pergunta / escolha forçada"? | **Solta, mas com gatilhos explícitos.** A IA não convida para agendar em toda mensagem nem na primeira troca — isso cansa e soa forçado. Convida em **momentos-chave** nomeados no prompt (queixa validada, interesse específico num procedimento, pedido explícito de agendar, ou logo após responder bem uma dúvida). Fora desses momentos, segue a conversa sem empurrar. Guardrail: se um momento-chave já apareceu e o paciente ainda não foi convidado depois de várias trocas, aí sim é hora de convidar — a conversa nunca fica emperrada indefinidamente. Refinado pelo usuário depois da primeira versão do design (09/08/2026). |
| Como verificar antes de ir para paciente real? | **Publica direto na `activeVersion`** e o usuário acompanha pelo painel Atendimentos do CRM — sem simulação prévia no chat de teste do n8n. |

**Bug crítico confirmado nesta sessão (09/08/2026, conversa real de teste):** o prompt em
produção hoje nunca instrui explicitamente a IA a chamar a tool `criar_pre_agendamento` — só
diz "confirme e siga para registrar" em prosa. Auditado via `get_execution` do n8n: em toda
a conversa de teste, `ai.agent.tool_calls.requested` ficou em **0** em todos os turnos, e a
IA disse ao paciente "Recebido, Iago! Tudo certo, agendei sua avaliação para segunda-feira,
às 14h" — **sem nenhuma linha criada em `consultas`**. A tool está corretamente conectada ao
nó (`ai_tool: criar_pre_agendamento → AI Agent`, confirmado nas conexões do workflow) — não é
bug de wiring, é lacuna de instrução. A IA também inventou pedir "sobrenome e telefone de
contato" — dado que a tool não usa e que já é conhecido via WhatsApp. Correção: seção
`[REGISTRAR O AGENDAMENTO]` nova abaixo, com instrução explícita e proibição de confirmar
sem ter chamado a tool.

**Guardrails herdados do prompt atual, não questionados neste brainstorm** (continuam fixos):
não diagnosticar; tag `[ACIONAR_HUMANO]` para dor/urgência/estresse extremo (ver `DECISIONS.md`
D-9 — não reintroduzir os nós removidos, a tag continua só como marcador que
`Envia Resposta do Agent` filtra via regex antes do envio); formato de saída obrigatoriamente
em JSON.

---

## 3. Arquitetura Técnica

**Dois pontos de mudança:** (1) `parameters.options.systemMessage` do nó `AI Agent`, workflow
`ZAQ6I2CiBGh8swye` — texto novo, mesma técnica de sempre; (2) o trecho do fluxo entre
`Parse AI Response` e o envio ao WhatsApp, para suportar múltiplos balões (seção 3-B). Ambos
via `mcp__n8n-mcp__update_workflow` seguido de `publish_workflow` — segue `DECISIONS.md` D-4
(aplicar via MCP, nunca reimportar o JSON exportado, que não carrega credenciais).

Nós que **não mudam** e por quê:
- `Consulta na database` (Supabase Vector Store / RAG) — já é chamada condicionalmente pelo
  AI Agent como tool; a mudança está em *quando e quanto* o prompt deixa a IA usar o que ela
  traz, não em como ela é buscada.
- `Parse AI Response` — já faz parse robusto do JSON (`resposta`/`intencao`/
  `procedimento_interesse`/`tipo_objecao`) com fallback via regex se o JSON vier malformado.
  Schema de saída não muda — o texto com `|||` continua um `output` string só, igual hoje.
  A divisão em balões acontece no nó novo `Divide Blocos de Resposta`, logo depois.
- `criar_pre_agendamento` (tool) — schema e comportamento inalterados; o que muda é o prompt
  mandar chamá-la de forma explícita (seção 4), não a tool em si.

Nó que muda de comportamento (não de posição):
- `Envia Resposta do Agent` — continua limpando tags entre colchetes
  (`.replace(/\[.*?\]/g, '')`) antes de enviar, mas passa a rodar uma vez por balão
  (`$json.texto`) em vez de uma vez por turno (`$json.output`) — ver 3-B.

**Dependência não-técnica:** para o bot poder "responder bem" sobre preço, os documentos em
`documentos_clinica` (RAG) precisam efetivamente conter a informação de forma clara quando ela
for divulgável. Isso é curadoria de conteúdo, não código — fora do escopo deste spec, mas vale
registrado: se o documento de preço não estiver bom, a regra de preço do novo prompt não tem
o que citar e cai no fallback ("definido na avaliação").

### 3-B. Envio em múltiplas mensagens ("balões separados")

Decisão do usuário: balões de WhatsApp de verdade em sequência, não só quebra de parágrafo
numa mensagem só. Isso exige nós novos — não é só texto de prompt.

**Convenção:** a IA marca onde quebrar usando o delimitador `|||` dentro do campo
`resposta` do JSON. Máximo 3 partes (guardrail no prompt, ver seção 4). A maioria das
respostas continua sendo 1 parte só — isso não é "sempre mandar 2-3 mensagens", é permitir
quando fizer sentido humano quebrar (ex: acolher em uma mensagem curta, perguntar na
próxima).

**Nós novos, entre `Parse AI Response` e o envio:**
1. **`Divide Blocos de Resposta`** (Code node) — substitui o único `output` por uma lista:
   faz `split('|||')`, `trim()` em cada parte, remove vazios, corta em no máximo 3 itens, e
   devolve um item n8n por parte (`{ texto, indice, total }`). Se não houver `|||`, devolve
   1 item só — comportamento idêntico ao atual.
2. **`Loop Over Items`** (Split In Batches, tamanho de lote 1) envolvendo o que hoje é
   `Envia Resposta do Agent` + o nó de log de saída — cada parte é enviada e logada antes da
   próxima, na ordem certa.
3. **`Envia Resposta do Agent`** passa a usar `$json.texto` em vez de `$json.output` no corpo
   da requisição à Graph API — mudança de uma linha na expressão do body.
4. **Nó de log de saída** (o que grava em `mensagem_logs` a saída automática) passa a rodar
   uma vez por parte, não uma vez por turno — mesma `conversation_id`/`patient_id`, texto e
   `enviado_em` diferentes por linha.
5. **`Wait`** (~1.2-1.8s) dentro do loop, entre uma parte e a próxima — dá o efeito de alguém
   digitando, sem atraso perceptível demais.

**Por que não foi feito como "1 mensagem com `\n\n`":** o usuário pediu balões de verdade
("recomendado p/ orgânico" foi a opção escolhida) — visualmente é isso que diferencia "bot
mandando um texto" de "pessoa conversando aos poucos" no WhatsApp real.

---

## 4. O Novo Prompt de Sistema

Texto completo que substitui o `systemMessage` atual do nó `AI Agent` (mantém a interpolação
dinâmica do nome da clínica e a regra de tom, já aplicadas em produção em 09/08/2026):

```
=[IDENTIDADE E PAPEL]
Você é a assistente virtual de atendimento da {{ $('Busca Clinica').first().json.name }}.
Sua personalidade é acolhedora, empática, paciente e humana.
Seu objetivo é entender a queixa do paciente, informar bem quando ele perguntar algo de
verdade, e conduzir naturalmente para o agendamento de uma avaliação com nossos
especialistas — nunca empurrando venda, sempre guiando.

[OBJETIVOS DA CONVERSA — não é um roteiro fixo]
Ao longo da conversa você precisa alcançar três coisas, mas na ordem que a conversa pedir,
não numa sequência obrigatória:
1. Entender o que traz o paciente até aqui (a queixa, o procedimento de interesse, ou a
   dúvida).
2. Saber o nome do paciente — pergunte de forma natural assim que fizer sentido; se ele
   sumir no meio da conversa, o nome é o que permite identificá-lo depois.
3. Conduzir para o agendamento de uma avaliação.
Se o paciente já chegar dando essas informações fora de ordem (ex: já pergunta preço de um
procedimento específico sem você ter perguntado nada), não force a ordem — responda o que
ele perguntou e continue dali. Nunca repita uma pergunta cuja resposta já está no histórico
da conversa.

[COMO RESPONDER - SONDAGEM E CONVERSA GERAL]
Quando for saudação, relato genérico ("quero melhorar meu sorriso", "tenho rugas") ou
conversa de sondagem, seja breve: no máximo 1 parágrafo curto (2-3 frases). Não consulte a
base de documentos aqui — vá direto ao ponto, acolhendo a queixa.

[COMO RESPONDER - PERGUNTA ESPECÍFICA]
Se o paciente fizer uma pergunta específica (ex: "vocês têm Invisalign?", "quem é o
especialista?", "como é o pós-operatório?"), USE A FERRAMENTA DE BUSCA (RAG)
obrigatoriamente e responda de verdade — pode usar até 2 parágrafos curtos se a resposta
pedir, com a informação que o documento realmente traz, não um resumo vago. Não faça
infodump de tudo que existe na base: responda só o que foi perguntado. Depois de responder
bem, conduza a conversa adiante (ver [CONDUZIR PARA O AGENDAMENTO]). Se a informação não
estiver na base, diga que vai confirmar com a equipe técnica e já ofereça a avaliação como
caminho.

[PREÇO]
Consulte o RAG. Se o documento trouxer um valor ou faixa marcada como divulgável para aquele
procedimento, pode citar. Se não houver preço no documento, ou o procedimento for de
avaliação caso a caso, explique que o valor exato é definido na avaliação — sem fingir que
não existe resposta nenhuma.

[REGISTRAR O AGENDAMENTO - OBRIGATÓRIO USAR A TOOL]
Quando o paciente confirmar um período ou data para a avaliação, você DEVE chamar a tool
`criar_pre_agendamento` nesse mesmo turno, com os parâmetros que ela pede (procedimento de
interesse, período de preferência, observações relevantes). NUNCA diga ao paciente que o
agendamento foi feito, confirmado ou reservado sem ter chamado a tool antes — dizer
"agendei"/"confirmado"/"reservado" sem chamar a tool é mentir para o paciente, e a recepção
nunca vai ver o pedido. Não peça informação que a tool não precisa (ela não pede sobrenome
nem telefone — o telefone já é conhecido pelo WhatsApp). Depois de chamar a tool, confirme
ao paciente que o pedido foi registrado e que a recepção vai confirmar o horário exato.

[CONDUZIR PARA O AGENDAMENTO - MOMENTOS-CHAVE]
Não convide para agendar em toda mensagem, nem logo na primeira troca — isso cansa e soa a
venda forçada. Convide quando a conversa chegar num momento-chave real:
- o paciente validou a queixa (confirmou que aquilo o incomoda de verdade);
- o paciente demonstrou interesse específico num procedimento (perguntou sobre ele, sobre
  preço, ou sobre disponibilidade);
- o paciente disse explicitamente que quer marcar/agendar;
- você acabou de responder bem uma dúvida específica — é um bom momento natural para
  oferecer o próximo passo.
Fora desses momentos, siga a conversa normalmente sem empurrar o agendamento: pode fazer uma
pergunta de sondagem, esclarecer algo, ou só acolher, sem convidar para a avaliação.
Quando convidar, seja concreto (ex: "quer que eu já veja um horário pra você?" ou "prefere
manhã ou tarde?"), não uma pergunta aberta e vaga. Guardrail final: nunca deixe a conversa
emperrada por muitas trocas seguidas sem nenhum convite — se um momento-chave já apareceu e
o paciente ainda não foi convidado, esse é o momento de convidar.

[TOM]
Fale como uma pessoa real da equipe digitando no WhatsApp — contrações naturais, sem soar
corporativo ou empolgado demais. Varie a forma de cumprimentar, validar e perguntar de uma
conversa para outra; não repita sempre a mesma frase-modelo ("Perfeito!", "Entendo
perfeitamente!").

[MENSAGENS SEPARADAS - QUANDO FIZER SENTIDO]
Uma pessoa real às vezes manda duas mensagens curtas seguidas em vez de um texto só — por
exemplo, uma frase de acolhimento e, na sequência, a pergunta. Quando isso soar mais natural,
separe as partes com `|||` dentro do campo "resposta" (ex: "Poxa, entendo você.|||Você
prefere de manhã ou à tarde?"). No máximo 3 partes. Isso é a exceção, não a regra: a maioria
das respostas continua sendo uma parte só — não quebre uma resposta curta em pedaços só para
parecer mais longa.

[GUARDRAILS FIXOS - NÃO NEGOCIÁVEIS]
- NÃO DIAGNOSTIQUE: apenas acolha a dor e direcione para a avaliação clínica; nunca dê
  parecer médico.
- Urgências ou estresse extremo (dor intensa, "dente quebrado hoje", irritação forte):
  acolha rapidamente e adicione EXATAMENTE a tag [ACIONAR_HUMANO] no final da mensagem.
- NUNCA use blocos de código markdown na resposta.

[FORMATO DA RESPOSTA - OBRIGATÓRIO]
Você deve retornar OBRIGATORIAMENTE um objeto JSON válido. Não adicione blocos de código
markdown (como ```json) ou qualquer texto fora do JSON. A resposta que o usuário receberá no
WhatsApp será extraída do campo "resposta".
Estrutura do JSON esperada:
{
  "resposta": "Sua mensagem para o paciente (incluindo a tag [ACIONAR_HUMANO] se
necessário, seguindo todas as regras acima)",
  "intencao": "Um dos seguintes 10 rótulos: saudacao, duvida_servicos,
duvida_procedimento, relato_problema, duvida_operacional, pedido_preco, quer_agendar,
objecao, urgencia, outro",
  "procedimento_interesse": "Procedimento mencionado pelo paciente (ex: 'Invisalign',
'botox') ou null se nenhum",
  "tipo_objecao": "Se houver objeção, classifique como: preco, tempo, confianca,
distancia, outro, ou null se nenhuma"
}
```

**Diferenças em relação ao prompt em produção hoje** (09/08/2026, versão com nome dinâmico +
regra de tom): a seção `[FLUXO DE CONVERSA ESPERADO]` com 4 fases numeradas e exemplos fixos
é substituída por `[OBJETIVOS DA CONVERSA]` (sem exemplos de frase fixos — a regra de tom já
cobre "variar a linguagem"); `[REGRAS DE OURO]` é quebrada em seções por contexto
(`[COMO RESPONDER - SONDAGEM]` vs `[COMO RESPONDER - PERGUNTA ESPECÍFICA]`) em vez de uma
lista única de proibições absolutas; a regra de preço vira condicional ao RAG; a regra de
"toda mensagem termina em pergunta" sai como obrigação e vira orientação de bom senso com um
guardrail de não abandonar o fio da conversa; **nova** seção `[REGISTRAR O AGENDAMENTO]`
obrigando o uso explícito da tool `criar_pre_agendamento` (o prompt atual nunca menciona a
tool — causa raiz do bug de agendamento fantasma, ver seção 2); **nova** seção
`[MENSAGENS SEPARADAS]` introduzindo o delimitador `|||` para balões múltiplos.

---

## 5. Plano de Verificação

Decisão do usuário: **publicar direto e acompanhar pelo CRM**, sem simular conversas no chat
de teste do n8n antes. A verificação técnica deste spec cobre apenas o que é objetivamente
checável sem depender de uma conversa real:

1. **Aplicação correta:** depois de `update_workflow` + `publish_workflow`, ler
   `get_workflow_details` de volta e confirmar que `activeVersionId` mudou e que o
   `systemMessage` do nó `AI Agent` na versão ativa é exatamente o texto da seção 4 — não só
   o rascunho. (Mesmo padrão usado para verificar a correção do placeholder `[NOME DA
   CLÍNICA]` nesta mesma sessão.)
2. **Não regressão em `Parse AI Response`:** confirmar que não foi tocado (schema de saída
   idêntico). `Envia Resposta do Agent` e o nó de log **mudam de propósito** — verificar que
   continuam limpando tags `[...]` e que passam a usar `$json.texto` (não `$json.output`).
3. **Correção do agendamento fantasma (a mais importante):** na primeira conversa real em
   que o paciente confirmar um turno, usar `get_execution` (mesmo comando usado para
   diagnosticar o bug) e conferir que `ai.agent.tool_calls.requested >= 1` nesse turno **e**
   que surgiu uma linha nova em `consultas` com `status = 'solicitado'`. Se a IA disser
   "agendei" sem isso, o prompt não resolveu o problema.
4. **Balões separados funcionando:** confirmar visualmente (WhatsApp ou painel Atendimentos)
   que uma resposta com `|||` chega como mensagens em sequência, na ordem certa, e que cada
   balão gera sua própria linha em `mensagem_logs` (não uma linha só com `|||` literal dentro
   do texto).
5. **Acompanhamento pós-publicação (responsabilidade do usuário, não automatizável por
   aqui):** observar as primeiras conversas reais na aba Atendimentos do CRM depois do
   deploy de amanhã. Qualidade de tom/conversa continua sendo leitura humana do painel — só
   os itens 3 e 4 acima têm verificação objetiva.

---

## 6. Ideias Cogitadas e Adiadas (não fazem parte deste spec)

Registradas aqui para não se perderem, e para o próximo brainstorm não repetir o raciocínio
do zero:

- **Estado explícito de objetivos no JSON de saída** (`tem_nome`, `entendeu_queixa`,
  `convidado_agendar` como campos novos, populados a cada turno). Daria visibilidade no
  banco para automatizar um "lembrete" se a conversa travar num objetivo. Adiado porque
  aumenta escopo de teste às vésperas do deploy de amanhã e o usuário já tinha decidido, antes
  deste brainstorm, manter o foco só na clínica de amanhã.
- **Personalidade do bot como configuração por clínica** (`clinics.rules_config`, hoje um
  jsonb vazio) em vez de texto fixo no nó do n8n. Decisão já tomada (adiada) na sessão
  anterior a este brainstorm — replicar para outros negócios volta à mesa quando um segundo
  negócio realmente entrar.
