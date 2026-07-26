// ============================================================================
// NÓ: FILTRO ANTI-LOOP EVO-GO v3.2 - FIX: Buscador de dados resiliente
// ============================================================================

const body = items[0].json.body || items[0].json;

// Evo-Go pode enviar os dados dentro de 'data' ou diretamente no 'body'
const payload = body.data || body;

// Extrair Info e Message de forma case-insensitive
const info = payload.Info || payload.info || payload.key || payload;
const message = payload.Message || payload.message || {};

// Propriedades comuns
const isFromMe = info.IsFromMe !== undefined ? info.IsFromMe : info.fromMe;
const isGroup = info.IsGroup !== undefined ? info.IsGroup : info.isGroup;
const chat = info.Chat || info.remoteJid || payload.instance || "";
const type = info.Type || payload.messageType || Object.keys(message)[0];

// --- VALIDAÇÃO 1: Mensagem é do próprio sistema? ---
if (isFromMe === true) {
  console.log("🚫 Bloqueado: Mensagem enviada pelo sistema");
  return [];
}

// --- VALIDAÇÃO 2: É grupo ou broadcast? ---
if (isGroup === true || chat.includes('@g.us') || chat.includes('@broadcast')) {
  console.log("🚫 Bloqueado: Mensagem de grupo/broadcast");
  return [];
}

// --- VALIDAÇÃO 3: É newsletter? ---
if (chat.includes('@newsletter')) {
  console.log("🚫 Bloqueado: Newsletter");
  return [];
}

// --- VALIDAÇÃO 4: Tem ALGUM conteúdo? ---
if (!type || Object.keys(message).length === 0) {
  console.log("🚫 Bloqueado: Mensagem completamente vazia");
  return [];
}

// ✅ PASSA: É mensagem legítima de cliente
console.log("✅ Aprovado: Mensagem de cliente", chat);
if (type.includes('audio')) {
  console.log("📢 Áudio detectado - será tratado pelo 'Valida contexto'");
}

// Injetar o payload descoberto para o próximo nó não precisar descobrir de novo
items[0].json._evo_payload = payload;

return items;
