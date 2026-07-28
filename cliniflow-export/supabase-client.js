// supabase-client.js
// Camada de acesso ao Supabase para o Cliniflow CRM
// Carregado via CDN junto com supabase-js
// Exporta para window: SupabaseService

(function () {
  'use strict';

  // ── CONFIG ──────────────────────────────────────────────────────────────────
  // Lê do window.CLINIFLOW_CONFIG (definido em config.js) ou usa defaults

  function getConfig() {
    const cfg = window.CLINIFLOW_CONFIG || {};
    return {
      supabaseUrl: cfg.supabaseUrl || '',
      supabaseAnonKey: cfg.supabaseAnonKey || '',
      n8nBaseUrl: cfg.n8nBaseUrl || '',
      n8nWebhookToken: cfg.n8nWebhookToken || '',
    };
  }

  let _client = null;

  function getClient() {
    if (_client) return _client;
    const cfg = getConfig();
    if (!cfg.supabaseUrl || !cfg.supabaseAnonKey) return null;
    // supabase-js via CDN expõe window.supabase
    if (!window.supabase || !window.supabase.createClient) {
      console.error('[Cliniflow] supabase-js não carregado. Inclua o CDN antes.');
      return null;
    }
    _client = window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey);
    return _client;
  }

  // ── HELPERS ─────────────────────────────────────────────────────────────────

  function isConnected() {
    return !!getClient();
  }

  // ── AUTH ────────────────────────────────────────────────────────────────────
  // O supabase-js v2 já persiste a sessão em localStorage e renova o token
  // sozinho. Os defaults estão certos — não desabilite, e não monte o header
  // Authorization à mão.

  let _session = null;

  async function getSession() {
    const client = getClient();
    if (!client) return null;
    const { data } = await client.auth.getSession();
    _session = data.session || null;
    return _session;
  }

  // Um login por clínica (DECISIONS D-6): este uid identifica a CONTA da clínica,
  // não a pessoa. Serve para "alguém assumiu", nunca para "quem assumiu".
  function getCurrentUserId() {
    return (_session && _session.user && _session.user.id) || null;
  }

  function getCurrentUserEmail() {
    return (_session && _session.user && _session.user.email) || null;
  }

  // Traduz o erro do Supabase. Nunca devolva o erro cru para a tela.
  function traduzErroLogin(error) {
    const msg = String((error && error.message) || '');
    if (/Invalid login credentials/i.test(msg)) return 'E-mail ou senha incorretos.';
    if (/Failed to fetch|NetworkError|network/i.test(msg)) return 'Sem conexão com o servidor. Verifique a internet.';
    return 'Não foi possível entrar. Tente de novo.';
  }

  async function signIn(email, senha) {
    const client = getClient();
    if (!client) return { success: false, error: 'Supabase não configurado' };
    try {
      const { data, error } = await client.auth.signInWithPassword({ email, password: senha });
      if (error) return { success: false, error: traduzErroLogin(error) };
      _session = data.session || null;
      return { success: true, session: _session };
    } catch (err) {
      return { success: false, error: traduzErroLogin(err) };
    }
  }

  async function signOut() {
    const client = getClient();
    if (!client) return { success: false };
    const { error } = await client.auth.signOut();
    _session = null;
    return { success: !error };
  }

  function onAuthStateChange(callback) {
    const client = getClient();
    if (!client) return null;
    const { data } = client.auth.onAuthStateChange((_event, session) => {
      _session = session || null;
      callback(_session);
    });
    return data.subscription;
  }

  // sessoes_ativas.telefone é gravada pelo n8n ("Normalizar Dados v2") no formato
  // 55 + DDD + 9 + número (13 dígitos), enquanto patients.telefone guarda 11 dígitos.
  // Sem converter, todo .eq('telefone', ...) nessa tabela erra a linha.
  function telefoneSessao(telefone) {
    const d = String(telefone || '').replace(/\D/g, '');
    if (!d) return d;
    if (d.startsWith('55')) {
      const semDDI = d.substring(2);
      return semDDI.length === 10 ? `55${semDDI.substring(0, 2)}9${semDDI.substring(2)}` : d;
    }
    if (d.length === 10) return `55${d.substring(0, 2)}9${d.substring(2)}`;
    return `55${d}`;
  }

  // Wrapper que trata erros e retorna { data, error }
  async function query(fn) {
    const client = getClient();
    if (!client) return { data: null, error: { message: 'Supabase não configurado' } };
    try {
      const result = await fn(client);
      if (result.error) {
        console.error('[Cliniflow] Supabase error:', result.error);
      }
      return result;
    } catch (err) {
      console.error('[Cliniflow] Exception:', err);
      return { data: null, error: { message: err.message } };
    }
  }

  // ── PACIENTES ───────────────────────────────────────────────────────────────

  async function fetchPacientes(filtros = {}) {
    return query(async (sb) => {
      let q = sb.from('patients').select('*').order('criado_em', { ascending: false });

      if (filtros.status && filtros.status !== 'todos') {
        q = q.eq('status', filtros.status);
      }
      if (filtros.busca) {
        const term = `%${filtros.busca}%`;
        q = q.or(`nome.ilike.${term},telefone.ilike.${term},email.ilike.${term}`);
      }
      if (filtros.limit) {
        q = q.limit(filtros.limit);
      }
      return q;
    });
  }

  async function createPaciente(dados) {
    const rawPhone = dados.telefone || dados.phone || '';
    const cleanPhone = rawPhone.replace(/\D/g, '');
    
    let dataNasc = dados.data_nasc || null;
    const ageVal = dados.age !== undefined ? dados.age : dados.idade;
    if (!dataNasc && ageVal !== undefined) {
      const ageNum = parseInt(ageVal);
      if (!isNaN(ageNum)) {
        const birthYear = new Date().getFullYear() - ageNum;
        dataNasc = `${birthYear}-01-01`;
      }
    }

    return query(async (sb) => {
      return sb.from('patients').insert({
        nome: dados.nome || dados.name,
        telefone: cleanPhone,
        email: dados.email || '',
        convenio: dados.convenio || 'Particular',
        data_nasc: dataNasc,
        status: dados.status || 'novo',
      }).select().single();
    });
  }

  async function updatePaciente(id, dados) {
    const updateData = {};
    
    if (dados.name !== undefined) updateData.nome = dados.name;
    if (dados.nome !== undefined) updateData.nome = dados.nome;
    
    if (dados.phone !== undefined) updateData.telefone = dados.phone.replace(/\D/g, '');
    if (dados.telefone !== undefined) updateData.telefone = dados.telefone.replace(/\D/g, '');
    
    if (dados.email !== undefined) updateData.email = dados.email;
    if (dados.convenio !== undefined) updateData.convenio = dados.convenio;
    if (dados.status !== undefined) updateData.status = dados.status;
    
    const ageVal = dados.age !== undefined ? dados.age : dados.idade;
    if (ageVal !== undefined) {
      const ageNum = parseInt(ageVal);
      if (!isNaN(ageNum)) {
        const birthYear = new Date().getFullYear() - ageNum;
        updateData.data_nasc = `${birthYear}-01-01`;
      }
    }
    
    if (dados.data_nasc !== undefined) updateData.data_nasc = dados.data_nasc;
    if (dados.bot_pausado !== undefined) updateData.bot_pausado = dados.bot_pausado;

    return query(async (sb) => {
      return sb.from('patients').update(updateData).eq('id', id).select().single();
    });
  }

  // ── CONSULTAS ───────────────────────────────────────────────────────────────

  async function fetchConsultas(filtros = {}) {
    return query(async (sb) => {
      let q = sb.from('consultas')
        .select(`
          *,
          patient:patients (id, nome, telefone, email, convenio, status, data_nasc)
        `)
        .order('data_hora', { ascending: true });

      if (filtros.status && filtros.status !== 'todas') {
        q = q.eq('status', filtros.status);
      }
      if (filtros.dataInicio) {
        q = q.gte('data_hora', filtros.dataInicio);
      }
      if (filtros.dataFim) {
        q = q.lte('data_hora', filtros.dataFim);
      }
      if (filtros.medico) {
        q = q.eq('medico', filtros.medico);
      }
      if (filtros.patientId) {
        q = q.eq('patient_id', filtros.patientId);
      }
      return q;
    });
  }

  async function createConsulta(dados) {
    return query(async (sb) => {
      return sb.from('consultas').insert({
        patient_id: dados.patient_id,
        data_hora: dados.data_hora,
        duracao_min: dados.duracao_min || 30,
        tipo: dados.tipo || 'Consulta de rotina',
        medico: dados.medico,
        status: dados.status || 'pendente',
        convenio: dados.convenio || 'Particular',
        preco: dados.preco || null,
        whatsapp_ativo: dados.whatsapp_ativo !== undefined ? dados.whatsapp_ativo : true,
        notas: dados.notas || null,
      }).select(`
        *,
        patient:patients (id, nome, telefone, email, convenio, status)
      `).single();
    });
  }

  async function updateConsulta(id, dados) {
    return query(async (sb) => {
      return sb.from('consultas').update(dados).eq('id', id).select(`
        *,
        patient:patients (id, nome, telefone, email, convenio, status)
      `).single();
    });
  }

  async function deleteConsulta(id) {
    return query(async (sb) => {
      return sb.from('consultas').delete().eq('id', id);
    });
  }

  // ── KPIs (RELATÓRIOS) ───────────────────────────────────────────────────────

  async function fetchKpiComparecimento() {
    return query(async (sb) => {
      return sb.from('kpi_comparecimento').select('*').single();
    });
  }

  async function fetchKpiResumoMensal() {
    return query(async (sb) => {
      return sb.from('kpi_resumo_mensal').select('*');
    });
  }

  async function fetchKpiSessoesDiaSemana() {
    return query(async (sb) => {
      return sb.from('kpi_sessoes_dia_semana').select('*');
    });
  }

  async function fetchKpiRetencao() {
    return query(async (sb) => {
      return sb.from('kpi_retencao').select('*').limit(20);
    });
  }

  async function fetchAllKPIs() {
    const [comparecimento, mensal, diaSemana, retencao] = await Promise.all([
      fetchKpiComparecimento(),
      fetchKpiResumoMensal(),
      fetchKpiSessoesDiaSemana(),
      fetchKpiRetencao(),
    ]);
    return {
      comparecimento: comparecimento.data,
      mensal: mensal.data || [],
      diaSemana: diaSemana.data || [],
      retencao: retencao.data || [],
      error: comparecimento.error || mensal.error || diaSemana.error || retencao.error,
    };
  }

  // ── MENSAGEM LOGS ───────────────────────────────────────────────────────────

  async function fetchMensagemLogs(filtros = {}) {
    return query(async (sb) => {
      let q = sb.from('mensagem_logs')
        .select(`
          *,
          patient:patients (id, nome, telefone),
          consulta:consultas (id, data_hora, tipo, medico)
        `)
        .order('enviado_em', { ascending: false });

      if (filtros.consultaId) q = q.eq('consulta_id', filtros.consultaId);
      if (filtros.telefone) q = q.eq('telefone', filtros.telefone);
      if (filtros.tipo) q = q.eq('tipo', filtros.tipo);
      if (filtros.status) q = q.eq('status', filtros.status);
      if (filtros.limit) q = q.limit(filtros.limit);
      else q = q.limit(50);

      return q;
    });
  }

  // ── SAÚDE DO SISTEMA ────────────────────────────────────────────────────────

  // Agrupa logs_erro por assinatura (origem + workflow + nó + mensagem). O banco já
  // deduplica a GRAVAÇÃO numa janela de 1h (função detectar_silencio); aqui agrupamos o
  // histórico para a tela mostrar "8 problemas" em vez de "33 linhas".
  async function fetchSaudeSistema(dias = 7) {
    const desde = new Date(Date.now() - dias * 24 * 60 * 60 * 1000).toISOString();
    const res = await query(async (sb) => {
      return sb.from('logs_erro')
        .select('origem, workflow_name, node_name, error_message, criado_em')
        .gte('criado_em', desde)
        .order('criado_em', { ascending: false })
        .limit(500);
    });
    if (!res.data) return res;

    // Vem ordenado do mais recente para o mais antigo, então o primeiro que aparece
    // de cada assinatura é a última ocorrência.
    const porAssinatura = new Map();
    for (const linha of res.data) {
      const chave = `${linha.origem}|${linha.workflow_name}|${linha.node_name}|${linha.error_message}`;
      const atual = porAssinatura.get(chave);
      if (atual) {
        atual.ocorrencias += 1;
        atual.primeira = linha.criado_em;
      } else {
        porAssinatura.set(chave, {
          ...linha,
          ocorrencias: 1,
          ultima: linha.criado_em,
          primeira: linha.criado_em,
        });
      }
    }

    return {
      data: Array.from(porAssinatura.values()).sort((a, b) => b.ultima.localeCompare(a.ultima)),
      error: null,
    };
  }

  // ── CONFIGURAÇÃO DE AUTOMAÇÃO ───────────────────────────────────────────────

  async function fetchConfigAutomacao() {
    return query(async (sb) => {
      return sb.from('config_automacao').select('*').order('tipo_lembrete');
    });
  }

  async function updateConfigAutomacao(id, dados) {
    return query(async (sb) => {
      return sb.from('config_automacao')
        .update(dados)
        .eq('id', id)
        .select()
        .single();
    });
  }

  // ── HISTÓRICO DE CONFIRMAÇÕES ───────────────────────────────────────────────

  async function fetchHistoricoConfirmacoes(filtros = {}) {
    return query(async (sb) => {
      let q = sb.from('historico_confirmacoes')
        .select('*')
        .order('criado_em', { ascending: false });

      if (filtros.telefone) q = q.eq('telefone', filtros.telefone);
      if (filtros.limit) q = q.limit(filtros.limit);
      else q = q.limit(50);

      return q;
    });
  }

  // ── AÇÕES VIA N8N (WEBHOOKS) ────────────────────────────────────────────────

  async function callN8nWebhook(path, payload) {
    const cfg = getConfig();
    if (!cfg.n8nBaseUrl) {
      return { success: false, error: 'n8n URL não configurada' };
    }
    const url = `${cfg.n8nBaseUrl.replace(/\/$/, '')}/${path.replace(/^\//, '')}`;
    try {
      const headers = { 'Content-Type': 'application/json' };
      if (cfg.n8nWebhookToken) {
        headers['Authorization'] = `Bearer ${cfg.n8nWebhookToken}`;
      }
      const res = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      return { success: res.ok, data, status: res.status };
    } catch (err) {
      console.error('[Cliniflow] n8n webhook error:', err);
      return { success: false, error: err.message };
    }
  }

  async function enviarWhatsApp(telefone, mensagem, tipo, consultaId, nomePaciente = null) {
    const client = getClient();
    if (!client) return { success: false, error: 'Supabase não configurado' };

    const cleanPhone = telefone.replace(/\D/g, '');

    try {
      // Delega TODA a lógica (buscar/criar paciente, conversa e log) para a Edge Function
      const { data, error } = await client.functions.invoke('enviar-whatsapp', {
        body: {
          telefone: cleanPhone,
          mensagem,
          tipo: tipo || 'manual',
          consulta_id: consultaId,
          nome_paciente: nomePaciente,
          // Não passamos patient_id nem conversation_id para forçar a Edge Function a resolver com segurança
        }
      });
      
      if (!error && data?.ok) {
        return { success: true, data };
      }
      
      console.error('[Cliniflow] Erro ao chamar Edge Function enviar-whatsapp:', error || data?.error);
      return { success: false, error: error?.message || data?.error || 'Erro desconhecido na Edge Function' };
      
    } catch (err) {
      console.error('[Cliniflow] Exception em enviarWhatsApp:', err);
      return { success: false, error: err.message };
    }
  }

  async function verificarStatusEvo() {
    const client = getClient();
    if (!client) return { success: false, error: 'Supabase não configurado' };
    try {
      // Chamado direto no Supabase (não no n8n): guarda a evolution_apikey
      // no servidor e evita CORS de um webhook n8n que não existe.
      const { data, error } = await client.functions.invoke('status-evolution');
      if (error) return { success: false, error: error.message };
      return { success: !!data?.ok, data };
    } catch (err) {
      console.error('[Cliniflow] Erro ao verificar status Evolution:', err);
      return { success: false, error: err.message };
    }
  }

  // ── CONVERSAS & ATENDIMENTOS ───────────────────────────────────────────────

  async function fetchConversas(filtros = {}) {
    return query(async (sb) => {
      let q = sb.from('conversations')
        .select(`
          *,
          patient:patients (id, nome, telefone, bot_pausado)
        `)
        .order('last_activity_at', { ascending: false });

      if (filtros.status && filtros.status !== 'todas') {
        q = q.eq('status', filtros.status);
      }
      if (filtros.assigneeId === null) {
        q = q.is('assignee_id', null);
      } else if (filtros.assigneeId) {
        q = q.eq('assignee_id', filtros.assigneeId);
      }
      if (filtros.limit) {
        q = q.limit(filtros.limit);
      } else {
        q = q.limit(50);
      }
      return q;
    });
  }

  async function updateConversa(id, updates) {
    const cleanUpdates = { ...updates };
    return query(async (sb) => {
      return sb.from('conversations')
        .update(cleanUpdates)
        .eq('id', id)
        .select(`
          *,
          patient:patients (id, nome, telefone, bot_pausado)
        `)
        .single();
    });
  }

  async function fetchMensagens(conversaId) {
    return query(async (sb) => {
      return sb.from('mensagem_logs')
        .select('*')
        .eq('conversation_id', conversaId)
        .order('enviado_em', { ascending: true });
    });
  }

  // senderId é aceito por compatibilidade com os chamadores, mas ignorado:
  // com um login por clínica (DECISIONS D-6) gravar o uid não diz quem escreveu,
  // e dado sem informação engana quem for ler depois. sender_id fica sempre NULL.
  async function enviarMensagemCRM(conversaId, pacienteId, telefone, texto, senderId = null) {
    const client = getClient();
    if (!client) return { success: false, error: 'Supabase não configurado' };

    try {
      // 1. Grava no banco local
      const logResult = await query(async (sb) => {
        return sb.from('mensagem_logs').insert({
          conversation_id: conversaId,
          patient_id: pacienteId || null,
          telefone: telefone,
          mensagem: texto,
          tipo: 'manual',
          canal: 'whatsapp',
          direcao: 'saida',
          sender_id: null,
          status: 'pending',
        }).select().single();
      });

      // 2. O envio em si é assíncrono e gerenciado pelo Trigger (pg_net) no Supabase.
      // O WebSocket atualiza o status para 'sent' ou 'failed' depois.

      // 3. Força a pausa da IA ativando o atendimento_humano na sessão
      await query(async (sb) => {
        return sb.from('sessoes_ativas')
          .update({ atendimento_humano: true })
          .eq('telefone', telefoneSessao(telefone));
      });

      // 4. Atualiza a data de atividade na conversa
      await query(async (sb) => {
        return sb.from('conversations')
          .update({ last_activity_at: new Date().toISOString() })
          .eq('id', conversaId);
      });

      return { success: true, data: logResult.data };
    } catch (err) {
      console.error('[Cliniflow] Erro ao enviar mensagem do CRM:', err);
      return { success: false, error: err.message };
    }
  }

  async function fetchActiveSession(telefone) {
    return query(async (sb) => {
      return sb.from('sessoes_ativas').select('*').eq('telefone', telefoneSessao(telefone)).maybeSingle();
    });
  }

  async function updateConversaStatus(conversaId, status) {
    const client = getClient();
    if (!client) return { success: false };

    try {
      // Get conversation to find phone
      const { data: conv } = await client.from('conversations')
        .select('*, patient:patients(telefone)')
        .eq('id', conversaId)
        .single();
      
      // Update conversation status
      await client.from('conversations')
        .update({ status: status })
        .eq('id', conversaId);

      if (status === 'resolved' && conv?.patient?.telefone) {
        // Clear atendimento_humano in sessoes_ativas
        await client.from('sessoes_ativas')
          .update({ atendimento_humano: false })
          .eq('telefone', telefoneSessao(conv.patient.telefone));
      }
      return { success: true };
    } catch (err) {
      console.error('Error in updateConversaStatus:', err);
      return { success: false, error: err.message };
    }
  }

  function subscribeToMensagens(conversaId, callback) {
    const client = getClient();
    if (!client) return null;
    return client
      .channel(`msg_${conversaId}`)
      .on('postgres_changes', { 
        event: '*', 
        schema: 'public', 
        table: 'mensagem_logs',
        filter: `conversation_id=eq.${conversaId}`
      }, callback)
      .subscribe();
  }

  function subscribeToConversas(callback) {
    const client = getClient();
    if (!client) return null;
    return client
      .channel('conversas_changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'conversations' }, callback)
      .subscribe();
  }

  // ── REALTIME (SUBSCRIPTIONS) ────────────────────────────────────────────────

  function subscribeToConsultas(callback) {
    const client = getClient();
    if (!client) return null;
    return client
      .channel('consultas_changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'consultas' }, callback)
      .subscribe();
  }

  function subscribeToPacientes(callback) {
    const client = getClient();
    if (!client) return null;
    return client
      .channel('patients_changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'patients' }, callback)
      .subscribe();
  }

  // ── UTILITÁRIOS ─────────────────────────────────────────────────────────────

  // Converte consulta do Supabase para o formato que os componentes esperam
  function consultaToAppointment(c, currentMonday) {
    const dt = new Date(c.data_hora);
    const p = c.patient || {};

    // Calcular dia da semana relativo ao currentMonday fornecido ou à semana atual
    const monday = currentMonday ? new Date(currentMonday) : (() => {
      const now = new Date();
      const m = new Date(now);
      m.setDate(now.getDate() - ((now.getDay() + 6) % 7));
      m.setHours(0, 0, 0, 0);
      return m;
    })();
    const day = Math.floor((dt - monday) / (1000 * 60 * 60 * 24));

    // Iniciais do nome
    const nome = p.nome || 'Paciente';
    const initials = nome.split(' ').filter(Boolean).slice(0, 2).map(w => w[0].toUpperCase()).join('');

    // Calcular idade
    let age = 0;
    if (p.data_nasc) {
      const birth = new Date(p.data_nasc);
      age = Math.floor((new Date() - birth) / (365.25 * 24 * 60 * 60 * 1000));
    }

    // Map status
    const statusMap = {
      pendente: 'pending',
      confirmado: 'confirmed',
      cancelado: 'canceled',
      no_show: 'canceled',
      remarcado: 'rescheduled',
      solicitado: 'solicitado',
    };

    return {
      id: c.id,
      _supabaseId: c.id,
      day: day >= 0 && day <= 4 ? day : -1,
      time: `${String(dt.getHours()).padStart(2, '0')}:${String(dt.getMinutes()).padStart(2, '0')}`,
      patient: nome,
      initials,
      type: c.tipo || 'Consulta de rotina',
      doctor: c.medico || '',
      status: statusMap[c.status] || 'pending',
      _realStatus: c.status,
      wa: c.whatsapp_ativo !== false,
      dur: c.duracao_min || 30,
      phone: p.telefone || '',
      age,
      last: '—',
      preco: c.preco,
      _raw: c,
    };
  }

  // Converte paciente do Supabase para o formato dos componentes
  function pacienteToPatient(p) {
    const initials = (p.nome || '').split(' ').filter(Boolean).slice(0, 2).map(w => w[0].toUpperCase()).join('');
    let age = 0;
    if (p.data_nasc) {
      const birth = new Date(p.data_nasc);
      age = Math.floor((new Date() - birth) / (365.25 * 24 * 60 * 60 * 1000));
    }
    return {
      id: p.id,
      name: p.nome,
      initials,
      age,
      data_nasc: p.data_nasc || '',
      phone: p.telefone || '',
      email: p.email || '',
      convenio: p.convenio || 'Particular',
      last: '—',
      visits: 0,
      status: p.status || 'ativo',
    };
  }

  // Aplica template de mensagem com variáveis
  function aplicarTemplate(template, dados) {
    const primeiroNome = (dados.nome || '').split(' ')[0];
    return template
      .replace(/\{nome\}/g, dados.nome || '')
      .replace(/\{primeiro_nome\}/g, primeiroNome)
      .replace(/\{data\}/g, dados.data || '')
      .replace(/\{hora\}/g, dados.hora || '')
      .replace(/\{medico\}/g, dados.medico || '')
      .replace(/\{tipo\}/g, dados.tipo || '')
      .replace(/\{telefone\}/g, dados.telefone || '');
  }

  // ── EXPORT ──────────────────────────────────────────────────────────────────

  window.SupabaseService = {
    // Status
    isConnected,
    getClient,

    // Auth
    getSession,
    getCurrentUserId,
    getCurrentUserEmail,
    signIn,
    signOut,
    onAuthStateChange,

    // Pacientes
    fetchPacientes,
    createPaciente,
    updatePaciente,

    // Consultas
    fetchConsultas,
    createConsulta,
    updateConsulta,
    deleteConsulta,

    // KPIs
    fetchKpiComparecimento,
    fetchKpiResumoMensal,
    fetchKpiSessoesDiaSemana,
    fetchKpiRetencao,
    fetchAllKPIs,

    // Mensagens
    fetchMensagemLogs,
    enviarWhatsApp,
    verificarStatusEvo,

    // Conversas
    fetchConversas,
    updateConversa,
    fetchMensagens,
    enviarMensagemCRM,
    subscribeToMensagens,
    subscribeToConversas,
    fetchActiveSession,
    updateConversaStatus,

    // Config
    fetchConfigAutomacao,
    fetchSaudeSistema,
    updateConfigAutomacao,

    // Histórico
    fetchHistoricoConfirmacoes,

    // Realtime
    subscribeToConsultas,
    subscribeToPacientes,

    // Converters
    consultaToAppointment,
    pacienteToPatient,
    aplicarTemplate,

    // n8n
    callN8nWebhook,
  };
})();
