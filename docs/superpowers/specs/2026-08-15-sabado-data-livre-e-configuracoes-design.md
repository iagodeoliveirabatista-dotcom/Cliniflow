# Especificação de Design: Sábado na agenda, data livre na Nova Consulta e Configurações mais profissional

**Data**: 15 de Agosto de 2026
**Status**: Aprovado pelo usuário (brainstorming em chat, mesma sessão)
**Relação com trabalho anterior**: independente do spec de cadastro de profissionais (`2026-08-15-cadastro-profissionais-design.md`, já implementado por outro agente/sessão — commit `baf1e58`). Este spec consome o resultado dele (a lista `profissionais` já existe e já alimenta os seletores de médico), mas não altera nada daquele trabalho.

---

## 1. Contexto e motivação

Três pedidos do usuário, escolhidos para entrar num spec só por serem pequenos e, dois deles, tocarem o mesmo assunto (como a agenda representa dias/datas):

1. **Sábado na agenda.** Hoje a clínica só é representada como funcionando de segunda a sexta — a grade do calendário tem 5 colunas fixas, e um comentário no código (`patients-components.jsx:334-335`) documenta essa premissa explicitamente: *"Sábado e domingo caem para segunda: a clínica atende de segunda a sexta"*.
2. **Mais liberdade de data ao criar uma consulta.** O seletor "Dia" do modal "Nova consulta" (`NewAppointmentModal`) só oferece os dias da semana que a agenda principal já está mostrando. Pra marcar uma consulta daqui a duas semanas, hoje é preciso fechar o modal, navegar a agenda pra frente, e abrir de novo.
3. **Tela de Configurações mais profissional.** `SettingsModal` (`Cliniflow.html:685`) funciona mas parece mais um painel de debug: overlay próprio (duplicado do `Modal` compartilhado que o resto do app usa), seções identificadas só por texto/emoji, e o botão de ativar/desativar profissional é um texto clicável, não um controle visual reconhecível.

**Não-objetivo explícito**: não é uma segunda varredura de contraste (isso já foi feito num spec anterior) nem um redesign de identidade — mantém `--supabase-*`, `ACCENT_MAP`, densidade e padrões visuais já estabelecidos. Achados de contraste fora do escopo destes três pedidos (ex.: `AgendaHeader` e `LayoutBtn` com cores fixas do tema escuro) foram registrados como tarefas separadas, não entram aqui.

---

## 2. Escopo e não-escopo

**Dentro do escopo:**
- `cliniflow-export/cliniflow-components.jsx`: `DAY_LABELS`, cálculo de "hoje" (`todayCol`) dentro de `CalendarView`.
- `cliniflow-export/Cliniflow.html`: `AgendaHeader.formatWeekLabel`, `App.addAppt` (nova forma de calcular a data), `SettingsModal` (reescrita visual).
- `cliniflow-export/patients-components.jsx`: `proximoDiaUtil` (sábado deixa de ser empurrado pra segunda), `NewAppointmentModal` (cursor de semana próprio + sábado no seletor de dia).

**Fora do escopo (não fazer sem novo spec):**
- Domingo continua fechado — não vira dia útil, não ganha coluna.
- Qualquer mudança em `AprovarPedidoModal` além do efeito indireto de `proximoDiaUtil` (esse modal já tem campo de data livre, não precisa de mudança própria).
- Corrigir `AgendaHeader`/`LayoutBtn` (cores fixas de tema escuro) — já viraram tarefas próprias, fora daqui.
- Novos campos no cadastro de profissional, mudanças de RLS/schema — pertencem ao spec já implementado de profissionais.
- Sincronizar `appts` em tempo real entre semanas (hoje cada mudança de semana refaz o fetch; isso não muda).

---

## 3. Sábado na agenda

### 3.1 Grade do calendário

`DAY_LABELS` (`cliniflow-components.jsx:371`) ganha um 6º item:
```js
const DAY_LABELS = ['Seg','Ter','Qua','Qui','Sex','Sáb'];
```
`visibleDays` e `eventsByDay` já são derivados de `DAY_LABELS.map(...)` — a grade (`gridTemplateColumns: repeat(visibleDays.length, 1fr)`, usado duas vezes no `CalendarView`) se ajusta sozinha para 6 colunas, sem tocar em layout.

O fetch de consultas (`Cliniflow.html:264-266`) já busca a semana inteira, de `currentMonday` até `currentMonday + 6 dias` (domingo) — o dado de sábado já chega hoje, só não é desenhado. Esta mudança é só de exibição.

### 3.2 Cálculo de "hoje"

`todayCol` (`cliniflow-components.jsx:463-480`) checa se a data atual cai dentro da semana mostrada usando um limite fixo de "segunda + 4 dias" (sexta):
```js
const currentFri = new Date(currentMon);
currentFri.setDate(currentMon.getDate() + 4);
```
Passa a ser `+ 5` (sábado), para que um sábado "hoje" seja corretamente destacado na grade.

### 3.3 Rótulo da semana

`AgendaHeader.formatWeekLabel` (`Cliniflow.html:846-858`) usa o mesmo `+ 4`:
```js
const fri = new Date(currentMonday);
fri.setDate(currentMonday.getDate() + 4);
```
Também passa a ser `+ 5`. O texto do rótulo ("Semana de X–Y de mês") não precisa de outra mudança — `fri` (que passa a ser sábado) já alimenta o fim do intervalo mostrado.

### 3.4 Bot para de recusar sábado

`proximoDiaUtil` (`patients-components.jsx:336-341`), usado pelo palpite de horário do modal "Aprovar pedido" quando o bot recebe uma preferência de dia do paciente:
```js
function proximoDiaUtil(base) {
  const d = new Date(base);
  d.setHours(0, 0, 0, 0);
  while (d.getDay() === 0 || d.getDay() === 6) d.setDate(d.getDate() + 1);
  return d;
}
```
Passa a empurrar só domingo (`getDay() === 0`), deixando sábado (`=== 6`) como palpite válido.

---

## 4. Nova Consulta: cursor de semana próprio + sábado

### 4.1 Problema arquitetural por trás do pedido

Hoje `NewAppointmentModal.save()` manda um **índice de dia** (0 a 4) que só faz sentido porque o modal sempre usa a mesma semana que a agenda principal tem aberta (`currentMonday`, recebido como prop). `addAppt` (`Cliniflow.html:401-430`) converte esse índice em data somando `currentMonday + day`.

Dar ao modal um cursor de semana **independente** (pedido do usuário: navegar semanas sem fechar o modal) quebra essa suposição — o índice de dia deixa de ser suficiente sozinho, porque não se sabe mais a qual semana ele se refere. A correção não é cosmética: **o modal precisa passar a data absoluta escolhida**, não um índice relativo.

### 4.2 Cursor de semana no modal

`NewAppointmentModal` ganha estado próprio `weekMonday` (a segunda-feira da semana que o seletor de dia está mostrando *dentro do modal*), inicializado a partir da prop `currentMonday` (mesmo fallback que `getDayOptions` já usa hoje se a prop não vier). Dois botões `‹` / `›` ao lado do campo "Dia" avançam/recuam `weekMonday` em 7 dias — mesmo padrão visual de `NavBtn`, já usado em `AgendaHeader` para navegar a semana da agenda principal.

`getDayOptions()` (`patients-components.jsx:509-529`) passa a gerar 6 opções (Seg–Sáb) a partir de `weekMonday` em vez de 5 a partir de `currentMonday`:
```js
const days = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
for (let i = 0; i < 6; i++) { /* ... */ }
```
Trocar a semana (`weekMonday`) reseta o dia selecionado para o primeiro dia da nova semana (evita ficar com um índice que fazia sentido na semana antiga mas aponta para outro dia na nova).

### 4.3 O que `save()` passa a mandar

Em vez de `day: parseInt(f.day)`, o modal calcula e manda a data absoluta escolhida:
```js
const save = () => {
  if (!ok) return;
  const data = new Date(weekMonday);
  data.setDate(weekMonday.getDate() + parseInt(f.day));
  const [h, m] = f.time.split(':').map(Number);
  data.setHours(h, m, 0, 0);

  onSave({
    id: Date.now(),
    data,                              // Date absoluta — substitui `day`
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

### 4.4 `addAppt` passa a aceitar uma data, não um índice

`addAppt` (`Cliniflow.html:401-430`) hoje calcula `targetDate` a partir de `currentMonday + a.day`. Como `NewAppointmentModal` é o único ponto que produz esse formato (não é uma interface pública reusada por outro chamador), a mudança troca os dois lados juntos, sem precisar de compatibilidade com o formato antigo.

Consequência que **precisa** ser tratada, não é opcional: se a consulta for criada para uma semana diferente da que a agenda principal está mostrando, a agenda precisa **pular para a semana da nova consulta** — sem isso, a atualização otimista local calcularia a posição da consulta relativa à semana errada (a que ainda está na tela), e ela apareceria fora do lugar ou não apareceria até a próxima navegação manual. Isso vale tanto conectado ao Supabase quanto no modo demonstração (sem Supabase, `addAppt` cai no branch local — ver `Cliniflow.html:428-429` — que hoje empurra o objeto bruto pro estado sem calcular `day` nenhum; esse branch precisa do mesmo tratamento, senão o modo demonstração usado para verificação quebra).

```js
function mondayOf(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return d;
}

const addAppt = useCallback(async (a) => {
  const targetMonday = mondayOf(a.data);
  const diaSemHora = new Date(a.data.getFullYear(), a.data.getMonth(), a.data.getDate());
  const dayIndex = Math.round((diaSemHora - targetMonday) / 86400000); // 0=Seg ... 5=Sáb

  if (dbConnected) {
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
  // Fallback: modo demonstração (sem Supabase)
  setCurrentMonday(targetMonday);
  setAppts(prev => [...prev, { ...a, day: dayIndex }]);
}, [dbConnected, patients]);
```
`mondayOf` reaproveita a mesma fórmula (`(getDay()+6)%7`) que já aparece duplicada em `getDayOptions` e em `todayCol` — esta tarefa não teria motivo para unificar as outras duas ocorrências (fora do escopo, não quebrado), mas a nova não deveria adicionar uma quarta cópia solta; se o plano de implementação achar um lugar natural para essa função ficar compartilhada entre `Cliniflow.html` e `patients-components.jsx`, tanto melhor — não é requisito.

### 4.5 Critério de pronto

Abrir "Nova consulta", trocar de semana pelo `‹`/`›` sem fechar o modal, escolher um sábado, salvar — a consulta aparece na agenda, na semana e no dia certos, e a agenda pula sozinha pra essa semana.

---

## 5. Configurações mais profissional

### 5.1 Estrutura: reaproveitar o `Modal` compartilhado

`SettingsModal` hoje desenha seu próprio overlay (`Cliniflow.html:711-725`) — fundo escurecido, `Escape` pra fechar, botão de fechar — duplicando o que o componente `Modal` (`patients-components.jsx:71-105`, usado por `AddPatientModal`/`EditPatientModal`/`NewAppointmentModal`/`AprovarPedidoModal`) já faz. Passa a usar `<Modal title="Configurações" onClose={onClose} accent={accent} width={420}>`, removendo a duplicação (overlay, tecla Escape, botão ×) e ganhando de graça a mesma animação de entrada que o resto do app já tem.

### 5.2 Ícone por seção

Cada bloco (Tema, Cor de destaque, Profissionais) ganha um ícone SVG pequeno ao lado do rótulo, no mesmo estilo dos ícones já desenhados à mão na Sidebar (`viewBox="0 0 24 24"`, `fill` seguindo o token de texto/ícone do tema) — substitui os emojis 🌙/☀️ usados hoje só no par de botões de tema. Não há biblioteca de ícones no projeto (confirmado — todos os ícones existentes são path SVG customizados); os três novos seguem o mesmo padrão, sem introduzir dependência nova.

### 5.3 Switch em vez de botão de texto

O par "Ativar/Desativar" de cada profissional (`Cliniflow.html:795-807`) vira um componente `ToggleSwitch` novo — trilho arredondado com círculo deslizante, no lugar do botão pill de texto atual. Mesma função (`onToggleProfissionalAtivo`), só a representação visual muda:

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
        transition:'background .15s var(--ease-premium)',
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
Usado como `<ToggleSwitch checked={p.ativo} onChange={v => onToggleProfissionalAtivo(p.id, v)} accent={accent} />` no lugar do botão de texto — a lógica de chamada (`onToggleProfissionalAtivo(p.id, !p.ativo)`) não muda, só quem desenha.

### 5.4 Não-objetivo

Conteúdo das três seções (tema, cor, profissionais) continua o mesmo — nenhum campo novo, nenhuma reordenação de informação. É reforma de acabamento, igual ao spec de contraste anterior.

---

## 6. Verificação

Mesma receita dos specs anteriores (`docs/superpowers/plans/2026-08-05-ui-tema-claro-e-motion.md`, "Receita de verificação") — cópia isolada em modo demonstração, servida via HTTP local (não `file://`, para os scripts carregarem de verdade — armadilha registrada nesta sessão), console do navegador sem erros, teste manual guiado.

**Roteiro mínimo:**
1. Agenda em modo calendário: sábado aparece como 6ª coluna; se "hoje" for sábado (ou simule mudando a data do sistema/verifique a lógica por código), o destaque acompanha.
2. "Nova consulta": trocar de semana pelo `‹`/`›`, escolher sábado, salvar — consulta aparece na semana certa, agenda pula pra lá.
3. Modo demonstração (sem Supabase) e, se disponível, conectado ao Supabase — os dois caminhos de `addAppt` precisam ser exercitados, porque divergem (branch de fallback vs. `SB.createConsulta`).
4. Configurações: abre com a mesma animação dos outros modais, ícones visíveis nos 3 blocos, switch de ativar/desativar profissional funciona nos dois temas.
5. `node --check` **não se aplica** aos `.jsx` tocados (armadilha `docs/ARMADILHAS.md` §42 — Node não entende JSX). O gate real é o Babel do navegador: sem erro no console = sintaxe válida.

---

## 7. Arquivos afetados (para o plano de implementação)

| Arquivo | Natureza da mudança |
|---|---|
| `cliniflow-export/cliniflow-components.jsx` | `DAY_LABELS` ganha sábado; `todayCol` usa limite de semana `+5`. |
| `cliniflow-export/Cliniflow.html` | `AgendaHeader.formatWeekLabel` usa `+5`; `addAppt` reescrito para aceitar data absoluta e pular a agenda pra semana certa; `SettingsModal` reescrito (usa `Modal` compartilhado, ícones, `ToggleSwitch` novo). |
| `cliniflow-export/patients-components.jsx` | `proximoDiaUtil` só empurra domingo; `NewAppointmentModal` ganha `weekMonday` próprio, navegação de semana, 6 dias no seletor, `save()` manda data absoluta. |

A decomposição em tarefas bite-sized fica para o plano de implementação (`writing-plans`).

---

## 8. Decisões do usuário registradas nesta sessão

- Os três pedidos entram num spec e plano só (chat, 15/08/2026) — diferente do par de specs anterior, porque aqui não há mudança de schema/backend em nenhum dos três.
- Sábado sim, domingo continua fechado — clínica passa a atender segunda a sábado (chat, 15/08/2026).
- Liberdade de data na Nova Consulta: navegação de semana dentro do próprio modal (mantendo a lista de dias), não um `<input type="date">` solto nem uma lista longa de várias semanas — depois de comparar as três opções em chat, o usuário preferiu a navegação por semana por ficar mais familiar visualmente (chat, 15/08/2026).
- Configurações: as três direções de polimento foram aprovadas juntas — reaproveitar o `Modal` compartilhado, ícones por seção, switch em vez de botão de texto (chat, 15/08/2026).
