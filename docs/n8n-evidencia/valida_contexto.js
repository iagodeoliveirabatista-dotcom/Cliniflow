// ============================================================================
// NÓ: VALIDA CONTEXTO v5.3 - FIX: "pode confirmar" + Order refactor
// ============================================================================

const entrada = $('Normalizar Dados v2').first().json.mensagem_do_usuario || "";
const mensagem = entrada.toLowerCase().trim();

// --- 1. VALIDAÇÕES BÁSICAS ---
if (!mensagem || mensagem.length < 2) {
  return {
    json: {
      intencao_detectada: "INVALIDO",
      sugestao_acao: "ENCAMINHAR_HUMANO",
      motivo: "MENSAGEM_VAZIA_OU_CURTA",
      confianca_percentual: 0,
      ...items[0].json
    }
  };
}

// --- 2. DETECÇÃO DE MÍDIA (CORRIGIDO) ---
// Detecta tags de mídia (não tenta ler body que não existe)
const tagsMidia = [
  "[áudio recebido]",
  "[imagem recebida]",
  "[vídeo recebido]",
  "[mídia recebida]",
  "[documento recebido]"
];

if (tagsMidia.includes(mensagem)) {
  return {
    json: {
      intencao_detectada: "MIDIA_SEM_TEXTO",
      sugestao_acao: "ENCAMINHAR_HUMANO",
      motivo: "MENSAGEM_VAZIA",
      mensagem_para_paciente: "📱 Por favor, responda com TEXTO:\n\n✅ CONFIRMAR\n❌ CANCELAR\n📅 REMARCAR",
      confianca_percentual: 0,
      mensagem_original: entrada,
      ...items[0].json
    }
  };
}

// --- 3. NORMALIZAÇÃO ---
let mensagemNormalizada = mensagem
  .replace(/\b(vo|vô)\b/g, 'vou')
  .replace(/\bnao\b/g, 'não')
  .replace(/\btbm\b/g, 'também')
  .replace(/\bpq\b/g, 'porque')
  .replace(/\bblz\b/g, 'beleza')
  .replace(/\btd\b/g, 'tudo')
  .replace(/\bvc\b/g, 'você')
  .replace(/\bpra\b/g, 'para');

// --- 4. INCERTEZA (PRIORIDADE MÁXIMA) ---
const regexIncerteza = /\b(talvez|não sei|acho que não|não tenho certeza|ainda não sei|vou ver|deixa eu ver)\b/i;

if (regexIncerteza.test(mensagemNormalizada)) {
  return {
    json: {
      intencao_detectada: "DESCONHECIDO",
      sugestao_acao: "ENCAMINHAR_HUMANO",
      motivo: "INCERTEZA_EXPLICITA",
      mensagem_para_paciente: "Sem problema! Quando tiver certeza, me avise:\n1️⃣ CONFIRMAR\n2️⃣ CANCELAR\n3️⃣ REMARCAR",
      confianca_percentual: 0,
      mensagem_original: entrada,
      ...items[0].json
    }
  };
}

// --- 5. REMARCAÇÃO COM NEGAÇÃO ---
const regexRemarcacaoComNegacao = /\b(não|nao).{0,50}(mas|porém|porem).{0,50}(outro|mudar|remarcar|transferir|adiar)\b/i;

if (regexRemarcacaoComNegacao.test(mensagem)) {
  return {
    json: {
      intencao_detectada: "REMARCAR",
      sugestao_acao: "PROCESSAR",
      confianca_percentual: 93,
      mensagem_original: entrada,
      ...items[0].json
    }
  };
}

// --- 6. REMARCAÇÃO PURA ---
const regexRemarcacao = /\b(remarcar|remarque|remarca|mudar (data|hora|dia|horário|horario)|adiar|transferir|alterar (data|hora)|outro (dia|horário|horario)|data diferente|horário diferente|horario diferente|dia diferente|quero mudar|quero trocar|preciso mudar|preciso trocar)\b/i;

if (regexRemarcacao.test(mensagem)) {
  return {
    json: {
      intencao_detectada: "REMARCAR",
      sugestao_acao: "PROCESSAR",
      confianca_percentual: 92,
      mensagem_original: entrada,
      ...items[0].json
    }
  };
}

// --- 7. CANCELAMENTO ---
const regexInversaoNegativa = /\b(quero|posso|vou|consigo)\s+(não|nao)\b/i;
const regexCancelamentoIndireto = /\b(fica difícil|vai ser difícil|não vai dar|nao vai dar|tive (um|uma) (problema|probleminha)|desmarque|desmarcar)\b/i;
const regexCancelamentoDireto = /\b(não|nao|cancelar|cancela|cancelamento|desistir|não quero|nao quero|poderei não|poderei nao|imprevisto|surgiu (algo|um|uma)|contratempo|emergência|emergencia)\b/i;
const temPalavraRemarcar = /\b(remarcar|mudar|adiar|transferir|outro|alterar)\b/i;

if ((regexCancelamentoDireto.test(mensagemNormalizada) || 
     regexCancelamentoIndireto.test(mensagemNormalizada) ||
     regexInversaoNegativa.test(mensagem)) && 
    !temPalavraRemarcar.test(mensagemNormalizada)) {
  
  return {
    json: {
      intencao_detectada: "CANCELADO",
      sugestao_acao: "PROCESSAR",
      confianca_percentual: 95,
      mensagem_original: entrada,
      ...items[0].json
    }
  };
}

// --- 8. CONFIRMAÇÃO FORTE (MOVIDO ANTES DE PERGUNTAS!) ---
const regexConfirmacaoForte = /\b(pode confirmar|vou sim|estarei (lá|la)|compareço|compareco|confirmo|confirmado|confirmar|confirma|confirmadíssimo|irei|vou estar|comparecer|presença confirmada|(tô|to) indo|com certeza|também vou|vou também|fechado|pode ser sim)\b/i;

if (regexConfirmacaoForte.test(mensagemNormalizada)) {
  return {
    json: {
      intencao_detectada: "CONFIRMADO",
      sugestao_acao: "PROCESSAR",
      confianca_percentual: 95,
      mensagem_original: entrada,
      ...items[0].json
    }
  };
}

// --- 9. PERGUNTAS (AGORA DEPOIS DE CONFIRMAÇÕES!) ---
if (/\?$/.test(mensagem) && 
    !regexRemarcacao.test(mensagem) && 
    !regexCancelamentoDireto.test(mensagem)) {
  return {
    json: {
      intencao_detectada: "PERGUNTA",
      sugestao_acao: "ENCAMINHAR_HUMANO",
      motivo: "PERGUNTA_DETECTADA",
      confianca_percentual: 0,
      ...items[0].json
    }
  };
}

// Perguntas que começam com palavra interrogativa (COM EXCLUSÃO DE CONFIRMAÇÕES!)
if (/^(é|e|tem|vai|pode|qual|quando|onde|como)\b/i.test(mensagem) &&
    !regexRemarcacao.test(mensagem) &&
    !regexConfirmacaoForte.test(mensagemNormalizada)) {  // ← FIX AQUI!
  return {
    json: {
      intencao_detectada: "PERGUNTA",
      sugestao_acao: "ENCAMINHAR_HUMANO",
      motivo: "PERGUNTA_DETECTADA",
      confianca_percentual: 0,
      ...items[0].json
    }
  };
}

// --- 10. SAUDAÇÕES ---
if (/^(oi|olá|hey|bom dia|boa tarde|boa noite|obrigad[oa]|valeu|brigad[oa]|tudo bem|legal|certo|ok|tá bom)$/i.test(mensagemNormalizada)) {
  return {
    json: {
      intencao_detectada: "SAUDACAO",
      sugestao_acao: "ENCAMINHAR_HUMANO",
      motivo: "PADRAO_IGNORADO",
      confianca_percentual: 0,
      ...items[0].json
    }
  };
}

// --- 11. CONFIRMAÇÃO MÉDIA ---
const regexConfirmacaoMedia = /\b(vou querer|quero ir|quero sim)\b/i;

if (regexConfirmacaoMedia.test(mensagemNormalizada)) {
  return {
    json: {
      intencao_detectada: "CONFIRMADO",
      sugestao_acao: "PROCESSAR",
      confianca_percentual: 85,
      mensagem_original: entrada,
      ...items[0].json
    }
  };
}

// --- 12. CONFIRMAÇÃO FRACA ---
const regexConfirmacaoFraca = /\b(sim|vou|beleza|pode ser|ok|tá bom|ta bom|certo|combinado)\b/i;

if (regexConfirmacaoFraca.test(mensagemNormalizada)) {
  const temNegacaoAntes = /\b(não|nao|nem)\b.{0,20}(vou|posso|consigo)/i;
  const temIncertezaAntes = /\b(talvez|acho que|não sei).{0,30}(vou|posso)/i;
  
  if (!temNegacaoAntes.test(mensagem) && !temIncertezaAntes.test(mensagem)) {
    return {
      json: {
        intencao_detectada: "CONFIRMADO",
        sugestao_acao: "PROCESSAR",
        confianca_percentual: 75,
        mensagem_original: entrada,
        observacao: "Palavra genérica - confirmação fraca",
        ...items[0].json
      }
    };
  }
}

// --- 13. EMOJIS ---
if (/✅|👍|🆗|✔️/u.test(mensagem)) {
  return {
    json: {
      intencao_detectada: "CONFIRMADO",
      sugestao_acao: "PROCESSAR",
      confianca_percentual: 90,
      mensagem_original: entrada,
      ...items[0].json
    }
  };
}

if (/❌|👎|🚫|❎/u.test(mensagem)) {
  return {
    json: {
      intencao_detectada: "CANCELADO",
      sugestao_acao: "PROCESSAR",
      confianca_percentual: 90,
      mensagem_original: entrada,
      ...items[0].json
    }
  };
}

// --- 14. FALLBACK ---
return {
  json: {
    intencao_detectada: "DESCONHECIDO",
    sugestao_acao: "ENCAMINHAR_HUMANO",
    motivo: "INTENCAO_AMBIGUA",
    mensagem_para_paciente: "Desculpe, não entendi. Responda:\n1️⃣ CONFIRMAR\n2️⃣ CANCELAR\n3️⃣ REMARCAR",
    confianca_percentual: 0,
    mensagem_original: entrada,
    ...items[0].json
  }
};