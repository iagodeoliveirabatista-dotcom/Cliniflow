// cliniflow-components.jsx
// Shared components, mock data, and views for Cliniflow
// Exports to window: APPOINTMENTS, STATUS_CFG, Avatar, Badge, WaIcon,
//   Sidebar, ListView, CalendarView, KanbanView, DetailPanel

const { useState, useRef } = React;

// ─── MOCK DATA ───────────────────────────────────────────────────────────────

// day: 0=Mon, 1=Tue, 2=Wed, 3=Thu, 4=Fri (current week)
const APPOINTMENTS = [
  // Monday (today) — busy day with overlaps to demonstrate side-by-side rendering
  { id:1,  day:0, time:'08:00', patient:'Ana Lima',        initials:'AL', type:'Consulta de rotina',   doctor:'Dr. Carlos Mendes',   status:'confirmed', wa:true,  dur:30, phone:'(11) 99988-7766', age:34, last:'15 mar 2026' },
  { id:2,  day:0, time:'08:30', patient:'Marcos Oliveira', initials:'MO', type:'Retorno cardiologia',  doctor:'Dra. Fernanda Costa', status:'pending',   wa:false, dur:45, phone:'(11) 91234-5678', age:52, last:'01 mai 2026' },
  { id:3,  day:0, time:'09:15', patient:'Camila Santos',   initials:'CS', type:'Coleta de exames',     doctor:'Dr. Carlos Mendes',   status:'canceled',  wa:true,  dur:20, phone:'(11) 98765-4321', age:28, last:'10 fev 2026' },
  { id:4,  day:0, time:'10:00', patient:'Rafael Souza',    initials:'RS', type:'Consulta de rotina',   doctor:'Dra. Fernanda Costa', status:'confirmed', wa:true,  dur:30, phone:'(11) 97654-3210', age:45, last:'20 abr 2026' },
  { id:5,  day:0, time:'10:30', patient:'Juliana Ferreira',initials:'JF', type:'Pediatria',            doctor:'Dr. Paulo Ribeiro',   status:'confirmed', wa:true,  dur:30, phone:'(11) 96543-2109', age: 8, last:'05 jan 2026' },
  { id:6,  day:0, time:'11:00', patient:'Bruno Alves',     initials:'BA', type:'Check-up geral',       doctor:'Dr. Carlos Mendes',   status:'pending',   wa:false, dur:60, phone:'(11) 95432-1098', age:38, last:'—'           },
  { id:7,  day:0, time:'14:00', patient:'Carlos Mota',     initials:'CM', type:'Consulta de rotina',   doctor:'Dr. Paulo Ribeiro',   status:'canceled',  wa:false, dur:30, phone:'(11) 93210-9876', age:67, last:'14 mar 2026' },
  { id:8,  day:0, time:'15:00', patient:'Diego Lima',      initials:'DL', type:'Pressão arterial',     doctor:'Dr. Carlos Mendes',   status:'confirmed', wa:true,  dur:20, phone:'(11) 91098-7654', age:55, last:'30 abr 2026' },
  { id:9,  day:0, time:'16:00', patient:'Fernando Gomes',  initials:'FG', type:'Retorno clínico',      doctor:'Dr. Carlos Mendes',   status:'confirmed', wa:false, dur:45, phone:'(11) 99876-5432', age:48, last:'15 abr 2026' },
  // Tuesday
  { id:10, day:1, time:'09:00', patient:'Priya Nair',      initials:'PN', type:'Retorno clínico',      doctor:'Dra. Fernanda Costa', status:'confirmed', wa:true,  dur:30, phone:'(11) 94321-0987', age:31, last:'25 abr 2026' },
  { id:11, day:1, time:'11:00', patient:'Silvia Ramos',    initials:'SR', type:'Vacinação',            doctor:'Dra. Fernanda Costa', status:'confirmed', wa:true,  dur:15, phone:'(11) 92109-8765', age:29, last:'08 mai 2026' },
  { id:12, day:1, time:'14:30', patient:'Tatiana Cruz',    initials:'TC', type:'Consulta de rotina',   doctor:'Dr. Paulo Ribeiro',   status:'pending',   wa:true,  dur:30, phone:'(11) 90987-6543', age:42, last:'02 fev 2026' },
  // Wednesday
  { id:13, day:2, time:'08:30', patient:'Roberto Dias',    initials:'RD', type:'Consulta de rotina',   doctor:'Dr. Carlos Mendes',   status:'confirmed', wa:true,  dur:30, phone:'(11) 98877-6655', age:62, last:'12 mar 2026' },
  { id:14, day:2, time:'10:00', patient:'Laura Vieira',    initials:'LV', type:'Pré-natal',            doctor:'Dra. Fernanda Costa', status:'confirmed', wa:true,  dur:45, phone:'(11) 97766-5544', age:27, last:'15 mai 2026' },
  { id:15, day:2, time:'15:00', patient:'Hugo Pereira',    initials:'HP', type:'Retorno clínico',      doctor:'Dr. Paulo Ribeiro',   status:'pending',   wa:false, dur:30, phone:'(11) 96655-4433', age:55, last:'20 mar 2026' },
  // Thursday
  { id:16, day:3, time:'09:30', patient:'Mariana Castro',  initials:'MC', type:'Check-up geral',       doctor:'Dr. Carlos Mendes',   status:'confirmed', wa:true,  dur:60, phone:'(11) 95544-3322', age:41, last:'—'           },
  { id:17, day:3, time:'14:00', patient:'Eduardo Pinto',   initials:'EP', type:'Pressão arterial',     doctor:'Dr. Carlos Mendes',   status:'confirmed', wa:true,  dur:20, phone:'(11) 94433-2211', age:58, last:'22 abr 2026' },
  // Friday
  { id:18, day:4, time:'10:00', patient:'Beatriz Lima',    initials:'BL', type:'Consulta de rotina',   doctor:'Dra. Fernanda Costa', status:'confirmed', wa:true,  dur:30, phone:'(11) 93322-1100', age:36, last:'05 mai 2026' },
  { id:19, day:4, time:'15:30', patient:'Igor Martins',    initials:'IM', type:'Coleta de exames',     doctor:'Dr. Paulo Ribeiro',   status:'pending',   wa:true,  dur:20, phone:'(11) 92211-0099', age:39, last:'18 abr 2026' },
];

const STATUS_CFG = {
  confirmed: { label:'Confirmado', color:'#3ecf8e', bg:'rgba(62,207,142,0.10)' },
  pending:   { label:'Pendente',   color:'#6b7280', bg:'rgba(156,163,175,0.14)' },
  rescheduled: { label:'Solicitado reagendamento', color:'#f59e0b', bg:'rgba(245,158,11,0.10)' },
  canceled:  { label:'Cancelado',  color:'#ef4444', bg:'rgba(239,68,68,0.10)'  },
  solicitado: { label:'Solicitado', color:'#a855f7', bg:'rgba(168, 85, 247, 0.10)' },
  recusado:  { label:'Recusado',   color:'#4b5563', bg:'rgba(107,114,128,0.14)' },
};

// O bot grava a preferência dentro de `notas`, em prosa:
//   "Pedido pelo bot. Preferência do paciente: segunda de manhã"
// Para a recepção decidir o horário, o que importa é só o trecho final — o
// resto é ruído que empurra a informação útil para o meio da frase.
// Aceita também o formato antigo ("Solicitação IA. Preferência: X. Obs: Y").
function extrairPreferencia(notas) {
  if (!notas) return '';
  const m = String(notas).match(/Prefer[êe]ncia(?:\s+do\s+paciente)?:\s*([^.]*)/i);
  const bruto = m ? m[1] : String(notas);
  return bruto.replace(/\s*Obs:.*$/i, '').trim();
}

// Há quanto tempo o pedido está esperando. Para a recepção, "há 2 dias" diz
// mais sobre a urgência da triagem do que a data em que chegou.
function tempoDesde(iso) {
  if (!iso) return '';
  const min = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (min < 1) return 'agora';
  if (min < 60) return `há ${min}min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `há ${h}h`;
  const d = Math.floor(h / 24);
  return `há ${d}d`;
}

const getStatusStyle = (status) => {
  const normalized = {
    confirmed: 'confirmado',
    pending: 'pendente',
    canceled: 'cancelado',
    rescheduled: 'remarcado',
    solicitado: 'solicitado',
    recusado: 'recusado'
  }[status] || status;

  // Um tom médio + alfa, no mesmo estilo do STATUS_CFG — funciona em fundo
  // claro e escuro sem precisar de token por tema (ver Global Constraints
  // sobre o padrão `${cor}NN` usado por Avatar/KanbanView downstream).
  const TONS = {
    confirmado: '#10b981',
    cancelado:  '#ef4444',
    remarcado:  '#f59e0b',
    solicitado: '#a855f7',
    recusado:   '#6b7280',
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

// ─── MICRO COMPONENTS ────────────────────────────────────────────────────────

function Avatar({ initials, size=32, color='#3ecf8e' }) {
  return (
    <div style={{
      width:size, height:size, borderRadius:'50%', flexShrink:0,
      background:`${color}18`, border:`1.5px solid ${color}35`,
      display:'flex', alignItems:'center', justifyContent:'center',
      fontSize:size*0.34, fontWeight:600, color, letterSpacing:-.5,
      userSelect:'none',
    }}>{initials}</div>
  );
}

function Badge({ status }) {
  const s = STATUS_CFG[status];
  return (
    <span style={{
      display:'inline-flex', alignItems:'center', gap:4,
      padding:'2px 7px', borderRadius:4,
      background:s.bg, color:s.color,
      fontSize:11, fontWeight:500, whiteSpace:'nowrap',
    }}>
      <span style={{ width:5, height:5, borderRadius:'50%', background:s.color, flexShrink:0 }} />
      {s.label}
    </span>
  );
}

function WaIcon({ size=13 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="#25d366" style={{flexShrink:0}}>
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
    </svg>
  );
}

function InfoRow({ label, value }) {
  return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap:8 }}>
      <span style={{ fontSize:12, color:'var(--supabase-text-muted)', flexShrink:0 }}>{label}</span>
      <span style={{ fontSize:12.5, color:'var(--supabase-text-light)', textAlign:'right' }}>{value}</span>
    </div>
  );
}

function GhostBtn({ label, color, onClick }) {
  const [hov, setHov] = useState(false);
  return (
    <button onClick={onClick}
      onMouseEnter={()=>setHov(true)} onMouseLeave={()=>setHov(false)}
      style={{
        flex:1, padding:'7px 8px', borderRadius:6,
        background: hov ? `${color}22` : `${color}12`,
        border:`1px solid ${color}30`,
        color, fontSize:12, fontWeight:500, cursor:'pointer',
        transition:'all .15s',
      }}>{label}</button>
  );
}

// ─── SIDEBAR ─────────────────────────────────────────────────────────────────

const NAV_ITEMS = [
  { id:'agenda',     label:'Agenda',      d:'M17 12h-5v5h5v-5zM16 1v2H8V1H6v2H5c-1.11 0-1.99.9-1.99 2L3 19c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2h-1V1h-2zm3 18H5V8h14v11z' },
  { id:'atendimentos', label:'Atendimentos', d:'M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2z' },
  { id:'patients',   label:'Pacientes',   d:'M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z' },
  { id:'automation', label:'Automações',  d:'M19.5 12c0-.23-.01-.45-.03-.68l1.86-1.41c.4-.3.51-.86.26-1.3l-1.87-3.23a.987.987 0 00-1.25-.42l-2.15.91c-.37-.26-.76-.49-1.17-.68l-.29-2.31c-.06-.5-.49-.88-.99-.88h-3.73c-.51 0-.94.38-1 .88l-.29 2.31c-.41.19-.8.42-1.17.68l-2.15-.91c-.46-.2-1-.02-1.25.42L2.41 8.62c-.25.44-.14.99.26 1.3l1.86 1.41a7.343 7.343 0 000 1.35l-1.86 1.41c-.4.3-.51.86-.26 1.3l1.87 3.23c.25.44.79.62 1.25.42l2.15-.91c.37.26.76.49 1.17.68l.29 2.31c.06.5.49.88.99.88h3.73c.5 0 .93-.38.99-.88l.29-2.31c.41-.19.8-.42 1.17-.68l2.15.91c.46.2 1 .02 1.25-.42l1.87-3.23c.25-.44.14-.99-.26-1.3l-1.86-1.41c.03-.23.04-.45.04-.68zm-7.46 3.5c-1.93 0-3.5-1.57-3.5-3.5s1.57-3.5 3.5-3.5 3.5 1.57 3.5 3.5-1.57 3.5-3.5 3.5z' },
  { id:'reports',    label:'Relatórios',  d:'M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zM9 17H7v-7h2v7zm4 0h-2V7h2v10zm4 0h-2v-4h2v4z' },
];

function Sidebar({ accent, currentPage, onNavigate, onOpenSettings }) {
  return (
    <div style={{
      width:216, flexShrink:0, height:'100vh',
      background:'var(--supabase-bg-studio)', borderRight:'1px solid var(--supabase-border)',
      display:'flex', flexDirection:'column',
    }}>
      {/* Logo */}
      <div style={{ padding:'18px 16px 16px', display:'flex', alignItems:'center', gap:9 }}>
        <div style={{
          width:28, height:28, borderRadius:7, background:accent,
          display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0,
        }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="rgba(0,0,0,0.85)">
            <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 14.5v-9l6 4.5-6 4.5z"/>
          </svg>
        </div>
        <span style={{ fontSize:15, fontWeight:600, color:'var(--supabase-text-light)', letterSpacing:-.4 }}>Cliniflow</span>
      </div>

      {/* Nav */}
      <div style={{ flex:1, padding:'2px 8px', display:'flex', flexDirection:'column', gap:1 }}>
        {NAV_ITEMS.map(item => (
          <SidebarItem
            key={item.id}
            item={item}
            active={item.id === currentPage}
            accent={accent}
            onClick={() => onNavigate(item.id)}
          />
        ))}
      </div>

      {/* Footer */}
      <div style={{ borderTop:'1px solid var(--supabase-border)', padding:'10px 8px' }}>
        <SidebarItem
          item={{ id:'settings', label:'Configurações', d:'M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58c.18-.14.23-.41.12-.61l-1.92-3.32c-.12-.22-.37-.29-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94L14.4 2.81c-.04-.24-.24-.41-.48-.41h-3.84c-.24 0-.43.17-.47.41L9.25 5.35c-.59.24-1.13.56-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.22-.07.47.12.61l2.03 1.58c-.05.3-.07.63-.07.94s.02.64.07.94l-2.03 1.58c-.18.14-.23.41-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z' }}
          active={false} accent={accent}
          onClick={() => onOpenSettings && onOpenSettings()}
        />
        {/* Profile */}
        <ProfileFooter />
      </div>
    </div>
  );
}

// Conta da clínica (um login por clínica — DECISIONS D-6). Em modo de
// demonstração, sem Supabase configurado, não há sessão nem botão de sair.
function ProfileFooter() {
  const SB = window.SupabaseService;
  const email = (SB && SB.getCurrentUserEmail && SB.getCurrentUserEmail()) || null;
  const iniciais = email ? email.slice(0, 2).toUpperCase() : '--';
  const [hov, setHov] = useState(false);

  return (
    <div style={{ display:'flex', alignItems:'center', gap:8, padding:'8px 10px', marginTop:2, borderTop:'1px solid var(--supabase-border)' }}>
      <div style={{
        width:26, height:26, borderRadius:'50%', flexShrink:0,
        background:'var(--supabase-bg-card)', border:'1px solid var(--supabase-border)',
        display:'flex', alignItems:'center', justifyContent:'center',
        fontSize:10, fontWeight:600, color:'var(--supabase-text-muted)',
      }}>{iniciais}</div>
      <div style={{ minWidth:0 }}>
        <div style={{ fontSize:12, fontWeight:500, color:'var(--supabase-text-light)', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>
          {email || 'Modo demonstração'}
        </div>
        {email && (
          <button
            onClick={() => SB.signOut()}
            onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)}
            style={{
              padding:0, border:'none', background:'none',
              fontSize:10.5, color: hov ? 'var(--supabase-text-muted)' : 'var(--supabase-icon-inactive)',
              cursor:'pointer', transition:'color .12s',
            }}>
            Sair
          </button>
        )}
      </div>
    </div>
  );
}

function SidebarItem({ item, active, accent, onClick }) {
  const [hov, setHov] = useState(false);
  return (
    <div
      onClick={onClick}
      onMouseEnter={()=>setHov(true)} onMouseLeave={()=>setHov(false)}
      style={{
        display:'flex', alignItems:'center', gap:9,
        padding:'7px 10px', borderRadius:'var(--radius-studio)',
        background: active ? `${accent}14` : hov ? 'var(--supabase-bg-hover)' : 'transparent',
        color: active ? accent : hov ? 'var(--supabase-text-muted)' : 'var(--supabase-icon-inactive)',
        fontSize:13.5, fontWeight: active ? 500 : 400,
        cursor:'pointer', transition:'all .12s', userSelect:'none',
      }}
    >
      <svg width="15" height="15" viewBox="0 0 24 24" fill={active ? accent : hov ? 'var(--supabase-text-muted)' : 'var(--supabase-icon-inactive)'} style={{flexShrink:0}}>
        <path d={item.d}/>
      </svg>
      {item.label}
      {item.id === 'automation' && (
        <span style={{ marginLeft:'auto', fontSize:10, padding:'1px 5px',
          background:`${accent}20`, color:accent, borderRadius:8, fontWeight:600 }}>3</span>
      )}
    </div>
  );
}

// ─── LIST VIEW ────────────────────────────────────────────────────────────────

function ListView({ appointments, selectedId, onSelect, accent }) {
  if (appointments.length === 0) {
    return (
      <div style={{ flex:1, display:'flex', alignItems:'center', justifyContent:'center' }}>
        <div style={{ textAlign:'center' }}>
          <div style={{ fontSize:32, marginBottom:10, opacity:.3 }}>📋</div>
          <div style={{ fontSize:13, color:'var(--supabase-text-muted)' }}>Nenhuma consulta nesta categoria</div>
        </div>
      </div>
    );
  }
  return (
    <div style={{ flex:1, overflowY:'auto', overflowX:'hidden' }}>
      {appointments.map((apt, i) => (
        <AppRow
          key={apt.id}
          apt={apt}
          isSelected={apt.id === selectedId}
          onClick={() => onSelect(apt.id === selectedId ? null : apt.id)}
          accent={accent}
          isLast={i === appointments.length - 1}
        />
      ))}
    </div>
  );
}

function AppRow({ apt, isSelected, onClick, accent, isLast }) {
  const [hov, setHov] = useState(false);
  const s = STATUS_CFG[apt.status] || { color: '#9ca3af', bg: 'rgba(156,163,175,0.10)' };
  const dim = apt.status === 'canceled';
  const isSolicitado = apt.status === 'solicitado';
  const st = getStatusStyle(apt.status);
  return (
    <div
      onClick={onClick}
      onMouseEnter={()=>setHov(true)} onMouseLeave={()=>setHov(false)}
      style={{
        display:'flex', alignItems:'center', gap:12,
        padding:'0 20px', height:54,
        background: isSelected ? 'var(--supabase-bg-card)' : hov ? 'var(--supabase-bg-main)' : 'transparent',
        borderBottom: isLast ? 'none' : '1px solid var(--supabase-border)',
        borderLeft:`2px solid ${(isSelected || hov) ? (isSolicitado ? st.text : s.color) : 'transparent'}`,
        cursor:'pointer', transition:'all .1s',
        opacity: dim ? .55 : 1,
      }}
    >
      {/* Pedido não tem horário — o `time` dele é o instante em que o bot
          gravou, não um compromisso. Mostrar isso como hora enganaria a
          recepção, então no lugar vai a preferência que o paciente falou. */}
      <div style={{ width:46, fontSize:12, fontWeight:500, color:'var(--supabase-text-muted)', flexShrink:0 }}>
        {isSolicitado ? '—' : apt.time}
      </div>
      <Avatar initials={apt.initials} size={28} color={isSolicitado ? st.text : s.color} />
      <div style={{ flex:1, minWidth:0 }}>
        <div style={{ display:'flex', alignItems:'center', gap:5 }}>
          <span style={{
            fontSize:13.5, fontWeight:500, color: isSolicitado ? st.text : 'var(--supabase-text-light)',
            whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis',
            textDecoration: dim ? 'line-through' : 'none',
          }}>{apt.patient}</span>
          {apt.wa && <WaIcon size={12} />}
        </div>
        <div style={{ fontSize:11.5, color:'var(--supabase-text-muted)', marginTop:1.5,
          whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>
          {isSolicitado
            ? `${apt.type} · quer ${extrairPreferencia(apt.notas) || 'horário a combinar'}`
            : `${apt.type} · ${apt.doctor}`}
        </div>
      </div>
      <div style={{ fontSize:11, color:'var(--supabase-text-muted)', flexShrink:0 }}>
        {isSolicitado ? tempoDesde(apt.dataHoraISO) : `${apt.dur}min`}
      </div>
      <div style={{ flexShrink:0 }}><Badge status={apt.status} /></div>
    </div>
  );
}

// ─── CALENDAR VIEW (Google Calendar–style week view) ──────────────────────────
//
// Layout: sticky day-header row + scrollable area with hour gutter + 5 day cols.
// Overlap: events that overlap in time share their column width side-by-side.
// Drag-and-drop: HTML5 drag lets users move an event to any day/time slot,
// snapping to 15-minute increments. The detail panel reflects the change live.

const DAY_LABELS = ['Seg','Ter','Qua','Qui','Sex'];
const DAY_DATES  = ['1','2','3','4','5'];   // Jun 1–5, 2026 (week of)
const TODAY_COL  = 0;                        // Monday = today
const HOUR_START = 7;
const HOUR_END   = 19;
const SLOT_H     = 56;                       // 1 hour = 56px
const GUTTER_W   = 52;

const toMin = t => { const [h,m] = t.split(':').map(Number); return h*60+m; };
const fromMin = m => `${String(Math.floor(m/60)).padStart(2,'0')}:${String(m%60).padStart(2,'0')}`;

// Compute side-by-side positions for events in a single day column.
// For each event, find max parallel overlap → width = colW / parallelCount.
function layoutDay(dayEvts) {
  const sorted = [...dayEvts].sort((a,b) => toMin(a.time) - toMin(b.time));
  const positioned = sorted.map(e => {
    const start = toMin(e.time);
    const end   = start + e.dur;
    return { ...e, _start: start, _end: end, _col: 0, _total: 1 };
  });
  // Assign column index — first free column where no overlap exists.
  positioned.forEach((e, i) => {
    const used = new Set();
    for (let j = 0; j < i; j++) {
      const o = positioned[j];
      if (!(o._end <= e._start || o._start >= e._end)) used.add(o._col);
    }
    let c = 0;
    while (used.has(c)) c++;
    e._col = c;
  });
  // For each event, total = max columns in its overlap cluster.
  positioned.forEach(e => {
    const cluster = positioned.filter(o => !(o._end <= e._start || o._start >= e._end));
    e._total = Math.max(...cluster.map(o => o._col)) + 1;
  });
  return positioned;
}

function CalendarView({ appointments, selectedId, onSelect, accent, onMove, currentMonday }) {
  const hours = Array.from({ length: HOUR_END - HOUR_START }, (_, i) => i + HOUR_START);
  const dayStart = HOUR_START * 60;

  const [dragId, setDragId] = useState(null);
  const [hoverSlot, setHoverSlot] = useState(null); // { day, minute }
  const [dragPos, setDragPos] = useState(null);     // { x, y } — posição do cursor durante o arraste
  const dayColRefs = useRef([]);                    // uma ref por dia visível, na mesma ordem de visibleDays
  const [zoomedDay, setZoomedDay] = useState(null);  // null = week, 0–4 = day view

  const visibleDays = zoomedDay == null ? DAY_LABELS.map((_, i) => i) : [zoomedDay];
  const slotH = zoomedDay == null ? SLOT_H : 78;     // taller rows when zoomed

  const nowMin = 10 * 60 + 45;
  const nowTop = (nowMin - dayStart) / 60 * slotH;

  // Group events by day with overlap layout
  const eventsByDay = DAY_LABELS.map((_, d) =>
    layoutDay(appointments.filter(a => (a.day ?? 0) === d))
  );

  const getDayDates = () => {
    const dates = [];
    const mon = currentMonday ? new Date(currentMonday) : (() => {
      const now = new Date();
      const m = new Date(now);
      m.setDate(now.getDate() - ((now.getDay() + 6) % 7));
      m.setHours(0, 0, 0, 0);
      return m;
    })();
    for (let i = 0; i < 5; i++) {
      const d = new Date(mon);
      d.setDate(mon.getDate() + i);
      dates.push(String(d.getDate()));
    }
    return dates;
  };
  const dayDates = getDayDates();

  const getMonthName = (dOffset) => {
    const mon = currentMonday ? new Date(currentMonday) : (() => {
      const now = new Date();
      const m = new Date(now);
      m.setDate(now.getDate() - ((now.getDay() + 6) % 7));
      m.setHours(0, 0, 0, 0);
      return m;
    })();
    const d = new Date(mon);
    d.setDate(mon.getDate() + dOffset);
    const months = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
    return months[d.getMonth()];
  };

  const todayCol = (() => {
    const now = new Date();
    const mon = currentMonday ? new Date(currentMonday) : null;
    if (!mon) return 0;
    
    // Check if "now" falls in the week of "mon"
    const currentMon = new Date(mon);
    currentMon.setHours(0,0,0,0);
    const currentFri = new Date(currentMon);
    currentFri.setDate(currentMon.getDate() + 4);
    currentFri.setHours(23,59,59,999);
    
    const nowTime = now.getTime();
    if (nowTime >= currentMon.getTime() && nowTime <= currentFri.getTime()) {
      return (now.getDay() + 6) % 7; // 0=Mon, 1=Tue, etc.
    }
    return -1;
  })();

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

  const totalH = (HOUR_END - HOUR_START) * slotH;

  return (
    <div style={{ flex:1, display:'flex', flexDirection:'column', minWidth:0, overflow:'hidden' }}>

      {/* ── Day header row ───────────────────────────────────────────── */}
      <div style={{
        display:'grid',
        gridTemplateColumns: `${GUTTER_W}px repeat(${visibleDays.length}, 1fr)`,
        borderBottom:'1px solid var(--supabase-border)',
        background:'var(--supabase-bg-studio)',
        flexShrink:0,
      }}>
        <div style={{ display:'flex', alignItems:'center', justifyContent:'center' }}>
          {zoomedDay != null && (
            <button onClick={() => setZoomedDay(null)}
              title="Voltar à semana"
              style={{
                width:28, height:28, borderRadius:6, cursor:'pointer',
                background:'var(--supabase-bg-input)', border:'1px solid var(--supabase-border)',
                color:'var(--supabase-text-muted)', fontSize:14, lineHeight:1,
                display:'flex', alignItems:'center', justifyContent:'center',
              }}>‹</button>
          )}
        </div>
        {visibleDays.map(d => {
          const isToday = d === todayCol;
          const isZoomed = zoomedDay != null;
          return (
            <div key={d}
              onClick={() => setZoomedDay(isZoomed ? null : d)}
              title={isZoomed ? 'Voltar à semana' : 'Ampliar este dia'}
              style={{
                padding: isZoomed ? '12px 0 14px' : '10px 0 11px',
                textAlign:'center',
                borderLeft:'1px solid var(--supabase-border)',
                cursor:'pointer',
              }}>
              <div style={{ fontSize: isZoomed ? 12 : 10.5, fontWeight:600,
                color: isToday ? accent : 'var(--supabase-text-muted)',
                letterSpacing:1, textTransform:'uppercase' }}>
                {DAY_LABELS[d]}{isZoomed && `, ${dayDates[d]} de ${getMonthName(d)}`}
              </div>
              {!isZoomed && (
                <div style={{
                  display:'inline-flex', alignItems:'center', justifyContent:'center',
                  marginTop:4, width:24, height:24, borderRadius:'50%',
                  background: isToday ? accent : 'transparent',
                  color: isToday ? 'rgba(0,0,0,0.85)' : 'var(--supabase-text-muted)',
                  fontSize:13, fontWeight:600,
                }}>{dayDates[d]}</div>
              )}
            </div>
          );
        })}
      </div>

      {/* ── Scrollable grid ──────────────────────────────────────────── */}
      <div style={{ flex:1, overflowY:'auto', overflowX:'hidden' }}>
        <div style={{
          display:'grid',
          gridTemplateColumns: `${GUTTER_W}px repeat(${visibleDays.length}, 1fr)`,
          position:'relative',
        }}>
          {/* Hour gutter */}
          <div style={{ position:'relative', height: totalH }}>
            {hours.map((h, i) => (
              <div key={h} style={{
                position:'absolute', top: i * slotH - 7, right: 8,
                fontSize:10.5, color:'var(--supabase-text-muted)', fontWeight:500,
                letterSpacing:.3, textAlign:'right',
              }}>
                {i === 0 ? '' : `${String(h).padStart(2,'0')}:00`}
              </div>
            ))}
          </div>

          {/* Day columns */}
          {visibleDays.map((dayIdx, i) => {
            const isToday = dayIdx === todayCol;
            return (
              <div
                key={dayIdx}
                ref={el => { dayColRefs.current[i] = el; }}
                style={{
                  position:'relative',
                  height: totalH,
                  borderLeft:'1px solid var(--supabase-border-strong)',
                  background: isToday ? `${accent}0d` : 'transparent',
                }}
              >
                {/* Horizontal hour lines */}
                {hours.map((_, i) => (
                  <div key={i} style={{
                    position:'absolute', left:0, right:0, top: i * slotH,
                    borderTop:'1px solid var(--supabase-border-strong)',
                  }} />
                ))}
                {/* Half-hour ticks */}
                {hours.map((_, i) => (
                  <div key={`half-${i}`} style={{
                    position:'absolute', left:0, right:0, top: i * slotH + slotH/2,
                    borderTop:'1px dashed var(--supabase-border-strong)',
                  }} />
                ))}

                {/* "Now" indicator on today */}
                {isToday && (
                  <div style={{
                    position:'absolute', left:0, right:0, top: nowTop,
                    pointerEvents:'none', zIndex:6,
                    display:'flex', alignItems:'center',
                  }}>
                    <div style={{
                      width:7, height:7, borderRadius:'50%', background:accent,
                      marginLeft:-3.5, flexShrink:0,
                      boxShadow:`0 0 0 3px ${accent}22`,
                    }} />
                    <div style={{ flex:1, height:1.5, background:accent }} />
                  </div>
                )}

                {/* Drop ghost preview */}
                {dragId != null && hoverSlot && hoverSlot.day === dayIdx && (() => {
                  const dragApt = appointments.find(a => a.id === dragId);
                  if (!dragApt) return null;
                  const top = (hoverSlot.minute - dayStart) / 60 * slotH;
                  const h = Math.max(dragApt.dur / 60 * slotH - 3, 22);
                  return (
                    <div style={{
                      position:'absolute', left:4, right:4, top, height:h,
                      borderRadius:5,
                      background:`${accent}1a`,
                      border:`1.5px dashed ${accent}80`,
                      pointerEvents:'none', zIndex:7,
                      display:'flex', alignItems:'center', justifyContent:'center',
                      fontSize:11, fontWeight:600, color:accent, letterSpacing:.2,
                    }}>
                      {fromMin(hoverSlot.minute)}
                    </div>
                  );
                })()}

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
              </div>
            );
          })}

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
        </div>
      </div>
    </div>
  );
}

function CalEvent({ apt, dayStart, slotH, selected, dragging, onSelect, onPointerDown }) {
  const [hov, setHov] = useState(false);
  const s = STATUS_CFG[apt.status] || { color: '#9ca3af', bg: 'rgba(156,163,175,0.10)' };
  const sh = slotH || SLOT_H;
  const top = (apt._start - dayStart) / 60 * sh;
  const height = Math.max(apt.dur / 60 * sh - 2, 22);

  const widthPct = 100 / apt._total;
  const leftPct  = apt._col * widthPct;

  const dim = apt.status === 'canceled';
  const compact = height < 36;

  const styleVal = getStatusStyle(apt.status);
  const isSolicitado = apt.status === 'solicitado';

  return (
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
      <div style={{
        display:'flex', alignItems:'center', gap:4, minWidth:0,
      }}>
        <span style={{
          fontSize:11.5, fontWeight:600,
          color: isSolicitado ? styleVal.text : dim ? 'var(--supabase-text-muted)' : 'var(--supabase-text-light)',
          whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis',
          textDecoration: dim ? 'line-through' : 'none',
          letterSpacing:'-.1px',
        }}>{apt.patient}</span>
        {apt.wa && !dim && <WaIcon size={10} />}
      </div>
      {!compact && (
        <div style={{
          fontSize:10.5,
          color: isSolicitado ? `${styleVal.text}aa` : dim ? 'var(--supabase-icon-inactive)' : 'var(--supabase-text-muted)',
          whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis',
        }}>
          {apt.time} · {apt.type}
        </div>
      )}
      {compact && (
        <span style={{
          fontSize:10.5, color: isSolicitado ? `${styleVal.text}aa` : 'var(--supabase-text-muted)', flexShrink:0,
          whiteSpace:'nowrap',
        }}>{apt.time}</span>
      )}
    </div>
  );
}

// ─── KANBAN VIEW ──────────────────────────────────────────────────────────────

function KanbanView({ appointments, selectedId, onSelect, accent }) {
  const cols = [
    { id:'solicitado', ...STATUS_CFG.solicitado },
    { id:'pending',   ...STATUS_CFG.pending   },
    { id:'rescheduled', ...STATUS_CFG.rescheduled },
    { id:'confirmed', ...STATUS_CFG.confirmed },
    { id:'canceled',  ...STATUS_CFG.canceled  },
  ];
  return (
    <div style={{ flex:1, display:'flex', gap:10, padding:'16px 20px', overflow:'hidden' }}>
      {cols.map(col => {
        const items = appointments.filter(a => a.status === col.id);
        return (
          <div key={col.id} style={{
            flex:1, minWidth:220, display:'flex', flexDirection:'column',
            background:'var(--supabase-bg-studio)', border:'1px solid var(--supabase-border)',
            borderRadius:8, overflow:'hidden',
          }}>
            {/* Column header */}
            <div style={{ padding:'11px 14px 10px', borderBottom:'1px solid var(--supabase-border)',
              display:'flex', alignItems:'center', gap:7, flexShrink:0 }}>
              <span style={{ width:7, height:7, borderRadius:'50%', background:col.color, flexShrink:0 }} />
              <span style={{ fontSize:12, fontWeight:600, color:col.color, letterSpacing:.2 }}>{col.label}</span>
              <span style={{ marginLeft:'auto', fontSize:11, color:'var(--supabase-text-muted)',
                background:'var(--supabase-bg-input)', padding:'1px 7px', borderRadius:8 }}>{items.length}</span>
            </div>
            {/* Cards */}
            <div style={{ flex:1, overflowY:'auto', padding:'10px 10px', display:'flex', flexDirection:'column', gap:7 }}>
              {items.map(apt => {
                const isSel = apt.id === selectedId;
                return (
                  <div key={apt.id} onClick={() => onSelect(apt.id === selectedId ? null : apt.id)}
                    style={{
                      background: isSel ? 'var(--supabase-bg-main)' : 'var(--supabase-bg-card)',
                      border:`1px solid ${isSel ? col.color+'44' : 'var(--supabase-border)'}`,
                      borderRadius:'var(--radius-studio)', padding:'10px 12px', cursor:'pointer',
                      transition:'all .12s',
                    }}
                  >
                    <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:5 }}>
                      <span style={{ fontSize:13, fontWeight:500, color:'var(--supabase-text-light)', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis', maxWidth:130 }}>{apt.patient}</span>
                      {apt.wa && <WaIcon size={12} />}
                    </div>
                    <div style={{ fontSize:11.5, color:'var(--supabase-text-muted)', marginBottom:7, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{apt.type}</div>
                    <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                      <span style={{ fontSize:11, color:'var(--supabase-text-muted)', background:'var(--supabase-bg-hover)',
                        padding:'2px 7px', borderRadius:4, border:'1px solid var(--supabase-border)' }}>{apt.time}</span>
                      <span style={{ fontSize:11, color:'var(--supabase-text-muted)',
                        whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>
                        {apt.doctor.split(' ').slice(0,2).join(' ')}
                      </span>
                    </div>
                  </div>
                );
              })}
              {items.length === 0 && (
                <div style={{ textAlign:'center', padding:'24px 0', color:'var(--supabase-text-muted)', fontSize:12 }}>Nenhuma</div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── DETAIL PANEL ─────────────────────────────────────────────────────────────

function DetailPanel({ appointment: apt, onClose, accent, onUpdateStatus, onDelete, onUpdatePreco, onUpdateDuracao, onAprovarPedido, onAvisarPaciente }) {
  const [waState, setWaState] = useState(null); // null | 'sending' | 'sent'
  const [avisoState, setAvisoState] = useState(null); // null | 'sending' | 'sent' | mensagem de erro
  const [precoInput, setPrecoInput] = useState(apt.preco !== undefined && apt.preco !== null ? String(apt.preco) : '');

  const selectedConsulta = apt;
  // Antes isto só marcava como 'confirmed' — o botão prometia "Definir Horário"
  // e não abria formulário nenhum, então não havia como escolher quando seria.
  const abrirFormularioEdicao = (c) => {
    onAprovarPedido && onAprovarPedido(c);
  };
  // Recusar não apaga mais: marca 'recusado' e sai da fila. É ferramenta de
  // organização da recepção — falar com o paciente sobre a recusa é humano.
  const deletarConsulta = (id) => {
    if (confirm("Recusar esta solicitação? Ela sai da caixa de entrada, mas fica no histórico do paciente.")) {
      onUpdateStatus && onUpdateStatus(id, 'recusado');
    }
  };

  useEffect(() => {
    setPrecoInput(apt.preco !== undefined && apt.preco !== null ? String(apt.preco) : '');
  }, [apt.id, apt.preco]);

  const handlePrecoBlur = () => {
    const parsed = precoInput.trim() === '' ? null : parseFloat(precoInput);
    if (parsed !== apt.preco) {
      onUpdatePreco && onUpdatePreco(apt.id, parsed);
    }
  };

  const handlePrecoKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.target.blur();
    }
  };

  const s = STATUS_CFG[apt.status];
  const SB = window.SupabaseService;

  const sendWa = async () => {
    if (waState === 'sent') return;
    setWaState('sending');

    if (SB && SB.isConnected() && apt.phone) {
      // Real send via n8n webhook
      const msg = SB.aplicarTemplate(
        'Olá {nome}! 😊 Lembramos da sua consulta ({tipo}) amanhã às {hora} com {medico}. Confirme: ✅ CONFIRMAR ou ❌ CANCELAR',
        { nome: apt.patient, data: '—', hora: apt.time, medico: apt.doctor, tipo: apt.type }
      );
      const cleanPhone = apt.phone.replace(/\D/g, '');
      const result = await SB.enviarWhatsApp(cleanPhone, msg, 'manual', apt._supabaseId || null, apt.patient);
      setWaState(result.success ? 'sent' : 'failed');
      if (!result.success) setTimeout(() => setWaState(null), 2500);
    } else {
      // Mock fallback
      setTimeout(() => setWaState('sent'), 1400);
    }
  };

  return (
    <div style={{
      width:292, flexShrink:0, height:'100%',
      background:'var(--supabase-bg-studio)', borderLeft:'1px solid var(--supabase-border)',
      display:'flex', flexDirection:'column', overflowY:'auto',
    }}>
      {/* Header */}
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between',
        padding:'13px 16px', borderBottom:'1px solid var(--supabase-border)', flexShrink:0 }}>
        <span style={{ fontSize:12.5, fontWeight:500, color:'var(--supabase-text-muted)' }}>Detalhes da consulta</span>
        <button onClick={onClose} style={{
          background:'none', border:'none', color:'var(--supabase-text-muted)', cursor:'pointer',
          width:22, height:22, borderRadius:4, fontSize:17, lineHeight:'22px',
          display:'flex', alignItems:'center', justifyContent:'center',
          transition:'all .12s',
        }}>×</button>
      </div>

      {/* Patient */}
      <div style={{ padding:'16px', borderBottom:'1px solid var(--supabase-border)' }}>
        <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom:14 }}>
          <Avatar initials={apt.initials} size={44} color={s.color} />
          <div>
            <div style={{ fontSize:15, fontWeight:600, color:'var(--supabase-text-light)' }}>{apt.patient}</div>
            <div style={{ fontSize:12, color:'var(--supabase-text-muted)', marginTop:2 }}>{apt.age} anos</div>
          </div>
          <div style={{ marginLeft:'auto' }}><Badge status={apt.status} /></div>
        </div>
        <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
          <InfoRow label="Telefone" value={window.formatarTelefone ? window.formatarTelefone(apt.phone) : apt.phone} />
          <InfoRow label="Última consulta" value={apt.last} />
          <InfoRow label="Convênio" value="Particular" />
        </div>
      </div>

      {/* Appointment */}
      <div style={{ padding:'14px 16px', borderBottom:'1px solid var(--supabase-border)' }}>
        <div style={{ fontSize:10.5, fontWeight:600, color:'var(--supabase-text-muted)', textTransform:'uppercase', letterSpacing:.9, marginBottom:10 }}>Consulta de hoje</div>
        <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
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
          <InfoRow label="Tipo" value={apt.type} />
          <InfoRow label="Médico(a)" value={apt.doctor} />
          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap:8 }}>
            <span style={{ fontSize:12, color:'var(--supabase-text-muted)', flexShrink:0 }}>Preço</span>
            <div style={{ display:'flex', alignItems:'center', gap:4 }}>
              <span style={{ fontSize:11.5, color:'var(--supabase-text-muted)' }}>R$</span>
              <input
                type="number"
                step="0.01"
                min="0"
                value={precoInput}
                onChange={e => setPrecoInput(e.target.value)}
                onBlur={handlePrecoBlur}
                onKeyDown={handlePrecoKeyDown}
                placeholder="0.00"
                style={{
                  width:80, background:'var(--supabase-bg-input)', border:'1px solid var(--supabase-border)',
                  borderRadius:5, color:'var(--supabase-text-light)', fontSize:12, textAlign: 'right',
                  padding:'3px 6px', outline:'none', transition:'border-color .12s',
                }}
                onFocus={e => e.target.style.borderColor = 'var(--supabase-text-muted)'}
              />
            </div>
          </div>
        </div>
      </div>

      {/* WhatsApp */}
      <div style={{ padding:'14px 16px', borderBottom:'1px solid var(--supabase-border)' }}>
        {apt.wa ? (
          <button onClick={sendWa} style={{
            width:'100%', padding:'9px 14px', borderRadius:6, cursor: waState === 'sent' ? 'default' : 'pointer',
            background: waState === 'sent' ? 'rgba(37,211,102,.14)' : 'rgba(37,211,102,.08)',
            border:`1px solid ${waState === 'sent' ? '#25d36655' : 'rgba(37,211,102,.2)'}`,
            display:'flex', alignItems:'center', justifyContent:'center', gap:7,
            color: waState === 'sent' ? '#25d366' : '#22c55e',
            fontSize:12.5, fontWeight:500, transition:'all .2s',
          }}>
            <WaIcon size={14} />
            {waState === 'sending' ? 'Enviando…' : waState === 'sent' ? 'Lembrete enviado ✓' : 'Enviar lembrete WhatsApp'}
          </button>
        ) : (
          <div style={{ fontSize:12, color:'var(--supabase-text-muted)', textAlign:'center', padding:'8px',
            background:'var(--supabase-bg-input)', borderRadius:6, border:'1px solid var(--supabase-border)' }}>
            WhatsApp não cadastrado
          </div>
        )}
      </div>

      {/* Actions */}
      <div style={{ padding:'14px 16px', borderBottom:'1px solid var(--supabase-border)', display:'flex', flexDirection:'column', gap:8 }}>
        {selectedConsulta.status === 'solicitado' ? (
          <div style={{ padding: 12, background: 'rgba(168, 85, 247, 0.08)', borderRadius: 8 }}>
            <p style={{ margin: '0 0 4px 0', fontSize: 11, fontWeight: 600, color: '#a855f7', textTransform: 'uppercase', letterSpacing: .6 }}>
              🤖 Pedido feito pelo bot
            </p>
            {/* A preferência é o dado que decide o horário, então sai do meio da
                frase e vira a informação principal do bloco. */}
            <p style={{ margin: '0 0 2px 0', fontSize: 14, color: 'var(--supabase-text-light)', fontWeight: 500 }}>
              {extrairPreferencia(selectedConsulta.notas) || 'Sem preferência informada'}
            </p>
            <p style={{ margin: '0 0 10px 0', fontSize: 11.5, color: 'var(--supabase-text-muted)' }}>
              é o que o paciente pediu — você define o horário exato ao aprovar
            </p>
            <div style={{ display: 'flex', gap: 10 }}>
              <button
                onClick={() => abrirFormularioEdicao(selectedConsulta)}
                style={{ background: '#a855f7', color: 'white', border: 'none', padding: '8px 12px', borderRadius: 6, cursor: 'pointer', fontSize: 12, fontWeight: 500 }}
              >
                Aprovar e Definir Horário
              </button>
              <button
                onClick={() => deletarConsulta(selectedConsulta.id)}
                style={{ background: 'transparent', color: '#ef4444', border: '1px solid rgba(239,68,68,.35)', padding: '8px 12px', borderRadius: 6, cursor: 'pointer', fontSize: 12, fontWeight: 500 }}
              >
                Recusar
              </button>
            </div>
          </div>
        ) : (
          <>
            {/* Pedido do bot que já teve horário definido, mas o paciente ainda
                não sabe qual foi. Fica visível até ser avisado — de propósito:
                avisar é decisão da recepção, mas esquecer não pode ser silencioso. */}
            {apt.veioDoBot && !apt.pacienteAvisadoEm && apt.status !== 'canceled' && (
              <div style={{ padding: 12, background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,.25)', borderRadius: 8 }}>
                <p style={{ margin: '0 0 8px 0', fontSize: 12.5, color: 'var(--supabase-text-light)' }}>
                  O paciente pediu <strong>{extrairPreferencia(apt.notas) || 'um horário'}</strong> e ainda não sabe que ficou{' '}
                  <strong>{apt.time}</strong>.
                </p>
                <button
                  disabled={avisoState === 'sending' || avisoState === 'sent'}
                  onClick={async () => {
                    setAvisoState('sending');
                    const r = await (onAvisarPaciente && onAvisarPaciente(apt));
                    setAvisoState(r && r.success ? 'sent' : (r && r.error) || 'Não foi possível avisar');
                  }}
                  style={{
                    width: '100%', background: avisoState === 'sent' ? 'rgba(37,211,102,.14)' : '#f59e0b',
                    color: avisoState === 'sent' ? '#25d366' : '#1f2937',
                    border: 'none', padding: '8px 12px', borderRadius: 6,
                    cursor: avisoState ? 'default' : 'pointer', fontSize: 12, fontWeight: 600,
                  }}
                >
                  {avisoState === 'sending' ? 'Enviando…'
                    : avisoState === 'sent' ? 'Paciente avisado ✓'
                    : 'Avisar paciente do horário'}
                </button>
                {avisoState && avisoState !== 'sending' && avisoState !== 'sent' && (
                  // Falha explícita: fora da janela de 24h da Meta o envio é
                  // recusado. Dizer isso é melhor que a recepção achar que avisou.
                  <p style={{ margin: '8px 0 0', fontSize: 11.5, color: '#ef4444', lineHeight: 1.4 }}>
                    {avisoState} — fale com o paciente por outro canal.
                  </p>
                )}
              </div>
            )}
            <div style={{ display:'flex', gap:8 }}>
              {(apt.status === 'pending' || apt.status === 'rescheduled') && <>
                <GhostBtn label="Confirmar" color={accent} onClick={() => onUpdateStatus(apt.id, 'confirmed')} />
                <GhostBtn label="Cancelar" color="#ef4444" onClick={() => onUpdateStatus(apt.id, 'canceled')} />
              </>}
              {apt.status === 'confirmed' && <>
                <GhostBtn label="Reagendar" color={accent} onClick={() => onUpdateStatus(apt.id, 'pending')} />
                <GhostBtn label="Cancelar" color="#ef4444" onClick={() => onUpdateStatus(apt.id, 'canceled')} />
              </>}
              {apt.status === 'canceled' && (
                <GhostBtn label="Reagendar consulta" color={accent} onClick={() => onUpdateStatus(apt.id, 'pending')} />
              )}
            </div>
            <button
              onClick={() => {
                if (confirm("Tem certeza que deseja deletar permanentemente este agendamento?")) {
                  onDelete && onDelete(apt.id);
                }
              }}
              style={{
                width: '100%',
                padding: '7px 8px',
                borderRadius: 6,
                background: 'transparent',
                border: '1px dashed #ef444450',
                color: '#ef4444',
                fontSize: 12,
                fontWeight: 500,
                cursor: 'pointer',
                marginTop: 4,
                transition: 'all .15s',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'rgba(239, 68, 68, 0.1)';
                e.currentTarget.style.borderColor = '#ef4444';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'transparent';
                e.currentTarget.style.borderColor = '#ef444450';
              }}
            >
              🗑️ Deletar Agendamento
            </button>
          </>
        )}
      </div>

      {/* History */}
      <div style={{ padding:'14px 16px' }}>
        <div style={{ fontSize:10.5, fontWeight:600, color:'var(--supabase-text-muted)', textTransform:'uppercase', letterSpacing:.9, marginBottom:12 }}>Histórico</div>
        <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
          {[
            { date:'15 mar 2026', label:'Consulta de rotina', ok:true },
            { date:'10 jan 2026', label:'Check-up geral', ok:true },
            { date:'04 nov 2025', label:'Retorno clínico', ok:true },
          ].map((h,i) => (
            <div key={i} style={{ display:'flex', gap:10, alignItems:'flex-start' }}>
              <div style={{ width:6, height:6, borderRadius:'50%', background:'var(--supabase-border)', flexShrink:0, marginTop:5 }} />
              <div>
                <div style={{ fontSize:11, color:'var(--supabase-text-muted)' }}>{h.date}</div>
                <div style={{ fontSize:12, color:'var(--supabase-text-muted)' }}>{h.label}</div>
              </div>
              <Badge status="confirmed" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

const { useState: useStateChat, useEffect: useEffectChat, useRef: useRefChat, useCallback: useCallbackChat } = React;

function AtendimentosView({ accent }) {
  const [conversas, setConversas] = useStateChat([]);
  const [selectedId, setSelectedId] = useStateChat(null);
  const [mensagens, setMensagens] = useStateChat([]);
  const [filtro, setFiltro] = useStateChat('nao_atribuidas'); // 'minhas' | 'nao_atribuidas' | 'resolvidas'
  const [texto, setTexto] = useStateChat('');
  const [loading, setLoading] = useStateChat(true);
  const [loadingChat, setLoadingChat] = useStateChat(false);
  const [sending, setSending] = useStateChat(false);

  const messagesEndRef = useRefChat(null);
  const isConnected = window.SupabaseService && window.SupabaseService.isConnected();
  // Um login por clínica (DECISIONS D-6): identifica a conta, não a pessoa.
  // Alimenta o rótulo "Humano" e as abas minhas/não atribuídas — "alguém assumiu".
  const currentUserId = (window.SupabaseService && window.SupabaseService.getCurrentUserId()) || null;

  const selectedConversa = conversas.find(c => c.id === selectedId) || null;

  // Carregar conversas
  const carregarConversas = useCallbackChat(async () => {
    if (!isConnected) { setLoading(false); return; }
    setLoading(true);
    
    // Mapeamento de abas para filtros do banco
    let filtros = {};
    if (filtro === 'minhas') {
      filtros.assigneeId = currentUserId;
      filtros.status = 'open';
    } else if (filtro === 'nao_atribuidas') {
      filtros.assigneeId = null;
      filtros.status = 'open';
    } else if (filtro === 'resolvidas') {
      filtros.status = 'resolved';
    }
    
    const res = await window.SupabaseService.fetchConversas(filtros);
    if (res.data) setConversas(res.data);
    setLoading(false);
  }, [filtro, isConnected]);

  useEffectChat(() => {
    carregarConversas();
  }, [carregarConversas]);

  // Se inscrever para atualizações de conversas
  useEffectChat(() => {
    if (!isConnected) return;
    const sub = window.SupabaseService.subscribeToConversas(() => {
      carregarConversas();
    });
    return () => {
      if (sub) sub.unsubscribe();
    };
  }, [isConnected, carregarConversas]);

  const [activeSession, setActiveSession] = useStateChat(null);

  // Carregar mensagens quando selecionar conversa
  useEffectChat(() => {
    if (!selectedId || !isConnected) { 
      setMensagens([]); 
      setActiveSession(null);
      return; 
    }
    setLoadingChat(true);
    
    window.SupabaseService.fetchMensagens(selectedId).then(res => {
      if (res.data) setMensagens(res.data);
      setLoadingChat(false);
    });

    if (selectedConversa && selectedConversa.patient?.telefone) {
      if (isConnected) {
        if (window.SupabaseService.fetchActiveSession) {
          window.SupabaseService.fetchActiveSession(selectedConversa.patient.telefone).then(res => {
            if (res.data) setActiveSession(res.data);
            else setActiveSession(null);
          });
        }
      } else {
        if (selectedConversa.assignee_id) {
          setActiveSession({ atendimento_humano: true });
        } else {
          setActiveSession(null);
        }
      }
    }

    // Se inscreve em novas mensagens e atualizações
    const channel = window.SupabaseService.subscribeToMensagens(selectedId, (payload) => {
      if (payload.eventType === 'INSERT') {
        setMensagens(prev => {
          // Evita duplicados comparando IDs de banco reais
          if (prev.some(m => m.id === payload.new.id)) return prev;
          return [...prev, payload.new];
        });
        if (selectedConversa && selectedConversa.patient?.telefone) {
          if (isConnected && window.SupabaseService.fetchActiveSession) {
            window.SupabaseService.fetchActiveSession(selectedConversa.patient.telefone).then(res => {
              if (res.data) setActiveSession(res.data);
            });
          }
        }
      } else if (payload.eventType === 'UPDATE') {
        setMensagens(prev => prev.map(m => m.id === payload.new.id ? { ...m, ...payload.new } : m));
      }
    });

    return () => {
      if (channel) channel.unsubscribe();
    };
  }, [selectedId, isConnected, selectedConversa?.patient?.telefone, selectedConversa?.assignee_id]);

  // Scroll para o fim das mensagens
  useEffectChat(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [mensagens]);

  const handleEnviar = async (e) => {
    e.preventDefault();
    if (!texto.trim() || !selectedConversa || sending) return;
    setSending(true);

    const telefone = selectedConversa.patient?.telefone;
    const patientId = selectedConversa.patient?.id;

    if (isConnected) {
      const res = await window.SupabaseService.enviarMensagemCRM(
        selectedId,
        patientId,
        telefone,
        texto,
        currentUserId
      );
      if (res.success) {
        setTexto('');
      } else {
        alert('Erro ao enviar mensagem');
      }
    } else {
      // Mock envio local
      const novaMsg = {
        id: Math.random().toString(),
        conversation_id: selectedId,
        telefone,
        mensagem: texto,
        direcao: 'saida',
        tipo: 'manual',
        sender_id: currentUserId,
        enviado_em: new Date().toISOString(),
        status: 'sent'
      };
      setMensagens(prev => [...prev, novaMsg]);
      setTexto('');
    }
    setSending(false);
  };

  const togglePausaBot = async () => {
    if (!selectedConversa) return;
    const currentVal = selectedConversa.patient?.bot_pausado || false;
    const newVal = !currentVal;
    
    // Atualiza otimista no estado local
    setConversas(prev => prev.map(c => {
      if (c.id === selectedId) {
        return {
          ...c,
          patient: { ...c.patient, bot_pausado: newVal }
        };
      }
      return c;
    }));

    if (isConnected && selectedConversa.patient?.id) {
      await window.SupabaseService.updatePaciente(selectedConversa.patient.id, {
        bot_pausado: newVal
      });
    }
  };

  const alterarStatusConversa = async (novoStatus) => {
    if (!selectedConversa) return;
    
    setConversas(prev => prev.map(c => {
      if (c.id === selectedId) {
        return { ...c, status: novoStatus };
      }
      return c;
    }));

    if (isConnected) {
      if (novoStatus === 'resolved' && window.SupabaseService.updateConversaStatus) {
        await window.SupabaseService.updateConversaStatus(selectedId, 'resolved');
        setActiveSession(null);
      } else {
        await window.SupabaseService.updateConversa(selectedId, { status: novoStatus });
      }
    }
    
    // Fecha conversa selecionada se mudar status
    setSelectedId(null);
  };

  const atribuirConversa = async () => {
    if (!selectedConversa) return;

    setConversas(prev => prev.map(c => {
      if (c.id === selectedId) {
        return { ...c, assignee_id: currentUserId };
      }
      return c;
    }));

    if (isConnected) {
      await window.SupabaseService.updateConversa(selectedId, { assignee_id: currentUserId });
    }
  };

  // Mock dados demo
  const mockConversas = [
    { id: 'c-1', display_id: 1, status: 'open', assignee_id: null, patient: { id: 'p-1', nome: 'Iago de Oliveira', telefone: '88981458633', bot_pausado: false }, last_activity_at: new Date().toISOString() },
    { id: 'c-2', display_id: 2, status: 'open', assignee_id: currentUserId, patient: { id: 'p-2', nome: 'Ana Silva', telefone: '11999999999', bot_pausado: true }, last_activity_at: new Date(Date.now() - 3600000).toISOString() },
    { id: 'c-3', display_id: 3, status: 'resolved', assignee_id: null, patient: { id: 'p-3', nome: 'Marcos Souza', telefone: '88988888888', bot_pausado: false }, last_activity_at: new Date(Date.now() - 7200000).toISOString() },
  ];

  const mockMensagens = [
    { id: 'm-1', mensagem: 'Olá, gostaria de saber se vocês aceitam convênio Bradesco?', direcao: 'entrada', enviado_em: new Date(Date.now() - 300000).toISOString() },
    { id: 'm-2', mensagem: 'Olá Iago! Sim, nós atendemos consultas no particular e fornecemos a documentação completa para você solicitar reembolso junto ao Bradesco Saúde. 😊', direcao: 'saida', tipo: 'auto', enviado_em: new Date(Date.now() - 240000).toISOString(), sender_id: null }, // IA
    { id: 'm-3', mensagem: 'Entendi. E qual o valor da consulta?', direcao: 'entrada', enviado_em: new Date(Date.now() - 120000).toISOString() }
  ];

  const displayConversas = isConnected ? conversas : mockConversas;
  const displayMensagens = isConnected ? mensagens : (selectedId ? mockMensagens : []);

  const renderBotStatus = () => {
    if (!selectedConversa) return null;
    const isPaused = selectedConversa.patient?.bot_pausado;
    const isHuman = activeSession?.atendimento_humano;

    let text = "🤖 IA Ativa";
    let color = "#10b981";
    if (isPaused) {
      text = "⏸️ IA Pausada";
      color = "#ef4444";
    } else if (isHuman) {
      text = "👤 Atendimento Humano";
      color = "#f59e0b";
    }

    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color }}>
        <span style={{ width: 8, height: 8, borderRadius: '50%', background: color }} />
        <strong>{text}</strong>
        {isHuman && !isPaused && (
          <button
            onClick={async () => {
              if (window.SupabaseService.updateConversaStatus) {
                await window.SupabaseService.updateConversaStatus(selectedConversa.id, 'resolved');
              }
              alterarStatusConversa('resolved');
              setActiveSession(null);
            }}
            style={{ 
              fontSize: 10, 
              padding: '2px 6px', 
              cursor: 'pointer',
              background: 'rgba(62,207,142,0.1)',
              border: '1px solid rgba(62,207,142,0.3)',
              color: '#3ecf8e',
              borderRadius: 4,
              fontWeight: 500,
              marginLeft: 8,
              transition: 'all 0.15s',
            }}
            onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(62,207,142,0.2)'}
            onMouseLeave={(e) => e.currentTarget.style.background = 'rgba(62,207,142,0.1)'}
          >
            Reativar IA
          </button>
        )}
      </div>
    );
  };

  return (
    <div style={{ flex: 1, display: 'flex', height: '100%', minWidth: 0, overflow: 'hidden' }}>
      
      {/* 1. Painel Esquerdo: Lista de Chats */}
      <div style={{
        width: 280, flexShrink: 0, borderRight: '1px solid var(--supabase-border)',
        display: 'flex', flexDirection: 'column', background: 'var(--supabase-bg-studio)'
      }}>
        {/* Filtros abas */}
        <div style={{ padding: '12px 14px', borderBottom: '1px solid var(--supabase-border)', flexShrink: 0 }}>
          <div style={{ display: 'flex', gap: 4, background: 'var(--supabase-bg-input)', padding: 2, borderRadius: 6 }}>
            {[
              { id: 'nao_atribuidas', label: 'IA/Fila' },
              { id: 'minhas', label: 'Minhas' },
              { id: 'resolvidas', label: 'Resolv.' }
            ].map(tab => (
              <button
                key={tab.id}
                onClick={() => { setFiltro(tab.id); setSelectedId(null); }}
                style={{
                  flex: 1, padding: '5px 0', border: 'none', borderRadius: 4,
                  background: filtro === tab.id ? 'var(--supabase-bg-card)' : 'transparent',
                  color: filtro === tab.id ? accent : 'var(--supabase-text-muted)',
                  fontSize: 11.5, fontWeight: 500, cursor: 'pointer',
                  transition: 'all .1s'
                }}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {/* Lista de conversas */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '8px' }}>
          {loading && <div style={{ padding: 20, textAlign: 'center', color: 'var(--supabase-text-muted)', fontSize: 12 }}>Carregando chats...</div>}
          {!loading && displayConversas.length === 0 && (
            <div style={{ padding: 40, textAlign: 'center', color: 'var(--supabase-text-muted)', fontSize: 12 }}>
              Nenhum atendimento nesta fila
            </div>
          )}
          {displayConversas.map(conv => {
            const isSel = conv.id === selectedId;
            const p = conv.patient || {};
            const dt = new Date(conv.last_activity_at);
            const hora = `${String(dt.getHours()).padStart(2, '0')}:${String(dt.getMinutes()).padStart(2, '0')}`;
            return (
              <div
                key={conv.id}
                onClick={() => setSelectedId(conv.id)}
                style={{
                  padding: '10px 12px', borderRadius: 6, cursor: 'pointer', marginBottom: 4,
                  background: isSel ? 'var(--supabase-bg-card)' : 'transparent',
                  border: `1px solid ${isSel ? 'var(--supabase-border)' : 'transparent'}`,
                  transition: 'all .12s'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--supabase-text-light)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 170 }}>
                    {p.nome || 'Paciente'}
                  </span>
                  <span style={{ fontSize: 10, color: 'var(--supabase-text-muted)', marginLeft: 'auto' }}>{hora}</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{
                    fontSize: 9.5, padding: '1px 5px', borderRadius: 4,
                    background: conv.assignee_id ? 'rgba(91,140,255,0.1)' : (p.bot_pausado ? 'rgba(239,68,68,0.1)' : 'rgba(62,207,142,0.1)'),
                    color: conv.assignee_id ? '#5b8cff' : (p.bot_pausado ? '#ef4444' : '#3ecf8e'), fontWeight: 600
                  }}>
                    {conv.assignee_id ? 'Humano' : (p.bot_pausado ? 'IA Inativa' : 'IA Ativa')}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* 2. Painel Central: Janela de Chat */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', height: '100%', background: 'var(--supabase-bg-main)' }}>
        {selectedConversa ? (
          <React.Fragment>
            {/* Header chat */}
            <div style={{
              height: 48, borderBottom: '1px solid var(--supabase-border)',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 18px', flexShrink: 0,
              background: 'var(--supabase-bg-studio)'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Avatar initials={(selectedConversa.patient?.nome || 'P').split(' ').filter(Boolean).slice(0, 2).map(w => w[0].toUpperCase()).join('')} size={26} color={accent} />
                <span style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--supabase-text-light)' }}>
                  {selectedConversa.patient?.nome}
                </span>
                <span style={{
                  fontSize: 10, padding: '2px 6px', borderRadius: 4,
                  background: selectedConversa.assignee_id ? 'rgba(91,140,255,0.12)' : 'rgba(62,207,142,0.12)',
                  color: selectedConversa.assignee_id ? '#5b8cff' : '#3ecf8e', fontWeight: 600
                }}>
                  {selectedConversa.assignee_id ? 'Humano' : 'IA Ativa'}
                </span>
              </div>
              {renderBotStatus()}
            </div>

            {/* Balões de mensagens */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 12 }}>
              {loadingChat && <div style={{ textAlign: 'center', padding: 20, color: 'var(--supabase-text-muted)' }}>Carregando conversa...</div>}
              {!loadingChat && displayMensagens.map(msg => {
                const isIncoming = msg.direcao === 'entrada';
                const isBot = msg.tipo === 'auto';

                return (
                  <div
                    key={msg.id}
                    style={{
                      alignSelf: isIncoming ? 'flex-start' : 'flex-end',
                      maxWidth: '70%', display: 'flex', flexDirection: 'column',
                      alignItems: isIncoming ? 'flex-start' : 'flex-end'
                    }}
                  >
                    <div style={{
                      background: isIncoming ? 'var(--supabase-bg-card)' : (isBot ? 'rgba(62,207,142,0.1)' : 'rgba(91,140,255,0.1)'),
                      border: `1px solid ${isIncoming ? 'var(--supabase-border)' : (isBot ? 'rgba(62,207,142,0.2)' : 'rgba(91,140,255,0.2)')}`,
                      borderRadius: 12, padding: '9px 13px',
                      color: 'var(--supabase-text-light)', fontSize: 12.5, lineHeight: 1.5,
                      whiteSpace: 'pre-wrap'
                    }}>
                      {msg.mensagem}
                    </div>
                    <span style={{ fontSize: 9.5, color: 'var(--supabase-text-muted)', marginTop: 4, display: 'flex', alignItems: 'center', gap: 4 }}>
                      {isBot && <span style={{ color: '#3ecf8e', fontWeight: 600 }}>🤖 IA</span>}
                      {!isBot && !isIncoming && <span style={{ color: '#5b8cff' }}>👤 Humano</span>}
                      {new Date(msg.enviado_em || msg.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                );
              })}
              <div ref={messagesEndRef} />
            </div>

            {/* Input digitação */}
            <div style={{ padding: '16px 20px', borderTop: '1px solid var(--supabase-border)', flexShrink: 0, background: 'var(--supabase-bg-studio)' }}>
              <form onSubmit={handleEnviar} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div style={{ display: 'flex', gap: 10 }}>
                  <textarea
                    value={texto}
                    onChange={e => setTexto(e.target.value)}
                    placeholder="Digite uma mensagem..."
                    rows={2}
                    style={{
                      flex: 1, padding: '10px 12px', borderRadius: 8,
                      background: 'var(--supabase-bg-input)',
                      border: '1px solid var(--supabase-border)',
                      color: 'var(--supabase-text-light)', fontSize: 13, outline: 'none', resize: 'none',
                      fontFamily: 'inherit', lineHeight: 1.4
                    }}
                    onKeyDown={e => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        handleEnviar(e);
                      }
                    }}
                  />
                  <button
                    type="submit"
                    disabled={sending || !texto.trim()}
                    style={{
                      padding: '0 20px', borderRadius: 8,
                      background: accent, border: 'none',
                      color: 'rgba(0,0,0,0.85)', fontSize: 13, fontWeight: 600,
                      cursor: (sending || !texto.trim()) ? 'not-allowed' : 'pointer',
                      opacity: (sending || !texto.trim()) ? 0.45 : 1
                    }}
                  >
                    {sending ? '...' : 'Enviar'}
                  </button>
                </div>
              </form>
            </div>
          </React.Fragment>
        ) : (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 12 }}>
            <span style={{ fontSize: 36, opacity: 0.15 }}>💬</span>
            <span style={{ fontSize: 13, color: 'var(--supabase-text-muted)' }}>Selecione um chat para iniciar o atendimento</span>
          </div>
        )}
      </div>

      {/* 3. Painel Direito: Contexto do Paciente & Controle IA */}
      {selectedConversa && (
        <div style={{
          width: 260, flexShrink: 0, borderLeft: '1px solid var(--supabase-border)',
          display: 'flex', flexDirection: 'column', background: 'var(--supabase-bg-studio)', padding: '16px 14px', gap: 16
        }}>
          {/* Dados Gerais */}
          <div>
            <span style={{ fontSize: 10, fontWeight: 600, color: 'var(--supabase-text-muted)', textTransform: 'uppercase', letterSpacing: .8 }}>Paciente</span>
            <div style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--supabase-text-light)', marginTop: 4 }}>{selectedConversa.patient?.nome}</div>
            <div style={{ fontSize: 11.5, color: 'var(--supabase-text-muted)', marginTop: 2 }}>
              {selectedConversa.patient?.telefone ? window.formatarTelefone ? window.formatarTelefone(selectedConversa.patient.telefone) : selectedConversa.patient.telefone : '—'}
            </div>
          </div>

          <hr style={{ border: 'none', borderTop: '1px solid var(--supabase-border)' }} />

          {/* Controle IA */}
          <div>
            <span style={{ display: 'block', fontSize: 10, fontWeight: 600, color: 'var(--supabase-text-muted)', textTransform: 'uppercase', letterSpacing: .8, marginBottom: 8 }}>
              Controle do Agente IA
            </span>
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '10px 12px', borderRadius: 6, background: 'var(--supabase-bg-input)', border: '1px solid var(--supabase-border)'
            }}>
              <span style={{ fontSize: 12, color: 'var(--supabase-text-muted)', fontWeight: 500 }}>
                {selectedConversa.patient?.bot_pausado ? '🤖 IA Inativa' : '🤖 IA Ativa'}
              </span>
              <button
                onClick={togglePausaBot}
                style={{
                  position: 'relative', width: 34, height: 18, border: 0, borderRadius: 999,
                  background: !selectedConversa.patient?.bot_pausado ? accent : 'var(--supabase-border)',
                  cursor: 'pointer', padding: 0, transition: 'background .15s'
                }}
              >
                <span style={{
                  position: 'absolute', top: 2, left: !selectedConversa.patient?.bot_pausado ? 18 : 2,
                  width: 14, height: 14, borderRadius: '50%', background: '#fff',
                  boxShadow: '0 1px 3px rgba(0,0,0,0.3)', transition: 'left .15s'
                }} />
              </button>
            </div>
            <p style={{ fontSize: 10.5, color: 'var(--supabase-icon-inactive)', marginTop: 6, lineHeight: 1.4 }}>
              {!selectedConversa.patient?.bot_pausado 
                ? 'A IA responderá o paciente automaticamente caso ele faça perguntas ou queira reagendar.'
                : 'A IA está silenciada. Somente respostas manuais enviadas por atendentes serão disparadas.'}
            </p>
          </div>

          <hr style={{ border: 'none', borderTop: '1px solid var(--supabase-border)' }} />

          {/* Atribuição & Ações */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <span style={{ fontSize: 10, fontWeight: 600, color: 'var(--supabase-text-muted)', textTransform: 'uppercase', letterSpacing: .8, marginBottom: 2 }}>
              Ações de Fila
            </span>
            
            {selectedConversa.assignee_id !== currentUserId && selectedConversa.status === 'open' && (
              <button
                onClick={atribuirConversa}
                style={{
                  width: '100%', padding: '7px 10px', borderRadius: 6, cursor: 'pointer',
                  background: 'rgba(91,140,255,0.08)', border: '1px solid rgba(91,140,255,0.2)',
                  color: '#5b8cff', fontSize: 11.5, fontWeight: 500, transition: 'all .12s'
                }}
              >
                🙋‍♂️ Atribuir a Mim
              </button>
            )}

            {selectedConversa.status === 'open' ? (
              <button
                onClick={() => alterarStatusConversa('resolved')}
                style={{
                  width: '100%', padding: '7px 10px', borderRadius: 6, cursor: 'pointer',
                  background: 'rgba(62,207,142,0.08)', border: '1px solid rgba(62,207,142,0.2)',
                  color: '#3ecf8e', fontSize: 11.5, fontWeight: 500, transition: 'all .12s'
                }}
              >
                ✓ Marcar como Resolvida
              </button>
            ) : (
              <button
                onClick={() => alterarStatusConversa('open')}
                style={{
                  width: '100%', padding: '7px 10px', borderRadius: 6, cursor: 'pointer',
                  background: 'rgba(91,140,255,0.08)', border: '1px solid rgba(91,140,255,0.2)',
                  color: '#5b8cff', fontSize: 11.5, fontWeight: 500, transition: 'all .12s'
                }}
              >
                ↺ Reabrir Atendimento
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── EXPORTS ─────────────────────────────────────────────────────────────────

Object.assign(window, {
  APPOINTMENTS, STATUS_CFG, extrairPreferencia,
  Avatar, Badge, WaIcon,
  Sidebar, ListView, CalendarView, KanbanView, DetailPanel,
  AtendimentosView,
});
