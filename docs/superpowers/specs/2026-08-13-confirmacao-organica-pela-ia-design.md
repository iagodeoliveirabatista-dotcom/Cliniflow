# Especificação de Design: Confirmação de Consulta pela IA (fim do roteiro modal)

**Data**: 13 de Agosto de 2026
**Status**: Proposto — decisão do dono registrada (seção 2), questões abertas na seção 7
**Autor**: Claude Code (a partir do diagnóstico das execuções 83417/83421/83425)

---

## 1. Visão Geral do Objetivo

Hoje o Cliniflow tem **dois atendentes diferentes** conversando com o mesmo paciente no mesmo
número, e quem manda é o relógio: se existe uma consulta aguardando confirmação, o paciente
fala com um roteiro de regex que só entende três palavras; se não existe, fala com a IA.

Este spec propõe eliminar esse desvio. A confirmação de consulta passa a ser **mais uma coisa
que a assistente sabe fazer**, não um modo separado do sistema.

O objetivo declarado pelo dono: *"deixar o mais fluido possível a marcação, com o agente sendo
o mais claro possível e atendendo de forma orgânica."*

**Escopo:** roteamento do workflow `ZAQ6I2CiBGh8swye`, prompt do `AI Agent`, e duas tools
novas de confirmação/cancelamento.

**Fora de escopo:** o CRM, a Edge Function de lembretes, e os dois bugs de texto achados no
mesmo teste (data/hora divergente entre a mensagem e `consultas.data_hora`; `medico` null
renderizando "com ." no template). São de outra camada e seguem em aberto separadamente.

---

## 2. Decisão já tomada

| Questão | Decisão (13/08/2026) |
|---|---|
| Consertar o roteiro atual ou substituí-lo pela IA? | **Os dois, em ordem: "A agora, B como alvo".** A = correções cirúrgicas no roteiro, já aplicadas e publicadas (`activeVersion` `6945f2a8`). B = este spec. |
| Por que não ir direto pro B? | Porque havia paciente real recebendo uma mensagem falsa hoje. A parou o sangramento; B resolve o desenho. |

---

## 3. O problema, com a evidência

Teste real do dono em 14/08/2026 (UTC), execuções `83417`, `83421`, `83425` — todas
`status: success`, **todas sem resposta útil ao paciente**:

| Hora | Mensagem | O que aconteceu |
|---|---|---|
| 02:32:59 | *(lembrete disparado)* | Criou linha em `sessoes_ativas`, `expira_em` 18:32 — **16h de bloqueio** |
| 02:33:49 | "Oi" | `AI Agent` nunca rodou |
| 02:35:43 | "Certo" | idem |
| 02:36:14 | "Ok" | idem |

### 3.1. O desvio modal

`Status da sessão?` (switch, 3 saídas) só encaminha para o `AI Agent` na saída **2**, quando
`sessao_status == 'NAO_ENCONTRADA'`. Existindo sessão válida, tudo cai no roteiro.

Consequência prática: **por 16h depois de cada lembrete, o paciente não consegue falar com o
bot sobre nada.** Nem preço, nem dúvida do procedimento, nem marcar outra coisa.

### 3.2. E o roteiro estava morto (corrigido em A)

- `Consulta Encontrada?` testava `{{ $json.length > 0 }}` com `$json` sendo a **linha**, não um
  array → `undefined > 0` → sempre falso. Nunca ninguém confirmou nada por WhatsApp.
- `Busca Consulta` filtrava `patient_id + status='pendente'`, `limit 1`, **sem ordenação** →
  pegava a consulta errada.
- `ENCAMINHAR MENSAGEM` dizia *"encaminhei sua mensagem para a nossa equipe humana"* e mandava
  para o **próprio paciente**, sem notificar ninguém.

Tudo isso foi corrigido em A. Mas A não muda o desenho.

### 3.3. Achados que sobrevivem ao A e que B precisa resolver

**(a) "ok" e "certo" são classificados como saudação e descartados.** Em `Valida contexto`, a
regra **10 (SAUDAÇÕES)** casa `^(oi|olá|...|legal|certo|ok|tá bom)$` e vem **antes** da regra
**12 (CONFIRMAÇÃO FRACA)**, que lista `sim|vou|beleza|pode ser|ok|tá bom|certo|combinado`.
A regra 10 ganha. As duas respostas mais naturais a um lembrete — "ok" e "certo" — não
confirmam nada. Foi exatamente o que o dono digitou no teste.

**(b) Mensagens que o sistema escreve e joga fora.** `Análise de evento - Claude` monta três
`mensagem_para_usuario` distintas (*"já foi confirmada anteriormente"*, *"já foi cancelada"*,
*"não encontrei consulta com seu telefone"*) e `Valida contexto` monta três
`mensagem_para_paciente`. **Nenhum nó consome esses campos.** Mesmo com o Switch funcionando,
nada disso chega ao paciente.

**(c) Duas taxonomias de intenção concorrentes.** `Valida contexto` classifica em
`CONFIRMADO/CANCELADO/REMARCAR/PERGUNTA/SAUDACAO/MIDIA_SEM_TEXTO/INVALIDO/DESCONHECIDO`; o
prompt do `AI Agent` classifica em `saudacao/duvida_servicos/.../quer_agendar/objecao/urgencia`.
São dois vocabulários para o mesmo problema, mantidos em lugares diferentes.

---

## 4. Arquitetura alvo

**Princípio:** `sessoes_ativas` deixa de **desviar** o fluxo e passa a ser **contexto**.

```
hoje:   inbound → Status da sessão? ─┬─ sessão viva → roteiro regex (modal, 16h)
                                     └─ sem sessão  → AI Agent

alvo:   inbound → Status da sessão? ─┬─ expirada    → Cleanup de Sessão
                                     └─ resto       → AI Agent
                                                        ↑
                                        contexto: "consulta pendente X em D/H"
                                        tools:    confirmar / cancelar
```

### 4.1. Contexto injetado

Um bloco montado a partir de `Get a row` (`sessoes_ativas`) + `Busca Consulta`, entregue ao
`AI Agent` junto da mensagem. Quando não há consulta pendente, o bloco vem vazio e a seção
correspondente do prompt fica inerte.

```
[CONSULTA AGUARDANDO CONFIRMAÇÃO]
consulta_id: d708ca7f-...
procedimento: Botox facial
quando: 14/08/2026 (quinta) às 09:30
medico: (não definido)
status: pendente
```

### 4.2. Tools novas

Mesmo padrão já provado do `criar_pre_agendamento`: `@n8n/n8n-nodes-langchain.toolHttpRequest`
com `$fromAI()` nos campos, chamando RPC do Supabase. **Não** Custom Code Tool — ver
`ARMADILHAS.md` §30.

| Tool | Argumentos | Efeito |
|---|---|---|
| `confirmar_consulta` | `consulta_id` | `consultas.status = 'confirmado'` |
| `cancelar_consulta` | `consulta_id`, `motivo` | `consultas.status = 'cancelado'` |

`consulta_id` vem do contexto, não da IA inventando — o prompt deve mandar copiar o valor
literal do bloco.

### 4.3. Seção nova no prompt

`[CONFIRMAÇÃO DE CONSULTA]`, ativa só quando o bloco de contexto existe. Precisa cobrir:

- Aceitar as formas reais de confirmar ("pode ser", "confirmo", "tô indo", "beleza", "👍") e
  de recusar ("não vou conseguir", "surgiu um imprevisto", "fica difícil").
- **Nunca cancelar sem confirmação explícita.** Antes de chamar `cancelar_consulta`, repetir
  o que vai ser cancelado e esperar o "sim" ("posso cancelar sua consulta de quinta às 09:30?").
- Se o paciente falar de outra coisa (preço, dúvida, outro procedimento), **responder
  normalmente** e retomar a confirmação num momento natural — nunca travar a conversa.
- Continuar valendo o `[RITMO E LEGIBILIDADE DA MENSAGEM]` já publicado.

### 4.4. Nós que saem do caminho principal

`Valida contexto`, `Análise de evento - Claude`, `Switch`, `Confirma evento - GREEN`,
`Cancela evento - RED`, `Update an event`, `REGISTRO OUTLIER1`, `MSG - NAO ENTENDI`,
`ENCAMINHAR MENSAGEM`, `MSG EDUCADA`.

⚠️ **Não apagar na primeira entrega.** Desconectar e deixar no canvas até B rodar em conversa
real. `MSG EDUCADA` (áudio) provavelmente precisa continuar viva em outro ponto — a IA não
escuta áudio.

---

## 5. O que se ganha

- "ok", "certo", "pode ser", "não vou conseguir, dá pra outro dia?" passam a funcionar.
- Some o bloqueio de 16h: o paciente pode perguntar qualquer coisa durante a janela.
- Uma voz só. Hoje o paciente fala com dois sistemas diferentes dependendo da hora do dia.
- Some a duplicação de taxonomia (achado 3.3c) e o problema das mensagens órfãs (3.3b), porque
  quem escreve a resposta passa a ser sempre quem decidiu a ação.

## 6. O que se perde, e como mitigar

| Risco | Mitigação |
|---|---|
| **Perda de determinismo.** Hoje "CANCELAR" cancela por regex; com IA depende de classificação. | Dupla confirmação obrigatória antes de `cancelar_consulta` (4.3). Cancelar é o único caminho destrutivo. |
| **Custo e latência.** O roteiro regex é grátis e instantâneo; toda mensagem passar pelo LLM não é. | Aceitável no volume atual (dezenas de mensagens/dia). Reavaliar se escalar. |
| **Dependência do Gemini para operação de negócio.** | Fallback de modelo (`needsFallback` + `Gemini Fallback`) já publicado em 13/08. Falta o `retryOnFail` na UI. |
| **Regressão silenciosa:** confirmar/cancelar param de funcionar sem ninguém perceber. | Verificação da seção 8 é obrigatória antes de considerar B pronto. |

## 7. Questões abertas (decisão do dono, antes de implementar)

1. **REMARCAR.** Hoje vai pra `Update an event` + `AVISO SECRETÁRIA`. Em B, quando o paciente
   pede outro dia, a IA deve: (a) cancelar a atual e criar pré-agendamento novo com a
   preferência dele, (b) só registrar e avisar a recepção, ou (c) negociar horário direto com
   o paciente? **(c) exige a IA conhecer a agenda — hoje ela não conhece.**
2. **Cancelamento por IA precisa de dupla confirmação?** Proposto sim (4.3). Custa uma troca
   de mensagem a mais em todo cancelamento.
3. **A janela de `sessoes_ativas` continua fazendo sentido?** Se ela não desvia mais nada, ela
   vira só o TTL do contexto injetado. 16h é o número certo pra isso?
4. **`historico_confirmacoes` continua sendo alimentado?** Hoje quem escreve é `REGISTRO
   OUTLIER1`, que sai do caminho. Se a tabela ainda importa, alguém precisa assumir a escrita.

## 8. Como verificar (obrigatório antes de dar B como pronto)

Conversa real, com um lembrete disparado de verdade antes:

1. Paciente responde **"ok"** → `consultas.status` vira `confirmado` **e** ele recebe uma
   resposta que reconhece a confirmação. (Hoje: nada acontece.)
2. Paciente responde **"não vou conseguir"** → a IA **pergunta antes de cancelar**, e só
   cancela depois do "sim".
3. Paciente pergunta **"quanto custa mesmo?"** com a consulta pendente → recebe resposta sobre
   preço, e a confirmação é retomada depois. (Hoje: 16h de bloqueio.)
4. `mensagem_logs` tem a saída correspondente em todos os três casos — nada de mensagem
   invisível pro CRM, que foi o defeito do `ENCAMINHAR MENSAGEM`.

⚠️ Conferir sempre na `activeVersion`, não no rascunho (`ARMADILHAS.md` §5d).
