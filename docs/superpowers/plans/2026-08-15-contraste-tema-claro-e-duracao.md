# Contraste do Tema Claro e Duração Editável — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Corrigir os pontos de contraste ruim do tema claro do Cliniflow (cores esquecidas na migração de 05/08, tom de status fraco, linhas do calendário, camadas de fundo muito próximas do branco, destaque de "hoje" invisível) e tornar a duração da consulta editável pelo card de detalhes.

**Architecture:** React 18 (UMD) + Babel standalone via CDN, sem build step, `style` inline lendo `var(--supabase-*)` de um `:root`/`:root[data-theme="light"]` central em `Cliniflow.html` — mesma arquitetura do trabalho de 05/08. Nenhuma dependência nova.

**Tech Stack:** React 18.3.1 (CDN), Babel standalone 7.29, CSS custom properties.

## Global Constraints

- Sem build step: os 3 arquivos tocados (`Cliniflow.html`, `cliniflow-components.jsx`, `patients-components.jsx`) continuam sendo servidos como `<script type="text/babel" src="...">`.
- Sem framework de teste automatizado. Verificação é manual — receita abaixo, usada em toda tarefa.
- **Nunca** editar `cliniflow-export/config.js` de produção nem abrir o app contra o Supabase real durante este trabalho. Todo teste usa cópia isolada com config vazio (modo demonstração).
- Não é redesign de identidade: mantém `--supabase-brand`, `ACCENT_MAP`, fonte Inter, layout e densidade atuais. Só tokens de cor e os pontos listados no spec mudam.
- **Cache-busting obrigatório:** `Cliniflow.html` carrega `cliniflow-components.jsx?v=10` e `patients-components.jsx?v=8`. Toda tarefa que edita um desses dois arquivos pela última vez termina bumpando o número de versão na tag `<script>` correspondente em `Cliniflow.html` — sem isso o navegador pode servir a versão em cache e a mudança parece "não aplicada". Confirmado como convenção deste projeto (`git log -p -- Cliniflow.html`: todo commit que mexeu num `.jsx` bumpou o `?v=`).
- **Armadilha a respeitar:** várias cores em `cliniflow-components.jsx` são consumidas via concatenação de string tipo `` `${cor}18` `` (hex + sufixo de alfa). **Nunca troque uma dessas variáveis por `var(--algo)`** — vira CSS inválido. Nenhuma tarefa deste plano mexe nesse padrão (confirmado abaixo, tarefa por tarefa), mas se durante a implementação aparecer uma cor fixa não listada aqui dentro desse padrão, não mexa nela — está fora do escopo deste plano.

## Receita de verificação (usada em toda tarefa)

Cópia isolada para testar em modo demonstração, sem tocar nos arquivos reais nem no `config.js` de produção:

```bash
SCRATCH=/tmp/cliniflow-demo-check   # troque por um diretório local seu, fora do repo
mkdir -p "$SCRATCH"
cp cliniflow-export/Cliniflow.html cliniflow-export/*.jsx cliniflow-export/supabase.js "$SCRATCH/"
echo "window.CLINIFLOW_CONFIG = { supabaseUrl: '', supabaseAnonKey: '', n8nBaseUrl: '', n8nWebhookToken: '' };" > "$SCRATCH/config.js"
cd "$SCRATCH" && python -m http.server 3009
```

Abra `http://localhost:3009/Cliniflow.html`. O app sobe em "Modo demonstração" com dados fake (`APPOINTMENTS`/`PATIENTS`), sem tocar dado real. O `TweaksPanel` (ícone de engrenagem) tem o toggle `theme: dark/light`.

Cada tarefa termina com:
1. `node --check <arquivo.jsx>` (garante que a sintaxe transpila; para `Cliniflow.html` a verificação é o próprio carregamento no navegador — se o Babel falhar ao transpilar, o console mostra o erro).
2. Recarregar a cópia de teste (hard-reload, `Ctrl+Shift+R`, já que estamos mexendo em cache-busting), console sem erros.
3. Alternar `dark`/`light` no `TweaksPanel` e revisar visualmente a área afetada nos dois temas.

---

## Task 1: Tokens de tema em `Cliniflow.html`

**Files:**
- Modify: `cliniflow-export/Cliniflow.html:24-70` (bloco `<style>`, `:root` e `:root[data-theme="light"]`)

**Interfaces:**
- Produces: token novo `--supabase-border-strong` (dois temas) e valores reajustados de `--supabase-bg-main`, `--supabase-bg-studio`, `--supabase-border`, `--supabase-bg-hover`, `--supabase-bg-input` no tema claro — consumidos pelas Tarefas 2 e 3.

- [ ] **Step 1: Adicionar `--supabase-border-strong` nos dois temas**

Em `Cliniflow.html`, no bloco `:root { ... }`, encontre a última linha do bloco (linha 52):
```css
      --supabase-icon-inactive: #3a3a3a;
```
Adicione logo depois, ainda dentro de `:root { ... }`:
```css
      --supabase-border-strong: #3d3d3d;
```

No bloco `:root[data-theme="light"] { ... }`, encontre a última linha (linha 69):
```css
      --supabase-icon-inactive: #aeb4bd;
```
Adicione logo depois, ainda dentro do bloco:
```css
      --supabase-border-strong: #c8ccd2;
```

- [ ] **Step 2: Reajustar as camadas de fundo do tema claro**

Encontre, em `:root[data-theme="light"]` (linhas 55-69):
```css
    :root[data-theme="light"] {
      --supabase-bg-main: #fbfcfd;
      --supabase-bg-studio: #f4f5f7;
      --supabase-bg-card: #ffffff;
      --supabase-border: #e6e8eb;
      --supabase-text: #1f2937;
      --supabase-text-light: #4b5563;
      --supabase-text-muted: #8c92a0;

      --shadow-sm: 0 1px 2px rgba(15,23,42,0.06);
      --shadow-md: 0 8px 24px -8px rgba(15,23,42,0.12), 0 1px 2px rgba(15,23,42,0.05);
      --shadow-lg: 0 24px 56px -20px rgba(15,23,42,0.2);
      --shadow-brand: 0 0 0 3px rgba(62,207,142,0.18);
      --supabase-bg-hover: #f1f3f5;
      --supabase-bg-input: #f8f9fa;
      --supabase-icon-inactive: #aeb4bd;
      --supabase-border-strong: #c8ccd2;
    }
```
Substitua por (só os 5 valores de fundo/borda mudam — `bg-card`, textos e sombras ficam como estavam):
```css
    :root[data-theme="light"] {
      --supabase-bg-main: #f3f4f6;
      --supabase-bg-studio: #e9ebef;
      --supabase-bg-card: #ffffff;
      --supabase-border: #d8dce1;
      --supabase-text: #1f2937;
      --supabase-text-light: #4b5563;
      --supabase-text-muted: #8c92a0;

      --shadow-sm: 0 1px 2px rgba(15,23,42,0.06);
      --shadow-md: 0 8px 24px -8px rgba(15,23,42,0.12), 0 1px 2px rgba(15,23,42,0.05);
      --shadow-lg: 0 24px 56px -20px rgba(15,23,42,0.2);
      --shadow-brand: 0 0 0 3px rgba(62,207,142,0.18);
      --supabase-bg-hover: #eceef1;
      --supabase-bg-input: #eef0f2;
      --supabase-icon-inactive: #aeb4bd;
      --supabase-border-strong: #c8ccd2;
    }
```

- [ ] **Step 3: Verificar que os tokens resolvem nos dois temas**

Suba a cópia de teste (receita acima) e rode no console do navegador:
```js
document.documentElement.setAttribute('data-theme','light');
getComputedStyle(document.documentElement).getPropertyValue('--supabase-border-strong'); // " #c8ccd2"
getComputedStyle(document.documentElement).getPropertyValue('--supabase-bg-main');        // " #f3f4f6"
document.documentElement.removeAttribute('data-theme');
getComputedStyle(document.documentElement).getPropertyValue('--supabase-border-strong'); // " #3d3d3d"
getComputedStyle(document.documentElement).getPropertyValue('--supabase-bg-main');        // " #171717" (inalterado)
```
Expected: valores batem com o escrito acima, sem erro no console.

- [ ] **Step 4: Passagem visual rápida**

No `TweaksPanel`, alterne para tema claro. A Agenda em modo lista deve estar visivelmente menos "tudo branco" que antes (o Sidebar/painéis agora têm um cinza perceptível contra o card branco) — isso é esperado nesta tarefa; as cores de texto que ainda estão erradas (Tarefas 2 e 3) continuam erradas até lá, não é regressão desta tarefa.

- [ ] **Step 5: Commit**

```bash
git add cliniflow-export/Cliniflow.html
git commit -m "Tema claro: novo token de borda forte e camadas de fundo mais separadas"
```

---

## Task 2: `cliniflow-components.jsx` — cores esquecidas, status, grade do calendário e destaque de hoje

**Files:**
- Modify: `cliniflow-export/cliniflow-components.jsx` (linhas 40, 44, 190, 635, 643, 650, 636)

**Interfaces:**
- Consumes: `--supabase-border-strong` (Tarefa 1).
- Produces: nenhuma interface nova — `STATUS_CFG` continua com o mesmo formato (`{label, color, bg}`).

### 2.1 — Logo da sidebar

- [ ] **Step 1**

Encontre (linha 190):
```js
        <span style={{ fontSize:15, fontWeight:600, color:'#efefef', letterSpacing:-.4 }}>Cliniflow</span>
```
Substitua por:
```js
        <span style={{ fontSize:15, fontWeight:600, color:'var(--supabase-text-light)', letterSpacing:-.4 }}>Cliniflow</span>
```

### 2.2 — `STATUS_CFG.pending`/`recusado`

- [ ] **Step 1**

Encontre (linhas 38-45):
```js
const STATUS_CFG = {
  confirmed: { label:'Confirmado', color:'#3ecf8e', bg:'rgba(62,207,142,0.10)' },
  pending:   { label:'Pendente',   color:'#9ca3af', bg:'rgba(156,163,175,0.10)' },
  rescheduled: { label:'Solicitado reagendamento', color:'#f59e0b', bg:'rgba(245,158,11,0.10)' },
  canceled:  { label:'Cancelado',  color:'#ef4444', bg:'rgba(239,68,68,0.10)'  },
  solicitado: { label:'Solicitado', color:'#a855f7', bg:'rgba(168, 85, 247, 0.10)' },
  recusado:  { label:'Recusado',   color:'#6b7280', bg:'rgba(107,114,128,0.10)' },
};
```
Substitua por (só `pending`/`recusado` mudam de valor; os outros quatro ficam idênticos):
```js
const STATUS_CFG = {
  confirmed: { label:'Confirmado', color:'#3ecf8e', bg:'rgba(62,207,142,0.10)' },
  pending:   { label:'Pendente',   color:'#6b7280', bg:'rgba(156,163,175,0.14)' },
  rescheduled: { label:'Solicitado reagendamento', color:'#f59e0b', bg:'rgba(245,158,11,0.10)' },
  canceled:  { label:'Cancelado',  color:'#ef4444', bg:'rgba(239,68,68,0.10)'  },
  solicitado: { label:'Solicitado', color:'#a855f7', bg:'rgba(168, 85, 247, 0.10)' },
  recusado:  { label:'Recusado',   color:'#4b5563', bg:'rgba(107,114,128,0.14)' },
};
```

### 2.3 — Linhas de grade do calendário

- [ ] **Step 1: Borda da coluna de dia**

Encontre (por volta da linha 635, dentro do `.map` de `visibleDays` na grade rolável — **não** confundir com a linha 583, que é a borda do cabeçalho de dia, fora de escopo):
```js
                  position:'relative',
                  height: totalH,
                  borderLeft:'1px solid var(--supabase-border)',
                  background: isToday ? 'rgba(255,255,255,0.012)' : 'transparent',
```
Substitua por (a troca de borda E o destaque de hoje, seção 2.4, ficam na mesma edição pois são linhas adjacentes):
```js
                  position:'relative',
                  height: totalH,
                  borderLeft:'1px solid var(--supabase-border-strong)',
                  background: isToday ? `${accent}0d` : 'transparent',
```

- [ ] **Step 2: Linha de cada hora**

Encontre (linha 643):
```js
                    position:'absolute', left:0, right:0, top: i * slotH,
                    borderTop:'1px solid var(--supabase-border)',
```
Substitua por:
```js
                    position:'absolute', left:0, right:0, top: i * slotH,
                    borderTop:'1px solid var(--supabase-border-strong)',
```

- [ ] **Step 3: Linha tracejada de meia-hora**

Encontre (linha 650):
```js
                    position:'absolute', left:0, right:0, top: i * slotH + slotH/2,
                    borderTop:'1px dashed var(--supabase-border)',
```
Substitua por:
```js
                    position:'absolute', left:0, right:0, top: i * slotH + slotH/2,
                    borderTop:'1px dashed var(--supabase-border-strong)',
```

### 2.4 — Destaque de "hoje" (já trocado no Step 1 da seção 2.3)

Confirme que a linha `background: isToday ? \`${accent}0d\` : 'transparent',` ficou correta — é o mesmo padrão `${accent}NN` já usado em outros pontos deste arquivo (ex.: `SidebarItem`), então **não** é uma variável `var()` (respeitaria a armadilha de concatenação mesmo se fosse, mas aqui nem se aplica: `accent` já é uma string hex vinda de `ACCENT_MAP`).

### 2.5 — Verificar, `node --check`, bump de versão, commit

- [ ] **Step 1: `node --check`**
```bash
node --check cliniflow-export/cliniflow-components.jsx
```
Expected: sem output.

- [ ] **Step 2: Bump de versão em `Cliniflow.html`**

Este arquivo ainda será tocado na Tarefa 4 (duração editável) — o bump de `?v=` para `cliniflow-components.jsx` fica para o fim da Tarefa 4, não aqui, para não bumpar duas vezes. **Pule este step nesta tarefa.** (O `?v=` só importa para cache de navegador contra o servidor real; localmente um hard-reload no Step 3 já garante que o teste é fiel ao arquivo atual.)

- [ ] **Step 3: Passagem visual**

Na cópia de teste, recarregue com hard-reload (`Ctrl+Shift+R`, ignora cache independente do `?v=`) e alterne para tema claro: sidebar mostra "Cliniflow" legível; Agenda em lista, o agendamento "Pendente" tem texto/borda visíveis contra o card branco; Agenda em calendário, as linhas de hora são visíveis e a coluna do dia atual tem um tingimento perceptível da cor de destaque. Repita nos dois temas (escuro não deve ter regredido).

- [ ] **Step 4: Commit**
```bash
git add cliniflow-export/cliniflow-components.jsx
git commit -m "Tema claro: corrige logo da sidebar, status Pendente/Recusado, grade do calendario e destaque de hoje"
```

---

## Task 3: `patients-components.jsx` — cores esquecidas em `NewAppointmentModal`/`PatientPickRow`

**Files:**
- Modify: `cliniflow-export/patients-components.jsx` (linhas 562, 584, 585, 588, 637, 657, 659, 662, 663, 665)
- Modify: `cliniflow-export/Cliniflow.html` (bump de versão, último step)

**Interfaces:**
- Consumes: tokens já existentes (`--supabase-text-light`, `--supabase-text-muted`, `--supabase-icon-inactive`, `--supabase-bg-hover`, `--supabase-border` — nenhum é novo desta tarefa).
- Produces: nenhuma.

- [ ] **Step 1: Busca vazia**

Encontre (linha 562):
```js
                  <div style={{ padding:'14px 12px', fontSize:12, color:'#444', textAlign:'center' }}>
```
Substitua por:
```js
                  <div style={{ padding:'14px 12px', fontSize:12, color:'var(--supabase-icon-inactive)', textAlign:'center' }}>
```

- [ ] **Step 2: Paciente selecionado — nome e telefone/idade**

Encontre (linhas 584-585):
```js
                <div style={{ fontSize:13, fontWeight:500, color:'#e6e6e6' }}>{selectedPatient.name}</div>
                <div style={{ fontSize:11, color:'#555' }}>{formatarTelefone(selectedPatient.phone)} · {selectedPatient.age} anos</div>
```
Substitua por:
```js
                <div style={{ fontSize:13, fontWeight:500, color:'var(--supabase-text-light)' }}>{selectedPatient.name}</div>
                <div style={{ fontSize:11, color:'var(--supabase-text-muted)' }}>{formatarTelefone(selectedPatient.phone)} · {selectedPatient.age} anos</div>
```

- [ ] **Step 3: Botão "Trocar"**

Encontre (linha 588):
```js
                background:'none', border:'none', color:'#666', cursor:'pointer',
```
Substitua por:
```js
                background:'none', border:'none', color:'var(--supabase-text-muted)', cursor:'pointer',
```

- [ ] **Step 4: Label do checkbox de WhatsApp**

Encontre (linha 637):
```js
          <span style={{ fontSize:12.5, color:'#aaa' }}>Enviar lembrete automático via WhatsApp</span>
```
Substitua por:
```js
          <span style={{ fontSize:12.5, color:'var(--supabase-text-light)' }}>Enviar lembrete automático via WhatsApp</span>
```

- [ ] **Step 5: Avatar e textos do `PatientPickRow`**

Encontre (linhas 655-665):
```js
      <div style={{
        width:26, height:26, borderRadius:'50%', flexShrink:0,
        background:'#1c1c1c', border:'1px solid #252525',
        display:'flex', alignItems:'center', justifyContent:'center',
        fontSize:10, fontWeight:600, color:'#888',
      }}>{p.initials}</div>
      <div style={{ flex:1, minWidth:0 }}>
        <div style={{ fontSize:12.5, color:'#ccc', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{p.name}</div>
        <div style={{ fontSize:11, color:'#484848' }}>{formatarTelefone(p.phone)}</div>
      </div>
      <span style={{ fontSize:10.5, color:'#3a3a3a' }}>{p.convenio}</span>
```
Substitua por:
```js
      <div style={{
        width:26, height:26, borderRadius:'50%', flexShrink:0,
        background:'var(--supabase-bg-hover)', border:'1px solid var(--supabase-border)',
        display:'flex', alignItems:'center', justifyContent:'center',
        fontSize:10, fontWeight:600, color:'var(--supabase-text-muted)',
      }}>{p.initials}</div>
      <div style={{ flex:1, minWidth:0 }}>
        <div style={{ fontSize:12.5, color:'var(--supabase-text-light)', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{p.name}</div>
        <div style={{ fontSize:11, color:'var(--supabase-text-muted)' }}>{formatarTelefone(p.phone)}</div>
      </div>
      <span style={{ fontSize:10.5, color:'var(--supabase-icon-inactive)' }}>{p.convenio}</span>
```

- [ ] **Step 6: `node --check`**
```bash
node --check cliniflow-export/patients-components.jsx
```
Expected: sem output.

- [ ] **Step 7: Bump de versão em `Cliniflow.html`**

Encontre:
```html
  <script type="text/babel" src="patients-components.jsx?v=8"></script>
```
Substitua por:
```html
  <script type="text/babel" src="patients-components.jsx?v=9"></script>
```

- [ ] **Step 8: Passagem visual**

Cópia de teste **nova** (recopie os arquivos — o bump de versão exige isso para o teste ser fiel), tema claro: abra "Nova consulta", digite algo na busca de paciente (nenhum resultado → texto do "nenhum encontrado" legível), selecione um paciente (nome/telefone/botão "Trocar" legíveis), veja a lista de sugestões antes de selecionar (avatar, nome, telefone, convênio legíveis). Repita no tema escuro (não deve ter regredido).

- [ ] **Step 9: Commit**
```bash
git add cliniflow-export/patients-components.jsx cliniflow-export/Cliniflow.html
git commit -m "Tema claro: corrige cores esquecidas em Nova Consulta e na busca de paciente"
```

---

## Task 4: Duração editável no card de detalhes

**Files:**
- Modify: `cliniflow-export/Cliniflow.html` (callback `updateDuracao` ao lado de `updateConsulta`, ~linha 269-306; prop `onUpdateDuracao` no `DetailPanel`, ~linha 510-518; bump final de versão de `cliniflow-components.jsx`)
- Modify: `cliniflow-export/cliniflow-components.jsx` (`DetailPanel`, linha 976; assinatura da função, linha 878)

**Interfaces:**
- Consumes: `dbConnected`, `SB.updateConsulta(id, payload)`, `setAppts` — já existem em `Cliniflow.html`.
- Produces: `updateDuracao(id, dur)` (callback em `Cliniflow.html`) e a prop `onUpdateDuracao(id, dur)` no `DetailPanel` — não consumidos por nenhuma tarefa futura (é a última tarefa do plano).

### 4.1 — Callback `updateDuracao` em `Cliniflow.html`

- [ ] **Step 1**

Encontre (linhas 284-293, logo depois de `updateConsulta`):
```js
      const deleteAppt = useCallback(async (id) => {
        // Update locally first (optimistic)
        setAppts(prev => prev.filter(a => a.id !== id));
        setSelectedId(null);

        // Delete in Supabase if connected
        if (dbConnected) {
          await SB.deleteConsulta(id);
        }
      }, [dbConnected]);
```
Adicione **antes** dessa função (entre `updateConsulta` e `deleteAppt`):
```js
      // Duração não pode reusar updateConsulta genérico: o campo local do
      // agendamento é `dur`, mas a coluna no Supabase é `duracao_min` — um
      // merge genérico gravaria certo no banco e deixaria a UI desatualizada
      // até o próximo fetch. Mesmo motivo pelo qual moveAppt já tem função
      // própria em vez de reusar o genérico.
      const updateDuracao = useCallback(async (id, dur) => {
        setAppts(prev => prev.map(a => a.id === id ? { ...a, dur } : a));

        if (dbConnected) {
          await SB.updateConsulta(id, { duracao_min: dur });
        }
      }, [dbConnected]);

      const deleteAppt = useCallback(async (id) => {
        // Update locally first (optimistic)
        setAppts(prev => prev.filter(a => a.id !== id));
        setSelectedId(null);

        // Delete in Supabase if connected
        if (dbConnected) {
          await SB.deleteConsulta(id);
        }
      }, [dbConnected]);
```

- [ ] **Step 2: Passar a prop para `DetailPanel`**

Encontre (linhas 509-518):
```js
                  {selected && (
                    <DetailPanel appointment={selected} onClose={() => setSelectedId(null)}
                      accent={accent}
                      onUpdateStatus={(id, status) => updateConsulta(id, { status })}
                      onDelete={deleteAppt}
                      onUpdatePreco={(id, preco) => updateConsulta(id, { preco })}
                      onAprovarPedido={setPedidoEmAprovacao}
                      onAvisarPaciente={avisarPacienteDoHorario}
                    />
                  )}
```
Substitua por:
```js
                  {selected && (
                    <DetailPanel appointment={selected} onClose={() => setSelectedId(null)}
                      accent={accent}
                      onUpdateStatus={(id, status) => updateConsulta(id, { status })}
                      onDelete={deleteAppt}
                      onUpdatePreco={(id, preco) => updateConsulta(id, { preco })}
                      onUpdateDuracao={(id, dur) => updateDuracao(id, dur)}
                      onAprovarPedido={setPedidoEmAprovacao}
                      onAvisarPaciente={avisarPacienteDoHorario}
                    />
                  )}
```

### 4.2 — `Select` de duração no `DetailPanel`

- [ ] **Step 1: Aceitar a nova prop**

Encontre (linha 878):
```js
function DetailPanel({ appointment: apt, onClose, accent, onUpdateStatus, onDelete, onUpdatePreco, onAprovarPedido, onAvisarPaciente }) {
```
Substitua por:
```js
function DetailPanel({ appointment: apt, onClose, accent, onUpdateStatus, onDelete, onUpdatePreco, onUpdateDuracao, onAprovarPedido, onAvisarPaciente }) {
```

- [ ] **Step 2: Trocar a linha estática de Horário pelo Select**

Encontre (linha 976):
```js
          <InfoRow label="Horário" value={`${apt.time} · ${apt.dur} min`} />
```
Substitua por:
```js
          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap:8 }}>
            <span style={{ fontSize:12, color:'var(--supabase-text-muted)', flexShrink:0 }}>Horário</span>
            <div style={{ display:'flex', alignItems:'center', gap:6 }}>
              <span style={{ fontSize:12.5, color:'var(--supabase-text-light)' }}>{apt.time}</span>
              <span style={{ fontSize:12, color:'var(--supabase-text-muted)' }}>·</span>
              <select
                value={apt.dur}
                onChange={e => onUpdateDuracao && onUpdateDuracao(apt.id, parseInt(e.target.value, 10))}
                style={{
                  background:'var(--supabase-bg-input)', border:'1px solid var(--supabase-border)',
                  borderRadius:5, color:'var(--supabase-text-light)', fontSize:12,
                  padding:'3px 6px', outline:'none', cursor:'pointer',
                }}
              >
                {[15, 20, 30, 45, 60, 90].map(m => (
                  <option key={m} value={m} style={{ background:'var(--supabase-bg-input)' }}>
                    {m === 60 ? '1 hora' : m === 90 ? '1h 30' : `${m} min`}
                  </option>
                ))}
              </select>
            </div>
          </div>
```

(Não usa o componente `Select` compartilhado de `patients-components.jsx` — aquele é `width:'100%'`, pensado para dentro de um `Field` de modal; este contexto é uma linha compacta inline, no mesmo padrão que o campo de Preço logo abaixo já usa nesta mesma função.)

### 4.3 — Verificar, `node --check`, bump final de versão, commit

- [ ] **Step 1: `node --check`**
```bash
node --check cliniflow-export/cliniflow-components.jsx
```
Expected: sem output.

- [ ] **Step 2: Bump de versão em `Cliniflow.html`**

Encontre:
```html
  <script type="text/babel" src="cliniflow-components.jsx?v=10"></script>
```
Substitua por:
```html
  <script type="text/babel" src="cliniflow-components.jsx?v=11"></script>
```

- [ ] **Step 3: Passagem visual**

Cópia de teste nova (recopiar os arquivos, o bump exige isso). Clique num agendamento para abrir o card de detalhes, troque a duração no seletor novo, confirme:
- O texto muda imediatamente (sem precisar de botão salvar).
- Trocando para a visão calendário, o card do agendamento fica mais alto/baixo de acordo com a nova duração (efeito automático de `CalEvent` derivar altura de `apt.dur` — não é código novo, só confirmação de que nada quebrou).
- Console sem erros, nos dois temas.

- [ ] **Step 4: Commit**
```bash
git add cliniflow-export/Cliniflow.html cliniflow-export/cliniflow-components.jsx
git commit -m "Duracao da consulta editavel no card de detalhes"
```

---

## Task 5: Verificação final cross-file e fechamento

**Files:**
- Modify: `cliniflow-export/AGENTS.md` → na verdade é `AGENTS.md` na raiz do projeto (confirme o caminho: `AGENTS.md`, não dentro de `cliniflow-export/`).

**Interfaces:**
- Consumes: tudo das Tarefas 1-4.
- Produces: nenhuma — última tarefa do plano.

- [ ] **Step 1: `node --check` em todos os arquivos tocados**
```bash
for f in cliniflow-export/cliniflow-components.jsx cliniflow-export/patients-components.jsx; do
  echo "== $f =="; node --check "$f"
done
```
Expected: nenhum output de erro.

- [ ] **Step 2: Passagem visual completa, cópia de teste recém-copiada**

`TweaksPanel` alternando `dark`/`light`, visite: Agenda (lista → calendário → kanban), abra "Nova consulta" e o picker de paciente, abra o card de detalhes de um agendamento e troque a duração. Console sem erros em nenhuma tela, em nenhum tema.

- [ ] **Step 3: Atualizar `AGENTS.md` e commit final**

Adicione uma entrada em "Estado atual" de `AGENTS.md`, seguindo o padrão das entradas existentes, registrando: contraste do tema claro corrigido nos pontos identificados em `docs/superpowers/specs/2026-08-15-contraste-tema-claro-e-duracao-design.md` (cores esquecidas, status Pendente/Recusado, grade do calendário, destaque de hoje, camadas de fundo) e duração da consulta editável no card de detalhes — deixe explícito que a verificação foi manual (sem screenshot/teste automatizado), como já registrado para o trabalho de 05/08/2026.

```bash
git add AGENTS.md
git commit -m "Fecha o plano de contraste do tema claro e duracao editavel"
```

---

## Cobertura do spec

| Seção do spec (`2026-08-15-contraste-tema-claro-e-duracao-design.md`) | Tarefa(s) |
|---|---|
| §3.1 Cores nunca migradas (sidebar) | Tarefa 2.1 |
| §3.1 Cores nunca migradas (Nova consulta / PatientPickRow) | Tarefa 3 |
| §3.2 Tom de Pendente/Recusado | Tarefa 2.2 |
| §3.3 Token para linhas de grade | Tarefas 1 (token) + 2.3 (aplicação) |
| §3.4 Destaque de "hoje" | Tarefa 2.3/2.4 |
| §3.5 Camadas de fundo/borda | Tarefa 1 |
| §4 Duração editável | Tarefa 4 |
| §5 Verificação | Receita usada em toda tarefa + Tarefa 5 |
