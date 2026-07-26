// ============================================================================
// NORMALIZAÇÃO EVO-GO v3.2 - FIX: Tipo 'text' e 'instanceName'
// ============================================================================

const DELAY_MS = 650;
await new Promise(resolve => setTimeout(resolve, DELAY_MS));

const body = items[0].json.body || items[0].json;
const payload = items[0].json._evo_payload || body.data || body;

const info = payload.Info || payload.info || payload.key || payload;
const msgData = payload.Message || payload.message || {};
const type = info.Type || payload.messageType || Object.keys(msgData)[0] || "conversation";

// --- EXTRAÇÃO DE DADOS EVO-GO ---
let textoMensagem = "";

// Evolution Go pode enviar tipo 'text' ou 'conversation' para texto simples
if (type === 'text' || type === 'conversation') {
    textoMensagem = msgData.conversation || "";
} else if (type === 'extendedTextMessage') {
    textoMensagem = msgData.extendedTextMessage?.text || "";
} else if (type.includes('audio')) {
    textoMensagem = "[ÁUDIO RECEBIDO]";
} else if (type.includes('document')) {
    textoMensagem = "[DOCUMENTO RECEBIDO]";
} else if (type.includes('image')) {
    textoMensagem = msgData.imageMessage?.caption || "[MÍDIA RECEBIDA]";
} else if (type.includes('video')) {
    textoMensagem = msgData.videoMessage?.caption || "[MÍDIA RECEBIDA]";
} else {
    textoMensagem = "[CONTEÚDO NÃO RECONHECIDO]";
}

const pushName = info.PushName || payload.pushName || "Paciente";
// Corrigido para buscar 'instanceName' ou 'instance'
const instancia = body.instanceName || body.instance || payload.instance || "default";

// ============================================================================
// DETECÇÃO CORRETA DO TELEFONE
// ============================================================================

const phoneRaw = info.Chat || info.remoteJid || "";
// Remove sufixo @lid ou @s.whatsapp.net
let telefone = phoneRaw.split('@')[0];

// --- NORMALIZAÇÃO 9º DÍGITO ---
telefone = telefone.replace(/\D/g, '');
let telefonePadronizado = "";

if (telefone.startsWith("55")) {
  const semDDI = telefone.substring(2);
  if (semDDI.length === 10) {
    const ddd = semDDI.substring(0, 2);
    const numero = semDDI.substring(2);
    telefonePadronizado = `55${ddd}9${numero}`;
  } else {
    telefonePadronizado = telefone;
  }
} else {
  if (telefone.length === 10) {
    const ddd = telefone.substring(0, 2);
    const numero = telefone.substring(2);
    telefonePadronizado = `55${ddd}9${numero}`;
  } else if (telefone.length === 11) {
    telefonePadronizado = `55${telefone}`;
  } else {
    telefonePadronizado = telefone.startsWith("55") ? telefone : `55${telefone}`;
  }
}

const agora = new Date();
const dataLegivel = agora.toLocaleString("pt-BR", { 
    timeZone: "America/Sao_Paulo",
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit", second: "2-digit"
});

// --- RETORNO NO FORMATO ORIGINAL RAG ---
return {
    json: {
        mensagem_do_usuario: textoMensagem,
        nome_paciente: pushName,
        telefone_whatsapp: telefonePadronizado,
        remote_jid: phoneRaw,
        instancia: instancia,
        timestamp: agora.toISOString(),
        data_hora_legivel: dataLegivel,
        
        // Debug
        _evo_debug: {
            chat_original: phoneRaw,
            is_from_me: info.IsFromMe || info.fromMe,
            type: type
        }
    }
};
