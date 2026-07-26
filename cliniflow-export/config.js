// config.js — Configuração do Cliniflow
// Preencha com os dados do seu Supabase e n8n
// Se deixar vazio, o Cliniflow rodará em modo de demonstração (mock data)

window.CLINIFLOW_CONFIG = {
  // ── Supabase ────────────────────────────────────────────
  // Encontre no Supabase Dashboard > Settings > API
  supabaseUrl: 'https://mxvaufkqijdkapvtkvee.supabase.co',       // Ex: 'https://abcdefgh.supabase.co'
  supabaseAnonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im14dmF1ZmtxaWpka2FwdnRrdmVlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM0MjEzMDAsImV4cCI6MjA4ODk5NzMwMH0.CVl3Qechh91cZA9AXfMrNmnCMgGFCyROaSB4AqU9c3I',   // Ex: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...'

  // ── n8n ─────────────────────────────────────────────────
  // URL base do seu n8n (sem barra final)
  n8nBaseUrl: 'https://n8n.iagobatista.cloud',        // Ex: 'https://n8n.iagobatista.cloud'
  n8nWebhookToken: '',   // Opcional: token de autenticação para webhooks
};
