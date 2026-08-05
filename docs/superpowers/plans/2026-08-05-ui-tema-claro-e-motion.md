# Tema Claro, Motion Fluido e Drag-and-Drop da Agenda — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tornar o tema claro do Cliniflow (CRM) genuinamente utilizável nas 5 telas autenticadas, dar mais fluidez às transições do app, e reescrever o drag-and-drop da Agenda (visão calendário) para ter a sensação do Google Calendar.

**Architecture:** React 18 (UMD) + Babel standalone via CDN, sem build step, tudo em `style` inline lendo `var(--supabase-*)` de um `:root`/`:root[data-theme="light"]` central em `Cliniflow.html`. Nenhuma dependência nova é introduzida.

**Tech Stack:** React 18.3.1 (CDN), Babel standalone 7.29 (transpila `.jsx` no navegador), CSS custom properties, Pointer Events API (nativa do navegador, sem lib).

## Global Constraints

- Sem build step: os 5 arquivos (`Cliniflow.html`, `cliniflow-components.jsx`, `patients-components.jsx`, `reports-components.jsx`, `automation-components.jsx`) continuam sendo servidos como estão, via `<script type="text/babel" src="...">`.
- Sem framework de teste automatizado. Verificação é manual — ver "Receita de verificação" abaixo, usada por toda tarefa.
- **Nunca** editar `cliniflow-export/config.js` de produção nem abrir o app contra o Supabase real durante este trabalho. Todo teste usa uma cópia isolada com config vazio (modo demonstração).
- Não é redesign de identidade: mantém `--supabase-brand`, `ACCENT_MAP` (verde/azul/violeta/cyan), fonte Inter, layout e densidade atuais de cada tela.
- Assinaturas de função/prop existentes não mudam a menos que a tarefa diga o contrário. Em particular, `onMove(id, day, minutosDoNovoHorário)` (consumida hoje por `CalendarView`) continua com a mesma assinatura depois da Tarefa 3.
- **Armadilha a respeitar em toda tarefa de cor:** várias cores em `cliniflow-components.jsx` são consumidas via concatenação de string tipo `` `${cor}18` `` (hex + sufixo de alfa — ex.: `Avatar`, `GhostBtn`, `SidebarItem`, `CalEvent`, `KanbanView`). Isso só funciona se `cor` for uma string hex literal de 6 dígitos. **Nunca troque uma dessas variáveis por `var(--algo)` ou `rgba(...)`** — a string concatenada vira CSS inválido e o elemento perde fundo/borda em silêncio (sem erro no console). Antes de tocar em qualquer cor, rode `grep -n '\${nomeDaVariavel}' arquivo.jsx` para confirmar se ela é usada com esse padrão. Se for, ela é semântica/fixa por design (categoria 3 do spec) — não precisa mudar por tema.

## Receita de verificação (usada em toda tarefa)

Cópia isolada para testar em modo demonstração, sem tocar nos arquivos reais nem no `config.js` de produção:

```bash
SCRATCH=/tmp/cliniflow-demo-check   # troque por um diretório local seu, fora do repo
mkdir -p "$SCRATCH"
cp cliniflow-export/Cliniflow.html cliniflow-export/*.jsx cliniflow-export/supabase.js "$SCRATCH/"
echo "window.CLINIFLOW_CONFIG = { supabaseUrl: '', supabaseAnonKey: '', n8nBaseUrl: '', n8nWebhookToken: '' };" > "$SCRATCH/config.js"
cd "$SCRATCH" && python -m http.server 3009
```

Abra `http://localhost:3009/Cliniflow.html`. O app sobe em "Modo demonstração" com dados fake (`APPOINTMENTS`/`PATIENTS`) — nenhum dado real de paciente, nenhuma mensagem de WhatsApp é enviada. O `TweaksPanel` (ícone de engrenagem/configurações) tem o toggle `theme: dark/light` — use-o para conferir os dois temas.

Cada tarefa abaixo termina com:
1. `node --check <arquivo.jsx>` (garante que a sintaxe transpila).
2. Recarregar a cópia de teste, abrir o console do navegador e confirmar **zero erros**.
3. Alternar `dark`/`light` no `TweaksPanel` e revisar visualmente a tela afetada nos dois temas.

---

## Task 1: Novos tokens de tema em `Cliniflow.html`

**Files:**
- Modify: `cliniflow-export/Cliniflow.html:24-88` (bloco `<style>`, dentro de `:root` e `:root[data-theme="light"]`, já editados na sessão de hoje com `--shadow-*`/`--ease-premium`)

**Interfaces:**
- Produces: três novos custom properties — `--supabase-bg-hover`, `--supabase-bg-input`, `--supabase-icon-inactive` — consumidos pelas Tarefas 2, 4, 5 e 6.

Hoje cada arquivo de componente usa hexadecimais fixos e inconsistentes (`#181818`, `#161616`, `#1c1c1c`, `#1a1a1a`...) para três papéis que se repetem em todas as telas: fundo de hover de linha/item, fundo de campo de formulário (mais recuado que o card), e ícone/texto "inativo" bem apagado. Esta tarefa cria UM token por papel, com valor correto nos dois temas, para as tarefas seguintes usarem em vez de inventar hex novos.

- [ ] **Step 1: Adicionar os três tokens no `:root` (tema escuro)**

Em `Cliniflow.html`, dentro do bloco `:root { ... }` que já tem `--shadow-brand: ...;` como última linha (adicionada na sessão de hoje), adicionar logo depois:

```css
      --supabase-bg-hover: #1c1c1c;
      --supabase-bg-input: #161616;
      --supabase-icon-inactive: #3a3a3a;
```

- [ ] **Step 2: Adicionar os equivalentes claros em `:root[data-theme="light"]`**

No bloco `:root[data-theme="light"] { ... }`, logo depois da última linha (`--shadow-brand: ...;` do tema claro), adicionar:

```css
      --supabase-bg-hover: #f1f3f5;
      --supabase-bg-input: #f8f9fa;
      --supabase-icon-inactive: #cbd5e1;
```

- [ ] **Step 3: Verificar que os tokens resolvem nos dois temas**

Suba a cópia de teste (receita acima) e rode no console do navegador:

```js
document.documentElement.setAttribute('data-theme','light');
getComputedStyle(document.documentElement).getPropertyValue('--supabase-bg-hover'); // "#f1f3f5"
document.documentElement.removeAttribute('data-theme');
getComputedStyle(document.documentElement).getPropertyValue('--supabase-bg-hover'); // "#1c1c1c"
```

Expected: os dois valores batem com o que foi escrito acima, sem erro no console.

- [ ] **Step 4: `node --check` e commit**

```bash
node --check cliniflow-export/Cliniflow.html 2>&1 | head -5
```
(Esse comando vai reclamar de sintaxe HTML — `node --check` só entende JS puro. Em vez disso, para `Cliniflow.html`, a verificação de sintaxe é o próprio carregamento no navegador: se o Babel falhar ao transpilar o `<script type="text/babel">`, o console mostra o erro. O passo 3 acima já cobre isso.)

```bash
git add cliniflow-export/Cliniflow.html
git commit -m "Adiciona tokens de tema para hover/input/icone-inativo"
```

---

## Task 2: `cliniflow-components.jsx` — cores tema-aware (sem mexer no drag)

**Files:**
- Modify: `cliniflow-export/cliniflow-components.jsx` (funções `getStatusStyle`, `Sidebar`, `SidebarItem`, `ProfileFooter`, `ListView`, `AppRow`, `KanbanView`, `DetailPanel`, `AtendimentosView` — **não** mexe em `CalendarView`/`CalEvent`, que é a Tarefa 3)

**Interfaces:**
- Consumes: `--supabase-bg-hover`, `--supabase-bg-input`, `--supabase-icon-inactive` (Tarefa 1).
- Produces: nenhuma interface nova — `getStatusStyle(status)` continua devolvendo `{ bg, border, text }` com o mesmo formato de string que já devolvia (literais hex/rgba, não `var()` — ver armadilha nas Global Constraints).

### 2.1 — Corrigir `getStatusStyle()` (hoje só funciona no tema claro)

A função (linhas 46-62) devolve pares Tailwind "100/800" (ex.: `bg:'#d1fae5'`, `text:'#065f46'`) pensados para fundo claro. No tema escuro, o texto `#065f46` (verde bem escuro) fica quase ilegível sobre o card escuro. Só `text` importa aqui porque **é consumido com o padrão de concatenação de alfa** (`Avatar` recebe `color={isSolicitado ? st.text : s.color}` e faz `` `${color}18` ``) — por isso a correção troca os PARES por um tom médio + alfa, no mesmo estilo que `STATUS_CFG` já usa com sucesso, em vez de virar `var()`.

- [ ] **Step 1: Substituir o corpo de `getStatusStyle`**

Encontre (linhas 46-62):

```js
const getStatusStyle = (status) => {
  const normalized = {
    confirmed: 'confirmado',
    pending: 'pendente',
    canceled: 'cancelado',
    rescheduled: 'remarcado',
    solicitado: 'solicitado'
  }[status] || status;

  switch (normalized) {
    case 'confirmado': return { bg: '#d1fae5', border: 'solid 1px #10b981', text: '#065f46' };
    case 'cancelado': return { bg: '#fee2e2', border: 'solid 1px #ef4444', text: '#991b1b' };
    case 'remarcado': return { bg: '#fef3c7', border: 'solid 1px #f59e0b', text: '#92400e' };
    case 'solicitado': return { bg: '#f3e8ff', border: 'dashed 2px #a855f7', text: '#6b21a8' }; // Roxo pontilhado
    default: return { bg: '#f3f4f6', border: 'solid 1px #9ca3af', text: '#374151' }; // Pendente
  }
};
```

Substitua por:

```js
const getStatusStyle = (status) => {
  const normalized = {
    confirmed: 'confirmado',
    pending: 'pendente',
    canceled: 'cancelado',
    rescheduled: 'remarcado',
    solicitado: 'solicitado'
  }[status] || status;

  // Um tom médio + alfa, no mesmo estilo do STATUS_CFG — funciona em fundo
  // claro e escuro sem precisar de token por tema (ver Global Constraints
  // sobre o padrão `${cor}NN` usado por Avatar/KanbanView downstream).
  const TONS = {
    confirmado: '#10b981',
    cancelado:  '#ef4444',
    remarcado:  '#f59e0b',
    solicitado: '#a855f7',
    pendente:   '#9ca3af',
  };
  const c = TONS[normalized] || TONS.pendente;
  const isDashed = normalized === 'solicitado';
  return {
    bg: `${c}1f`,
    border: `${isDashed ? 'dashed 2px' : 'solid 1px'} ${c}`,
    text: c,
  };
};
```

- [ ] **Step 2: Verificar visualmente**

Suba a cópia de teste, vá na Agenda em modo lista, selecione um agendamento "Solicitado" (roxo) e um "Pendente" (cinza) nos dois temas. Espera-se: texto e borda legíveis nos dois fundos, sem mais o par pastel/escuro do Tailwind.

### 2.2 — Sidebar, SidebarItem, ProfileFooter

- [ ] **Step 1: `SidebarItem` (linha ~219) — ícone/texto inativo**

Encontre:
```js
        background: active ? `${accent}14` : hov ? 'var(--supabase-bg-card)' : 'transparent',
        color: active ? accent : hov ? '#888' : '#4a4a4a',
```
e, mais abaixo:
```js
      <svg width="15" height="15" viewBox="0 0 24 24" fill={active ? accent : hov ? '#666' : '#3a3a3a'} style={{flexShrink:0}}>
```

Substitua os literais de estado "inativo"/"hover neutro" pelos tokens (mantendo `accent` como está — é cor semântica, não muda por tema):
```js
        background: active ? `${accent}14` : hov ? 'var(--supabase-bg-hover)' : 'transparent',
        color: active ? accent : hov ? 'var(--supabase-text-muted)' : 'var(--supabase-icon-inactive)',
```
```js
      <svg width="15" height="15" viewBox="0 0 24 24" fill={active ? accent : hov ? 'var(--supabase-text-muted)' : 'var(--supabase-icon-inactive)'} style={{flexShrink:0}}>
```

- [ ] **Step 2: `ProfileFooter` (linha ~184) — avatar de iniciais e borda**

Encontre:
```js
      <div style={{
        width:26, height:26, borderRadius:'50%', flexShrink:0,
        background:'#1e1e1e', border:'1px solid #2a2a2a',
        display:'flex', alignItems:'center', justifyContent:'center',
        fontSize:10, fontWeight:600, color:'#666',
      }}>{iniciais}</div>
```
Substitua por:
```js
      <div style={{
        width:26, height:26, borderRadius:'50%', flexShrink:0,
        background:'var(--supabase-bg-card)', border:'1px solid var(--supabase-border)',
        display:'flex', alignItems:'center', justifyContent:'center',
        fontSize:10, fontWeight:600, color:'var(--supabase-text-muted)',
      }}>{iniciais}</div>
```
E o e-mail/botão "Sair" logo abaixo — troque `color:'#bbb'` (texto do e-mail) por `'var(--supabase-text-light)'`, e no botão "Sair" troque `color: hov ? '#888' : '#3d3d3d'` por `color: hov ? 'var(--supabase-text-muted)' : 'var(--supabase-icon-inactive)'`.

- [ ] **Step 3: Verificar**

Recarregue a cópia de teste nos dois temas — sidebar, item ativo/hover, e o rodapé de perfil devem ter contraste correto em ambos.

### 2.3 — ListView / AppRow (linhas ~248-335)

- [ ] **Step 1: Trocar fundos e textos fixos por tokens**

`AppRow` usa `background: isSelected ? 'var(--supabase-bg-card)' : hov ? 'var(--supabase-bg-main)' : 'transparent'` — isso já está correto (usa tokens). O que precisa de correção é o texto do horário:
```js
      <div style={{ width:46, fontSize:12, fontWeight:500, color:'#555', flexShrink:0 }}>{apt.time}</div>
```
Substitua `color:'#555'` por `color:'var(--supabase-text-muted)'`.

Repita o mesmo raciocínio para qualquer outro `color:'#555'`/`'#666'`/`'#888'`/`'#9ca3af'`/`'#aaa'`/`'#ccc'` que aparecer no restante de `AppRow` (texto secundário, ex.: nome do médico, duração) — todos mapeiam para `var(--supabase-text-muted)`. Rode:

```bash
grep -n "color:'#" cliniflow-export/cliniflow-components.jsx | sed -n '1,60p'
```

para listar as ocorrências restantes nesta faixa de linhas (248-335) e aplicar a mesma troca. **Pule qualquer cor usada dentro de um `` `${...}` `` (ver Global Constraints)** — essas ficam como estão.

- [ ] **Step 2: Verificar**

Cópia de teste, Agenda em modo lista, nos dois temas: horário, nome do médico e duração devem ficar legíveis (não sumir) no tema claro.

### 2.4 — KanbanView e DetailPanel

- [ ] **Step 1: Aplicar a mesma regra de tradução**

Para `KanbanView` (linha ~723) e `DetailPanel` (linha ~791), repita o método: rode `grep -n "'#" ` restrito ao intervalo de linhas de cada função (use `sed -n '723,790p' cliniflow-export/cliniflow-components.jsx` para isolar o texto de `KanbanView` antes de decidir), classifique cada cor fixa:
  - Fundo de coluna/cartão/hover → `var(--supabase-bg-card)` ou `var(--supabase-bg-hover)`.
  - Borda/divisor → `var(--supabase-border)`.
  - Texto principal → `var(--supabase-text)` ou `var(--supabase-text-light)`.
  - Texto secundário/ícone apagado → `var(--supabase-text-muted)` ou `var(--supabase-icon-inactive)`.
  - Qualquer cor usada dentro de `` `${var}NN` `` → **não mexe** (semântica, ver Global Constraints).

- [ ] **Step 2: Verificar**

Cópia de teste: abra o Kanban e clique num agendamento para abrir o `DetailPanel`, nos dois temas. Confira que nenhum texto fica invisível contra o próprio fundo.

- [ ] **Step 3: `node --check`, teste final da tarefa e commit**

```bash
node --check cliniflow-export/cliniflow-components.jsx
```
Expected: sem output (sintaxe válida).

Recarregue a cópia de teste, console sem erros, alterne tema em Agenda (lista/kanban) e Atendimentos.

```bash
git add cliniflow-export/cliniflow-components.jsx
git commit -m "Tema claro: getStatusStyle, Sidebar, ListView, Kanban e DetailPanel usam tokens"
```

---

## Task 3: Drag-and-drop da Agenda com ponteiro customizado (estilo Google Calendar)

**Files:**
- Modify: `cliniflow-export/cliniflow-components.jsx` (`CalendarView`, `CalEvent`, e a linha `const { useState } = React;` no topo do arquivo)

**Interfaces:**
- Consumes: `onMove(id, day, minutos)` — já existe, prop de `CalendarView`, não muda.
- Produces: nenhuma interface nova exposta para fora de `CalendarView`/`CalEvent`.

### 3.1 — Adicionar `useRef` ao destructuring do React

- [ ] **Step 1**

No topo do arquivo (linha 6):
```js
const { useState } = React;
```
Substitua por:
```js
const { useState, useRef } = React;
```

### 3.2 — Trocar os handlers de drag nativo por um controlador de ponteiro

- [ ] **Step 1: Remover os handlers nativos e adicionar o novo estado**

Em `CalendarView`, encontre (linhas 367-368):
```js
  const [dragId, setDragId] = useState(null);
  const [hoverSlot, setHoverSlot] = useState(null); // { day, minute }
```
Substitua por:
```js
  const [dragId, setDragId] = useState(null);
  const [hoverSlot, setHoverSlot] = useState(null); // { day, minute }
  const [dragPos, setDragPos] = useState(null);     // { x, y } — posição do cursor durante o arraste
  const dayColRefs = useRef([]);                    // uma ref por dia visível, na mesma ordem de visibleDays
```

- [ ] **Step 2: Substituir os handlers `onDragStart`/`computeSlotFromEvent`/`onDragOverCol`/`onDrop`/`onDragEnd`**

Encontre o bloco inteiro (linhas 433-473):
```js
  // Drag handlers ────────────────────────────────────────────────────────────
  const onDragStart = (e, id) => {
    setDragId(id);
    e.dataTransfer.effectAllowed = 'move';
    // Custom transparent drag image so the ghost slot does the work
    const ghost = document.createElement('div');
    ghost.style.opacity = '0';
    document.body.appendChild(ghost);
    e.dataTransfer.setDragImage(ghost, 0, 0);
    setTimeout(() => document.body.removeChild(ghost), 0);
  };

  const computeSlotFromEvent = (e, dayIdx, colRef) => {
    const rect = colRef.getBoundingClientRect();
    const y = e.clientY - rect.top;
    let minute = dayStart + Math.round(y / slotH * 60);
    minute = Math.round(minute / 15) * 15;          // snap to 15 min
    minute = Math.max(dayStart, Math.min(HOUR_END * 60 - 15, minute));
    return { day: dayIdx, minute };
  };

  const onDragOverCol = (e, dayIdx) => {
    if (dragId == null) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    const slot = computeSlotFromEvent(e, dayIdx, e.currentTarget);
    if (!hoverSlot || hoverSlot.day !== slot.day || hoverSlot.minute !== slot.minute) {
      setHoverSlot(slot);
    }
  };

  const onDrop = (e, dayIdx) => {
    if (dragId == null) return;
    e.preventDefault();
    const slot = computeSlotFromEvent(e, dayIdx, e.currentTarget);
    onMove && onMove(dragId, slot.day, fromMin(slot.minute));
    setDragId(null);
    setHoverSlot(null);
  };

  const onDragEnd = () => { setDragId(null); setHoverSlot(null); };
```

Substitua por:
```js
  // Drag handlers (ponteiro customizado) ──────────────────────────────────────
  // Descobre, a partir de um ponto de tela (clientX/clientY), qual coluna de
  // dia está sob o cursor e qual horário (arredondado a 15min) corresponde.
  const computeSlotFromPoint = (clientX, clientY) => {
    for (let i = 0; i < visibleDays.length; i++) {
      const col = dayColRefs.current[i];
      if (!col) continue;
      const rect = col.getBoundingClientRect();
      if (clientX >= rect.left && clientX < rect.right) {
        const y = clientY - rect.top;
        let minute = dayStart + Math.round(y / slotH * 60);
        minute = Math.round(minute / 15) * 15;
        minute = Math.max(dayStart, Math.min(HOUR_END * 60 - 15, minute));
        return { day: visibleDays[i], minute };
      }
    }
    return null;
  };

  const onEventPointerDown = (e, id) => {
    if (e.button !== 0) return; // só arrasta com o botão esquerdo
    e.preventDefault();
    const startX = e.clientX;
    const startY = e.clientY;
    let started = false; // só vira "arraste" depois de passar o limiar de 4px

    const onPointerMove = (ev) => {
      if (!started) {
        if (Math.hypot(ev.clientX - startX, ev.clientY - startY) < 4) return;
        started = true;
        setDragId(id);
      }
      setDragPos({ x: ev.clientX, y: ev.clientY });
      setHoverSlot(computeSlotFromPoint(ev.clientX, ev.clientY));
    };

    const cleanup = () => {
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      window.removeEventListener('keydown', onKeyDown);
    };

    const onPointerUp = (ev) => {
      cleanup();
      if (started) {
        const slot = computeSlotFromPoint(ev.clientX, ev.clientY);
        if (slot) onMove && onMove(id, slot.day, fromMin(slot.minute));
      }
      setDragId(null);
      setHoverSlot(null);
      setDragPos(null);
    };

    const onKeyDown = (ev) => {
      if (ev.key !== 'Escape') return;
      cleanup();
      setDragId(null);
      setHoverSlot(null);
      setDragPos(null);
    };

    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    window.addEventListener('keydown', onKeyDown);
  };
```

- [ ] **Step 3: Atribuir a ref de cada coluna e remover os handlers nativos do `<div>` de coluna**

Encontre (linhas 553-567):
```js
          {visibleDays.map(dayIdx => {
            const isToday = dayIdx === todayCol;
            return (
              <div
                key={dayIdx}
                onDragOver={e => onDragOverCol(e, dayIdx)}
                onDrop={e => onDrop(e, dayIdx)}
                onDragLeave={() => { /* keep last hover until drop or end */ }}
                style={{
                  position:'relative',
                  height: totalH,
                  borderLeft:'1px solid #161616',
                  background: isToday ? 'rgba(255,255,255,0.012)' : 'transparent',
                }}
              >
```
Substitua por:
```js
          {visibleDays.map((dayIdx, i) => {
            const isToday = dayIdx === todayCol;
            return (
              <div
                key={dayIdx}
                ref={el => { dayColRefs.current[i] = el; }}
                style={{
                  position:'relative',
                  height: totalH,
                  borderLeft:'1px solid var(--supabase-border)',
                  background: isToday ? 'rgba(255,255,255,0.012)' : 'transparent',
                }}
              >
```
(A troca de `borderLeft:'1px solid #161616'` por `var(--supabase-border)` é a mesma tradução tema-aware da Tarefa 2 — como esta linha está sendo tocada de qualquer forma para remover os handlers nativos, aproveite e aplique aqui também.)

- [ ] **Step 4: Trocar a prop de `CalEvent` e adicionar o "fantasma" flutuante**

Encontre (linhas 621-633):
```js
                {/* Events */}
                {eventsByDay[dayIdx].map(apt => (
                  <CalEvent
                    key={apt.id}
                    apt={apt}
                    dayStart={dayStart}
                    slotH={slotH}
                    selected={apt.id === selectedId}
                    dragging={apt.id === dragId}
                    onSelect={() => onSelect(apt.id === selectedId ? null : apt.id)}
                    onDragStart={e => onDragStart(e, apt.id)}
                    onDragEnd={onDragEnd}
                  />
                ))}
```
Substitua por:
```js
                {/* Events */}
                {eventsByDay[dayIdx].map(apt => (
                  <CalEvent
                    key={apt.id}
                    apt={apt}
                    dayStart={dayStart}
                    slotH={slotH}
                    selected={apt.id === selectedId}
                    dragging={apt.id === dragId}
                    onSelect={() => onSelect(apt.id === selectedId ? null : apt.id)}
                    onPointerDown={e => onEventPointerDown(e, apt.id)}
                  />
                ))}
```

Logo depois do `.map` das colunas de dia (depois do `})}` que fecha `visibleDays.map(...)`, ainda dentro do mesmo `<div>` de grid), adicione o cartão flutuante que segue o cursor:

```jsx
          {/* Fantasma flutuante do evento sendo arrastado — segue o cursor */}
          {dragId != null && dragPos && (() => {
            const dragApt = appointments.find(a => a.id === dragId);
            if (!dragApt) return null;
            return (
              <div style={{
                position:'fixed', left: dragPos.x + 14, top: dragPos.y + 14,
                maxWidth:200, padding:'6px 10px', borderRadius:6,
                background:'var(--supabase-bg-card)', border:'1px solid var(--supabase-brand)',
                boxShadow:'var(--shadow-lg)', transform:'scale(1.02)',
                pointerEvents:'none', zIndex:1000,
                fontSize:12, fontWeight:600, color:'var(--supabase-text)',
                whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis',
              }}>
                {dragApt.patient} · {hoverSlot ? fromMin(hoverSlot.minute) : dragApt.time}
              </div>
            );
          })()}
```

- [ ] **Step 5: Atualizar `CalEvent` — trocar `draggable`/`onDragStart`/`onDragEnd` por `onPointerDown`, e animar o encaixe**

Encontre a assinatura da função (linha 643):
```js
function CalEvent({ apt, dayStart, slotH, selected, dragging, onSelect, onDragStart, onDragEnd }) {
```
Substitua por:
```js
function CalEvent({ apt, dayStart, slotH, selected, dragging, onSelect, onPointerDown }) {
```

Encontre (linhas 659-688):
```js
    <div
      draggable
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onClick={onSelect}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        position:'absolute',
        top,
        height,
        left:  `calc(${leftPct}% + 2px)`,
        width: `calc(${widthPct}% - 4px)`,
        background: selected || hov ? (isSolicitado ? `${styleVal.text}26` : `${s.color}26`) : (isSolicitado ? styleVal.bg : dim ? '#161616' : `${s.color}14`),
        border: isSolicitado 
          ? (selected ? `solid 2px ${styleVal.text}` : hov ? `dashed 2px ${styleVal.text}` : styleVal.border)
          : `1px solid ${selected ? s.color+'70' : hov ? s.color+'44' : dim ? '#222' : s.color+'2a'}`,
        borderLeft: isSolicitado ? undefined : `3px solid ${dim ? '#2e2e2e' : s.color}`,
        borderRadius:5,
        padding: compact ? '2px 6px' : '4px 7px 5px',
        cursor: dragging ? 'grabbing' : 'grab',
        transition: dragging ? 'none' : 'background .12s, border-color .12s, box-shadow .12s',
        opacity: dragging ? .35 : dim ? .55 : 1,
        boxShadow: hov && !dim ? `0 4px 14px -6px ${isSolicitado ? styleVal.text : s.color}55` : 'none',
        overflow:'hidden',
        display:'flex', flexDirection: compact ? 'row' : 'column',
        gap: compact ? 6 : 1,
        zIndex: selected || hov ? 5 : 2,
      }}
    >
```
Substitua por (mudanças: `onPointerDown` no lugar dos handlers nativos, `background`/`border`/`borderLeft` usam `var(--supabase-bg-hover)`/`var(--supabase-border)` nos dois pontos que eram hex fixo, e a `transition` ganha `top`/`left` para animar o encaixe ao soltar):
```js
    <div
      onPointerDown={onPointerDown}
      onClick={onSelect}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        position:'absolute',
        top,
        height,
        left:  `calc(${leftPct}% + 2px)`,
        width: `calc(${widthPct}% - 4px)`,
        background: selected || hov ? (isSolicitado ? `${styleVal.text}26` : `${s.color}26`) : (isSolicitado ? styleVal.bg : dim ? 'var(--supabase-bg-hover)' : `${s.color}14`),
        border: isSolicitado 
          ? (selected ? `solid 2px ${styleVal.text}` : hov ? `dashed 2px ${styleVal.text}` : styleVal.border)
          : `1px solid ${selected ? s.color+'70' : hov ? s.color+'44' : dim ? 'var(--supabase-border)' : s.color+'2a'}`,
        borderLeft: isSolicitado ? undefined : `3px solid ${dim ? 'var(--supabase-border)' : s.color}`,
        borderRadius:5,
        padding: compact ? '2px 6px' : '4px 7px 5px',
        cursor: dragging ? 'grabbing' : 'grab',
        transition: dragging ? 'none' : 'top .25s var(--ease-premium), left .25s var(--ease-premium), background .12s, border-color .12s, box-shadow .12s',
        opacity: dragging ? .35 : dim ? .55 : 1,
        boxShadow: hov && !dim ? `0 4px 14px -6px ${isSolicitado ? styleVal.text : s.color}55` : 'none',
        overflow:'hidden',
        display:'flex', flexDirection: compact ? 'row' : 'column',
        gap: compact ? 6 : 1,
        zIndex: selected || hov ? 5 : 2,
      }}
    >
```

### 3.3 — Verificar

- [ ] **Step 1: `node --check`**

```bash
node --check cliniflow-export/cliniflow-components.jsx
```
Expected: sem output.

- [ ] **Step 2: Testar o arraste na cópia de teste**

Suba a cópia de teste, vá em Agenda → visão calendário. Segure o botão esquerdo sobre um evento e mova o mouse:
- Abaixo de 4px de movimento: nada acontece (evita iniciar arraste num clique simples — clicar ainda deve abrir o `DetailPanel` via `onSelect`).
- Acima de 4px: um cartão pequeno (nome do paciente + horário) passa a seguir o cursor; o evento original fica com opacidade reduzida no lugar; a prévia tracejada do horário de destino aparece na coluna sob o cursor.
- Ao soltar dentro da grade: o evento anima suavemente até a nova posição (não pula).
- Ao soltar fora da grade (fora de qualquer coluna): nada muda, o evento volta ao normal.
- Apertar `Esc` durante o arraste: cancela, o evento volta ao normal sem mudar de horário.
- Clicar (sem arrastar) num evento: ainda abre o `DetailPanel` normalmente.

- [ ] **Step 3: Console sem erros, depois commit**

```bash
git add cliniflow-export/cliniflow-components.jsx
git commit -m "Reescreve drag-and-drop da Agenda com ponteiro customizado (estilo Google Calendar)"
```

---

## Task 4: `patients-components.jsx` — cores tema-aware e motion do Modal compartilhado

**Files:**
- Modify: `cliniflow-export/patients-components.jsx` (`Modal`, `Field`, `Input`, `Select`, `ModalFooter`, `PatientsView`, `PatientRow`)

**Interfaces:**
- Consumes: `--supabase-bg-hover`, `--supabase-bg-input`, `--ease-premium`, `--shadow-lg` (Tarefas 1 e a camada global já commitada hoje).
- Produces: nenhuma — `Modal`/`Field`/`Input`/`Select`/`ModalFooter` continuam com as mesmas props, usados por `AddPatientModal`/`EditPatientModal`/`NewAppointmentModal` sem mudança de assinatura.

### 4.1 — Cores fixas no bloco de primitivas compartilhadas (linhas 71-174)

- [ ] **Step 1: `Modal` — botão de fechar**

Encontre:
```js
          <button onClick={onClose} style={{
            background:'none', border:'none', color:'#555', cursor:'pointer',
            width:24, height:24, borderRadius:4, fontSize:18, lineHeight:'24px',
          }}>×</button>
```
Substitua `color:'#555'` por `color:'var(--supabase-text-muted)'`.

- [ ] **Step 2: `Field` — label e hint**

Encontre:
```js
      <label style={{
        display:'block', fontSize:11, fontWeight:600, color:'#666',
        textTransform:'uppercase', letterSpacing:.7, marginBottom:6,
      }}>{label}</label>
      {children}
      {hint && <div style={{ fontSize:11, color:'#444', marginTop:5 }}>{hint}</div>}
```
Substitua `color:'#666'` por `color:'var(--supabase-text-muted)'` e `color:'#444'` por `color:'var(--supabase-icon-inactive)'`.

- [ ] **Step 3: `inputStyle`/`Input`/`Select` — fundo recuado e foco**

Encontre:
```js
const inputStyle = {
  width:'100%', padding:'9px 11px',
  background:'var(--supabase-bg-card)', border:'1px solid var(--supabase-border)', borderRadius:'var(--radius-studio)',
  color:'var(--supabase-text)', fontSize:13, outline:'none',
  transition:'border-color .12s',
};

function Input(props) {
  const [foc, setFoc] = useStateP(false);
  return (
    <input
      {...props}
      onFocus={() => setFoc(true)} onBlur={() => setFoc(false)}
      style={{ ...inputStyle, borderColor: foc ? '#555' : 'var(--supabase-border)', ...(props.style||{}) }}
    />
  );
}
```
Substitua por (fundo do input passa a usar o token recuado; a cor de foco usa `--supabase-brand`, consistente com o `input:focus` global já commitado hoje em `Cliniflow.html`):
```js
const inputStyle = {
  width:'100%', padding:'9px 11px',
  background:'var(--supabase-bg-input)', border:'1px solid var(--supabase-border)', borderRadius:'var(--radius-studio)',
  color:'var(--supabase-text)', fontSize:13, outline:'none',
  transition:'border-color .15s var(--ease-premium)',
};

function Input(props) {
  const [foc, setFoc] = useStateP(false);
  return (
    <input
      {...props}
      onFocus={() => setFoc(true)} onBlur={() => setFoc(false)}
      style={{ ...inputStyle, borderColor: foc ? 'var(--supabase-brand)' : 'var(--supabase-border)', ...(props.style||{}) }}
    />
  );
}
```

Para `Select` (linha ~146), troque `background:'#161616'` (estilo do `<option>`) por `background:'var(--supabase-bg-input)'`. O `fill='%23666'` embutido no data-URI do ícone de seta **fica como está** — trocar exigiria dois data-URIs (um por tema), o que é desproporcional para uma seta cinza que já tem contraste aceitável nos dois temas; não faça essa troca nesta tarefa.

- [ ] **Step 4: `ModalFooter` — botão cancelar e botão salvar desabilitado**

Encontre:
```js
      <button onClick={onCancel} style={{
        padding:'8px 16px', borderRadius:'var(--radius-studio)', cursor:'pointer',
        background:'var(--supabase-bg-card)', border:'1px solid var(--supabase-border)',
        color:'#888', fontSize:12.5, fontWeight:500,
      }}>Cancelar</button>
      <button onClick={onSave} disabled={saveDisabled} style={{
        padding:'8px 18px', borderRadius:6,
        cursor: saveDisabled ? 'not-allowed' : 'pointer',
        background: saveDisabled ? '#222' : accent,
        border:'none', color: saveDisabled ? '#555' : 'rgba(0,0,0,0.85)',
        fontSize:12.5, fontWeight:600, letterSpacing:'-.2px',
      }}>{saveLabel}</button>
```
Substitua por:
```js
      <button onClick={onCancel} style={{
        padding:'8px 16px', borderRadius:'var(--radius-studio)', cursor:'pointer',
        background:'var(--supabase-bg-card)', border:'1px solid var(--supabase-border)',
        color:'var(--supabase-text-muted)', fontSize:12.5, fontWeight:500,
      }}>Cancelar</button>
      <button onClick={onSave} disabled={saveDisabled} style={{
        padding:'8px 18px', borderRadius:6,
        cursor: saveDisabled ? 'not-allowed' : 'pointer',
        background: saveDisabled ? 'var(--supabase-bg-hover)' : accent,
        border:'none', color: saveDisabled ? 'var(--supabase-icon-inactive)' : 'rgba(0,0,0,0.85)',
        fontSize:12.5, fontWeight:600, letterSpacing:'-.2px',
      }}>{saveLabel}</button>
```

### 4.2 — Motion do `Modal` (entrada já existe, falta a saída e o easing unificado)

O `Modal` já anima a entrada (`animation:'fadeIn .15s ease-out'` no overlay, `'slideUp .18s ease-out'` no card) — bom achado, não precisa ser criado do zero. Falta: (a) usar o mesmo `--ease-premium` da camada global de hoje, e (b) o fechamento hoje é instantâneo (o componente some do DOM assim que `onClose` roda) — deixar assim é aceitável para esta tarefa (animar a *saída* de um componente que desmonta via `useState`/condicional exigiria adiar o unmount, o que é uma mudança de arquitetura maior do que o pedido). Escopo desta tarefa: só alinhar o easing de entrada.

- [ ] **Step 1**

Encontre:
```js
      background:'rgba(0,0,0,0.62)', backdropFilter:'blur(3px)',
      display:'flex', alignItems:'center', justifyContent:'center',
      animation:'fadeIn .15s ease-out',
```
Substitua `animation:'fadeIn .15s ease-out'` por `animation:'fadeIn .2s var(--ease-premium)'`.

Encontre:
```js
        boxShadow:'0 20px 60px -10px rgba(0,0,0,0.6)',
        display:'flex', flexDirection:'column', overflow:'hidden',
        animation:'slideUp .18s ease-out',
```
Substitua `boxShadow:'0 20px 60px -10px rgba(0,0,0,0.6)'` por `boxShadow:'var(--shadow-lg)'` e `animation:'slideUp .18s ease-out'` por `animation:'slideUp .25s var(--ease-premium)'`.

### 4.3 — `PatientsView`/`PatientRow`

- [ ] **Step 1: Aplicar a mesma regra de tradução do resto do plano**

Rode `grep -n "'#" cliniflow-export/patients-components.jsx` restrito às linhas de `PatientsView`/`PatientRow` (a partir da linha ~479) e classifique cada cor fixa pela mesma regra da Tarefa 2.4 (fundo/hover → `--supabase-bg-hover`, borda → `--supabase-border`, texto principal → `--supabase-text`/`--supabase-text-light`, texto secundário → `--supabase-text-muted`).

- [ ] **Step 2: Verificar, `node --check`, commit**

```bash
node --check cliniflow-export/patients-components.jsx
```
Cópia de teste: abra "Novo paciente" e "Editar paciente" nos dois temas — campos, labels, botões devem ter contraste correto. Confira também a lista de Pacientes nos dois temas.

```bash
git add cliniflow-export/patients-components.jsx
git commit -m "Tema claro e motion unificado no Modal e primitivas de formulario"
```

---

## Task 5: `reports-components.jsx` — cores tema-aware

**Files:**
- Modify: `cliniflow-export/reports-components.jsx` (`KpiCard`, `BarChart`, `Donut`, `RetentionTable`, `ReportsView`, `RevenueLine`)

**Interfaces:**
- Consumes: tokens das Tarefas 1 e da camada global de hoje.
- Produces: nenhuma.

- [ ] **Step 1: Aplicar a regra de tradução em cada componente**

Este arquivo tem gráficos desenhados à mão em SVG (`BarChart`, `Donut`, `RevenueLine`) — além dos `style={{...}}` de HTML, cores também aparecem como atributo `fill`/`stroke` dentro de elementos `<rect>`/`<path>`/`<circle>`. Rode, por componente (`sed -n '<início>,<fim>p' reports-components.jsx` para isolar cada função pelos números de linha já mapeados: `KpiCard` 47-84, `BarChart` 85-137, `Donut` 138-190, `RetentionTable` 191-236, `ReportsView` 237-472, `RevenueLine` 482-fim):

```bash
grep -n "'#\|fill=\"#\|stroke=\"#" cliniflow-export/reports-components.jsx
```

Classifique cada ocorrência pela mesma regra das tarefas anteriores. Atenção a dois pontos específicos deste arquivo:
- `#00d084` e `#ef4444` aparecem como o par positivo/negativo do sistema (igual em `automation-components.jsx`, Tarefa 6) — são cor semântica fixa, **não precisam de token novo**, mantenha como estão.
- Eixos/grades de gráfico (`stroke` de linhas de fundo do `BarChart`/`RevenueLine`) costumam usar um cinza bem apagado (`#1a1a1a`/`#1c1c1c`/`#101010`) — troque por `var(--supabase-border)`; como é um atributo SVG, não uma propriedade de objeto `style`, use exatamente `stroke="var(--supabase-border)"` (custom properties funcionam em atributos de apresentação SVG normalmente, é só confirmar visualmente no Step 2).

- [ ] **Step 2: Verificar, `node --check`, commit**

```bash
node --check cliniflow-export/reports-components.jsx
```
Cópia de teste: aba Relatórios, nos dois temas — confira que as linhas de grade dos gráficos continuam visíveis (não somem) no tema claro, e que os números/legendas têm contraste correto.

```bash
git add cliniflow-export/reports-components.jsx
git commit -m "Tema claro nos graficos e componentes de Relatorios"
```

---

## Task 6: `automation-components.jsx` — cores tema-aware e motion das abas

**Files:**
- Modify: `cliniflow-export/automation-components.jsx` (`AutomationView`, `LembretesTab`, `LembreteCard`, `HistoricoTab`, `MensagemRow`, `StatusTab`, `SaudeSistemaCard`, `StatCard`)

**Interfaces:**
- Consumes: tokens das Tarefas 1 e da camada global de hoje.
- Produces: nenhuma.

### 6.1 — Cores

- [ ] **Step 1: Aplicar a regra de tradução**

```bash
grep -n "'#" cliniflow-export/automation-components.jsx
```

Mesma regra das tarefas anteriores. `#00d084`/`#ef4444` (conectado/erro, ex.: linhas ~120-125, ~555-560, ~614-618, ~655-657) são o par semântico positivo/negativo do sistema — mantenha fixo nos dois temas, é status de conexão real (bot online/offline), não decoração.

### 6.2 — Motion na troca de abas

`AutomationView` tem abas (Lembretes/Histórico/Status, conforme `LembretesTab`/`HistoricoTab`/`StatusTab`) trocadas por estado local. Aplique o mesmo padrão de entrada usado no `Modal` (Tarefa 4.2): o conteúdo da aba ativa ganha `animation:'fadeIn .2s var(--ease-premium)'` no elemento raiz que `AutomationView` renderiza condicionalmente para cada aba.

- [ ] **Step 1: Localizar o render condicional das abas**

```bash
grep -n "LembretesTab\|HistoricoTab\|StatusTab" cliniflow-export/automation-components.jsx | head -10
```

No `<div>` raiz de cada um dos três componentes de aba (`LembretesTab`, `HistoricoTab`, `StatusTab` — o elemento mais externo que cada função retorna), adicione `animation:'fadeIn .2s var(--ease-premium)'` ao objeto de `style` existente (sem remover nenhuma propriedade já presente).

- [ ] **Step 2: Verificar, `node --check`, commit**

```bash
node --check cliniflow-export/automation-components.jsx
```
Cópia de teste: aba Automações, alterne entre Lembretes/Histórico/Status — cada troca deve ter uma entrada suave em vez de aparecer seca. Confira os dois temas.

```bash
git add cliniflow-export/automation-components.jsx
git commit -m "Tema claro em Automacoes e fade na troca de abas"
```

---

## Task 7: Motion na troca de view da Agenda + verificação final cross-file

**Files:**
- Modify: `cliniflow-export/Cliniflow.html` (função `App`, bloco que renderiza `ListView`/`CalendarView`/`KanbanView` condicionalmente conforme `t.layout`, por volta da linha 390)

**Interfaces:**
- Consumes: tudo das Tarefas 1-6.
- Produces: nenhuma — esta é a última tarefa, encerra o plano.

### 7.1 — Motion na troca lista/calendário/kanban

- [ ] **Step 1: Localizar o bloco**

```bash
grep -n "t.layout === " cliniflow-export/Cliniflow.html
```

Deve apontar para três blocos (`t.layout === 'lista'`, `'calendário'`, `'kanban'`) por volta das linhas 390-399, cada um envolvendo `<ListView .../>`, `<CalendarView .../>` ou `<KanbanView .../>`. Envolva o retorno de cada bloco condicional num `<div>` com a key do layout ativo, para o React remontar (e portanto reanimar) ao trocar de view:

Exemplo de forma (adapte aos três blocos existentes, mantendo todas as props que já são passadas para `ListView`/`CalendarView`/`KanbanView` sem alterá-las):
```jsx
{t.layout === 'lista' && (
  <div key="lista" style={{ flex:1, minHeight:0, animation:'fadeIn .2s var(--ease-premium)' }}>
    <ListView appointments={filteredList} selectedId={selectedId} /* ...demais props inalteradas... */ />
  </div>
)}
```

Repita para os blocos `'calendário'` e `'kanban'`, cada um com sua própria `key` (`"calendario"`, `"kanban"`) e o mesmo `style={{ flex:1, minHeight:0, animation:'fadeIn .2s var(--ease-premium)' }}`.

- [ ] **Step 2: Verificar**

Cópia de teste: alterne entre lista/calendário/kanban usando o `LayoutBtn` da barra da Agenda — cada troca deve ter uma entrada suave. Confirme que a seleção de agendamento (`selectedId`) e o `DetailPanel` continuam funcionando normalmente (o `<div>` novo não deve quebrar nenhum layout flex existente — se o `flex:1, minHeight:0` não bater com o contêiner pai, ajuste para o que o pai já esperava antes desta mudança).

### 7.2 — Verificação final de todo o plano

- [ ] **Step 1: `node --check` em todos os arquivos tocados**

```bash
for f in cliniflow-export/cliniflow-components.jsx cliniflow-export/patients-components.jsx cliniflow-export/reports-components.jsx cliniflow-export/automation-components.jsx; do
  echo "== $f =="; node --check "$f"
done
```
Expected: nenhum output de erro em nenhum arquivo.

- [ ] **Step 2: Passagem visual completa nos dois temas**

Na cópia de teste (modo demonstração), com o `TweaksPanel` alternando `dark`/`light`, visite nesta ordem: Login (já feito na sessão de hoje, só confirmar que não regrediu), Agenda (lista → calendário → kanban, testando o drag em pelo menos 2 eventos), Atendimentos, Pacientes (abrir os 3 modais), Relatórios, Automações (as 3 abas). Console do navegador sem erros em nenhuma tela, em nenhum tema.

- [ ] **Step 3: Atualizar `AGENTS.md` e commit final**

Adicione uma entrada em "Estado atual" de `AGENTS.md` (seguindo o padrão das entradas já existentes) registrando: tema claro cobrindo as 5 telas autenticadas, drag-and-drop da Agenda reescrito com ponteiro customizado, motion unificado — e deixe explícito que a verificação foi manual (sem screenshot/teste automatizado), igual ao que já está registrado para o trabalho de 05/08/2026.

```bash
git add cliniflow-export/Cliniflow.html AGENTS.md
git commit -m "Motion na troca de view da Agenda; fecha o plano de tema claro/drag/motion"
```

---

## Cobertura do spec

| Seção do spec (`2026-08-05-ui-tema-claro-e-motion-design.md`) | Tarefa(s) |
|---|---|
| §3 Tema claro completo | Tarefas 1, 2, 4, 5, 6 |
| §4 Motion mais fluido | Tarefas 4.2, 6.2, 7.1 |
| §5 Drag-and-drop estilo Google Calendar | Tarefa 3 |
| §6 Verificação | Receita de verificação (usada em toda tarefa) + Tarefa 7.2 |
| §7 Arquivos afetados | Tarefas 1-7, um bloco por arquivo |
