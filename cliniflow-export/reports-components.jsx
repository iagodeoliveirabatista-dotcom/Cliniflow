// reports-components.jsx
// KPI dashboard for Cliniflow
// Exports to window: ReportsView

const { useState: useStateR, useMemo: useMemoR, useEffect: useEffectR } = React;

// ─── MOCK DATA (espelha sua estrutura real do Supabase) ────────────────────────
// Quando integrar: substitua por queries nas views kpi_comparecimento, kpi_receita_mensal, kpi_retencao

const MOCK_MONTHLY = [
  { mes:'Dez 25', total:61, confirmados:49, cancelados:8,  no_shows:4,  receita:12250 },
  { mes:'Jan 26', total:58, confirmados:46, cancelados:7,  no_shows:5,  receita:11500 },
  { mes:'Fev 26', total:72, confirmados:60, cancelados:8,  no_shows:4,  receita:15000 },
  { mes:'Mar 26', total:84, confirmados:70, cancelados:10, no_shows:4,  receita:17500 },
  { mes:'Abr 26', total:79, confirmados:65, cancelados:9,  no_shows:5,  receita:16250 },
  { mes:'Mai 26', total:91, confirmados:76, cancelados:10, no_shows:5,  receita:19000 },
];

const MOCK_WEEKDAY = [
  { dia:'Seg', sessoes:22, confirmados:18 },
  { dia:'Ter', sessoes:18, confirmados:15 },
  { dia:'Qua', sessoes:20, confirmados:17 },
  { dia:'Qui', sessoes:16, confirmados:13 },
  { dia:'Sex', sessoes:15, confirmados:13 },
];

const MOCK_RETENTION = [
  { nome:'Ana Lima',         telefone:'(11) 99988-7766', sessoes:8,  ultima:'15 mai 26', convenio:'Particular'     },
  { nome:'Marcos Oliveira',  telefone:'(11) 91234-5678', sessoes:14, ultima:'28 mai 26', convenio:'Unimed'         },
  { nome:'Roberto Dias',     telefone:'(11) 98877-6655', sessoes:18, ultima:'12 mai 26', convenio:'Unimed'         },
  { nome:'Rafael Souza',     telefone:'(11) 97654-3210', sessoes:11, ultima:'20 mai 26', convenio:'Particular'     },
  { nome:'Fernando Gomes',   telefone:'(11) 99876-5432', sessoes:7,  ultima:'15 mai 26', convenio:'Particular'     },
  { nome:'Priya Nair',       telefone:'(11) 94321-0987', sessoes:6,  ultima:'25 mai 26', convenio:'SulAmérica'     },
  { nome:'Carlos Mota',      telefone:'(11) 93210-9876', sessoes:22, ultima:'14 mai 26', convenio:'Unimed'         },
  { nome:'Diego Lima',       telefone:'(11) 91098-7654', sessoes:9,  ultima:'30 mai 26', convenio:'Bradesco Saúde' },
];

const PERIODS = ['Esta semana', 'Este mês', 'Últimos 3 meses', 'Últimos 6 meses'];

// ─── HELPERS ─────────────────────────────────────────────────────────────────

const fmtBRL = n => n.toLocaleString('pt-BR', { style:'currency', currency:'BRL', maximumFractionDigits:0 });
const pct = (a, b) => b === 0 ? 0 : Math.round(a / b * 100);

// ─── KPI CARD ─────────────────────────────────────────────────────────────────

function KpiCard({ label, value, sub, color, trend, icon }) {
  return (
    <div style={{
      background:'var(--supabase-bg-studio)', border:'1px solid var(--supabase-border)', borderRadius:8,
      padding:'18px 20px', display:'flex', flexDirection:'column', gap:10,
    }}>
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
        <span style={{ fontSize:11.5, fontWeight:600, color:'var(--supabase-text-muted)',
          textTransform:'uppercase', letterSpacing:.8 }}>{label}</span>
        <div style={{
          width:30, height:30, borderRadius:7,
          background:`${color}14`, border:`1px solid ${color}22`,
          display:'flex', alignItems:'center', justifyContent:'center',
        }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill={color}><path d={icon}/></svg>
        </div>
      </div>
      <div style={{ fontSize:28, fontWeight:700, color:'var(--supabase-text)', letterSpacing:'-1px', lineHeight:1 }}>
        {value}
      </div>
      <div style={{ display:'flex', alignItems:'center', gap:8 }}>
        {trend != null && (
          <span style={{
            fontSize:11, fontWeight:600, padding:'2px 6px', borderRadius:4,
            background: trend >= 0 ? 'rgba(0,208,132,0.12)' : 'rgba(239,68,68,0.12)',
            color: trend >= 0 ? '#00d084' : '#ef4444',
          }}>
            {trend >= 0 ? '↑' : '↓'} {Math.abs(trend)}%
          </span>
        )}
        <span style={{ fontSize:11.5, color:'var(--supabase-text-muted)' }}>{sub}</span>
      </div>
    </div>
  );
}

// ─── BAR CHART ───────────────────────────────────────────────────────────────

function BarChart({ data, accent, mode }) {
  const maxVal = Math.max(...data.map(d => d.total || d.sessoes));
  const [hov, setHov] = useStateR(null);

  return (
    <div style={{ display:'flex', alignItems:'flex-end', gap:8, height:120, padding:'0 4px' }}>
      {data.map((d, i) => {
        const main = mode === 'month' ? d.confirmados : d.confirmados;
        const total = mode === 'month' ? d.total : d.sessoes;
        const mainH = Math.round((main / maxVal) * 100);
        const totalH = Math.round((total / maxVal) * 100);
        const isHov = hov === i;
        return (
          <div key={i}
            onMouseEnter={() => setHov(i)} onMouseLeave={() => setHov(null)}
            style={{ flex:1, display:'flex', flexDirection:'column', alignItems:'center', gap:5, cursor:'default' }}>
            {/* Tooltip */}
            {isHov && (
              <div style={{
                position:'absolute', marginTop:-46, background:'var(--supabase-bg-hover)',
                border:'1px solid var(--supabase-border)', borderRadius:5, padding:'5px 8px',
                fontSize:11, color:'var(--supabase-text-light)', whiteSpace:'nowrap', zIndex:10, pointerEvents:'none',
              }}>
                {total} sessões · {pct(main, total)}% comparec.
              </div>
            )}
            <div style={{ width:'100%', position:'relative', display:'flex', flexDirection:'column', justifyContent:'flex-end', height:100 }}>
              {/* Total (background) */}
              <div style={{
                position:'absolute', bottom:0, left:0, right:0,
                height:`${totalH}%`, borderRadius:'3px 3px 0 0',
                background: 'var(--supabase-border)',
              }} />
              {/* Confirmed (foreground) */}
              <div style={{
                position:'absolute', bottom:0, left:2, right:2,
                height:`${mainH}%`, borderRadius:'2px 2px 0 0',
                background: isHov ? accent : `${accent}cc`,
                transition:'background .1s, height .3s',
              }} />
            </div>
            <span style={{ fontSize:9.5, color: isHov ? 'var(--supabase-text-muted)' : 'var(--supabase-icon-inactive)', whiteSpace:'nowrap' }}>
              {mode === 'month' ? d.mes : d.dia}
            </span>
          </div>
        );
      })}
    </div>
  );
}

// ─── DONUT ───────────────────────────────────────────────────────────────────

function Donut({ confirmados, cancelados, no_shows, pendentes, accent }) {
  const total = confirmados + cancelados + no_shows + pendentes;
  const slices = [
    { v: confirmados, color: accent,    label:'Confirmados' },
    { v: cancelados,  color: '#ef4444', label:'Cancelados'  },
    { v: no_shows,    color: '#f59e0b', label:'No-shows'    },
    { v: pendentes,   color: 'var(--supabase-border)', label:'Pendentes' },
  ];

  // SVG donut using strokeDasharray
  const R = 30, C = 2 * Math.PI * R;
  let offset = 0;

  return (
    <div style={{ display:'flex', alignItems:'center', gap:20 }}>
      <svg width="80" height="80" viewBox="0 0 80 80" style={{ flexShrink:0 }}>
        {/* Track */}
        <circle cx="40" cy="40" r={R} fill="none" stroke="var(--supabase-border)" strokeWidth="10" />
        {slices.filter(s => s.v > 0).map((s, i) => {
          const dash = (s.v / total) * C;
          const gap = C - dash;
          const el = (
            <circle key={i} cx="40" cy="40" r={R} fill="none"
              stroke={s.color} strokeWidth="10"
              strokeDasharray={`${dash} ${gap}`}
              strokeDashoffset={-offset * (C / total)}
              style={{ transform:'rotate(-90deg)', transformOrigin:'40px 40px' }}
              opacity={.9}
            />
          );
          offset += s.v;
          return el;
        })}
        <text x="40" y="38" textAnchor="middle" fill="var(--supabase-text-light)" fontSize="11" fontWeight="700"
          fontFamily="Inter,sans-serif">{pct(confirmados, total)}%</text>
        <text x="40" y="49" textAnchor="middle" fill="var(--supabase-text-muted)" fontSize="8"
          fontFamily="Inter,sans-serif">presença</text>
      </svg>
      <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
        {slices.filter(s => s.v > 0).map(s => (
          <div key={s.label} style={{ display:'flex', alignItems:'center', gap:7 }}>
            <span style={{ width:8, height:8, borderRadius:2, background:s.color, flexShrink:0 }} />
            <span style={{ fontSize:11.5, color:'var(--supabase-text-muted)' }}>{s.label}</span>
            <span style={{ fontSize:11.5, color:'var(--supabase-text-light)', fontWeight:600, marginLeft:'auto', paddingLeft:12 }}>{s.v}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── RETENTION TABLE ─────────────────────────────────────────────────────────

function RetentionTable({ data, accent }) {
  if (data.length === 0) {
    return (
      <div style={{ padding: '24px 0', textAlign: 'center', color: 'var(--supabase-text-muted)', fontSize: 12.5 }}>
        Nenhum paciente frequente ainda.
      </div>
    );
  }
  const max = Math.max(...data.map(d => d.sessoes));
  return (
    <div style={{ display:'flex', flexDirection:'column', gap:1 }}>
      {data.map((p, i) => (
        <div key={i} style={{
          display:'grid', gridTemplateColumns:'1fr 90px 80px 80px',
          alignItems:'center', gap:10,
          padding:'8px 0', borderBottom:'1px solid var(--supabase-border)',
        }}>
          <div style={{ display:'flex', alignItems:'center', gap:9, minWidth:0 }}>
            <div style={{
              width:7, borderRadius:2, height:7, flexShrink:0,
              background: i < 3 ? accent : 'var(--supabase-border)',
            }} />
            <div style={{ minWidth:0 }}>
              <div style={{ fontSize:12.5, color:'var(--supabase-text-light)', fontWeight:500,
                whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{p.nome}</div>
              <div style={{ fontSize:10.5, color:'var(--supabase-text-muted)' }}>{window.formatarTelefone ? window.formatarTelefone(p.telefone) : p.telefone}</div>
            </div>
          </div>
          {/* Bar */}
          <div style={{ height:4, background:'var(--supabase-border)', borderRadius:2, overflow:'hidden' }}>
            <div style={{
              height:'100%', borderRadius:2,
              width:`${Math.round(p.sessoes / max * 100)}%`,
              background: `${accent}bb`,
            }} />
          </div>
          <span style={{ fontSize:12, color:'var(--supabase-text-muted)', textAlign:'right' }}>{p.sessoes} sessões</span>
          <span style={{ fontSize:11, color:'var(--supabase-text-muted)', textAlign:'right' }}>{p.ultima}</span>
        </div>
      ))}
    </div>
  );
}

// ─── REPORTS VIEW ─────────────────────────────────────────────────────────────

function ReportsView({ accent }) {
  const [period, setPeriod]       = useStateR('Este mês');
  const [monthly, setMonthly]     = useStateR(MOCK_MONTHLY);
  const [weekday, setWeekday]     = useStateR(MOCK_WEEKDAY);
  const [retention, setRetention] = useStateR(MOCK_RETENTION);
  const [loading, setLoading]     = useStateR(false);
  const [connected, setConnected] = useStateR(false);

  useEffectR(() => {
    const SB = window.SupabaseService;
    if (!SB || !SB.isConnected()) return;
    setConnected(true);
    setLoading(true);
    SB.fetchAllKPIs().then(kpis => {
      if (kpis.mensal && kpis.mensal.length > 0) {
        setMonthly(kpis.mensal);
      } else {
        setMonthly([{ mes: 'Sem dados', total: 0, confirmados: 0, cancelados: 0, no_shows: 0, receita: 0 }]);
      }
      if (kpis.diaSemana && kpis.diaSemana.length > 0) {
        setWeekday(kpis.diaSemana);
      } else {
        setWeekday([
          { dia: 'Seg', sessoes: 0, confirmados: 0 },
          { dia: 'Ter', sessoes: 0, confirmados: 0 },
          { dia: 'Qua', sessoes: 0, confirmados: 0 },
          { dia: 'Qui', sessoes: 0, confirmados: 0 },
          { dia: 'Sex', sessoes: 0, confirmados: 0 },
        ]);
      }
      if (kpis.retencao && kpis.retencao.length > 0) {
        const MES = ['jan','fev','mar','abr','mai','jun','jul','ago','set','out','nov','dez'];
        setRetention(kpis.retencao.map(p => ({
          ...p,
          ultima: p.ultima_sessao
            ? (() => { const d = new Date(p.ultima_sessao); return `${d.getDate()} ${MES[d.getMonth()]} ${String(d.getFullYear()).slice(2)}`; })()
            : '—',
        })));
      } else {
        setRetention([]);
      }
      setLoading(false);
    });
  }, []);

  // Use last two months for comparison
  const cur  = monthly[monthly.length - 1];
  const prev = monthly.length >= 2 ? monthly[monthly.length - 2] : monthly[monthly.length - 1];

  const taxaAtual = pct(cur.confirmados, cur.total);
  const taxaPrev  = pct(prev.confirmados, prev.total);
  const deltaTaxa = taxaAtual - taxaPrev;
  const deltaReceita = prev.receita > 0 ? Math.round((cur.receita - prev.receita) / prev.receita * 100) : 0;
  const deltaCancel  = cur.cancelados - prev.cancelados;
  const novos = 7; // mock — viria de patients criados no período

  return (
    <div style={{ flex:1, display:'flex', flexDirection:'column', minWidth:0, overflow:'hidden' }}>

      {/* ── Header ─────────────────────────────────────────────── */}
      <div style={{ padding:'14px 20px 14px', borderBottom:'1px solid var(--supabase-border)', flexShrink:0,
        display:'flex', alignItems:'center', justifyContent:'space-between' }}>
        <div style={{ display:'flex', alignItems:'center', gap:14 }}>
          <h1 style={{ fontSize:15.5, fontWeight:600, color:'var(--supabase-text)', letterSpacing:'-.35px' }}>Relatórios</h1>
          {connected ? (
            <span style={{
              fontSize:10.5, padding:'3px 8px', borderRadius:4,
              background:'rgba(0,208,132,0.12)', border:'1px solid rgba(0,208,132,0.25)', color:'#00d084',
              fontWeight:600, letterSpacing:.3,
            }}>{loading ? 'Carregando…' : 'Dados ao vivo'}</span>
          ) : (
            <span style={{
              fontSize:10.5, padding:'3px 8px', borderRadius:4,
              background:`${accent}18`, border:`1px solid ${accent}30`, color:accent,
              fontWeight:600, letterSpacing:.3,
            }}>Demonstração</span>
          )}
        </div>
        {/* Period selector */}
        <div style={{ display:'flex', background:'var(--supabase-bg-input)', border:'1px solid var(--supabase-border)',
          borderRadius:6, padding:2, gap:1 }}>
          {PERIODS.map(p => {
            const active = p === period;
            return (
              <button key={p} onClick={() => setPeriod(p)} style={{
                padding:'5px 11px', borderRadius:4, border:'none',
                background: active ? 'var(--supabase-border)' : 'transparent',
                color: active ? accent : 'var(--supabase-text-muted)',
                fontSize:11.5, fontWeight: active ? 500 : 400,
                cursor:'pointer', transition:'all .12s', whiteSpace:'nowrap',
              }}>{p}</button>
            );
          })}
        </div>
      </div>

      {/* ── Body ───────────────────────────────────────────────── */}
      <div style={{ flex:1, overflowY:'auto', padding:'20px' }}>

        {/* KPI Cards */}
        <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:12, marginBottom:20 }}>
          <KpiCard
            label="Consultas" value={cur.total}
            sub="vs. mês anterior" trend={Math.round((cur.total-prev.total)/prev.total*100)}
            color={accent}
            icon="M17 12h-5v5h5v-5zM16 1v2H8V1H6v2H5c-1.11 0-1.99.9-1.99 2L3 19c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2h-1V1h-2zm3 18H5V8h14v11z"
          />
          <KpiCard
            label="Taxa de comparecimento" value={`${taxaAtual}%`}
            sub="confirmados / total finalizados" trend={deltaTaxa}
            color="#00d084"
            icon="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41L9 16.17z"
          />
          <KpiCard
            label="Cancelamentos" value={cur.cancelados}
            sub={`${deltaCancel > 0 ? '+'+deltaCancel : deltaCancel} vs. mês anterior`}
            trend={deltaCancel > 0 ? -(Math.round(deltaCancel/prev.cancelados*100)) : Math.abs(Math.round(deltaCancel/prev.cancelados*100))}
            color="#ef4444"
            icon="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12 19 6.41z"
          />
          <KpiCard
            label="Receita estimada" value={fmtBRL(cur.receita)}
            sub="consultas confirmadas" trend={deltaReceita}
            color="#a78bfa"
            icon="M11.8 10.9c-2.27-.59-3-1.2-3-2.15 0-1.09 1.01-1.85 2.7-1.85 1.78 0 2.44.85 2.5 2.1h2.21c-.07-1.72-1.12-3.3-3.21-3.81V3h-3v2.16c-1.94.42-3.5 1.68-3.5 3.61 0 2.31 1.91 3.46 4.7 4.13 2.5.6 3 1.48 3 2.41 0 .69-.49 1.79-2.7 1.79-2.06 0-2.87-.92-2.98-2.1h-2.2c.12 2.19 1.76 3.42 3.68 3.83V21h3v-2.15c1.95-.37 3.5-1.5 3.5-3.55 0-2.84-2.43-3.81-4.7-4.4z"
          />
        </div>

        {/* Charts row */}
        <div style={{ display:'grid', gridTemplateColumns:'2fr 1fr', gap:12, marginBottom:20 }}>
          {/* Monthly trend */}
          <div style={{ background:'var(--supabase-bg-studio)', border:'1px solid var(--supabase-border)', borderRadius:8, padding:'18px 20px' }}>
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:16 }}>
              <span style={{ fontSize:12.5, fontWeight:600, color:'var(--supabase-text-muted)' }}>Consultas por mês</span>
              <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                <LegendDot color={accent} label="Confirmados" />
                <LegendDot color="var(--supabase-border)" label="Total" />
              </div>
            </div>
            <BarChart data={monthly} accent={accent} mode="month" />
          </div>

          {/* Status breakdown */}
          <div style={{ background:'var(--supabase-bg-studio)', border:'1px solid var(--supabase-border)', borderRadius:8, padding:'18px 20px' }}>
            <span style={{ fontSize:12.5, fontWeight:600, color:'var(--supabase-text-muted)', display:'block', marginBottom:18 }}>
              Distribuição de status
            </span>
            <Donut
              confirmados={cur.confirmados}
              cancelados={cur.cancelados}
              no_shows={cur.no_shows}
              pendentes={cur.total - cur.confirmados - cur.cancelados - cur.no_shows}
              accent={accent}
            />
          </div>
        </div>

        {/* Second row */}
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12, marginBottom:20 }}>
          {/* Weekday distribution */}
          <div style={{ background:'var(--supabase-bg-studio)', border:'1px solid var(--supabase-border)', borderRadius:8, padding:'18px 20px' }}>
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:16 }}>
              <span style={{ fontSize:12.5, fontWeight:600, color:'var(--supabase-text-muted)' }}>Sessões por dia da semana</span>
            </div>
            <BarChart data={weekday} accent={accent} mode="week" />
          </div>

          {/* Revenue trend mini */}
          <div style={{ background:'var(--supabase-bg-studio)', border:'1px solid var(--supabase-border)', borderRadius:8, padding:'18px 20px' }}>
            <span style={{ fontSize:12.5, fontWeight:600, color:'var(--supabase-text-muted)', display:'block', marginBottom:16 }}>
              Receita estimada — últimos 6 meses
            </span>
            <RevenueLine data={monthly} accent={accent} />
          </div>
        </div>

        {/* Retention table */}
        <div style={{ background:'var(--supabase-bg-studio)', border:'1px solid var(--supabase-border)', borderRadius:8, padding:'18px 20px' }}>
          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:14 }}>
            <div>
              <span style={{ fontSize:12.5, fontWeight:600, color:'var(--supabase-text-muted)' }}>Pacientes mais frequentes</span>
              <span style={{ fontSize:11.5, color:'var(--supabase-text-muted)', marginLeft:10 }}>Retenção · retornaram ao menos 2x</span>
            </div>
            <span style={{
              fontSize:10.5, padding:'3px 8px', borderRadius:4,
              background:'rgba(167,139,250,0.12)', color:'#a78bfa', fontWeight:600,
            }}>kpi_retencao · Supabase</span>
          </div>
          <div style={{
            display:'grid', gridTemplateColumns:'1fr 90px 80px 80px',
            gap:10, padding:'0 0 8px', borderBottom:'1px solid var(--supabase-border)', marginBottom:4,
          }}>
            {['Paciente','Frequência','Sessões','Última'].map(h => (
              <span key={h} style={{
                fontSize:10, fontWeight:600, color:'var(--supabase-text-muted)',
                textTransform:'uppercase', letterSpacing:.7,
              }}>{h}</span>
            ))}
          </div>
          <RetentionTable data={retention} accent={accent} />
        </div>

        {/* Connection status hint */}
        {!connected && (
          <div style={{
            marginTop:16, padding:'14px 18px', borderRadius:8,
            background:'var(--supabase-bg-input)', border:'1px solid var(--supabase-border)',
            display:'flex', alignItems:'flex-start', gap:12,
          }}>
            <div style={{
              width:28, height:28, borderRadius:6, flexShrink:0, marginTop:2,
              background:'rgba(0,208,132,0.12)', border:'1px solid rgba(0,208,132,0.2)',
              display:'flex', alignItems:'center', justifyContent:'center',
            }}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="#00d084"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z"/></svg>
            </div>
            <div>
              <div style={{ fontSize:12.5, fontWeight:600, color:'var(--supabase-text-muted)', marginBottom:4 }}>
                Modo demonstração — preencha o config.js para usar dados reais
              </div>
              <div style={{ fontSize:11.5, color:'var(--supabase-icon-inactive)', lineHeight:1.6 }}>
                Insira a URL e anon key do Supabase em{' '}
                <code style={{ background:'var(--supabase-bg-input)', padding:'1px 5px', borderRadius:3, color:'var(--supabase-text-muted)', fontSize:10.5 }}>config.js</code>{' '}
                e execute o{' '}
                <code style={{ background:'var(--supabase-bg-input)', padding:'1px 5px', borderRadius:3, color:'var(--supabase-text-muted)', fontSize:10.5 }}>supabase-schema.sql</code>{' '}
                no SQL Editor do Supabase. Os gráficos carregarão dados reais automaticamente.
              </div>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}

function LegendDot({ color, label }) {
  return (
    <div style={{ display:'flex', alignItems:'center', gap:5 }}>
      <span style={{ width:8, height:8, borderRadius:2, background:color, flexShrink:0 }} />
      <span style={{ fontSize:11, color:'var(--supabase-text-muted)' }}>{label}</span>
    </div>
  );
}

function RevenueLine({ data, accent }) {
  const max = Math.max(...data.map(d => d.receita));
  const w = 260, h = 80;
  const pts = data.map((d, i) => ({
    x: Math.round((i / (data.length - 1)) * (w - 20)) + 10,
    y: Math.round(h - (d.receita / max) * (h - 12) - 6),
    v: d.receita,
    mes: d.mes,
  }));
  const polyline = pts.map(p => `${p.x},${p.y}`).join(' ');
  const area = `${pts[0].x},${h} ${polyline} ${pts[pts.length-1].x},${h}`;

  return (
    <div style={{ position:'relative' }}>
      <svg width="100%" height={h + 20} viewBox={`0 0 ${w} ${h + 20}`}>
        <defs>
          <linearGradient id="revGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={accent} stopOpacity=".25" />
            <stop offset="100%" stopColor={accent} stopOpacity="0" />
          </linearGradient>
        </defs>
        <polygon points={area} fill="url(#revGrad)" />
        <polyline points={polyline} fill="none" stroke={accent} strokeWidth="1.5"
          strokeLinejoin="round" strokeLinecap="round" />
        {pts.map((p, i) => (
          <g key={i}>
            <circle cx={p.x} cy={p.y} r="3" fill={accent} />
            <text x={p.x} y={h + 14} textAnchor="middle" fill="var(--supabase-text-muted)"
              fontSize="9" fontFamily="Inter,sans-serif">{p.mes.split(' ')[0]}</text>
          </g>
        ))}
      </svg>
      <div style={{
        display:'flex', justifyContent:'space-between', marginTop:2,
        fontSize:11, color:'var(--supabase-text-muted)',
      }}>
        <span>{fmtBRL(data[0].receita)}</span>
        <span style={{ color: accent, fontWeight:600 }}>{fmtBRL(data[data.length-1].receita)}</span>
      </div>
    </div>
  );
}

// ─── EXPORTS ─────────────────────────────────────────────────────────────────

Object.assign(window, { ReportsView });
