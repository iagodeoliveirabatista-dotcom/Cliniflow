# Sábado na Agenda, Data Livre na Nova Consulta e Configurações Mais Profissional — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fazer a agenda do Cliniflow tratar sábado como dia útil, dar ao modal "Nova consulta" liberdade de navegar semanas sem fechar o modal, e reescrever a tela de Configurações para ficar visualmente consistente com o resto do app.

**Architecture:** React 18 (UMD) + Babel standalone via CDN, sem build step — mesma arquitetura dos planos anteriores. Funções top-level definidas num arquivo `.jsx`/`.html` carregado por `<script>` ficam disponíveis globalmente para os arquivos carregados depois, desde que só sejam referenciadas em tempo de renderização (não no topo do módulo) — padrão já usado com sucesso neste projeto (`Select`, definido em `patients-components.jsx`, é consumido por `DetailPanel` em `cliniflow-components.jsx`, carregado antes).

**Tech Stack:** React 18.3.1 (CDN), Babel standalone 7.29, CSS custom properties.

## Global Constraints

- Sem build step: os arquivos tocados (`Cliniflow.html`, `cliniflow-components.jsx`, `patients-components.jsx`) continuam sendo servidos via `<script type="text/babel" src="...">`.
- Sem framework de teste automatizado. Verificação é manual — receita abaixo, usada em toda tarefa.
- **`node --check` NÃO valida `.jsx`** (Node não entende JSX — `docs/ARMADILHAS.md` §42). Não use como gate; o gate real é o Babel do navegador (console sem erro).
- **Nunca** editar `cliniflow-export/config.js` de produção nem abrir a cópia de teste apontando pro Supabase real. Todo teste usa config vazio (modo demonstração).
- Domingo continua fechado — não ganha coluna, não vira dia útil. Só sábado passa a ser dia útil.
- Não é redesign de identidade: mantém `--supabase-*`, `ACCENT_MAP`, `Modal`/`Field`/`Select`/`Input` já existentes. `SettingsModal` (Tarefa 4) reaproveita esses componentes em vez de inventar novos.
- **Cache-busting obrigatório**: toda tarefa que edita `cliniflow-components.jsx` ou `patients-components.jsx` pela última vez termina bumpando o `?v=` correspondente na tag `<script>` de `Cliniflow.html`. Versões atuais nesta sessão: `cliniflow-components.jsx?v=11`, `patients-components.jsx?v=10` — confirme lendo `Cliniflow.html` antes de cada bump, outro agente pode ter mudado.

## Receita de verificação (usada em toda tarefa)

```bash
SCRATCH=/caminho/local/fora/do/repo/cliniflow-demo-check
mkdir -p "$SCRATCH"
cp cliniflow-export/Cliniflow.html cliniflow-export/*.jsx cliniflow-export/supabase.js cliniflow-export/supabase-client.js "$SCRATCH/"
echo "window.CLINIFLOW_CONFIG = { supabaseUrl: '', supabaseAnonKey: '', n8nBaseUrl: '', n8nWebhookToken: '' };" > "$SCRATCH/config.js"
cd "$SCRATCH" && python -m http.server 3009
```
Abra `http://localhost:3009/Cliniflow.html` (**precisa ser servido por HTTP** — abrir o arquivo direto como `file://` não executa os scripts corretamente). O app sobe em "Modo demonstração", dados fake, nenhum dado real tocado. **`supabase-client.js` faz parte da cópia** — esquecê-lo produz 404 e a tela quebra (já aconteceu numa sessão anterior).

Cada tarefa termina com:
1. Recarregar a cópia de teste com hard-reload (`Ctrl+Shift+R`).
2. Console do navegador sem erros.
3. Passo de verificação específico da tarefa (descrito em cada uma).

---

## Task 1: Sábado como dia útil

**Files:**
- Modify: `cliniflow-export/cliniflow-components.jsx:371` (`DAY_LABELS`)
- Modify: `cliniflow-export/cliniflow-components.jsx:471-472` (`todayCol`, dentro de `CalendarView`)
- Modify: `cliniflow-export/Cliniflow.html:849` (`AgendaHeader.formatWeekLabel`)
- Modify: `cliniflow-export/patients-components.jsx:334-339` (`proximoDiaUtil`)

**Interfaces:**
- Produces: nenhuma interface nova — `DAY_LABELS` continua um array de strings, `todayCol`/`formatWeekLabel`/`proximoDiaUtil` continuam com a mesma assinatura, só o comportamento (limite de semana) muda.

### 1.1 — Grade do calendário

- [ ] **Step 1**

Em `cliniflow-export/cliniflow-components.jsx`, encontre (linha 371):
```js
const DAY_LABELS = ['Seg','Ter','Qua','Qui','Sex'];
```
Substitua por:
```js
const DAY_LABELS = ['Seg','Ter','Qua','Qui','Sex','Sáb'];
```
(`visibleDays`/`eventsByDay`, mais abaixo no mesmo arquivo, já são derivados de `DAY_LABELS.map(...)` — nada mais precisa mudar pra grade ganhar a 6ª coluna.)

### 1.2 — Cálculo de "hoje"

- [ ] **Step 1**

Ainda em `cliniflow-components.jsx`, encontre (dentro de `CalendarView`, variável `todayCol`):
```js
    const currentFri = new Date(currentMon);
    currentFri.setDate(currentMon.getDate() + 4);
    currentFri.setHours(23,59,59,999);
```
Substitua por:
```js
    const currentSab = new Date(currentMon);
    currentSab.setDate(currentMon.getDate() + 5);
    currentSab.setHours(23,59,59,999);
```
E, logo abaixo, encontre:
```js
    const nowTime = now.getTime();
    if (nowTime >= currentMon.getTime() && nowTime <= currentFri.getTime()) {
      return (now.getDay() + 6) % 7; // 0=Mon, 1=Tue, etc.
    }
```
Substitua por:
```js
    const nowTime = now.getTime();
    if (nowTime >= currentMon.getTime() && nowTime <= currentSab.getTime()) {
      return (now.getDay() + 6) % 7; // 0=Mon, 1=Tue, etc.
    }
```

### 1.3 — Rótulo da semana

- [ ] **Step 1**

Em `cliniflow-export/Cliniflow.html`, dentro de `AgendaHeader.formatWeekLabel`, encontre:
```js
      const formatWeekLabel = () => {
        const mon = new Date(currentMonday);
        const fri = new Date(currentMonday);
        fri.setDate(currentMonday.getDate() + 4);
```
Substitua por:
```js
      const formatWeekLabel = () => {
        const mon = new Date(currentMonday);
        const fri = new Date(currentMonday);
        fri.setDate(currentMonday.getDate() + 5);
```
(A variável continua se chamando `fri` de propósito — renomear pra `sab` tocaria todas as referências abaixo dela na mesma função sem nenhum ganho; o valor que ela guarda é o que importa.)

### 1.4 — Bot para de recusar sábado

- [ ] **Step 1**

Em `cliniflow-export/patients-components.jsx`, encontre:
```js
// Sábado e domingo caem para segunda: a clínica atende de segunda a sexta
// (é o que a agenda mostra — a grade tem 5 colunas).
function proximoDiaUtil(base) {
  const d = new Date(base);
  d.setHours(0, 0, 0, 0);
  while (d.getDay() === 0 || d.getDay() === 6) d.setDate(d.getDate() + 1);
  return d;
}
```
Substitua por:
```js
// Domingo cai para segunda: a clínica atende de segunda a sábado
// (é o que a agenda mostra — a grade tem 6 colunas).
function proximoDiaUtil(base) {
  const d = new Date(base);
  d.setHours(0, 0, 0, 0);
  while (d.getDay() === 0) d.setDate(d.getDate() + 1);
  return d;
}
```

### 1.5 — Verificar, bump de versão, commit

- [ ] **Step 1: Bump de versão**

Em `Cliniflow.html`, confira a versão atual de `cliniflow-components.jsx` e `patients-components.jsx` nas tags `<script>` (leia antes de editar — outro agente pode ter mudado desde a redação deste plano) e bump os dois em +1.

- [ ] **Step 2: Passagem visual**

Cópia de teste (receita acima), hard-reload. Console sem erros. Agenda em modo calendário: confira 6 colunas (Seg a Sáb) no cabeçalho e na grade. Se hoje for entre segunda e sábado, confira que a coluna de hoje está destacada; navegue uma semana pra trás/frente com `‹`/`›` e confira que o rótulo "Semana de X–Y" agora cobre até sábado.

- [ ] **Step 3: Commit**

```bash
git add cliniflow-export/cliniflow-components.jsx cliniflow-export/patients-components.jsx cliniflow-export/Cliniflow.html
git commit -m "Sabado vira dia util: grade do calendario, rotulo de semana e bot"
```

---

## Task 2: Nova Consulta — cursor de semana e sábado no seletor de dia

**Files:**
- Modify: `cliniflow-export/patients-components.jsx` (`NewAppointmentModal`)

**Interfaces:**
- Consumes: `NavBtn` (função top-level definida em `Cliniflow.html`, disponível globalmente em tempo de renderização — mesmo padrão já usado para `Select`/`Input` no sentido contrário).
- Produces: o objeto que `NewAppointmentModal.save()` passa para a prop `onSave` ganha o campo **`data`** (um `Date` absoluto) no lugar de `day` (índice 0-4). A Tarefa 3 depende deste formato exato.

### 2.1 — Estado de cursor de semana

- [ ] **Step 1**

Encontre a assinatura e o estado inicial de `NewAppointmentModal`:
```js
function NewAppointmentModal({ onClose, onSave, accent, patients, defaultDay, defaultTime, currentMonday, profissionais = [] }) {
  const [f, setF] = useStateP({
    patientId: '', search: '',
    day: defaultDay ?? 0,
    time: defaultTime ?? '09:00',
    dur: 30,
    type: 'Consulta de rotina',
    doctor: profissionais.length > 0 ? profissionais[0].nome : '',
    status: 'pending',
    wa: true,
    preco: '',
  });
  const set = (k,v) => setF(prev => ({ ...prev, [k]: v }));
```
Substitua por (adiciona `weekMonday` como estado próprio do modal, calculado a partir de `currentMonday` — mesmo fallback que `getDayOptions` já usava, movido para cá):
```js
function NewAppointmentModal({ onClose, onSave, accent, patients, defaultDay, defaultTime, currentMonday, profissionais = [] }) {
  const [weekMonday, setWeekMonday] = useStateP(() => {
    if (currentMonday) return new Date(currentMonday);
    const now = new Date();
    const m = new Date(now);
    m.setDate(now.getDate() - ((now.getDay() + 6) % 7));
    m.setHours(0, 0, 0, 0);
    return m;
  });
  const [f, setF] = useStateP({
    patientId: '', search: '',
    day: defaultDay ?? 0,
    time: defaultTime ?? '09:00',
    dur: 30,
    type: 'Consulta de rotina',
    doctor: profissionais.length > 0 ? profissionais[0].nome : '',
    status: 'pending',
    wa: true,
    preco: '',
  });
  const set = (k,v) => setF(prev => ({ ...prev, [k]: v }));

  const shiftWeek = (deltaDias) => {
    setWeekMonday(prev => {
      const next = new Date(prev);
      next.setDate(prev.getDate() + deltaDias);
      return next;
    });
    set('day', 0); // a semana mudou; o dia selecionado na semana antiga não faz mais sentido
  };
```

### 2.2 — `getDayOptions` usa `weekMonday` e ganha sábado

- [ ] **Step 1**

Encontre:
```js
  const getDayOptions = () => {
    const monday = currentMonday || (() => {
      const now = new Date();
      const m = new Date(now);
      m.setDate(now.getDate() - ((now.getDay() + 6) % 7));
      m.setHours(0, 0, 0, 0);
      return m;
    })();
    const options = [];
    const days = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex'];
    const months = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
    for (let i = 0; i < 5; i++) {
      const d = new Date(monday);
      d.setDate(monday.getDate() + i);
      options.push({
        value: i,
        label: `${days[i]}, ${d.getDate()} ${months[d.getMonth()]}`
      });
    }
    return options;
  };
```
Substitua por (usa `weekMonday` do estado, não mais `currentMonday`/prop; 6 dias em vez de 5):
```js
  const getDayOptions = () => {
    const options = [];
    const days = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
    const months = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
    for (let i = 0; i < 6; i++) {
      const d = new Date(weekMonday);
      d.setDate(weekMonday.getDate() + i);
      options.push({
        value: i,
        label: `${days[i]}, ${d.getDate()} ${months[d.getMonth()]}`
      });
    }
    return options;
  };
```

### 2.3 — `save()` manda a data absoluta

- [ ] **Step 1**

Encontre:
```js
  const save = () => {
    if (!ok) return;
    onSave({
      id: Date.now(),
      day: parseInt(f.day),
      time: f.time,
      patient: selectedPatient.name,
      initials: selectedPatient.initials,
      type: f.type, doctor: f.doctor,
      status: f.status, wa: f.wa,
      dur: parseInt(f.dur),
      phone: selectedPatient.phone,
      age: selectedPatient.age,
      last: selectedPatient.last,
      preco: f.preco.trim() === '' ? null : parseFloat(f.preco),
    });
    onClose();
  };
```
Substitua por:
```js
  const save = () => {
    if (!ok) return;
    const data = new Date(weekMonday);
    data.setDate(weekMonday.getDate() + parseInt(f.day));
    const [h, m] = f.time.split(':').map(Number);
    data.setHours(h, m, 0, 0);

    onSave({
      id: Date.now(),
      data,
      time: f.time,
      patient: selectedPatient.name,
      initials: selectedPatient.initials,
      type: f.type, doctor: f.doctor,
      status: f.status, wa: f.wa,
      dur: parseInt(f.dur),
      phone: selectedPatient.phone,
      age: selectedPatient.age,
      last: selectedPatient.last,
      preco: f.preco.trim() === '' ? null : parseFloat(f.preco),
    });
    onClose();
  };
```

### 2.4 — Campo "Dia" ganha os botões de navegar semana

- [ ] **Step 1**

Encontre:
```js
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:10 }}>
          <Field label="Dia">
            <Select value={f.day} onChange={v => set('day', v)}
              options={getDayOptions()} />
          </Field>
          <Field label="Horário">
```
Substitua por (o `Field` de "Dia" ganha um cabeçalho próprio com os botões `‹`/`›`, reaproveitando `NavBtn` — o mesmo componente que a barra da Agenda já usa pra navegar semana):
```js
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:10 }}>
          <Field label={
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
              <span>Dia</span>
              <div style={{ display:'flex', alignItems:'center', gap:2 }}>
                <NavBtn onClick={() => shiftWeek(-7)}>‹</NavBtn>
                <NavBtn onClick={() => shiftWeek(7)}>›</NavBtn>
              </div>
            </div>
          }>
            <Select value={f.day} onChange={v => set('day', v)}
              options={getDayOptions()} />
          </Field>
          <Field label="Horário">
```

(`Field` — mesmo arquivo — já renderiza `{label}` como filho JSX puro dentro de um `<label>`, sem manipulação de string; o `textTransform:'uppercase'` que deixa o texto em caixa alta é CSS no wrapper, então funciona igual para uma `string` ou pra um elemento React. Não precisa mudar `Field`.)

### 2.5 — Verificar, bump de versão, commit

- [ ] **Step 1: Bump de versão**

Em `Cliniflow.html`, confira a versão atual de `patients-components.jsx` (pode já ter sido bumpada na Tarefa 1 — não bumpe de novo se sim; se esta tarefa rodar isolada, bump +1).

- [ ] **Step 2: Passagem visual**

Cópia de teste, hard-reload, console sem erros. Abra "Nova consulta": o campo "Dia" mostra 6 opções (Seg a Sáb). Clique `›` ao lado do rótulo "Dia" — as opções mudam pra semana seguinte, e o dia selecionado volta pro primeiro (Segunda) dessa nova semana. Clique `‹` duas vezes — volta pra semana anterior à original. Escolha "Sáb" e confirme que aparece nas opções com a data certa.

- [ ] **Step 3: Commit**

```bash
git add cliniflow-export/patients-components.jsx cliniflow-export/Cliniflow.html
git commit -m "Nova consulta ganha navegacao de semana propria e sabado no seletor de dia"
```

---

## Task 3: `addAppt` consome data absoluta e pula a agenda pra semana certa

**Files:**
- Modify: `cliniflow-export/Cliniflow.html` (`addAppt`, dentro de `App`)

**Interfaces:**
- Consumes: o objeto `a` passado por `NewAppointmentModal.save()` (Tarefa 2) — agora tem `a.data` (`Date` absoluto) no lugar de `a.day` (índice).
- Produces: nenhuma interface nova exposta — `addAppt` continua sendo passado como `onSave` pro `NewAppointmentModal` sem mudar de nome.

### 3.1 — Helper `mondayOf`

- [ ] **Step 1**

Em `Cliniflow.html`, logo antes da definição de `addAppt` (mesmo escopo da função `App`, ou como função top-level do mesmo `<script>` — qualquer um dos dois funciona; escolha o que ficar mais perto de `addAppt` no arquivo pra facilitar leitura), adicione:
```js
      // Segunda-feira da semana que contém `date`. Mesma fórmula que já
      // aparece em getDayOptions/todayCol — não unificada aqui de propósito
      // (cada arquivo mantém a sua cópia; ver spec §4.4).
      function mondayOf(date) {
        const d = new Date(date);
        d.setHours(0, 0, 0, 0);
        d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
        return d;
      }
```

### 3.2 — Reescrever `addAppt`

- [ ] **Step 1**

Encontre:
```js
      const addAppt = useCallback(async (a) => {
        if (dbConnected) {
          // Calculate real datetime from currentMonday
          const targetDate = new Date(currentMonday);
          targetDate.setDate(currentMonday.getDate() + parseInt(a.day));
          const [h, m] = a.time.split(':').map(Number);
          targetDate.setHours(h, m, 0, 0);

          // Find patient by name to get ID
          const pat = patients.find(p => p.name === a.patient || p.id === a.patientId);

          const statusMap = { confirmed: 'confirmado', pending: 'pendente', rescheduled: 'remarcado', canceled: 'cancelado', solicitado: 'solicitado' };
          const res = await SB.createConsulta({
            patient_id: pat?.id || null,
            data_hora: targetDate.toISOString(),
            duracao_min: a.dur,
            tipo: a.type,
            medico: a.doctor,
            status: statusMap[a.status] || 'pendente',
            whatsapp_ativo: a.wa,
            preco: a.preco,
          });
          if (res.data) {
            setAppts(prev => [...prev, SB.consultaToAppointment(res.data, currentMonday)]);
            return;
          }
        }
        // Fallback: add locally
        setAppts(prev => [...prev, a]);
      }, [dbConnected, patients, currentMonday]);
```
Substitua por:
```js
      const addAppt = useCallback(async (a) => {
        const targetMonday = mondayOf(a.data);
        const diaSemHora = new Date(a.data.getFullYear(), a.data.getMonth(), a.data.getDate());
        const dayIndex = Math.round((diaSemHora - targetMonday) / 86400000); // 0=Seg ... 5=Sáb

        if (dbConnected) {
          // Find patient by name to get ID
          const pat = patients.find(p => p.name === a.patient || p.id === a.patientId);

          const statusMap = { confirmed: 'confirmado', pending: 'pendente', rescheduled: 'remarcado', canceled: 'cancelado', solicitado: 'solicitado' };
          const res = await SB.createConsulta({
            patient_id: pat?.id || null,
            data_hora: a.data.toISOString(),
            duracao_min: a.dur,
            tipo: a.type,
            medico: a.doctor,
            status: statusMap[a.status] || 'pendente',
            whatsapp_ativo: a.wa,
            preco: a.preco,
          });
          if (res.data) {
            setCurrentMonday(targetMonday);
            setAppts(prev => [...prev, SB.consultaToAppointment(res.data, targetMonday)]);
            return;
          }
        }
        // Fallback: modo demonstração (sem Supabase) — grava local com o
        // `day` já calculado pra semana certa, e pula a agenda pra lá.
        setCurrentMonday(targetMonday);
        setAppts(prev => [...prev, { ...a, day: dayIndex }]);
      }, [dbConnected, patients]);
```

(`currentMonday`/`setCurrentMonday` — `Cliniflow.html:185`, `const [currentMonday, setCurrentMonday] = useState(...)` — já existe com esse nome exato, confirmado ao escrever este plano.)

### 3.3 — Verificar, commit

- [ ] **Step 1: Passagem visual — caso simples (mesma semana)**

Cópia de teste, hard-reload. Abra "Nova consulta" sem trocar de semana, agende pra hoje ou outro dia da semana atual, salve. A consulta aparece na agenda, no dia certo, sem a tela pular de lugar.

- [ ] **Step 2: Passagem visual — caso que exercita o pulo de semana**

Abra "Nova consulta", clique `›` (próxima semana) duas vezes, escolha um dia (inclusive teste "Sáb"), salve. Confirme: a agenda muda sozinha pra mostrar a semana escolhida, e a consulta aparece no dia certo dessa semana, na visão calendário e na visão lista.

- [ ] **Step 3: Console sem erros nos dois casos, depois commit**

```bash
git add cliniflow-export/Cliniflow.html
git commit -m "addAppt aceita data absoluta e pula a agenda pra semana da nova consulta"
```

---

## Task 4: Configurações mais profissional

**Files:**
- Modify: `cliniflow-export/Cliniflow.html` (`SettingsModal`, e um componente novo `ToggleSwitch` definido perto dela)

**Interfaces:**
- Consumes: `Modal` (de `patients-components.jsx`, mesmo padrão de reaproveitamento cross-file já usado nesta sessão), `ACCENT_MAP` (já existe em `Cliniflow.html`).
- Produces: `ToggleSwitch({ checked, onChange, accent })` — usado só dentro de `SettingsModal` nesta tarefa, mas fica disponível globalmente (mesmo padrão de `NavBtn`) se algum dia outra tela precisar de um toggle.

### 4.1 — Componente `ToggleSwitch`

- [ ] **Step 1**

Em `Cliniflow.html`, logo antes da definição de `SettingsModal`, adicione:
```js
    function ToggleSwitch({ checked, onChange, accent }) {
      return (
        <button
          type="button"
          onClick={() => onChange(!checked)}
          style={{
            width:34, height:20, borderRadius:10, padding:2, border:'none', cursor:'pointer',
            background: checked ? accent : 'var(--supabase-bg-hover)',
            display:'flex', justifyContent: checked ? 'flex-end' : 'flex-start',
            transition:'background .15s var(--ease-premium)', flexShrink:0,
          }}
        >
          <span style={{
            width:16, height:16, borderRadius:'50%', background:'#fff',
            boxShadow:'var(--shadow-sm)', display:'block',
            transition:'transform .15s var(--ease-premium)',
          }} />
        </button>
      );
    }

```

### 4.2 — Ícones das 3 seções

- [ ] **Step 1**

Ainda antes de `SettingsModal` (pode ficar logo depois de `ToggleSwitch`), adicione três componentes de ícone, no mesmo estilo de `WaIcon` (`cliniflow-components.jsx:131-137`) — `<svg viewBox="0 0 24 24">` com um único `<path>`:
```js
    function ThemeIcon({ size=15, color }) {
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill={color} style={{flexShrink:0}}>
          <path d="M12 3a9 9 0 1 0 9 9c0-.46-.04-.92-.1-1.36a5.389 5.389 0 0 1-4.4 2.26 5.403 5.403 0 0 1-3.14-9.8c-.44-.06-.9-.1-1.36-.1z" />
        </svg>
      );
    }
    function PaletteIcon({ size=15, color }) {
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill={color} style={{flexShrink:0}}>
          <path d="M12 2C6.49 2 2 6.49 2 12s4.49 10 10 10c1.38 0 2.5-1.12 2.5-2.5 0-.61-.23-1.2-.64-1.67-.08-.09-.13-.21-.13-.33 0-.28.22-.5.5-.5H16c3.31 0 6-2.69 6-6 0-4.96-4.49-9-10-9zm5.5 11c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5zm-3-4C13.67 9 13 8.33 13 7.5S13.67 6 14.5 6s1.5.67 1.5 1.5S15.33 9 14.5 9zm-5 0C8.67 9 8 8.33 8 7.5S8.67 6 9.5 6s1.5.67 1.5 1.5S10.33 9 9.5 9zm-3 4C5.67 13 5 12.33 5 11.5S5.67 10 6.5 10s1.5.67 1.5 1.5S7.33 13 6.5 13z" />
        </svg>
      );
    }
    function ProfissionaisIcon({ size=15, color }) {
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill={color} style={{flexShrink:0}}>
          <path d="M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5c-1.66 0-3 1.34-3 3s1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5C6.34 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z" />
        </svg>
      );
    }

```
(Paths do Material Design, domínio público — mesmo tipo de ícone já usado em várias telas de produto; não introduz dependência nova, é só `<path>` estático.)

### 4.3 — Reescrever `SettingsModal`

- [ ] **Step 1**

Encontre o corpo inteiro de `SettingsModal`:
```js
    function SettingsModal({ theme, accentKey, onSetTheme, onSetAccent, accent, onClose, profissionais = [], onAddProfissional, onToggleProfissionalAtivo }) {
      const [novoNome, setNovoNome] = useState('');

      useEffect(() => {
        const h = e => e.key === 'Escape' && onClose();
        window.addEventListener('keydown', h);
        return () => window.removeEventListener('keydown', h);
      }, [onClose]);

      const optBtn = (active) => ({
        flex:1, padding:'8px 10px', borderRadius:6, cursor:'pointer',
        background: active ? `${accent}18` : 'var(--supabase-bg-input)',
        border: `1px solid ${active ? accent : 'var(--supabase-border)'}`,
        color: active ? accent : 'var(--supabase-text-muted)',
        fontSize:12.5, fontWeight: active ? 600 : 500,
      });

      const handleAdd = (e) => {
        e.preventDefault();
        if (novoNome.trim() && onAddProfissional) {
          onAddProfissional(novoNome.trim());
          setNovoNome('');
        }
      };

      return (
        <div onClick={onClose} style={{
          position:'fixed', inset:0, zIndex:1000,
          background:'rgba(0,0,0,0.62)', backdropFilter:'blur(3px)',
          display:'flex', alignItems:'center', justifyContent:'center',
          animation:'fadeIn .2s var(--ease-premium)',
        }}>
          <div onClick={e => e.stopPropagation()} style={{
            width:420, maxWidth:'94vw', maxHeight:'90vh', padding:22, borderRadius:12,
            background:'var(--supabase-bg-card)',
            border:'1px solid var(--supabase-border)',
            boxShadow:'var(--shadow-lg)',
            animation:'slideUp .25s var(--ease-premium)',
            display:'flex', flexDirection:'column', gap:18,
            overflowY:'auto',
          }}>
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
              <span style={{ fontSize:15, fontWeight:600, color:'var(--supabase-text)' }}>Configurações</span>
              <button onClick={onClose} style={{
                background:'none', border:'none', color:'var(--supabase-text-muted)', cursor:'pointer',
                width:24, height:24, borderRadius:4, fontSize:18, lineHeight:'24px',
              }}>×</button>
            </div>

            <div>
              <div style={{ fontSize:11, fontWeight:600, color:'var(--supabase-text-muted)',
                textTransform:'uppercase', letterSpacing:.7, marginBottom:8 }}>Tema</div>
              <div style={{ display:'flex', gap:8 }}>
                <button style={optBtn(theme === 'dark')} onClick={() => onSetTheme('dark')}>🌙 Escuro</button>
                <button style={optBtn(theme === 'light')} onClick={() => onSetTheme('light')}>☀️ Claro</button>
              </div>
            </div>

            <div>
              <div style={{ fontSize:11, fontWeight:600, color:'var(--supabase-text-muted)',
                textTransform:'uppercase', letterSpacing:.7, marginBottom:8 }}>Cor de destaque</div>
              <div style={{ display:'flex', gap:8 }}>
                {Object.entries(ACCENT_MAP).map(([key, hex]) => (
                  <button key={key} title={key} onClick={() => onSetAccent(key)} style={{
                    width:34, height:34, borderRadius:'50%', cursor:'pointer',
                    background:hex,
                    border: accentKey === key ? '2px solid var(--supabase-text)' : '2px solid transparent',
                    outline: accentKey === key ? `2px solid ${hex}55` : 'none',
                  }} />
                ))}
              </div>
            </div>

            <div style={{ borderTop:'1px solid var(--supabase-border)', paddingTop:16 }}>
              <div style={{ fontSize:11, fontWeight:600, color:'var(--supabase-text-muted)',
                textTransform:'uppercase', letterSpacing:.7, marginBottom:8, display:'flex', alignItems:'center', justifyContent:'space-between' }}>
                <span>Profissionais</span>
                <span style={{ fontSize:10, textTransform:'none', fontWeight:400, color:'var(--supabase-icon-inactive)' }}>
                  {profissionais.filter(p => p.ativo).length} ativo(s)
                </span>
              </div>

              <div style={{ maxHeight:160, overflowY:'auto', display:'flex', flexDirection:'column', gap:6, marginBottom:8 }}>
                {profissionais.length === 0 ? (
                  <div style={{
                    fontSize:12, color:'var(--supabase-text-muted)', padding:'12px',
                    background:'var(--supabase-bg-input)', border:'1px solid var(--supabase-border)',
                    borderRadius:'var(--radius-studio)', textAlign:'center',
                  }}>
                    Nenhum profissional cadastrado.
                  </div>
                ) : (
                  profissionais.map(p => (
                    <div key={p.id} style={{
                      display:'flex', alignItems:'center', justifyContent:'space-between',
                      padding:'6px 10px', background:'var(--supabase-bg-input)',
                      border:'1px solid var(--supabase-border)', borderRadius:'var(--radius-studio)',
                    }}>
                      <div style={{ display:'flex', alignItems:'center', gap:8, minWidth:0, flex:1 }}>
                        <span style={{
                          width:7, height:7, borderRadius:'50%', flexShrink:0,
                          background: p.ativo ? '#3ecf8e' : 'var(--supabase-text-muted)',
                        }} />
                        <span style={{
                          fontSize:12.5, fontWeight:500,
                          color: p.ativo ? 'var(--supabase-text)' : 'var(--supabase-text-muted)',
                          textDecoration: p.ativo ? 'none' : 'line-through',
                          whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis',
                        }}>{p.nome}</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => onToggleProfissionalAtivo && onToggleProfissionalAtivo(p.id, !p.ativo)}
                        style={{
                          padding:'3px 8px', borderRadius:4, cursor:'pointer',
                          background: p.ativo ? 'rgba(239, 68, 68, 0.08)' : `${accent}15`,
                          border: `1px solid ${p.ativo ? 'rgba(239, 68, 68, 0.25)' : accent + '40'}`,
                          color: p.ativo ? '#ef4444' : accent,
                          fontSize:11, fontWeight:600, flexShrink:0,
                        }}
                      >
                        {p.ativo ? 'Desativar' : 'Ativar'}
                      </button>
                    </div>
                  ))
                )}
              </div>

              <form onSubmit={handleAdd} style={{ display:'flex', gap:6, marginTop:6 }}>
                <input
                  type="text"
                  value={novoNome}
                  onChange={e => setNovoNome(e.target.value)}
                  placeholder="Nome do profissional (ex: Dra. Ana)"
                  style={{
                    flex:1, padding:'7px 10px', fontSize:12,
                    background:'var(--supabase-bg-input)', border:'1px solid var(--supabase-border)',
                    borderRadius:'var(--radius-studio)', color:'var(--supabase-text)', outline:'none',
                  }}
                />
                <button
                  type="submit"
                  disabled={!novoNome.trim()}
                  style={{
                    padding:'7px 12px', borderRadius:'var(--radius-studio)',
                    background: novoNome.trim() ? accent : 'var(--supabase-bg-hover)',
                    border:'none', color: novoNome.trim() ? '#000' : 'var(--supabase-icon-inactive)',
                    fontSize:12, fontWeight:600, cursor: novoNome.trim() ? 'pointer' : 'not-allowed',
                    flexShrink:0,
                  }}
                >
                  Adicionar
                </button>
              </form>
            </div>
          </div>
        </div>
      );
    }
```
Substitua o corpo inteiro por (usa `Modal` compartilhado no lugar do overlay próprio — perde o `useEffect` de `Escape` e o botão `×` manual, porque `Modal` já cobre os dois; ganha ícone por seção e `ToggleSwitch` no lugar do botão de texto):
```js
    function SettingsModal({ theme, accentKey, onSetTheme, onSetAccent, accent, onClose, profissionais = [], onAddProfissional, onToggleProfissionalAtivo }) {
      const [novoNome, setNovoNome] = useState('');

      const optBtn = (active) => ({
        flex:1, padding:'8px 10px', borderRadius:6, cursor:'pointer',
        background: active ? `${accent}18` : 'var(--supabase-bg-input)',
        border: `1px solid ${active ? accent : 'var(--supabase-border)'}`,
        color: active ? accent : 'var(--supabase-text-muted)',
        fontSize:12.5, fontWeight: active ? 600 : 500,
      });

      const sectionLabelStyle = {
        fontSize:11, fontWeight:600, color:'var(--supabase-text-muted)',
        textTransform:'uppercase', letterSpacing:.7, marginBottom:8,
        display:'flex', alignItems:'center', gap:6,
      };

      const handleAdd = (e) => {
        e.preventDefault();
        if (novoNome.trim() && onAddProfissional) {
          onAddProfissional(novoNome.trim());
          setNovoNome('');
        }
      };

      return (
        <Modal title="Configurações" onClose={onClose} accent={accent} width={420}>
          <div style={{ padding:'18px', display:'flex', flexDirection:'column', gap:18 }}>
            <div>
              <div style={sectionLabelStyle}>
                <ThemeIcon color="var(--supabase-text-muted)" />
                <span>Tema</span>
              </div>
              <div style={{ display:'flex', gap:8 }}>
                <button style={optBtn(theme === 'dark')} onClick={() => onSetTheme('dark')}>Escuro</button>
                <button style={optBtn(theme === 'light')} onClick={() => onSetTheme('light')}>Claro</button>
              </div>
            </div>

            <div>
              <div style={sectionLabelStyle}>
                <PaletteIcon color="var(--supabase-text-muted)" />
                <span>Cor de destaque</span>
              </div>
              <div style={{ display:'flex', gap:8 }}>
                {Object.entries(ACCENT_MAP).map(([key, hex]) => (
                  <button key={key} title={key} onClick={() => onSetAccent(key)} style={{
                    width:34, height:34, borderRadius:'50%', cursor:'pointer',
                    background:hex,
                    border: accentKey === key ? '2px solid var(--supabase-text)' : '2px solid transparent',
                    outline: accentKey === key ? `2px solid ${hex}55` : 'none',
                  }} />
                ))}
              </div>
            </div>

            <div style={{ borderTop:'1px solid var(--supabase-border)', paddingTop:16 }}>
              <div style={{ ...sectionLabelStyle, justifyContent:'space-between' }}>
                <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                  <ProfissionaisIcon color="var(--supabase-text-muted)" />
                  <span>Profissionais</span>
                </div>
                <span style={{ fontSize:10, textTransform:'none', fontWeight:400, color:'var(--supabase-icon-inactive)' }}>
                  {profissionais.filter(p => p.ativo).length} ativo(s)
                </span>
              </div>

              <div style={{ maxHeight:160, overflowY:'auto', display:'flex', flexDirection:'column', gap:6, marginBottom:8 }}>
                {profissionais.length === 0 ? (
                  <div style={{
                    fontSize:12, color:'var(--supabase-text-muted)', padding:'12px',
                    background:'var(--supabase-bg-input)', border:'1px solid var(--supabase-border)',
                    borderRadius:'var(--radius-studio)', textAlign:'center',
                  }}>
                    Nenhum profissional cadastrado.
                  </div>
                ) : (
                  profissionais.map(p => (
                    <div key={p.id} style={{
                      display:'flex', alignItems:'center', justifyContent:'space-between',
                      padding:'6px 10px', background:'var(--supabase-bg-input)',
                      border:'1px solid var(--supabase-border)', borderRadius:'var(--radius-studio)',
                    }}>
                      <div style={{ display:'flex', alignItems:'center', gap:8, minWidth:0, flex:1 }}>
                        <span style={{
                          width:7, height:7, borderRadius:'50%', flexShrink:0,
                          background: p.ativo ? '#3ecf8e' : 'var(--supabase-text-muted)',
                        }} />
                        <span style={{
                          fontSize:12.5, fontWeight:500,
                          color: p.ativo ? 'var(--supabase-text)' : 'var(--supabase-text-muted)',
                          textDecoration: p.ativo ? 'none' : 'line-through',
                          whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis',
                        }}>{p.nome}</span>
                      </div>
                      <ToggleSwitch
                        checked={p.ativo}
                        accent={accent}
                        onChange={v => onToggleProfissionalAtivo && onToggleProfissionalAtivo(p.id, v)}
                      />
                    </div>
                  ))
                )}
              </div>

              <form onSubmit={handleAdd} style={{ display:'flex', gap:6, marginTop:6 }}>
                <input
                  type="text"
                  value={novoNome}
                  onChange={e => setNovoNome(e.target.value)}
                  placeholder="Nome do profissional (ex: Dra. Ana)"
                  style={{
                    flex:1, padding:'7px 10px', fontSize:12,
                    background:'var(--supabase-bg-input)', border:'1px solid var(--supabase-border)',
                    borderRadius:'var(--radius-studio)', color:'var(--supabase-text)', outline:'none',
                  }}
                />
                <button
                  type="submit"
                  disabled={!novoNome.trim()}
                  style={{
                    padding:'7px 12px', borderRadius:'var(--radius-studio)',
                    background: novoNome.trim() ? accent : 'var(--supabase-bg-hover)',
                    border:'none', color: novoNome.trim() ? '#000' : 'var(--supabase-icon-inactive)',
                    fontSize:12, fontWeight:600, cursor: novoNome.trim() ? 'pointer' : 'not-allowed',
                    flexShrink:0,
                  }}
                >
                  Adicionar
                </button>
              </form>
            </div>
          </div>
        </Modal>
      );
    }
```

**Nota sobre a remoção do `useEffect` de `Escape`:** o `Modal` compartilhado (`patients-components.jsx:71-76`) já registra o próprio listener de `Escape` — manter o de `SettingsModal` duplicaria o comportamento (inofensivo, mas redundante) e, pior, o `useEffect` removido dependia de `onClose` — como a versão nova não usa mais esse efeito, `useEffect` deixa de ser necessário no import do topo do arquivo (mas `useEffect` é usado em outros componentes do mesmo arquivo — **não remova o import**, só o uso local).

### 4.4 — Verificar, commit

- [ ] **Step 1: Passagem visual**

Cópia de teste, hard-reload, console sem erros. Abra Configurações pela sidebar: confirme que abre com a mesma animação dos outros modais (fade + slide up), tecla `Escape` fecha, clique fora fecha. Confirme os 3 ícones aparecem ao lado de Tema/Cor/Profissionais. Adicione um profissional de teste, confirme que o switch aparece ligado (cor de destaque) e clique nele — desliga (cinza) e o nome ganha risco. Teste nos dois temas.

- [ ] **Step 2: Commit**

```bash
git add cliniflow-export/Cliniflow.html
git commit -m "Configuracoes reescrita: reaproveita Modal compartilhado, icones por secao e toggle switch"
```

---

## Task 5: Verificação final cross-file e fechamento

**Files:**
- Modify: `AGENTS.md` (raiz do projeto)

**Interfaces:**
- Consumes: tudo das Tarefas 1-4.
- Produces: nenhuma — última tarefa do plano.

- [ ] **Step 1: Passagem visual completa, cópia de teste recém-copiada**

Nos dois temas: Agenda em calendário (6 colunas, sábado incluso), lista, kanban. Abra "Nova consulta", navegue 2 semanas pra frente, agende num sábado, confirme que a agenda pula pra lá e a consulta aparece certa. Abra Configurações, confirme ícones/switch/animação. Console sem erros em nenhuma tela, em nenhum tema.

- [ ] **Step 2: Atualizar `AGENTS.md`**

Leia o arquivo inteiro primeiro (`git log -p -1 -- AGENTS.md` ou `cat AGENTS.md`) — outro agente pode ter mexido nele desde a redação deste plano. Adicione uma entrada em "Estado atual" registrando: sábado virou dia útil na agenda (grade, rótulo de semana, bot de triagem), Nova Consulta ganhou navegação de semana própria, Configurações foi reescrita (Modal compartilhado, ícones, toggle switch) — cite `docs/superpowers/specs/2026-08-15-sabado-data-livre-e-configuracoes-design.md`. Deixe explícito que a verificação foi manual via Browser MCP em modo demonstração, seguindo o padrão de honestidade já estabelecido nas entradas anteriores. **Se o arquivo já estiver no teto de linhas** (confira a nota no final da seção "Regras para agentes"), condense uma entrada mais antiga de "Estado atual" pra abrir espaço, do jeito que a sessão anterior já fez — não pule esse passo só porque está cheio.

- [ ] **Step 3: Commit final**

```bash
git add AGENTS.md
git commit -m "Fecha o plano de sabado, data livre na Nova Consulta e Configuracoes"
```

---

## Cobertura do spec

| Seção do spec (`2026-08-15-sabado-data-livre-e-configuracoes-design.md`) | Tarefa(s) |
|---|---|
| §3 Sábado na agenda (grade, hoje, rótulo, bot) | Tarefa 1 |
| §4 Nova Consulta: cursor de semana + data absoluta | Tarefas 2, 3 |
| §5 Configurações mais profissional | Tarefa 4 |
| §6 Verificação | Receita usada em toda tarefa + Tarefa 5 |
