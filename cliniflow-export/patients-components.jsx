// patients-components.jsx
// Patient database, list view, modals for adding patients & new appointments.
// Exports to window: PATIENTS, PatientsView, AddPatientModal, NewAppointmentModal

const { useState: useStateP, useMemo, useEffect } = React;

function formatarTelefone(tel) {
  if (!tel) return '';
  const digits = String(tel).replace(/\D/g, '');
  let national = digits;
  if (digits.startsWith('55') && (digits.length === 12 || digits.length === 13)) {
    national = digits.slice(2);
  }
  if (national.length === 11) {
    return `(${national.slice(0, 2)}) ${national.slice(2, 7)}-${national.slice(7)}`;
  }
  if (national.length === 10) {
    return `(${national.slice(0, 2)}) ${national.slice(2, 6)}-${national.slice(6)}`;
  }
  if (national.length > 2) {
    return `(${national.slice(0, 2)}) ${national.slice(2)}`;
  }
  return national;
}

const aplicarMascaraTelefone = (value) => {
  const digits = value.replace(/\D/g, '').slice(0, 11);
  if (digits.length === 0) return '';
  if (digits.length <= 2) return `(${digits}`;
  if (digits.length <= 6) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
  if (digits.length <= 10) return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
};

function formatarDataBR(dataSql) {
  if (!dataSql) return '';
  const parts = dataSql.split('-');
  if (parts.length !== 3) return dataSql;
  return `${parts[2]}/${parts[1]}/${parts[0]}`;
}

// ─── MOCK DATA ───────────────────────────────────────────────────────────────

const PATIENTS = [
  { id:1,  name:'Ana Lima',         initials:'AL', age:34, phone:'(11) 99988-7766', email:'ana.lima@email.com',    convenio:'Particular',    last:'15 mar 2026', visits:8,  status:'ativo' },
  { id:2,  name:'Marcos Oliveira',  initials:'MO', age:52, phone:'(11) 91234-5678', email:'m.oliveira@email.com',  convenio:'Unimed',        last:'01 mai 2026', visits:14, status:'ativo' },
  { id:3,  name:'Camila Santos',    initials:'CS', age:28, phone:'(11) 98765-4321', email:'cami.santos@email.com', convenio:'Bradesco Saúde',last:'10 fev 2026', visits:3,  status:'ativo' },
  { id:4,  name:'Rafael Souza',     initials:'RS', age:45, phone:'(11) 97654-3210', email:'rafa.souza@email.com',  convenio:'Particular',    last:'20 abr 2026', visits:11, status:'ativo' },
  { id:5,  name:'Juliana Ferreira', initials:'JF', age: 8, phone:'(11) 96543-2109', email:'mae.julia@email.com',   convenio:'Amil',          last:'05 jan 2026', visits:5,  status:'ativo' },
  { id:6,  name:'Bruno Alves',      initials:'BA', age:38, phone:'(11) 95432-1098', email:'bruno.a@email.com',     convenio:'Particular',    last:'—',           visits:0,  status:'novo'  },
  { id:7,  name:'Priya Nair',       initials:'PN', age:31, phone:'(11) 94321-0987', email:'priya.n@email.com',     convenio:'SulAmérica',    last:'25 abr 2026', visits:6,  status:'ativo' },
  { id:8,  name:'Carlos Mota',      initials:'CM', age:67, phone:'(11) 93210-9876', email:'c.mota@email.com',      convenio:'Unimed',        last:'14 mar 2026', visits:22, status:'inativo' },
  { id:9,  name:'Silvia Ramos',     initials:'SR', age:29, phone:'(11) 92109-8765', email:'silvia.r@email.com',    convenio:'Particular',    last:'08 mai 2026', visits:2,  status:'ativo' },
  { id:10, name:'Diego Lima',       initials:'DL', age:55, phone:'(11) 91098-7654', email:'diego.lima@email.com',  convenio:'Bradesco Saúde',last:'30 abr 2026', visits:9,  status:'ativo' },
  { id:11, name:'Tatiana Cruz',     initials:'TC', age:42, phone:'(11) 90987-6543', email:'tati.cruz@email.com',   convenio:'Amil',          last:'02 fev 2026', visits:4,  status:'ativo' },
  { id:12, name:'Fernando Gomes',   initials:'FG', age:48, phone:'(11) 99876-5432', email:'fer.gomes@email.com',   convenio:'Particular',    last:'15 abr 2026', visits:7,  status:'ativo' },
  { id:13, name:'Roberto Dias',     initials:'RD', age:62, phone:'(11) 98877-6655', email:'roberto.d@email.com',   convenio:'Unimed',        last:'12 mar 2026', visits:18, status:'ativo' },
  { id:14, name:'Laura Vieira',     initials:'LV', age:27, phone:'(11) 97766-5544', email:'laura.v@email.com',     convenio:'SulAmérica',    last:'15 mai 2026', visits:6,  status:'ativo' },
  { id:15, name:'Hugo Pereira',     initials:'HP', age:55, phone:'(11) 96655-4433', email:'hugo.p@email.com',      convenio:'Particular',    last:'20 mar 2026', visits:3,  status:'ativo' },
  { id:16, name:'Mariana Castro',   initials:'MC', age:41, phone:'(11) 95544-3322', email:'mari.castro@email.com', convenio:'Amil',          last:'—',           visits:0,  status:'novo'  },
];

const STATUS_PAT = {
  ativo:   { label:'Ativo',   color:'#3ecf8e' },
  novo:    { label:'Novo',    color:'#5b8cff' },
  inativo: { label:'Inativo', color:'#666'    },
};

// ─── MODAL SHELL ─────────────────────────────────────────────────────────────

function Modal({ title, onClose, children, accent, width=460 }) {
  useEffect(() => {
    const h = e => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onClose]);
  return (
    <div onClick={onClose} style={{
      position:'fixed', inset:0, zIndex:1000,
      background:'rgba(0,0,0,0.62)', backdropFilter:'blur(3px)',
      display:'flex', alignItems:'center', justifyContent:'center',
      animation:'fadeIn .2s var(--ease-premium)',
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        width, maxWidth:'92vw', maxHeight:'88vh',
        background:'var(--supabase-bg-studio)', border:'1px solid var(--supabase-border)', borderRadius:'var(--radius-studio)',
        boxShadow:'var(--shadow-lg)',
        display:'flex', flexDirection:'column', overflow:'hidden',
        animation:'slideUp .25s var(--ease-premium)',
      }}>
        <div style={{
          display:'flex', alignItems:'center', justifyContent:'space-between',
          padding:'14px 18px', borderBottom:'1px solid var(--supabase-border)',
        }}>
          <span style={{ fontSize:14, fontWeight:600, color:'var(--supabase-text)', letterSpacing:'-.2px' }}>{title}</span>
          <button onClick={onClose} style={{
            background:'none', border:'none', color:'var(--supabase-text-muted)', cursor:'pointer',
            width:24, height:24, borderRadius:4, fontSize:18, lineHeight:'24px',
          }}>×</button>
        </div>
        <div style={{ flex:1, overflowY:'auto' }}>{children}</div>
      </div>
    </div>
  );
}

function Field({ label, children, hint }) {
  return (
    <div style={{ marginBottom:14 }}>
      <label style={{
        display:'block', fontSize:11, fontWeight:600, color:'var(--supabase-text-muted)',
        textTransform:'uppercase', letterSpacing:.7, marginBottom:6,
      }}>{label}</label>
      {children}
      {hint && <div style={{ fontSize:11, color:'var(--supabase-icon-inactive)', marginTop:5 }}>{hint}</div>}
    </div>
  );
}

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

function Select({ value, onChange, options }) {
  return (
    <select value={value} onChange={e => onChange(e.target.value)} style={{
      ...inputStyle, appearance:'none', cursor:'pointer',
      backgroundImage:'url("data:image/svg+xml;utf8,<svg xmlns=\'http://www.w3.org/2000/svg\' width=\'12\' height=\'12\' viewBox=\'0 0 24 24\' fill=\'%23666\'><path d=\'M7 10l5 5 5-5z\'/></svg>")',
      backgroundRepeat:'no-repeat', backgroundPosition:'right 10px center', paddingRight:30,
    }}>
      {options.map(o => (
        <option key={o.value ?? o} value={o.value ?? o} style={{ background:'var(--supabase-bg-input)' }}>
          {o.label ?? o}
        </option>
      ))}
    </select>
  );
}

function ModalFooter({ onCancel, onSave, saveLabel, accent, saveDisabled }) {
  return (
    <div style={{
      display:'flex', gap:8, justifyContent:'flex-end',
      padding:'14px 18px', borderTop:'1px solid var(--supabase-border)', background:'var(--supabase-bg-studio)',
    }}>
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
    </div>
  );
}

// ─── ADD PATIENT MODAL ───────────────────────────────────────────────────────

function AddPatientModal({ onClose, onSave, accent }) {
  // bot_ativo nasce false de proposito: quem e cadastrado aqui ja e paciente da
  // clinica e deve ser atendido por gente. A IA e opt-in, nao opt-out.
  const [f, setF] = useStateP({ name:'', data_nasc:'', phone:'', email:'', convenio:'Particular', bot_ativo:false });
  const set = (k,v) => setF(prev => ({ ...prev, [k]: v }));
  const ok = f.name.trim().length > 0 && f.phone.trim().length > 0;

  const save = () => {
    if (!ok) return;
    const initials = f.name.trim().split(' ').filter(Boolean).slice(0,2).map(w => w[0].toUpperCase()).join('');
    onSave({
      id: Date.now(),
      name: f.name.trim(), initials,
      data_nasc: f.data_nasc || null,
      phone: f.phone, email: f.email,
      convenio: f.convenio, last:'—', visits:0, status:'novo',
      bot_pausado: !f.bot_ativo,
    });
    onClose();
  };

  return (
    <Modal title="Novo paciente" onClose={onClose} accent={accent}>
      <div style={{ padding:'18px 18px 4px' }}>
        <Field label="Nome completo">
          <Input value={f.name} onChange={e => set('name', e.target.value)} placeholder="Ex: Maria da Silva" autoFocus />
        </Field>
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
          <Field label="Data de nascimento">
            <Input value={f.data_nasc} onChange={e => set('data_nasc', e.target.value)} type="date" />
          </Field>
          <Field label="Telefone">
            <Input value={f.phone} onChange={e => set('phone', aplicarMascaraTelefone(e.target.value))} placeholder="(11) 99999-9999" />
          </Field>
        </div>
        <Field label="E-mail">
          <Input value={f.email} onChange={e => set('email', e.target.value)} placeholder="paciente@email.com" type="email" />
        </Field>
        <Field label="Convênio">
          <Select value={f.convenio} onChange={v => set('convenio', v)}
            options={['Particular','Unimed','Bradesco Saúde','SulAmérica','Amil','Hapvida','Outro']} />
        </Field>
        <Field label="Atendimento no WhatsApp">
          <div style={{
            display:'flex', alignItems:'center', justifyContent:'space-between',
            padding:'10px 12px', borderRadius:6,
            background:'var(--supabase-bg-input)', border:'1px solid var(--supabase-border)'
          }}>
            <span style={{ fontSize:12, fontWeight:500, color:'var(--supabase-text-muted)' }}>
              {f.bot_ativo ? '🤖 IA Ativa' : '🤖 IA Inativa'}
            </span>
            <button type="button" onClick={() => set('bot_ativo', !f.bot_ativo)}
              style={{
                position:'relative', width:34, height:18, border:0, borderRadius:999,
                background: f.bot_ativo ? accent : 'var(--supabase-border)',
                cursor:'pointer', padding:0, transition:'background .15s'
              }}>
              <span style={{
                position:'absolute', top:2, left: f.bot_ativo ? 18 : 2,
                width:14, height:14, borderRadius:'50%', background:'#fff',
                boxShadow:'0 1px 3px rgba(0,0,0,0.3)', transition:'left .15s'
              }} />
            </button>
          </div>
          <p style={{ fontSize:10.5, color:'var(--supabase-icon-inactive)', marginTop:6, lineHeight:1.4 }}>
            {f.bot_ativo
              ? 'A IA vai responder este paciente no WhatsApp automaticamente.'
              : 'A IA não responde este paciente. As mensagens dele chegam em Atendimentos para a recepção responder.'}
          </p>
        </Field>
      </div>
      <ModalFooter onCancel={onClose} onSave={save} saveLabel="Cadastrar paciente" accent={accent} saveDisabled={!ok} />
    </Modal>
  );
}

// ─── EDIT PATIENT MODAL ──────────────────────────────────────────────────────

function EditPatientModal({ patient, onClose, onSave, accent }) {
  const [f, setF] = useStateP({
    name: patient.name || '',
    data_nasc: patient.data_nasc || '',
    phone: formatarTelefone(patient.phone) || '',
    email: patient.email || '',
    convenio: patient.convenio || 'Particular',
    status: patient.status || 'ativo',
  });
  const set = (k,v) => setF(prev => ({ ...prev, [k]: v }));
  const ok = f.name.trim().length > 0 && f.phone.trim().length > 0;

  const save = () => {
    if (!ok) return;
    const initials = f.name.trim().split(' ').filter(Boolean).slice(0,2).map(w => w[0].toUpperCase()).join('');
    onSave({
      name: f.name.trim(),
      initials,
      data_nasc: f.data_nasc || null,
      phone: f.phone,
      email: f.email,
      convenio: f.convenio,
      status: f.status,
    });
    onClose();
  };

  return (
    <Modal title="Editar paciente" onClose={onClose} accent={accent}>
      <div style={{ padding:'18px 18px 4px' }}>
        <Field label="Nome completo">
          <Input value={f.name} onChange={e => set('name', e.target.value)} placeholder="Ex: Maria da Silva" autoFocus />
        </Field>
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
          <Field label="Data de nascimento">
            <Input value={f.data_nasc} onChange={e => set('data_nasc', e.target.value)} type="date" />
          </Field>
          <Field label="Telefone">
            <Input value={f.phone} onChange={e => set('phone', aplicarMascaraTelefone(e.target.value))} placeholder="(11) 99999-9999" />
          </Field>
        </div>
        <Field label="E-mail">
          <Input value={f.email} onChange={e => set('email', e.target.value)} placeholder="paciente@email.com" type="email" />
        </Field>
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
          <Field label="Convênio">
            <Select value={f.convenio} onChange={v => set('convenio', v)}
              options={['Particular','Unimed','Bradesco Saúde','SulAmérica','Amil','Hapvida','Outro']} />
          </Field>
          <Field label="Status">
            <Select value={f.status} onChange={v => set('status', v)}
              options={[
                { value: 'ativo', label: 'Ativo' },
                { value: 'novo', label: 'Novo' },
                { value: 'inativo', label: 'Inativo' },
              ]} />
          </Field>
        </div>
      </div>
      <ModalFooter onCancel={onClose} onSave={save} saveLabel="Salvar alterações" accent={accent} saveDisabled={!ok} />
    </Modal>
  );
}

// ─── APROVAR PEDIDO DO BOT (TRIAGEM) ─────────────────────────────────────────
//
// O pedido criado pelo bot NÃO tem horário: `consultas.data_hora` é NOT NULL, e
// a RPC grava now() só para satisfazer a coluna. Quem decide quando a consulta
// acontece é a recepção — e este modal é onde isso acontece.
//
// Não reutiliza `NewAppointmentModal` de propósito: o seletor de dia de lá
// (`getDayOptions`) só oferece Seg–Sex da semana que está aberta na agenda,
// então aprovar um pedido para "próxima segunda" obrigaria a navegar a semana
// antes. Aqui a data é um campo de data de verdade.

const fmtData = (d) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

// Sábado e domingo caem para segunda: a clínica atende de segunda a sexta
// (é o que a agenda mostra — a grade tem 5 colunas).
function proximoDiaUtil(base) {
  const d = new Date(base);
  d.setHours(0, 0, 0, 0);
  while (d.getDay() === 0 || d.getDay() === 6) d.setDate(d.getDate() + 1);
  return d;
}

// Transforma o que o paciente falou ("segunda de manhã", "à tarde", "dia 12 às
// 14h") num palpite de data+hora. É PALPITE: a recepção vê a frase original ao
// lado e corrige se não bater. Não tenta ser esperto demais de propósito —
// errar para mais cedo é fácil de perceber e ajustar.
function palpiteDeHorario(preferencia) {
  const hoje = new Date();
  // O RegExp e montado a partir de string ASCII para remover os acentos:
  // escrever os caracteres combinantes direto no literal deixaria a regra
  // dependente da codificacao com que o arquivo for salvo, e ela passaria a
  // nao casar nada em silencio.
  const SEM_ACENTO = new RegExp('[\u0300-\u036f]', 'g');
  const txt = String(preferencia || '')
    .toLowerCase()
    .normalize('NFD').replace(SEM_ACENTO, '');

  let hora = '09:00';
  if (/tarde/.test(txt)) hora = '14:00';
  else if (/noite/.test(txt)) hora = '18:00';
  else if (/manha/.test(txt)) hora = '09:00';

  // Hora explícita ganha do turno: "segunda às 15h" é mais específico que "tarde".
  const mHora = txt.match(/(\d{1,2})\s*(?::|h)\s*(\d{2})?/);
  if (mHora) {
    const h = Math.min(23, parseInt(mHora[1], 10));
    const min = mHora[2] ? Math.min(59, parseInt(mHora[2], 10)) : 0;
    hora = `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
  }

  const DIAS = { domingo: 0, segunda: 1, terca: 2, quarta: 3, quinta: 4, sexta: 5, sabado: 6 };
  const diaNome = Object.keys(DIAS).find(k => txt.includes(k));

  let data;
  if (diaNome) {
    // Próxima ocorrência daquele dia da semana, sempre no futuro.
    const alvo = DIAS[diaNome];
    data = new Date(hoje);
    data.setHours(0, 0, 0, 0);
    let delta = (alvo - data.getDay() + 7) % 7;
    if (delta === 0) delta = 7;
    data.setDate(data.getDate() + delta);
  } else if (/amanha/.test(txt)) {
    data = new Date(hoje);
    data.setDate(data.getDate() + 1);
    data = proximoDiaUtil(data);
  } else {
    const amanha = new Date(hoje);
    amanha.setDate(amanha.getDate() + 1);
    data = proximoDiaUtil(amanha);
  }

  return { data: fmtData(data), hora };
}

function AprovarPedidoModal({ pedido, preferencia, onClose, onSave, accent, profissionais = [] }) {
  const palpite = useMemo(() => palpiteDeHorario(preferencia), [preferencia]);
  const [f, setF] = useStateP({
    data: palpite.data,
    hora: palpite.hora,
    dur: pedido?.dur || 30,
    tipo: pedido?.type || 'Avaliação',
    doctor: pedido?.doctor || (profissionais.length > 0 ? profissionais[0].nome : ''),
  });
  const set = (k, v) => setF(prev => ({ ...prev, [k]: v }));

  const ok = !!f.data && !!f.hora && String(f.tipo).trim() !== '';

  const salvar = () => {
    if (!ok) return;
    const [ano, mes, dia] = f.data.split('-').map(Number);
    const [h, min] = f.hora.split(':').map(Number);
    const quando = new Date(ano, mes - 1, dia, h, min, 0, 0);
    onSave({
      id: pedido.id,
      patient_id: pedido.patientId,
      data_hora: quando.toISOString(),
      duracao_min: parseInt(f.dur, 10) || 30,
      tipo: f.tipo,
      medico: f.doctor || null,
    });
    onClose();
  };

  return (
    <Modal title="Aprovar pedido e definir horário" onClose={onClose} accent={accent} width={480}>
      <div style={{ padding: '18px 18px 4px' }}>
        <div style={{
          padding: 12, marginBottom: 16, borderRadius: 8,
          background: 'rgba(168, 85, 247, 0.08)', border: '1px solid rgba(168,85,247,.25)',
        }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: '#a855f7', textTransform: 'uppercase', letterSpacing: .6, marginBottom: 4 }}>
            {pedido?.patient || 'Paciente'} pediu
          </div>
          <div style={{ fontSize: 14, color: 'var(--supabase-text-light)', fontWeight: 500 }}>
            {preferencia || 'sem preferência informada'}
          </div>
          <div style={{ fontSize: 11.5, color: 'var(--supabase-text-muted)', marginTop: 4 }}>
            Os campos abaixo já vêm com um palpite a partir disso — confira e ajuste.
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <Field label="Data">
            <Input type="date" value={f.data} onChange={e => set('data', e.target.value)} autoFocus />
          </Field>
          <Field label="Hora">
            <Input type="time" value={f.hora} onChange={e => set('hora', e.target.value)} />
          </Field>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <Field label="Duração">
            <Select value={String(f.dur)} onChange={v => set('dur', v)}
              options={[
                { value: '15', label: '15 min' }, { value: '20', label: '20 min' },
                { value: '30', label: '30 min' }, { value: '45', label: '45 min' },
                { value: '60', label: '1 hora' },
              ]} />
          </Field>
          <Field label="Profissional">
            {profissionais.length > 0 ? (
              <Select value={f.doctor} onChange={v => set('doctor', v)}
                options={profissionais.map(p => p.nome)} />
            ) : (
              <div style={{
                fontSize: 11.5, color: 'var(--supabase-text-muted)', padding: '9px 10px',
                background: 'var(--supabase-bg-input)', border: '1px solid var(--supabase-border)',
                borderRadius: 'var(--radius-studio)', lineHeight: 1.3,
              }}>
                Nenhum cadastrado (Configurações)
              </div>
            )}
          </Field>
        </div>

        <Field label="Procedimento">
          <Input value={f.tipo} onChange={e => set('tipo', e.target.value)} placeholder="Ex: Avaliação estética" />
        </Field>

        <div style={{ fontSize: 11.5, color: 'var(--supabase-text-muted)', lineHeight: 1.5, marginBottom: 4 }}>
          A consulta entra na agenda como <strong>pendente</strong> — quem confirma é o
          paciente. Ele recebe o lembrete automático 24h antes; se quiser avisar do
          horário agora, use o botão no painel da consulta.
        </div>
      </div>
      <ModalFooter onCancel={onClose} onSave={salvar} saveLabel="Aprovar e agendar"
        accent={accent} saveDisabled={!ok} />
    </Modal>
  );
}

// ─── NEW APPOINTMENT MODAL ───────────────────────────────────────────────────

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

  const filtered = useMemo(() => {
    if (!f.search.trim()) return patients.slice(0,6);
    const q = f.search.toLowerCase();
    return patients.filter(p => p.name.toLowerCase().includes(q) || p.phone.includes(q)).slice(0,8);
  }, [f.search, patients]);

  const selectedPatient = patients.find(p => p.id === f.patientId);
  const ok = !!selectedPatient && f.time && f.type.trim();

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

  return (
    <Modal title="Nova consulta" onClose={onClose} accent={accent} width={520}>
      <div style={{ padding:'18px 18px 4px' }}>
        {/* Patient picker */}
        <Field label="Paciente">
          {!selectedPatient ? (
            <div>
              <Input value={f.search} onChange={e => set('search', e.target.value)}
                placeholder="Buscar por nome ou telefone…" autoFocus />
              <div style={{
                marginTop:6, maxHeight:180, overflowY:'auto',
                background:'var(--supabase-bg-card)', border:'1px solid var(--supabase-border)', borderRadius:'var(--radius-studio)',
              }}>
                {filtered.length === 0 && (
                  <div style={{ padding:'14px 12px', fontSize:12, color:'var(--supabase-icon-inactive)', textAlign:'center' }}>
                    Nenhum paciente encontrado
                  </div>
                )}
                {filtered.map(p => (
                  <PatientPickRow key={p.id} p={p} onClick={() => set('patientId', p.id)} accent={accent} />
                ))}
              </div>
            </div>
          ) : (
            <div style={{
              display:'flex', alignItems:'center', gap:10,
              padding:'8px 10px', background:`${accent}10`,
              border:`1px solid ${accent}30`, borderRadius:6,
            }}>
              <div style={{
                width:30, height:30, borderRadius:'50%', flexShrink:0,
                background:`${accent}25`, border:`1px solid ${accent}40`,
                display:'flex', alignItems:'center', justifyContent:'center',
                fontSize:11, fontWeight:600, color:accent,
              }}>{selectedPatient.initials}</div>
              <div style={{ flex:1, minWidth:0 }}>
                <div style={{ fontSize:13, fontWeight:500, color:'var(--supabase-text-light)' }}>{selectedPatient.name}</div>
                <div style={{ fontSize:11, color:'var(--supabase-text-muted)' }}>{formatarTelefone(selectedPatient.phone)} · {selectedPatient.age} anos</div>
              </div>
              <button onClick={() => { set('patientId',''); set('search',''); }} style={{
                background:'none', border:'none', color:'var(--supabase-text-muted)', cursor:'pointer',
                fontSize:12, padding:'4px 8px', borderRadius:4,
              }}>Trocar</button>
            </div>
          )}
        </Field>

        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:10 }}>
          <Field label="Dia">
            <Select value={f.day} onChange={v => set('day', v)}
              options={getDayOptions()} />
          </Field>
          <Field label="Horário">
            <Input type="time" value={f.time} onChange={e => set('time', e.target.value)} step="900" />
          </Field>
          <Field label="Duração">
            <Select value={f.dur} onChange={v => set('dur', v)}
              options={[
                {value:15,label:'15 min'},{value:20,label:'20 min'},
                {value:30,label:'30 min'},{value:45,label:'45 min'},
                {value:60,label:'1 hora'},{value:90,label:'1h 30'},
              ]} />
          </Field>
        </div>

        <Field label="Tipo de consulta">
          <Select value={f.type} onChange={v => set('type', v)}
            options={['Consulta de rotina','Retorno clínico','Check-up geral','Coleta de exames','Pediatria','Pressão arterial','Vacinação','Retorno cardiologia','Pré-natal']} />
        </Field>

        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:10 }}>
          <Field label="Médico(a)">
            {profissionais.length > 0 ? (
              <Select value={f.doctor} onChange={v => set('doctor', v)}
                options={profissionais.map(p => p.nome)} />
            ) : (
              <div style={{
                fontSize: 11.5, color: 'var(--supabase-text-muted)', padding: '9px 10px',
                background: 'var(--supabase-bg-input)', border: '1px solid var(--supabase-border)',
                borderRadius: 'var(--radius-studio)', lineHeight: 1.3,
              }}>
                Nenhum cadastrado (Configurações)
              </div>
            )}
          </Field>
          <Field label="Status inicial">
            <Select value={f.status} onChange={v => set('status', v)}
              options={[
                {value:'pending',label:'Pendente'},
                {value:'confirmed',label:'Confirmado'},
              ]} />
          </Field>
          <Field label="Preço (R$)">
            <Input type="number" step="0.01" min="0" value={f.preco} onChange={e => set('preco', e.target.value)} placeholder="0.00" />
          </Field>
        </div>

        <label style={{ display:'flex', alignItems:'center', gap:8, cursor:'pointer', marginTop:4, marginBottom:14 }}>
          <input type="checkbox" checked={f.wa} onChange={e => set('wa', e.target.checked)} style={{ accentColor: accent }} />
          <span style={{ fontSize:12.5, color:'var(--supabase-text-light)' }}>Enviar lembrete automático via WhatsApp</span>
        </label>
      </div>
      <ModalFooter onCancel={onClose} onSave={save} saveLabel="Agendar consulta" accent={accent} saveDisabled={!ok} />
    </Modal>
  );
}

function PatientPickRow({ p, onClick, accent }) {
  const [hov, setHov] = useStateP(false);
  return (
    <div onClick={onClick}
      onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)}
      style={{
        display:'flex', alignItems:'center', gap:10, padding:'8px 11px',
        cursor:'pointer', background: hov ? 'var(--supabase-bg-main)' : 'transparent',
        borderBottom:'1px solid var(--supabase-border)',
      }}>
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
    </div>
  );
}

// ─── PATIENTS VIEW (table) ───────────────────────────────────────────────────

function PatientsView({ patients, onAddPatient, onNewAppointment, onEditPatient, accent }) {
  const [q, setQ] = useStateP('');
  const [filter, setFilter] = useStateP('todos');

  const filtered = useMemo(() => {
    let list = patients;
    if (filter !== 'todos') list = list.filter(p => p.status === filter);
    if (q.trim()) {
      const t = q.toLowerCase();
      list = list.filter(p =>
        p.name.toLowerCase().includes(t) ||
        p.phone.includes(t) ||
        p.email.toLowerCase().includes(t)
      );
    }
    return list;
  }, [patients, q, filter]);

  const counts = {
    todos: patients.length,
    ativo:   patients.filter(p => p.status === 'ativo').length,
    novo:    patients.filter(p => p.status === 'novo').length,
    inativo: patients.filter(p => p.status === 'inativo').length,
  };

  return (
    <div style={{ flex:1, display:'flex', flexDirection:'column', minWidth:0, overflow:'hidden' }}>
      {/* Header */}
      <div style={{ padding:'14px 20px 0', borderBottom:'1px solid var(--supabase-border)', flexShrink:0 }}>
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:13 }}>
          <div style={{ display:'flex', alignItems:'center', gap:14 }}>
            <h1 style={{ fontSize:15.5, fontWeight:600, color:'var(--supabase-text)', letterSpacing:'-.35px' }}>Pacientes</h1>
            <span style={{ fontSize:12, color:'var(--supabase-text-muted)' }}>{patients.length} cadastrados</span>
          </div>
          <div style={{ display:'flex', alignItems:'center', gap:8 }}>
            {/* Search */}
            <div style={{ position:'relative' }}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="var(--supabase-icon-inactive)" style={{
                position:'absolute', left:9, top:'50%', transform:'translateY(-50%)', pointerEvents:'none',
              }}>
                <path d="M15.5 14h-.79l-.28-.27C15.41 12.59 16 11.11 16 9.5 16 5.91 13.09 3 9.5 3S3 5.91 3 9.5 5.91 16 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"/>
              </svg>
              <input value={q} onChange={e => setQ(e.target.value)}
                placeholder="Buscar paciente…"
                style={{
                  width:240, padding:'6px 11px 6px 28px', borderRadius:'var(--radius-studio)',
                  background:'var(--supabase-bg-card)', border:'1px solid var(--supabase-border)',
                  color:'var(--supabase-text-light)', fontSize:12.5, outline:'none',
                }} />
            </div>
            <button onClick={() => onNewAppointment()} style={{
              padding:'6px 12px', borderRadius:6, cursor:'pointer',
              background:'var(--supabase-bg-input)', border:'1px solid var(--supabase-border)',
              color:'var(--supabase-text-muted)', fontSize:12.5, fontWeight:500,
              display:'flex', alignItems:'center', gap:5,
            }}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="var(--supabase-text-muted)"><path d="M17 12h-5v5h5v-5zM16 1v2H8V1H6v2H5c-1.11 0-1.99.9-1.99 2L3 19c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2h-1V1h-2zm3 18H5V8h14v11z"/></svg>
              Agendar
            </button>
            <button onClick={onAddPatient} style={{
              padding:'6px 13px', borderRadius:6, cursor:'pointer',
              background: accent, border:'none',
              color:'rgba(0,0,0,0.85)', fontSize:12.5, fontWeight:600,
              display:'flex', alignItems:'center', gap:5, letterSpacing:'-.2px',
            }}>
              <span style={{ fontSize:16, lineHeight:1, marginTop:-1 }}>+</span> Novo paciente
            </button>
          </div>
        </div>

        {/* Filter tabs */}
        <div style={{ display:'flex', gap:0, marginBottom:'-1px' }}>
          {[
            { id:'todos',   label:'Todos'    },
            { id:'ativo',   label:'Ativos'   },
            { id:'novo',    label:'Novos'    },
            { id:'inativo', label:'Inativos' },
          ].map(tab => {
            const active = filter === tab.id;
            return (
              <button key={tab.id} onClick={() => setFilter(tab.id)} style={{
                padding:'8px 13px', border:'none', background:'transparent',
                borderBottom: active ? `2px solid ${accent}` : '2px solid transparent',
                color: active ? accent : 'var(--supabase-text-muted)',
                fontSize:12.5, fontWeight: active ? 500 : 400,
                cursor:'pointer', display:'flex', alignItems:'center', gap:5,
              }}>
                {tab.label}
                <span style={{
                  fontSize:10.5, minWidth:18, textAlign:'center',
                  padding:'0 5px', borderRadius:8,
                  background: active ? `${accent}20` : 'var(--supabase-bg-input)',
                  color: active ? accent : 'var(--supabase-text-muted)',
                }}>{counts[tab.id]}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Column headers */}
      <div style={{
        display:'grid',
        gridTemplateColumns:'minmax(220px,2fr) 110px 1fr 1fr 95px 90px 60px 40px',
        gap:10, padding:'8px 20px', borderBottom:'1px solid var(--supabase-border)',
        background:'var(--supabase-bg-main)', flexShrink:0,
      }}>
        {['Paciente','Telefone','E-mail','Convênio','Última','Visitas','Status',''].map((h, i) => (
          <div key={i} style={{
            fontSize:10.5, fontWeight:600, color:'var(--supabase-text-muted)',
            textTransform:'uppercase', letterSpacing:.8,
          }}>{h}</div>
        ))}
      </div>

      {/* Rows */}
      <div style={{ flex:1, overflowY:'auto' }}>
        {filtered.length === 0 && (
          <div style={{ padding:'48px 20px', textAlign:'center', color:'var(--supabase-text-muted)', fontSize:13 }}>
            Nenhum paciente encontrado
          </div>
        )}
        {filtered.map(p => <PatientRow key={p.id} p={p} onEdit={() => onEditPatient(p)} accent={accent} />)}
      </div>
    </div>
  );
}

function PatientRow({ p, onEdit, accent }) {
  const [hov, setHov] = useStateP(false);
  const s = STATUS_PAT[p.status];
  return (
    <div
      onClick={onEdit}
      onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)}
      style={{
        display:'grid',
        gridTemplateColumns:'minmax(220px,2fr) 110px 1fr 1fr 95px 90px 60px 40px',
        gap:10, padding:'0 20px', height:50, alignItems:'center',
        borderBottom:'1px solid var(--supabase-border)',
        background: hov ? 'var(--supabase-bg-card)' : 'transparent',
        borderLeft: `2px solid ${hov ? s.color : 'transparent'}`,
        cursor:'pointer', transition:'all .1s',
      }}>
      {/* Patient */}
      <div style={{ display:'flex', alignItems:'center', gap:10, minWidth:0 }}>
        <div style={{
          width:30, height:30, borderRadius:'50%', flexShrink:0,
          background:`${s.color}18`, border:`1px solid ${s.color}30`,
          display:'flex', alignItems:'center', justifyContent:'center',
          fontSize:11, fontWeight:600, color: s.color,
        }}>{p.initials}</div>
        <div style={{ minWidth:0 }}>
          <div style={{ fontSize:13, color:'var(--supabase-text-light)', fontWeight:500,
            whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{p.name}</div>
          <div style={{ fontSize:11, color:'var(--supabase-text-muted)' }}>
            {p.data_nasc ? `${formatarDataBR(p.data_nasc)} (${p.age} anos)` : (p.age > 0 ? `${p.age} anos` : '—')}
          </div>
        </div>
      </div>
      <div style={{ fontSize:12, color:'var(--supabase-text-muted)' }}>{formatarTelefone(p.phone)}</div>
      <div style={{ fontSize:12, color:'var(--supabase-text-muted)', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{p.email}</div>
      <div style={{ fontSize:12, color:'var(--supabase-text-muted)' }}>{p.convenio}</div>
      <div style={{ fontSize:12, color:'var(--supabase-text-muted)' }}>{p.last}</div>
      <div style={{ fontSize:12, color:'var(--supabase-text-muted)' }}>{p.visits}</div>
      <div>
        <span style={{
          display:'inline-flex', alignItems:'center', gap:4,
          padding:'2px 7px', borderRadius:4,
          background:`${s.color}14`, color:s.color,
          fontSize:10.5, fontWeight:600,
        }}>
          <span style={{ width:5, height:5, borderRadius:'50%', background:s.color }} />
          {s.label}
        </span>
      </div>
      <div style={{ display: 'flex', justifyContent: 'center' }}>
        <button
          onClick={(e) => {
            e.stopPropagation();
            onEdit();
          }}
          title="Editar Paciente"
          style={{
            background: 'none',
            border: 'none',
            color: hov ? accent : 'var(--supabase-text-muted)',
            opacity: hov ? 1.0 : 0.35,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 26,
            height: 26,
            borderRadius: 4,
            transition: 'all 0.15s ease-in-out',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = 'rgba(255,255,255,0.06)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'none';
          }}
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor">
            <path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/>
          </svg>
        </button>
      </div>
    </div>
  );
}

// ─── EXPORTS ─────────────────────────────────────────────────────────────────

Object.assign(window, {
  PATIENTS, STATUS_PAT,
  Modal, Field, Input, Select, ModalFooter,
  AddPatientModal, EditPatientModal, NewAppointmentModal, AprovarPedidoModal, PatientsView,
  formatarTelefone, aplicarMascaraTelefone, formatarDataBR,
});
