# Guia de Referência: Evolution Go & Integração CRM RAG

Este documento serve como referência técnica detalhada para a integração da **Evolution API (Evo-Go)** com o CRM **Cliniflow** e os fluxos do **n8n**, especificamente focado no controle de pausa e ativação do robô de atendimento baseado em RAG.

---

## 1. Autenticação e Endpoints da Evolution API (Go)

A Evolution Go é uma implementação de alta performance em Go para controle do WhatsApp. Diferente da versão em Node.js (que utiliza parâmetros de rota para instâncias `/message/sendText/{instance}`), a versão em Go utiliza endpoints mais diretos e autenticação por cabeçalho (`apikey`).

### Cabeçalhos Padrão
Toda requisição deve conter:
```http
Content-Type: application/json
apikey: <GLOBAL_API_KEY> ou <INSTANCE_TOKEN>
```
> [!NOTE]
> Ao usar o token de uma instância específica no cabeçalho `apikey`, a API do Evolution Go direciona automaticamente a mensagem para a respectiva instância.

---

## 2. Principais Requisições de Mensagens (Evolution Go)

### A. Enviar Mensagem de Texto
* **Endpoint**: `POST /send/text`
* **Corpo da Requisição (`application/json`)**:
```json
{
  "number": "5511999999999",
  "text": "Olá, esta é uma mensagem de confirmação de consulta.",
  "delay": 0,
  "mentionAll": false
}
```
* **Resposta de Sucesso (200 OK)**:
```json
{
  "success": true,
  "message": "success",
  "messageId": "3EB0000000000000000010"
}
```

### B. Enviar Mensagem de Mídia (Documento/Imagem/Áudio/Vídeo)
* **Endpoint**: `POST /send/media`
* **Corpo da Requisição (`application/json`)**:
```json
{
  "number": "5511999999999",
  "url": "https://meusistema.com/preparo_exame.pdf",
  "type": "document", // Opções: 'document', 'image', 'video', 'audio'
  "caption": "Aqui está o PDF de preparo para o seu procedimento.",
  "filename": "preparo.pdf"
}
```
* **Resposta de Sucesso (200 OK)**:
```json
{
  "success": true,
  "message": "success",
  "messageId": "3EB0000000000000000007"
}
```

### C. Verificar Status da Instância
* **Endpoint**: `GET /instance/status`
* **Resposta de Sucesso (200 OK)**:
```json
{
  "success": true,
  "data": {
    "connected": true,
    "os_name": "Evolution GO",
    "client_name": "evolution"
  },
  "message": "success"
}
```

---

## 3. Webhook de Recebimento de Mensagens (Entrada)

Quando o paciente responde pelo WhatsApp, a Evolution API dispara um webhook `POST` para o n8n. O payload JSON segue a estrutura abaixo:

```json
{
  "data": {
    "Info": {
      "Chat": "5588981698181@s.whatsapp.net",
      "Sender": "5588981698181@s.whatsapp.net",
      "IsFromMe": false,
      "IsGroup": false,
      "ID": "3EB0000000000000000010",
      "Type": "conversation", // ou 'extendedTextMessage'
      "PushName": "Paciente João"
    },
    "Message": {
      "conversation": "Quero confirmar a minha consulta de amanhã."
    }
  }
}
```

---

## 4. Integração da Pausa/Ativação do Bot RAG (CRM <=> n8n)

Para permitir que a recepção da clínica assuma o atendimento humano e "pause" o robô de inteligência artificial de forma segura, o sistema utiliza uma flag no banco de dados.

### A. Estrutura do Banco de Dados (Supabase)
Na tabela `patients`, a coluna `bot_pausado` (tipo `boolean`) determina se o RAG responderá automaticamente ou não:

```sql
ALTER TABLE public.patients ADD COLUMN IF NOT EXISTS bot_pausado boolean DEFAULT false;
```

### B. Fluxo de Decisão no n8n (Filtro RAG)
Toda vez que o webhook de mensagem recebida for disparado no n8n:
1. **Busca no Supabase**: Consulta o paciente pelo número de telefone normalizado:
   ```sql
   SELECT id, nome, bot_pausado FROM patients WHERE telefone = '5588981698181' LIMIT 1;
   ```
2. **Validação de Flag**:
   * **`bot_pausado == true`**: O fluxo do n8n interrompe o bot imediatamente. A mensagem é apenas registrada nos logs e sinalizada no CRM para que o atendente responda manualmente.
   * **`bot_pausado == false`** (ou `null`): O bot de RAG processa a resposta usando a base de conhecimento `base_conhecimento_clinica.md` e responde via `/send/text`.

### C. Ações do CRM (Cliniflow)
O painel lateral de chat do CRM interage com esta flag por meio da função JS:
```javascript
// Ativa ou pausa o bot
async function setBotPausado(patientId, pausado) {
  return SupabaseService.updatePaciente(patientId, { bot_pausado: pausado });
}
```

---
