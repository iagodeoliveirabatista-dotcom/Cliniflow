// automation-components.jsx
// Tela de Automações do Cliniflow — Configuração de lembretes, status do bot, histórico de mensagens
// Exports to window: AutomationView

const { useState: useStateA, useEffect: useEffectA, useMemo: useMemoA, useCallback: useCallbackA } = React;

// ─── STATUS ICONS ────────────────────────────────────────────────────────────

const MSG_STATUS_CFG = {
  sending:   { label: 'Enviando',  color: '#f59e0b', icon: '⏳' },
  sent:      { label: 'Enviado',   color: '#5b8cff', icon: '✓'  },
  delivered: { label: 'Entregue',  color: '#00d084', icon: '✓✓' },
  read:      { label: 'Lido',      color: '#00d084', icon: '👁' },
  failed:    { label: 'Falhou',    color: '#ef4444', icon: '✕'  },
};

const TIPO_LABELS = {
  reminder_24h:  'Lembrete 24h',
  reminder_2h:   'Lembrete 2h',
  reminder_custom: 'Lembrete personalizado',
  confirmation:  'Confirmação',
  cancellation:  'Cancelamento',
  reschedule:    'Remarcação',
  outlier:       'Outlier',
  manual:        'Manual',
};

// ─── MAIN VIEW ───────────────────────────────────────────────────────────────

function AutomationView({ accent }) {
  const [tab, setTab] = useStateA('lembretes'); // 'lembretes' | 'historico' | 'status'
  const [configs, setConfigs] = useStateA([]);
  const [logs, setLogs] = useStateA([]);
  const [loading, setLoading] = useStateA(true);
  const [saude, setSaude] = useStateA([]); // erros agrupados por assinatura
  const [saving, setSaving] = useStateA(false);
  const [toast, setToast] = useStateA(null);

  const isConnected = window.SupabaseService && window.SupabaseService.isConnected();

  // Load data
  useEffectA(() => {
    if (!isConnected) { setLoading(false); return; }
    loadData();
  }, [isConnected]);

  const loadData = useCallbackA(async () => {
    setLoading(true);
    const [cfgRes, logsRes, saudeRes] = await Promise.all([
      window.SupabaseService.fetchConfigAutomacao(),
      window.SupabaseService.fetchMensagemLogs({ limit: 30 }),
      window.SupabaseService.fetchSaudeSistema(7),
    ]);
    if (cfgRes.data) setConfigs(cfgRes.data);
    if (logsRes.data) setLogs(logsRes.data);
    if (saudeRes.data) setSaude(saudeRes.data);
    setLoading(false);
  }, []);

  const showToast = (msg, type) => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  };

  const handleSaveConfig = useCallbackA(async (id, dados) => {
    setSaving(true);
    const res = await window.SupabaseService.updateConfigAutomacao(id, dados);
    if (res.data) {
      setConfigs(prev => prev.map(c => c.id === id ? { ...c, ...res.data } : c));
      showToast('Configuração salva!', 'success');
    } else {
      showToast('Erro ao salvar', 'error');
    }
    setSaving(false);
  }, []);

  // ── Mock data for demo mode ───────────────────────────────────────────────
  const demoConfigs = [
    { id: 'demo-1', tipo_lembrete: 'reminder_24h', ativo: true, horario_envio: '14:00', antecedencia_horas: 24,
      template_mensagem: 'Olá {nome}! 😊 Lembramos que você tem uma consulta amanhã ({data}) às {hora} com {medico}. Confirme: ✅ CONFIRMAR ou ❌ CANCELAR' },
    { id: 'demo-2', tipo_lembrete: 'reminder_2h', ativo: false, horario_envio: null, antecedencia_horas: 2,
      template_mensagem: 'Olá {nome}! Sua consulta é daqui a 2 horas ({hora}) com {medico}. Te esperamos! 😊' },
    { id: 'demo-3', tipo_lembrete: 'reminder_custom', ativo: false, horario_envio: null, antecedencia_horas: 48,
      template_mensagem: 'Olá {nome}! Você tem uma consulta marcada para {data} às {hora}. Confirme!' },
  ];

  const demoLogs = [
    { id: '1', telefone: '5511999887766', tipo: 'reminder_24h', direcao: 'saida', mensagem: 'Olá Ana! Lembramos...', status: 'delivered', enviado_em: new Date(Date.now() - 3600000).toISOString(), patient: { nome: 'Ana Lima' } },
    { id: '2', telefone: '5511912345678', tipo: 'confirmation', direcao: 'entrada', mensagem: 'Vou sim!', status: 'read', intencao_detectada: 'CONFIRMADO', confianca_percentual: 95, enviado_em: new Date(Date.now() - 7200000).toISOString(), patient: { nome: 'Marcos Oliveira' } },
    { id: '3', telefone: '5511987654321', tipo: 'reminder_24h', direcao: 'saida', mensagem: 'Olá Camila! Lembramos...', status: 'failed', enviado_em: new Date(Date.now() - 10800000).toISOString(), patient: { nome: 'Camila Santos' } },
    { id: '4', telefone: '5511976543210', tipo: 'cancellation', direcao: 'entrada', mensagem: 'Não vou conseguir ir', status: 'read', intencao_detectada: 'CANCELADO', confianca_percentual: 90, enviado_em: new Date(Date.now() - 14400000).toISOString(), patient: { nome: 'Rafael Souza' } },
    { id: '5', telefone: '5511999887766', tipo: 'manual', direcao: 'saida', mensagem: 'Consulta confirmada! ✅', status: 'sent', enviado_em: new Date(Date.now() - 18000000).toISOString(), patient: { nome: 'Ana Lima' } },
  ];

  const displayConfigs = isConnected ? configs : demoConfigs;
  const displayLogs = isConnected ? logs : demoLogs;

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, overflow: 'hidden' }}>
      {/* Header */}
      <div style={{ padding: '14px 20px 0', borderBottom: '1px solid var(--supabase-border)', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 13 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <h1 style={{ fontSize: 15.5, fontWeight: 600, color: 'var(--supabase-text)', letterSpacing: '-.35px' }}>Automações</h1>
            {!isConnected && (
              <span style={{
                fontSize: 10.5, padding: '3px 8px', borderRadius: 4,
                background: `${accent}18`, border: `1px solid ${accent}30`, color: accent,
                fontWeight: 600, letterSpacing: .3,
              }}>Modo demonstração</span>
            )}
          </div>
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', gap: 0, marginBottom: '-1px' }}>
          {[
            { id: 'lembretes', label: 'Lembretes', count: displayConfigs.filter(c => c.ativo).length },
            { id: 'historico', label: 'Histórico de mensagens', count: displayLogs.length },
            { id: 'status',    label: 'Status do bot' },
          ].map(t => {
            const active = tab === t.id;
            return (
              <button key={t.id} onClick={() => setTab(t.id)} style={{
                padding: '8px 13px', border: 'none', background: 'transparent',
                borderBottom: active ? `2px solid ${accent}` : '2px solid transparent',
                color: active ? accent : 'var(--supabase-text-muted)',
                fontSize: 12.5, fontWeight: active ? 500 : 400,
                cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5,
              }}>
                {t.label}
                {t.count != null && (
                  <span style={{
                    fontSize: 10.5, minWidth: 18, textAlign: 'center',
                    padding: '0 5px', borderRadius: 8,
                    background: active ? `${accent}20` : 'var(--supabase-bg-input)',
                    color: active ? accent : 'var(--supabase-text-muted)',
                  }}>{t.count}</span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Body */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '20px' }}>
        {tab === 'lembretes' && (
          <LembretesTab configs={displayConfigs} accent={accent} onSave={handleSaveConfig} saving={saving} isConnected={isConnected} />
        )}
        {tab === 'historico' && (
          <HistoricoTab logs={displayLogs} accent={accent} onRefresh={loadData} loading={loading} />
        )}
        {tab === 'status' && (
          <StatusTab accent={accent} logs={displayLogs} saude={saude} isConnected={isConnected} />
        )}
      </div>

      {/* Toast */}
      {toast && (
        <div style={{
          position: 'fixed', bottom: 24, right: 24, zIndex: 9999,
          padding: '10px 18px', borderRadius: 8,
          background: toast.type === 'success' ? 'rgba(0,208,132,0.95)' : 'rgba(239,68,68,0.95)',
          color: '#fff', fontSize: 13, fontWeight: 500,
          boxShadow: '0 4px 20px rgba(0,0,0,0.3)',
          animation: 'slideUp .2s ease-out',
        }}>{toast.msg}</div>
      )}
    </div>
  );
}

// ─── LEMBRETES TAB ───────────────────────────────────────────────────────────

function LembretesTab({ configs, accent, onSave, saving, isConnected }) {
  // Só aparece o que o sistema consegue mandar de verdade. Lembrete cai sempre
  // fora da janela de 24h da Meta, e ali só passa template aprovado — sem
  // `meta_template_nome` a `disparar-lembretes` pula a config (index.ts:116).
  // As 3 configs de 04/06/2026 nunca tiveram template e ficam escondidas: elas
  // estavam LIGADAS na tela em 15/08 enquanto as boas estavam desligadas, e o
  // painel parecia saudável com zero lembrete saindo. Ver ARMADILHAS.md §39.
  const enviaveis = isConnected ? configs.filter(c => c.meta_template_nome) : configs;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, animation: 'fadeIn .2s var(--ease-premium)' }}>
      {enviaveis.map(cfg => (
        <LembreteCard key={cfg.id} config={cfg} accent={accent} onSave={onSave} saving={saving} isConnected={isConnected} />
      ))}

      {/* Info box */}
      <div style={{
        padding: '14px 18px', borderRadius: 8,
        background: 'var(--supabase-bg-studio)', border: '1px solid var(--supabase-border)',
        display: 'flex', alignItems: 'flex-start', gap: 12,
      }}>
        <div style={{
          width: 28, height: 28, borderRadius: 6, flexShrink: 0, marginTop: 2,
          background: 'rgba(91,140,255,0.12)', border: '1px solid rgba(91,140,255,0.2)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="#5b8cff"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z"/></svg>
        </div>
        <div>
          <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--supabase-text-muted)', marginBottom: 4 }}>
            Como funciona o disparo
          </div>
          <div style={{ fontSize: 11.5, color: 'var(--supabase-icon-inactive)', lineHeight: 1.6 }}>
            O Cliniflow salva a configuração no Supabase. O n8n lê essas configurações no horário programado,
            busca as consultas do dia seguinte, e envia os lembretes via WhatsApp Cloud API (Meta).
            Variáveis disponíveis: <code style={{ background: 'var(--supabase-bg-input)', padding: '1px 5px', borderRadius: 3, color: 'var(--supabase-text-muted)', fontSize: 10.5 }}>
            {'{nome}'} {'{primeiro_nome}'} {'{data}'} {'{hora}'} {'{medico}'} {'{tipo}'}
            </code>
          </div>
        </div>
      </div>
    </div>
  );
}

function LembreteCard({ config, accent, onSave, saving, isConnected }) {
  const [editando, setEditando] = useStateA(false);
  const [draft, setDraft] = useStateA({ ...config });
  const set = (k, v) => setDraft(prev => ({ ...prev, [k]: v }));

  // O TÍTULO É DERIVADO de `antecedencia_horas`, nunca texto fixo — e acompanha
  // a edição ao vivo. O título fixo já mentiu em produção: "Lembrete 2 horas
  // antes" com `antecedencia_horas = 4` no banco. Agora, mudar a antecedência no
  // formulário renomeia o card. Ver ARMADILHAS.md §39.
  // As chaves em uso são `lembrete_*` (09/08/2026, com template aprovado na
  // Meta). As `reminder_*` são de 04/06/2026, sem template — ficam listadas aqui
  // só para não virarem nome cru se alguém as reativar direto pelo banco.
  const tipoInfo = {
    lembrete_24h: { desc: 'Enviado no dia anterior à consulta', icon: '🔔' },
    lembrete_4h: { desc: 'Enviado próximo ao horário da consulta', icon: '⏰' },
    reminder_24h: { desc: 'Legado — sem template da Meta, não envia', icon: '🔔' },
    reminder_2h: { desc: 'Legado — sem template da Meta, não envia', icon: '⏰' },
    reminder_custom: { desc: 'Legado — sem template da Meta, não envia', icon: '⚙️' },
  };
  const base = tipoInfo[config.tipo_lembrete] || { desc: '', icon: '📩' };
  const horas = draft.antecedencia_horas || config.antecedencia_horas;
  const info = { ...base, titulo: horas ? `Lembrete ${horas} horas antes` : config.tipo_lembrete };

  const handleSave = () => {
    onSave(config.id, {
      ativo: draft.ativo,
      horario_envio: draft.horario_envio || null,
      antecedencia_horas: parseInt(draft.antecedencia_horas) || 24,
      template_mensagem: draft.template_mensagem,
    });
    setEditando(false);
  };

  const previewMsg = (window.SupabaseService?.aplicarTemplate || ((t) => t))(draft.template_mensagem, {
    nome: 'Ana Lima', data: '04/06/2026', hora: '10:00', medico: 'Dr. Carlos Mendes', tipo: 'Consulta de rotina',
  });

  return (
    <div style={{
      background: 'var(--supabase-bg-studio)', border: `1px solid ${draft.ativo ? accent + '30' : 'var(--supabase-border)'}`,
      borderRadius: 8, overflow: 'hidden',
      transition: 'border-color .2s',
    }}>
      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '14px 18px', borderBottom: editando ? '1px solid var(--supabase-border)' : 'none',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ fontSize: 20 }}>{info.icon}</span>
          <div>
            <div style={{ fontSize: 13.5, fontWeight: 600, color: draft.ativo ? 'var(--supabase-text-light)' : 'var(--supabase-text-muted)' }}>
              {info.titulo}
            </div>
            <div style={{ fontSize: 11.5, color: 'var(--supabase-text-muted)', marginTop: 2 }}>
              {info.desc}
              {config.meta_template_nome && ` · template ${config.meta_template_nome}`}
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {/* Toggle ativo */}
          <button
            onClick={() => {
              const newVal = !draft.ativo;
              set('ativo', newVal);
              if (isConnected) onSave(config.id, { ativo: newVal });
            }}
            style={{
              position: 'relative', width: 36, height: 20, border: 0, borderRadius: 999,
              background: draft.ativo ? accent : 'var(--supabase-border)',
              cursor: 'pointer', padding: 0, transition: 'background .2s',
            }}
          >
            <span style={{
              position: 'absolute', top: 2, left: draft.ativo ? 18 : 2,
              width: 16, height: 16, borderRadius: '50%', background: '#fff',
              boxShadow: '0 1px 3px rgba(0,0,0,0.3)', transition: 'left .2s',
            }} />
          </button>
          {/* Edit button */}
          <button onClick={() => setEditando(!editando)} style={{
            padding: '5px 10px', borderRadius: 5, cursor: 'pointer',
            background: editando ? `${accent}20` : 'var(--supabase-bg-input)',
            border: `1px solid ${editando ? accent + '40' : 'var(--supabase-border)'}`,
            color: editando ? accent : 'var(--supabase-text-muted)', fontSize: 11.5, fontWeight: 500,
          }}>
            {editando ? 'Fechar' : 'Editar'}
          </button>
        </div>
      </div>

      {/* Edit panel */}
      {editando && (
        <div style={{ padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 14 }}>
          {/* O campo "Horário de envio" foi REMOVIDO em 15/08/2026: a
              `disparar-lembretes` nunca leu `horario_envio` — a janela é só
              `agora + antecedencia_horas` (+1h de tolerância). O controle
              prometia escolher a hora e não escolhia nada. A coluna continua no
              banco e o valor atual é preservado no save. Ver ARMADILHAS §39. */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 12 }}>
            <div>
              <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: 'var(--supabase-text-muted)', textTransform: 'uppercase', letterSpacing: .7, marginBottom: 6 }}>
                Antecedência
              </label>
              <select
                value={draft.antecedencia_horas}
                onChange={e => set('antecedencia_horas', e.target.value)}
                style={{
                  width: '100%', padding: '8px 10px', borderRadius: 6,
                  background: 'var(--supabase-bg-input)', border: '1px solid var(--supabase-border)',
                  color: 'var(--supabase-text-light)', fontSize: 13, outline: 'none', appearance: 'none',
                }}
              >
                <option value={2}>2 horas antes</option>
                <option value={4}>4 horas antes</option>
                <option value={12}>12 horas antes</option>
                <option value={24}>24 horas antes</option>
                <option value={48}>48 horas antes</option>
              </select>
            </div>
          </div>

          {/* Template */}
          <div>
            <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: 'var(--supabase-text-muted)', textTransform: 'uppercase', letterSpacing: .7, marginBottom: 6 }}>
              Template da mensagem
            </label>
            <textarea
              value={draft.template_mensagem}
              onChange={e => set('template_mensagem', e.target.value)}
              rows={3}
              style={{
                width: '100%', padding: '10px 12px', borderRadius: 6,
                background: 'var(--supabase-bg-input)', border: '1px solid var(--supabase-border)',
                color: 'var(--supabase-text-light)', fontSize: 13, outline: 'none', resize: 'vertical',
                lineHeight: 1.5, fontFamily: 'inherit',
              }}
            />
          </div>

          {/* Preview */}
          <div style={{
            padding: '12px 14px', borderRadius: 8,
            background: '#0d160d', border: '1px solid rgba(37,211,102,0.2)',
          }}>
            <div style={{ fontSize: 10.5, fontWeight: 600, color: '#25d366', textTransform: 'uppercase', letterSpacing: .7, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="#25d366"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
              Preview
            </div>
            <div style={{ fontSize: 12.5, color: '#a0d8a0', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>
              {previewMsg}
            </div>
          </div>

          {/* Save button */}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
            <button onClick={() => { setDraft({ ...config }); setEditando(false); }} style={{
              padding: '7px 14px', borderRadius: 6, cursor: 'pointer',
              background: 'var(--supabase-bg-card)', border: '1px solid var(--supabase-border)',
              color: 'var(--supabase-text-muted)', fontSize: 12, fontWeight: 500,
            }}>Cancelar</button>
            <button onClick={handleSave} disabled={saving} style={{
              padding: '7px 16px', borderRadius: 6,
              cursor: saving ? 'not-allowed' : 'pointer',
              background: saving ? 'var(--supabase-bg-hover)' : accent, border: 'none',
              color: saving ? 'var(--supabase-icon-inactive)' : 'rgba(0,0,0,0.85)',
              fontSize: 12, fontWeight: 600,
            }}>{saving ? 'Salvando…' : 'Salvar configuração'}</button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── HISTÓRICO TAB ───────────────────────────────────────────────────────────

function HistoricoTab({ logs, accent, onRefresh, loading }) {
  const [filtro, setFiltro] = useStateA('todos'); // 'todos' | tipo

  const filteredLogs = useMemoA(() => {
    if (filtro === 'todos') return logs;
    return logs.filter(l => l.tipo === filtro);
  }, [logs, filtro]);

  return (
    <div style={{ animation: 'fadeIn .2s var(--ease-premium)' }}>
      {/* Filters */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {['todos', 'reminder_24h', 'reminder_2h', 'confirmation', 'cancellation', 'manual', 'outlier'].map(f => (
            <button key={f} onClick={() => setFiltro(f)} style={{
              padding: '4px 10px', borderRadius: 5, cursor: 'pointer',
              background: filtro === f ? `${accent}20` : 'var(--supabase-bg-input)',
              border: `1px solid ${filtro === f ? accent + '40' : 'var(--supabase-border)'}`,
              color: filtro === f ? accent : 'var(--supabase-text-muted)', fontSize: 11, fontWeight: 500,
            }}>{f === 'todos' ? 'Todos' : (TIPO_LABELS[f] || f)}</button>
          ))}
        </div>
        <button onClick={onRefresh} disabled={loading} style={{
          padding: '5px 12px', borderRadius: 5, cursor: 'pointer',
          background: 'var(--supabase-bg-input)', border: '1px solid var(--supabase-border)',
          color: 'var(--supabase-text-muted)', fontSize: 11.5, fontWeight: 500,
        }}>{loading ? 'Carregando…' : '↻ Atualizar'}</button>
      </div>

      {/* Column headers */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: '1fr 110px 100px 80px 80px 100px',
        gap: 10, padding: '8px 12px', borderBottom: '1px solid var(--supabase-border)', marginBottom: 4,
      }}>
        {['Paciente', 'Tipo', 'Direção', 'Status', 'Confiança', 'Horário'].map(h => (
          <span key={h} style={{
            fontSize: 10, fontWeight: 600, color: 'var(--supabase-text-muted)',
            textTransform: 'uppercase', letterSpacing: .7,
          }}>{h}</span>
        ))}
      </div>

      {/* Rows */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
        {filteredLogs.length === 0 && (
          <div style={{ padding: '40px 20px', textAlign: 'center', color: 'var(--supabase-text-muted)', fontSize: 13 }}>
            Nenhuma mensagem encontrada
          </div>
        )}
        {filteredLogs.map(log => (
          <MensagemRow key={log.id} log={log} accent={accent} />
        ))}
      </div>
    </div>
  );
}

function MensagemRow({ log, accent }) {
  const [hov, setHov] = useStateA(false);
  const [expanded, setExpanded] = useStateA(false);
  const st = MSG_STATUS_CFG[log.status] || MSG_STATUS_CFG.sent;
  const nome = log.patient?.nome || log.telefone || '—';
  const dt = new Date(log.enviado_em);
  const hora = `${String(dt.getHours()).padStart(2, '0')}:${String(dt.getMinutes()).padStart(2, '0')}`;
  const data = `${String(dt.getDate()).padStart(2, '0')}/${String(dt.getMonth() + 1).padStart(2, '0')}`;

  return (
    <div>
      <div
        onClick={() => setExpanded(!expanded)}
        onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)}
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 110px 100px 80px 80px 100px',
          gap: 10, padding: '10px 12px', alignItems: 'center',
          borderBottom: '1px solid var(--supabase-border)',
          background: hov ? 'var(--supabase-bg-hover)' : 'transparent',
          cursor: 'pointer', transition: 'all .1s',
        }}
      >
        <div style={{ fontSize: 12.5, color: 'var(--supabase-text-light)', fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {nome}
        </div>
        <span style={{
          fontSize: 10.5, padding: '2px 7px', borderRadius: 4,
          background: `${accent}14`, color: accent, fontWeight: 500,
          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
        }}>{TIPO_LABELS[log.tipo] || log.tipo}</span>
        <span style={{ fontSize: 11.5, color: log.direcao === 'entrada' ? '#5b8cff' : 'var(--supabase-text-muted)' }}>
          {log.direcao === 'entrada' ? '← Entrada' : '→ Saída'}
        </span>
        <span style={{ fontSize: 11.5, color: st.color, fontWeight: 500 }}>
          {st.icon} {st.label}
        </span>
        <span style={{ fontSize: 11.5, color: log.confianca_percentual > 0 ? 'var(--supabase-text-muted)' : 'var(--supabase-icon-inactive)' }}>
          {log.confianca_percentual > 0 ? `${log.confianca_percentual}%` : '—'}
        </span>
        <span style={{ fontSize: 11.5, color: 'var(--supabase-text-muted)' }}>
          {data} {hora}
        </span>
      </div>

      {/* Expanded content */}
      {expanded && (
        <div style={{
          padding: '10px 12px 10px 24px', background: 'var(--supabase-bg-studio)',
          borderBottom: '1px solid var(--supabase-border)',
        }}>
          <div style={{ fontSize: 12, color: 'var(--supabase-text-muted)', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>
            {log.mensagem || '(sem conteúdo)'}
          </div>
          {log.intencao_detectada && (
            <div style={{ marginTop: 8, fontSize: 11, color: 'var(--supabase-text-muted)' }}>
              Intenção: <strong style={{ color: 'var(--supabase-text-light)' }}>{log.intencao_detectada}</strong>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── STATUS TAB ──────────────────────────────────────────────────────────────

function StatusTab({ accent, logs, saude, isConnected }) {
  const today = new Date().toDateString();
  const msgHoje = logs.filter(l => new Date(l.enviado_em).toDateString() === today);
  const enviados = msgHoje.filter(l => l.direcao === 'saida').length;
  const entregues = msgHoje.filter(l => l.status === 'delivered' || l.status === 'read').length;
  const falhas = msgHoje.filter(l => l.status === 'failed').length;
  const lastMsg = logs.length > 0 ? logs[0] : null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, animation: 'fadeIn .2s var(--ease-premium)' }}>
      {/* Saúde do sistema — erros agrupados por assinatura */}
      <SaudeSistemaCard saude={saude} isConnected={isConnected} />

      {/* Today stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
        <StatCard label="Mensagens enviadas hoje" value={enviados} color={accent} icon="→" />
        <StatCard label="Entregues / Lidas" value={entregues} color="#00d084" icon="✓✓" />
        <StatCard label="Falhas de envio" value={falhas} color="#ef4444" icon="✕" />
      </div>

      {/* Last message */}
      <div style={{
        background: 'var(--supabase-bg-studio)', border: '1px solid var(--supabase-border)', borderRadius: 8, padding: '18px 20px',
      }}>
        <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--supabase-text-muted)', marginBottom: 12 }}>Última mensagem</div>
        {lastMsg ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div style={{ fontSize: 13, color: 'var(--supabase-text-light)' }}>{lastMsg.patient?.nome || lastMsg.telefone}</div>
            <div style={{ fontSize: 12, color: 'var(--supabase-text-muted)', whiteSpace: 'pre-wrap', maxHeight: 60, overflow: 'hidden' }}>
              {lastMsg.mensagem || '(sem conteúdo)'}
            </div>
            <div style={{ fontSize: 11, color: 'var(--supabase-text-muted)' }}>
              {new Date(lastMsg.enviado_em).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}
              {' · '}
              <span style={{ color: (MSG_STATUS_CFG[lastMsg.status] || {}).color || 'var(--supabase-text-muted)' }}>
                {(MSG_STATUS_CFG[lastMsg.status] || {}).label || lastMsg.status}
              </span>
            </div>
          </div>
        ) : (
          <div style={{ fontSize: 12.5, color: 'var(--supabase-text-muted)' }}>Nenhuma mensagem registrada</div>
        )}
      </div>

      {/* Supabase connection */}
      <div style={{
        background: 'var(--supabase-bg-studio)', border: '1px solid var(--supabase-border)', borderRadius: 8, padding: '18px 20px',
      }}>
        <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--supabase-text-muted)', marginBottom: 12 }}>Conexão Supabase</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{
            width: 8, height: 8, borderRadius: '50%',
            background: isConnected ? '#00d084' : '#ef4444',
          }} />
          <span style={{ fontSize: 13, color: isConnected ? '#00d084' : '#ef4444', fontWeight: 500 }}>
            {isConnected ? 'Conectado ao banco de dados' : 'Modo demonstração (config.js vazio)'}
          </span>
        </div>
      </div>
    </div>
  );
}

// Erros de TODOS os componentes (n8n, edge functions, detector de silêncio) agrupados por
// assinatura. O que importa aqui é "quantos problemas distintos", não "quantas linhas":
// em 26/07/2026 a tabela tinha 33 linhas para 8 problemas reais.
const ORIGEM_CFG = {
  n8n:      { label: 'n8n',      color: '#ea4b71' },
  edge:     { label: 'edge',     color: '#3ecf8e' },
  cron:     { label: 'cron',     color: '#f59e0b' },
  frontend: { label: 'frontend', color: '#5b8cff' },
};

function SaudeSistemaCard({ saude, isConnected }) {
  const itens = saude || [];

  return (
    <div style={{
      background: 'var(--supabase-bg-studio)', border: '1px solid var(--supabase-border)', borderRadius: 8, padding: '18px 20px',
    }}>
      <div style={{
        display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 14,
      }}>
        <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--supabase-text-muted)' }}>Saúde do sistema</div>
        <div style={{ fontSize: 11, color: 'var(--supabase-icon-inactive)' }}>últimos 7 dias · agrupado por erro</div>
      </div>

      {!isConnected ? (
        <div style={{ fontSize: 12.5, color: 'var(--supabase-text-muted)' }}>Modo demonstração</div>
      ) : itens.length === 0 ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#00d084' }} />
          <span style={{ fontSize: 13, color: '#00d084', fontWeight: 500 }}>
            Nenhum erro registrado
          </span>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {itens.map((item, i) => {
            const org = ORIGEM_CFG[item.origem] || { label: item.origem, color: '#666' };
            return (
              <div key={i} style={{
                display: 'flex', alignItems: 'flex-start', gap: 10,
                paddingBottom: i < itens.length - 1 ? 10 : 0,
                borderBottom: i < itens.length - 1 ? '1px solid var(--supabase-border)' : 'none',
              }}>
                <span style={{
                  flexShrink: 0, marginTop: 1, padding: '1px 6px', borderRadius: 3,
                  fontSize: 10, fontWeight: 600, color: org.color,
                  background: `${org.color}1a`, border: `1px solid ${org.color}33`,
                }}>{org.label}</span>

                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ fontSize: 12.5, color: 'var(--supabase-text-light)', marginBottom: 2 }}>
                    {item.node_name}
                    <span style={{ color: 'var(--supabase-text-muted)' }}> · {item.workflow_name}</span>
                  </div>
                  <div style={{
                    fontSize: 11.5, color: 'var(--supabase-text-muted)', lineHeight: 1.5,
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  }} title={item.error_message}>{item.error_message}</div>
                  <div style={{ fontSize: 10.5, color: 'var(--supabase-text-muted)', marginTop: 3 }}>
                    {new Date(item.ultima).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}
                  </div>
                </div>

                {item.ocorrencias > 1 && (
                  <span style={{
                    flexShrink: 0, marginTop: 1, padding: '1px 7px', borderRadius: 10,
                    fontSize: 10.5, fontWeight: 600, color: 'var(--supabase-text-muted)', background: 'var(--supabase-bg-input)',
                  }}>{item.ocorrencias}×</span>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function StatCard({ label, value, color, icon }) {
  return (
    <div style={{
      background: 'var(--supabase-bg-studio)', border: '1px solid var(--supabase-border)', borderRadius: 8, padding: '16px 18px',
    }}>
      <div style={{ fontSize: 10.5, fontWeight: 600, color: 'var(--supabase-text-muted)', textTransform: 'uppercase', letterSpacing: .7, marginBottom: 8 }}>
        {label}
      </div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
        <span style={{ fontSize: 28, fontWeight: 700, color, letterSpacing: '-1px', lineHeight: 1 }}>
          {value}
        </span>
        <span style={{ fontSize: 14, color: `${color}88` }}>{icon}</span>
      </div>
    </div>
  );
}

// ─── EXPORTS ─────────────────────────────────────────────────────────────────

Object.assign(window, { AutomationView });
