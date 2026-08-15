# Especificação de Design: Contraste do tema claro e duração editável da consulta

**Data**: 15 de Agosto de 2026
**Status**: Aprovado pelo usuário (brainstorming em chat, mesma sessão)
**Relação com trabalho anterior**: complementa `docs/superpowers/specs/2026-08-05-ui-tema-claro-e-motion-design.md` — aquele spec cobriu as 5 telas autenticadas, mas dois pontos ficaram de fora (varredura incompleta e um token reaproveitado onde não devia). Este spec fecha essas lacunas e adiciona um recurso novo (duração editável) que estava fora de escopo no spec anterior.

---

## 1. Contexto e motivação

O usuário reportou, com prints da Agenda (visão calendário e card de detalhes) em tema claro:
- "a tela clara ofusca as coisas pretas, não dá para situar os agendamentos, não dá para ver as linhas direito, não tem muito contraste."

Investigação no código (15/08/2026) achou três causas concretas, não uma:

1. **Cores nunca migradas para token**, esquecidas na varredura do spec de 05/08:
   - `cliniflow-components.jsx:190` — texto "Cliniflow" da sidebar em `color:'#efefef'` (quase branco — invisível sobre sidebar clara).
   - `patients-components.jsx` linhas 562-665 — o modal "Nova consulta" inteiro e o `PatientPickRow` (busca de paciente) ainda usam literais pensados para fundo escuro: `#e6e6e6`, `#ccc`, `#888`, `#555`, `#484848`, `#444`, `#aaa`, fundo `#1c1c1c`/borda `#252525`. Nenhum desses usa `var(--supabase-*)`.
   - O plano de 05/08 (Tarefa 4.3) mandava aplicar a regra de tradução em "`PatientsView`/`PatientRow`" a partir da linha ~479, mas `NewAppointmentModal`/`AprovarPedidoModal`/`PatientPickRow` ficaram fora da varredura feita na prática.

2. **Cor semântica de status fraca no fundo claro**: `STATUS_CFG.pending` (`#9ca3af`) e `STATUS_CFG.recusado` (`#6b7280`) são tons médios de cinza. Sobre o card escuro (`#1e1e1e`) o contraste é aceitável; sobre o card claro (`#ffffff`) não é — é exatamente o agendamento "Pendente" que aparece quase invisível no print do usuário. Essas cores são fixas nos dois temas por decisão de design já registrada (spec de 05/08, §3.2, categoria 3 — cor semântica não varia por tema). Este spec não reabre essa decisão; corrige o **valor** do tom onde ele falha.

3. **Token errado reaproveitado nas linhas do calendário**: `--supabase-border` (`#e6e8eb` no tema claro) foi desenhado para ser uma borda sutil de card (`DetailPanel`, `Modal`, divisores de lista). O grid de horas do `CalendarView` (`cliniflow-components.jsx:557,643,650`) usa o mesmo token — mas uma linha de grade é informação (define onde um horário começa), não um divisor decorativo, e precisa de mais contraste do que uma borda de card.

Além disso, o usuário pediu que a duração da consulta passe a ser editável pela recepção — hoje `DetailPanel` mostra `${apt.time} · ${apt.dur} min` como texto estático, sem nenhuma forma de alterar.

**Não-objetivo explícito**: isto não é um novo redesign de identidade nem uma segunda varredura completa de cores fixas — é a correção pontual dos três pontos acima (escopo fechado por grep, não por inspeção visual geral) mais o recurso de duração editável. Redimensionar o evento arrastando a borda no calendário (estilo Google Calendar) foi considerado e **explicitamente adiado** pelo usuário nesta sessão — só o campo no card de detalhes entra agora.

---

## 2. Escopo e não-escopo

**Dentro do escopo:**
- `cliniflow-export/cliniflow-components.jsx`: texto da sidebar (linha 190), `STATUS_CFG.pending`/`STATUS_CFG.recusado` (linhas 40 e 44), token novo `--supabase-border-strong` aplicado às linhas de grade do `CalendarView` (linhas 557, 643, 650), e o `DetailPanel` (linha 976, campo de duração).
- `cliniflow-export/patients-components.jsx`: `NewAppointmentModal` e `PatientPickRow` (linhas 562-665) — tradução das cores fixas listadas na seção 1.
- `cliniflow-export/Cliniflow.html`: novo token `--supabase-border-strong` em `:root`/`:root[data-theme="light"]`; novo callback `onUpdateDuracao` na função `App`, ao lado de `onUpdatePreco`.

**Fora do escopo (não fazer sem novo spec):**
- Redimensionar duração arrastando a borda do evento no calendário (adiado explicitamente pelo usuário nesta sessão — pode virar um spec futuro).
- Nova varredura completa de cores fixas fora dos arquivos/linhas listados acima — se aparecer mais contraste ruim em outro lugar depois deste spec, é achado novo, não coberto aqui.
- Qualquer mudança no cadastro de médicos/profissionais (spec separado, ainda não desenhado).
- Mudar a paleta semântica dos outros status (`confirmado`, `cancelado`, `remarcado`, `solicitado`) — só `pending`/`recusado` têm problema de contraste medido.

---

## 3. Contraste — correções

### 3.1 Cores nunca migradas

Aplicar a mesma regra mecânica já usada no spec de 05/08 (literal hex → token equivalente por papel), nos pontos listados na seção 1.1:

| Local | Literal atual | Token |
|---|---|---|
| `cliniflow-components.jsx:190` (logo sidebar) | `color:'#efefef'` | `var(--supabase-text-light)` |
| `patients-components.jsx:562` (busca vazia) | `color:'#444'` | `var(--supabase-icon-inactive)` |
| `patients-components.jsx:584` (nome paciente selecionado) | `color:'#e6e6e6'` | `var(--supabase-text-light)` |
| `patients-components.jsx:585` (telefone/idade) | `color:'#555'` | `var(--supabase-text-muted)` |
| `patients-components.jsx:588` (botão "Trocar") | `color:'#666'` | `var(--supabase-text-muted)` |
| `patients-components.jsx:637` (label do checkbox WhatsApp) | `color:'#aaa'` | `var(--supabase-text-light)` |
| `patients-components.jsx:657` (avatar `PatientPickRow`) | `background:'#1c1c1c', border:'1px solid #252525'` | `background:'var(--supabase-bg-hover)', border:'1px solid var(--supabase-border)'` |
| `patients-components.jsx:659` (iniciais do avatar) | `color:'#888'` | `var(--supabase-text-muted)` |
| `patients-components.jsx:662` (nome na lista de busca) | `color:'#ccc'` | `var(--supabase-text-light)` |
| `patients-components.jsx:663` (telefone na lista) | `color:'#484848'` | `var(--supabase-text-muted)` |
| `patients-components.jsx:665` (convênio) | `color:'#3a3a3a'` | `var(--supabase-icon-inactive)` |

Isto cobre o modal "Nova consulta" inteiro (incluindo o picker de paciente) e a última cor esquecida da sidebar.

### 3.2 Tom de "Pendente" e "Recusado" no tema claro

`STATUS_CFG` continua com `color` fixo nos dois temas (decisão já tomada, não reaberta), mas os dois tons que falham contraste no fundo claro ganham um valor mais escuro:

```js
pending:   { label:'Pendente',   color:'#6b7280', bg:'rgba(156,163,175,0.14)' },
recusado:  { label:'Recusado',   color:'#4b5563', bg:'rgba(107,114,128,0.14)' },
```

(`#6b7280`/`#4b5563` são os mesmos tons já usados como `--supabase-text-muted`/`--supabase-text-light` do tema claro — não é cor nova no sistema, só reaproveitada aqui. `bg` sobe de `0.10` para `0.14` de opacidade para o card continuar distinguível.) Confirmar visualmente que o tema escuro não piorou — os tons atuais (`#9ca3af`/`#6b7280`) já tinham contraste bom lá, então a checagem é só "não regrediu".

### 3.3 Token novo para linhas de grade do calendário

Em `Cliniflow.html`, adicionar ao `:root`:
```css
--supabase-border-strong: #3d3d3d;
```
E ao `:root[data-theme="light"]`:
```css
--supabase-border-strong: #c8ccd2;
```

Trocar `var(--supabase-border)` por `var(--supabase-border-strong)` nas três linhas de grade do `CalendarView` (`cliniflow-components.jsx:557` — borda das colunas de dia, `:643` — linha de cada hora, `:650` — linha tracejada de meia-hora). Não mexe em nenhuma outra borda do app (cards, modais, listas continuam com `--supabase-border` normal).

### 3.4 Critério de pronto

Igual ao spec de 05/08 (§3.3), reaplicado ao escopo deste spec: nos pontos listados acima, alternando o `TweaksPanel` para tema claro, nenhum texto fica ilegível contra o próprio fundo, o agendamento "Pendente" fica distinguível no card/calendário, e as linhas de hora do calendário são visíveis sem precisar apertar os olhos.

---

## 4. Duração editável no card de detalhes

### 4.1 Interface

Em `DetailPanel` (`cliniflow-components.jsx:976`), a linha hoje estática:
```jsx
<InfoRow label="Horário" value={`${apt.time} · ${apt.dur} min`} />
```
vira duas informações lado a lado: o horário continua como texto (não é objetivo deste spec tornar o horário em si editável — só a duração), e a duração vira um `Select` inline, no mesmo estilo visual do campo de Preço já editável logo abaixo (label fixo + controle compacto à direita). Opções: `15, 20, 30, 45, 60, 90 min` — o mesmo conjunto já usado em `NewAppointmentModal` (`patients-components.jsx:606-609`), para manter os três lugares do app que escolhem duração (`AprovarPedidoModal`, `NewAppointmentModal`, agora `DetailPanel`) com o mesmo vocabulário de opções.

Mudança de valor salva imediatamente (sem botão "salvar" — mesmo padrão de commit-on-change que o resto dos `Select` do app já usa), diferente do campo de Preço que salva no `blur` porque é um `<input type="number">` de digitação livre.

### 4.2 Persistência

Novo callback em `Cliniflow.html`, ao lado de `updateConsulta`/`aprovarPedido` (~linha 269-306):

```js
const updateDuracao = useCallback(async (id, dur) => {
  setAppts(prev => prev.map(a => a.id === id ? { ...a, dur } : a));
  if (dbConnected) {
    await SB.updateConsulta(id, { duracao_min: dur });
  }
}, [dbConnected]);
```

**Por que não reusar `updateConsulta(id, updates)` genérico diretamente:** esse helper faz `{ ...a, ...updates }` no estado local — funciona quando a chave do update já é o nome do campo local (caso de `onUpdatePreco`, onde `preco` é usado dos dois lados). Duração não tem essa sorte: o campo local do agendamento é `apt.dur`, mas a coluna no Supabase é `duracao_min` (ver `aprovarPedido`, que já precisa fazer esse de-para manualmente). Chamar o genérico com `{ duracao_min: dur }` gravaria certo no banco mas deixaria `apt.dur` desatualizado na UI até o próximo fetch — o mesmo padrão de risco que `moveAppt` já evita fazendo sua própria função dedicada em vez de reusar `updateConsulta`. `updateDuracao` segue esse mesmo molde.

Prop nova passada para `DetailPanel`: `onUpdateDuracao={(id, dur) => updateDuracao(id, dur)}`, ao lado de `onUpdatePreco` na renderização do painel (~linha 514).

### 4.3 Efeito colateral esperado (não é bug a corrigir)

Como `CalEvent` já deriva a altura do card no calendário a partir de `apt.dur`, mudar a duração pelo card de detalhes automaticamente redesenha o evento mais alto/baixo na visão calendário, sem nenhum código adicional — é consequência do dado mudar, não um recurso novo a implementar.

### 4.4 Não-objetivo

Arrastar a borda do evento no calendário para redimensionar (ver seção 2 — adiado). Tornar o horário de início editável no mesmo painel (fora do que foi pedido; hoje isso só é feito reagendando/arrastando o evento).

---

## 5. Verificação

Mesma receita do spec de 05/08 (`docs/superpowers/plans/2026-08-05-ui-tema-claro-e-motion.md`, "Receita de verificação") — cópia isolada em modo demonstração, sem tocar `config.js` de produção nem dado real:

1. `node --check` nos dois arquivos `.jsx` tocados.
2. Console do navegador sem erros, nos dois temas.
3. Passagem visual: sidebar (logo), Agenda em modo lista (badge "Pendente"), Agenda em modo calendário (linhas de hora + evento pendente), abrir "Nova consulta" (picker de paciente e formulário), abrir o card de detalhes de um agendamento e trocar a duração — nos dois temas, verificar que o card/calendário refletem a nova duração.
4. Sem captura de screenshot automatizada nesta sessão (mesma limitação já registrada em `AGENTS.md`) — verificação visual manual via ferramentas de navegador/inspeção de código, como no spec anterior.

---

## 6. Arquivos afetados (para o plano de implementação)

| Arquivo | Natureza da mudança |
|---|---|
| `cliniflow-export/Cliniflow.html` | Novo token `--supabase-border-strong` (dois temas); novo callback `updateDuracao`; nova prop `onUpdateDuracao` passada ao `DetailPanel`. |
| `cliniflow-export/cliniflow-components.jsx` | Cor da sidebar (linha 190) → token; `STATUS_CFG.pending`/`recusado` → tons corrigidos; 3 linhas do grid do `CalendarView` → `--supabase-border-strong`; `DetailPanel` ganha `Select` de duração no lugar do texto estático. |
| `cliniflow-export/patients-components.jsx` | `NewAppointmentModal`/`PatientPickRow` (linhas 562-665) — 11 pontos de cor fixa → tokens, listados na tabela §3.1. |

A decomposição em tarefas bite-sized fica para o plano de implementação (`writing-plans`).

---

## 7. Decisões do usuário registradas nesta sessão

- Split em 2 specs: este (contraste + duração) e um segundo, ainda não desenhado, para cadastro de profissionais — porque este é só frontend e o outro exige tabela nova no Supabase (chat, 15/08/2026).
- Este spec entra primeiro (chat, 15/08/2026).
- Duração editável: só campo no card de detalhes agora; arrastar a borda no calendário (estilo Google Calendar) fica para depois (chat, 15/08/2026).
- Correção de contraste aprovada como descrita: migrar cores esquecidas, escurecer só o tom claro de Pendente/Recusado (sem mudar os outros status nem o tema escuro), criar token novo e mais forte só para as linhas do calendário (chat, 15/08/2026).
