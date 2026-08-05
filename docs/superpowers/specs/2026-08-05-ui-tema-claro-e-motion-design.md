# Especificação de Design: Tema claro completo, motion fluido e drag-and-drop da Agenda

**Data**: 05 de Agosto de 2026
**Status**: Aprovado pelo usuário (brainstorming em chat, mesma sessão)
**Escopo temporal**: projeto calmo, sem pressão de deploy (diferente da migração Evolution → Meta, adiada de propósito — ver `docs/DECISIONS.md` D-13)

---

## 1. Visão geral do objetivo

Hoje (05/08/2026) o Cliniflow já tem uma camada global de polimento visual em `Cliniflow.html` (sombras, easing, feedback de hover/focus) e as telas de Login/Onboarding foram refeitas. As 5 telas autenticadas — Agenda (lista/calendário/kanban), Atendimentos, Pacientes, Relatórios, Automações — continuam com o design anterior a essa camada.

Este spec cobre três frentes, escolhidas pelo usuário depois de recusar explicitamente um redesign de identidade:

1. **Tema claro que funciona de verdade** em todas as 5 telas (hoje é decorativo — a maioria das cores é fixa em hexadecimal, pensada só para o fundo escuro).
2. **Motion mais fluido e amigável** nas transições do app (troca de view, abrir/fechar modal, mudança de status).
3. **Drag-and-drop da Agenda (visão calendário) redesenhado** para ter a sensação do Google Calendar: segurar o evento, arrastar livremente seguindo o cursor, ver o destino em destaque, soltar com animação de encaixe.

**Não-objetivo explícito**: isto não é um redesign de identidade visual. Mantém os tokens `--supabase-*`, a cor de destaque configurável (verde/azul/violeta/cyan, ver `ACCENT_MAP` em `Cliniflow.html`), a fonte Inter, o layout e a densidade de informação atuais de cada tela. É reforma de acabamento, não de estrutura.

---

## 2. Escopo e não-escopo

**Dentro do escopo:**
- Todas as 5 telas autenticadas, porque o tema claro é uma configuração global (`TweaksPanel` → `theme: 'dark'|'light'`) — não existe "tema claro só numa tela".
- Os 5 arquivos: `Cliniflow.html`, `cliniflow-export/cliniflow-components.jsx`, `patients-components.jsx`, `reports-components.jsx`, `automation-components.jsx`.
- Novos tokens de cor/sombra onde os `--supabase-*` atuais não bastarem (ex.: cor de hover, que hoje é hex fixo em vários lugares).
- Vocabulário de animação (fade/slide de troca de view, entrada/saída de modal, transição de cor em badges de status) aplicado nos 5 arquivos.
- Reescrita do drag-and-drop de `CalendarView`/`CalEvent` (`cliniflow-components.jsx`) trocando a API nativa HTML5 (`draggable`, `onDragStart`) por um controlador de ponteiro customizado.

**Fora do escopo (não fazer sem novo spec):**
- Novo layout, nova hierarquia de informação, novos componentes.
- Troca dos gráficos SVG feitos à mão em `reports-components.jsx` (KpiCard, BarChart, Donut, RetentionTable, RevenueLine) por uma biblioteca de gráficos — eles só ganham cor consciente de tema, a implementação continua a mesma.
- Arrastar entre visões diferentes (ex. de uma linha da lista para o calendário).
- Redimensionar a duração de um evento arrastando a borda.
- Suporte a touch/mobile — o CRM é desktop-only (já documentado em `AGENTS.md`).
- Qualquer mudança na migração Evolution → Meta (D-13, projeto separado).

---

## 3. Tema claro completo

### 3.1 Diagnóstico

Contagem de cores fixas em hexadecimal (`grep -c '#[0-9a-fA-F]\{3,6\}'`) nos 4 arquivos de componente, em 05/08/2026:

| Arquivo | Ocorrências |
|---|---|
| `cliniflow-components.jsx` | 125 |
| `automation-components.jsx` | 99 |
| `reports-components.jsx` | 59 |
| `patients-components.jsx` | 39 |
| **Total** | **322** |

A maioria são tons de cinza/preto (`#efefef`, `#191919`, `#3a3a3a`, `#1e1e1e`, `#2a2a2a`, etc.) escolhidos a olho para o fundo escuro. No tema claro, aplicados sem tradução, produzem texto claro sobre fundo claro — ilegível. É por isso que o toggle de tema em `TweaksPanel` hoje não é uma opção usável fora do Login/Onboarding.

### 3.2 Método

Para cada cor fixa encontrada, decidir uma de três categorias:

1. **Já existe token equivalente** (`--supabase-text`, `--supabase-text-light`, `--supabase-text-muted`, `--supabase-bg-main`, `--supabase-bg-studio`, `--supabase-bg-card`, `--supabase-border`) → substituir pela var.
2. **Não existe token, mas se repete em vários lugares com o mesmo papel** (ex.: cor de hover de item de lista, hoje hardcoded como `#181818`/`#161616` em pontos diferentes) → criar um novo token em `:root`/`:root[data-theme="light"]` no `Cliniflow.html` (ex.: `--supabase-bg-hover`) e usá-lo.
3. **Cor semântica de status** (verde=confirmado, vermelho=cancelado/erro, laranja=pendente, cores do `ACCENT_MAP`) → **fica fixa nos dois temas** (não precisa variar por tema), mas a implementação confere contraste mínimo contra `--supabase-bg-card`/`--supabase-bg-main` de cada tema — se um tom não passar, ajustar só esse tom, não trocar a paleta semântica inteira.

### 3.3 Critério de pronto

Uma tela está com tema claro pronto quando, alternando o toggle do `TweaksPanel` em modo demonstração:
- Nenhum texto fica com contraste insuficiente contra o próprio fundo (checagem visual guiada por `getComputedStyle` nos elementos de texto de cada componente, já que não há screenshot disponível nesta sessão de trabalho — ver seção 6).
- Bordas, divisores e estados de hover continuam visíveis (não somem por herdar um cinza escuro fixo).
- Os SVGs desenhados à mão (ícones da sidebar, gráficos de relatório) não usam `fill="#000"`/`fill="#fff"` fixos onde deveriam seguir o tema.

---

## 4. Motion mais fluido

### 4.1 Estado atual

`Cliniflow.html` já define `@keyframes fadeIn` e `slideUp`, usadas hoje só no `#root` (fade de montagem) e nos cartões de Login/Onboarding. Fora disso, motion é pontual: hover da sidebar (`transition:'all .12s'`), badges e linhas de agendamento (`transition:'all .1s'` / `.12s`), sem padrão consistente entre arquivos.

### 4.2 Vocabulário proposto

Reaproveitar os tokens já criados hoje (`--ease-premium`, `--shadow-sm/md/lg`, `--shadow-brand`) e as keyframes existentes (`fadeIn`, `slideUp`) nos seguintes pontos, em todos os 5 arquivos:

- **Troca de view** (Agenda lista ↔ calendário ↔ kanban; abas de `AutomationView`; abas/seções de `ReportsView`): o conteúdo novo entra com `fadeIn` ou `slideUp` curto (200–300ms), não substitui instantaneamente.
- **Abrir/fechar modal** (`Modal` em `patients-components.jsx`, usado por `AddPatientModal`, `EditPatientModal`, `NewAppointmentModal`): overlay com fade, card com `slideUp` ou leve `scale` na entrada; saída é o inverso, não some abruptamente.
- **Mudança de status** (badge de agendamento, linha da lista quando confirmada/cancelada): transição de `background-color`/`color` suave (`transition` na propriedade, não troca seca) em vez do estado atual que já é abrupto em vários pontos.

### 4.3 Não-objetivo

Não muda densidade de informação, não adiciona som, não adiciona gestos além do drag do calendário (seção 5).

---

## 5. Drag-and-drop da Agenda (estilo Google Calendar)

### 5.1 Estado atual

`CalendarView`/`CalEvent` (`cliniflow-components.jsx:363` e `:643`) já implementam mover um evento entre dias/horários usando a API nativa HTML5: atributo `draggable`, `onDragStart`/`onDragEnd`, callback `onMove(id, dia, novoHorário)` que, no fim, grava a mudança. Essa API tem limitações estruturais que impedem a sensação pedida:
- O navegador desenha um "fantasma" padrão do elemento, não controlável com precisão.
- O elemento não segue o cursor livremente — o comportamento varia entre Chrome/Firefox e é notoriamente ruim em trackpad.
- Não dá para animar a posição em tempo real durante o arraste (só eventos de início/fim).

### 5.2 Abordagem escolhida

Substituir a API nativa por um controlador de ponteiro (`onPointerDown` no `CalEvent`, `onPointerMove`/`onPointerUp` capturados a nível de documento ou do container do `CalendarView` enquanto o arraste estiver ativo):

1. **`onPointerDown` no evento**: registra a posição inicial do ponteiro e do evento, ativa estado `draggingId`. Não move nada ainda (evita iniciar arraste num simples clique — usar um limiar de ~4px de movimento antes de considerar "arrastando", igual ao comportamento do Google Calendar).
2. **Durante o arraste** (`pointermove`): o card do evento passa a ser posicionado livremente (`position: fixed` ou `transform: translate`) seguindo o cursor, com leve escala (`scale(1.02)`) e `box-shadow: var(--shadow-lg)` para dar sensação de "levantado". Em paralelo, calcula qual dia/slot de horário está sob o cursor e aplica destaque visual nesse slot (reaproveita o `hoverSlot` que já existe hoje na implementação nativa).
3. **`pointerup`**: se soltou sobre um slot válido, anima (via CSS transition, não salto) o card até a posição final do slot e só então chama `onMove(id, dia, novoHorário)` — a mesma assinatura que já existe, então não muda nada do lado de quem consome (gravação no Supabase). Se soltou fora da grade, anima de volta à posição original e não chama `onMove`.
4. **Tecla `Escape`** durante o arraste cancela e anima de volta à posição original, sem chamar `onMove`.

### 5.3 Interface preservada

`CalendarView` continua recebendo `onMove` com a mesma assinatura (`(id, day, novoHorárioEmMinutos) => void`) — quem chama `CalendarView` (o componente `App` em `Cliniflow.html`) não muda nada. A reescrita fica contida em `CalendarView` e `CalEvent`, dentro de `cliniflow-components.jsx`.

### 5.4 Não-objetivo

Arrastar entre visões diferentes, redimensionar duração pela borda, suporte a touch — ver seção 2.

---

## 6. Verificação

O projeto não tem framework de teste automatizado (React 18 via CDN + Babel standalone, sem build step — ver `AGENTS.md` "Como rodar"). Verificação é manual, seguindo o que já foi validado nesta sessão:

1. **`node --check` em cada `.jsx` tocado** — garante que a sintaxe transpila (mesma prática que `AGENTS.md` já lista como verificada para os 5 arquivos).
2. **Modo demonstração** (sem `config.js` apontando para o Supabase real — dados fake) para abrir cada tela nos dois temas e testar o drag do calendário, sem qualquer risco de tocar dado real de paciente ou disparar mensagem de WhatsApp real.
3. **Sem captura de screenshot** nesta sessão de trabalho (limitação já registrada em `AGENTS.md` 05/08/2026) — a verificação visual é por leitura de `getComputedStyle`/árvore de acessibilidade via as ferramentas de navegador, mais inspeção de código. Se uma sessão futura tiver screenshot disponível, vale complementar com evidência visual real antes de marcar qualquer item como ✅ concluído (regra de honestidade do `AGENTS.md`).
4. **Console do navegador sem erros** em cada tela testada, nos dois temas.

Nenhum passo deste projeto deve tocar `cliniflow-export/config.js` de produção nem dado real de paciente — todo teste usa o modo demonstração (config vazio) em cópia isolada, como já foi feito na sessão de hoje.

---

## 7. Arquivos afetados (para o plano de implementação)

| Arquivo | Natureza da mudança |
|---|---|
| `cliniflow-export/Cliniflow.html` | Novos tokens de cor/hover para o tema claro; nenhuma mudança estrutural nova além da já commitada hoje. |
| `cliniflow-export/cliniflow-components.jsx` | Maior volume: tradução de cores fixas → tokens (Sidebar, ListView, CalendarView, KanbanView, DetailPanel, AtendimentosView) + reescrita do drag-and-drop (seção 5) + motion nas trocas de view. |
| `cliniflow-export/patients-components.jsx` | Tradução de cores fixas → tokens; motion no `Modal` compartilhado (afeta os 3 modais que o usam). |
| `cliniflow-export/reports-components.jsx` | Tradução de cores fixas → tokens, incluindo cores usadas dentro dos SVGs desenhados à mão. |
| `cliniflow-export/automation-components.jsx` | Tradução de cores fixas → tokens; motion na troca de abas. |

A decomposição em tarefas bite-sized (uma por arquivo/preocupação, com passo de teste manual entre cada uma) fica para o plano de implementação (`writing-plans`).

---

## 8. Decisões do usuário registradas nesta sessão

- Recusa explícita de nova identidade visual — manter tokens/marca atuais (chat, 05/08/2026).
- Prioridade: tema claro utilizável + motion fluido + drag-and-drop estilo Google Calendar (chat, 05/08/2026).
- Abordagem de drag escolhida: reescrever com ponteiro customizado, não apenas refinar a API nativa (chat, 05/08/2026), aceitando o custo maior de código pelo ganho de fidelidade à referência do Google Calendar.
- Sem pressão de deploy — este projeto roda em paralelo, sem afetar o lançamento de amanhã (06/08) nas clínicas da irmã e da tia do usuário, que sobe só com o que já foi commitado (Evolution API + polimento global de hoje).
