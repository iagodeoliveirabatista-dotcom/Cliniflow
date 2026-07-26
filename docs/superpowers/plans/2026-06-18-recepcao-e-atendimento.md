# Plano de Implementação: Recepção Robusta, Histórico de Chat e Agendamento via IA (RAG)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implementar o roteamento inteligente de novos/recorrentes pacientes, logging total de mensagens em tempo real e agendamento automático via IA (RAG).

**Architecture:** O roteamento centralizado rodará no n8n. O Supabase armazenará mensagens em tempo real (`mensagem_logs`) e solicitações de pré-agendamento (`consultas`), que serão exibidas na interface React do Cliniflow e controladas por sessões ativas com indicadores visuais de IA vs Humano.

**Tech Stack:** React (JSX), Supabase (PostgREST, WebSockets), n8n (Langchain Nodes, Gemini 2.5 Pro, Vector Store, Custom Tools).

## Global Constraints
*   **Definição de Recorrência**: Paciente é recorrente se já estiver na tabela `patients`.
*   **Pausa Automática**: Mensagem manual via CRM seta `sessoes_ativas.atendimento_humano = true`.
*   **Persistência da Pausa**: A sessão de atendimento humano não expira até que a conversa mude para `'resolved'`.
*   **Código do Banco**: A tabela de vetores `documentos_clinica` requer embeddings de 3072 dimensões.

---

### Task 1: Preparação do Banco e RLS
**Files:**
- Create: `scratch/apply_rls.py`
- Test: `scratch/test_rls_perms.py`

**Interfaces:**
- Consumes: `scratch/fix_rls.sql`
- Produces: Banco de dados com tabelas e permissões prontas.

- [ ] **Step 1: Criar o script para aplicar as permissões RLS no Supabase**
  Crie o arquivo `c:\Users\Remute\Desktop\Software Clínicas\scratch\apply_rls.py` com o seguinte código:
  ```python
  import requests

  supabase_url = "https://mxvaufkqijdkapvtkvee.supabase.co"
  service_role_key = input("Insira a Service Role Key do Supabase: ")

  sql_commands = """
  -- Habilitar RLS se desativado
  ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;
  ALTER TABLE public.mensagem_logs ENABLE ROW LEVEL SECURITY;

  -- Criar políticas se não existirem
  DROP POLICY IF EXISTS "Allow anon insert conversations" ON public.conversations;
  CREATE POLICY "Allow anon insert conversations" ON public.conversations FOR INSERT WITH CHECK (true);

  DROP POLICY IF EXISTS "Allow anon update conversations" ON public.conversations;
  CREATE POLICY "Allow anon update conversations" ON public.conversations FOR UPDATE USING (true);

  DROP POLICY IF EXISTS "Allow anon select conversations" ON public.conversations;
  CREATE POLICY "Allow anon select conversations" ON public.conversations FOR SELECT USING (true);

  DROP POLICY IF EXISTS "Allow anon insert mensagem_logs" ON public.mensagem_logs;
  CREATE POLICY "Allow anon insert mensagem_logs" ON public.mensagem_logs FOR INSERT WITH CHECK (true);

  DROP POLICY IF EXISTS "Allow anon select mensagem_logs" ON public.mensagem_logs;
  CREATE POLICY "Allow anon select mensagem_logs" ON public.mensagem_logs FOR SELECT USING (true);
  """

  headers = {
      "Authorization": f"Bearer {service_role_key}",
      "Content-Type": "application/json"
  }
  
  response = requests.post(f"{supabase_url}/pg/v1/sql", json={"query": sql_commands}, headers=headers)
  print("Status Code:", response.status_code)
  print("Response:", response.text)
  ```

- [ ] **Step 2: Executar o script de RLS**
  Run: `python "c:\Users\Remute\Desktop\Software Clínicas\scratch\apply_rls.py"`
  Expected: Retornar HTTP 200/201.

- [ ] **Step 3: Criar teste de permissão para anon key**
  Crie o arquivo `c:\Users\Remute\Desktop\Software Clínicas\scratch\test_rls_perms.py`:
  ```python
  import requests

  supabase_url = "https://mxvaufkqijdkapvtkvee.supabase.co"
  anon_key = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im14dmF1ZmtxaWpka2FwdnRrdmVlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM0MjEzMDAsImV4cCI6MjA4ODk5NzMwMH0.CVl3Qechh91cZA9AXfMrNmnCMgGFCyROaSB4AqU9c3I"

  headers = {
      "apikey": anon_key,
      "Authorization": f"Bearer {anon_key}",
      "Content-Type": "application/json"
  }

  print("Testando insert na tabela 'conversations'...")
  payload = {
      "status": "open",
      "clinic_id": "d3b07384-ad6b-4f5c-9ab4-66e2854d88ad"
  }
  response = requests.post(f"{supabase_url}/rest/v1/conversations", json=payload, headers=headers)
  print("Status Code:", response.status_code)
  print("Response:", response.text)
  ```

- [ ] **Step 4: Executar o teste de permissão**
  Run: `python "c:\Users\Remute\Desktop\Software Clínicas\scratch\test_rls_perms.py"`
  Expected: HTTP 201 Created (ou 400 se faltar patient_id, indicando que a permissão passou).

---

### Task 2: Carga de Vetores da Base de Conhecimento
**Files:**
- Create: `scratch/populate_vector_store.py`
- Test: Query manual na tabela `documentos_clinica`.

- [ ] **Step 1: Criar script de população de vetores**
  Crie o arquivo `c:\Users\Remute\Desktop\Software Clínicas\scratch\populate_vector_store.py` com o seguinte código (utiliza o modelo de embeddings do Gemini via API HTTP ou biblioteca Google AI para gerar vetores de 3072 dimensões):
  ```python
  import requests
  import os

  supabase_url = "https://mxvaufkqijdkapvtkvee.supabase.co"
  service_role_key = input("Insira a Service Role Key do Supabase: ")
  gemini_api_key = input("Insira a API Key do Gemini: ")

  # Ler base de conhecimento
  kb_path = r"c:\Users\Remute\Desktop\Software Clínicas\base_conhecimento_clinica.md"
  with open(kb_path, 'r', encoding='utf-8') as f:
      content = f.read()

  # Dividir por ---
  chunks = [c.strip() for c in content.split("---") if c.strip()]

  def get_embedding(text):
      url = f"https://generativelanguage.googleapis.com/v1beta/models/text-embedding-004:embedContent?key={gemini_api_key}"
      payload = {
          "model": "models/text-embedding-004",
          "content": {
              "parts": [{"text": text}]
          },
          "outputDimensionality": 3072
      }
      res = requests.post(url, json=payload)
      if res.status_code == 200:
          return res.json()["embedding"]["values"]
      else:
          raise Exception(f"Erro no embedding: {res.text}")

  headers = {
      "Authorization": f"Bearer {service_role_key}",
      "Content-Type": "application/json",
      "Prefer": "resolution=merge-duplicates"
  }

  print(f"Processando {len(chunks)} chunks...")
  for i, chunk in enumerate(chunks):
      print(f"Chunk {i+1}...")
      vector = get_embedding(chunk)
      # Salvar no Supabase
      payload = {
          "content": chunk,
          "metadata": {"source": "base_conhecimento_clinica.md", "chunk_index": i},
          "embedding": vector
      }
      res = requests.post(f"{supabase_url}/rest/v1/documentos_clinica", json=payload, headers=headers)
      if res.status_code not in [200, 201]:
          print(f"Erro ao salvar chunk {i+1}: {res.text}")
      else:
          print(f"Chunk {i+1} salvo com sucesso!")
  ```

- [ ] **Step 2: Executar carga de vetores**
  Run: `python "c:\Users\Remute\Desktop\Software Clínicas\scratch\populate_vector_store.py"`
  Insira as chaves do Supabase e do Gemini quando solicitado.
  Expected: Todos os chunks processados e salvos com sucesso.

- [ ] **Step 3: Validar a busca RAG no banco via RPC**
  Crie o arquivo `c:\Users\Remute\Desktop\Software Clínicas\scratch\test_rag_search.py` para testar a busca:
  ```python
  import requests

  supabase_url = "https://mxvaufkqijdkapvtkvee.supabase.co"
  anon_key = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im14dmF1ZmtxaWpka2FwdnRrdmVlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM0MjEzMDAsImV4cCI6MjA4ODk5NzMwMH0.CVl3Qechh91cZA9AXfMrNmnCMgGFCyROaSB4AqU9c3I"
  gemini_api_key = input("Insira a API Key do Gemini: ")

  def get_embedding(text):
      url = f"https://generativelanguage.googleapis.com/v1beta/models/text-embedding-004:embedContent?key={gemini_api_key}"
      payload = {
          "model": "models/text-embedding-004",
          "content": {
              "parts": [{"text": text}]
          },
          "outputDimensionality": 3072
      }
      res = requests.post(url, json=payload)
      return res.json()["embedding"]["values"]

  headers = {
      "apikey": anon_key,
      "Authorization": f"Bearer {anon_key}",
      "Content-Type": "application/json"
  }

  vector = get_embedding("Qual é o endereço e horário de funcionamento?")
  payload = {
      "filter": {},
      "match_count": 2,
      "query_embedding": vector
  }
  res = requests.post(f"{supabase_url}/rest/v1/rpc/match_documentos_clinica", json=payload, headers=headers)
  print("Resultados RAG:")
  print(res.json())
  ```
  Run: `python "c:\Users\Remute\Desktop\Software Clínicas\scratch\test_rag_search.py"`
  Expected: Retornar os blocos de texto contendo endereço e horário.

---

### Task 3: Cliente Supabase e Lógica de Mensagens CRM
**Files:**
- Modify: `cliniflow-export/supabase-client.js:404-464`
- Modify: `cliniflow-export/cliniflow-components.jsx` (Lógica do chat e WebSocket)

- [ ] **Step 1: Garantir que enviarMensagemCRM atualiza atendimento_humano no Supabase**
  Abra [supabase-client.js](file:///c:/Users/Remute/Desktop/Software%20Cl%C3%ADnicas/cliniflow-export/supabase-client.js#L446-L452). Verifique se o trecho abaixo existe e está atualizando a tabela `sessoes_ativas`:
  ```javascript
      // 3. Força a pausa da IA ativando o atendimento_humano na sessão
      await query(async (sb) => {
        return sb.from('sessoes_ativas')
          .update({ atendimento_humano: true })
          .eq('telefone', telefone);
      });
  ```
  Se não estiver lá, insira-o.

- [ ] **Step 2: Ajustar a escuta de Realtime no React para evitar duplicações e atualizar no UPDATE**
  No arquivo `c:\Users\Remute\Desktop\Software Clínicas\cliniflow-export\cliniflow-components.jsx`, localize a função `subscribeToMensagens`. Substitua o trecho de tratamento de payloads do canal Supabase:
  ```javascript
  // Altere a escuta para tratar INSERT e UPDATE de forma segura:
  const channel = window.SupabaseService.subscribeToMensagens(selectedId, (payload) => {
    if (payload.eventType === 'INSERT') {
      setMensagens(prev => {
        // Evita duplicados comparando IDs de banco reais
        if (prev.some(m => m.id === payload.new.id)) return prev;
        return [...prev, payload.new];
      });
    } else if (payload.eventType === 'UPDATE') {
      setMensagens(prev => prev.map(m => m.id === payload.new.id ? { ...m, ...payload.new } : m));
    }
  });
  ```

---

### Task 4: UI de Status da IA e "Solicitado" na Agenda
**Files:**
- Modify: `cliniflow-export/cliniflow-components.jsx`

- [ ] **Step 1: Adicionar estilos visuais para consultas status = 'solicitado'**
  Na agenda do React em `cliniflow-components.jsx`, localize a renderização de agendamentos no grid semanal/diário. Adicione uma regra de cor específica para o status `'solicitado'`:
  ```javascript
  const getStatusStyle = (status) => {
    switch (status) {
      case 'confirmado': return { bg: '#d1fae5', border: 'solid 1px #10b981', text: '#065f46' };
      case 'cancelado': return { bg: '#fee2e2', border: 'solid 1px #ef4444', text: '#991b1b' };
      case 'remarcado': return { bg: '#fef3c7', border: 'solid 1px #f59e0b', text: '#92400e' };
      case 'solicitado': return { bg: '#f3e8ff', border: 'dashed 2px #a855f7', text: '#6b21a8' }; // Roxo pontilhado
      default: return { bg: '#f3f4f6', border: 'solid 1px #9ca3af', text: '#374151' }; // Pendente
    }
  };
  ```

- [ ] **Step 2: Adicionar painel de ações para solicitações da IA**
  No painel lateral de detalhes da consulta em `cliniflow-components.jsx`, localize a seção onde os botões de status são exibidos. Se `consulta.status === 'solicitado'`, exiba um painel exclusivo:
  ```javascript
  {selectedConsulta.status === 'solicitado' && (
    <div style={{ marginTop: 15, padding: 12, background: 'rgba(168, 85, 247, 0.08)', borderRadius: 8 }}>
      <p style={{ margin: '0 0 10px 0', fontSize: 13, color: '#a855f7' }}>
        <strong>🤖 Solicitação da IA:</strong> {selectedConsulta.notas || "Sem detalhes adicionais."}
      </p>
      <div style={{ display: 'flex', gap: 10 }}>
        <button
          onClick={() => abrirFormularioEdicao(selectedConsulta)}
          style={{ background: '#a855f7', color: 'white', border: 'none', padding: '8px 12px', borderRadius: 6, cursor: 'pointer' }}
        >
          Aprovar e Definir Horário
        </button>
        <button
          onClick={() => deletarConsulta(selectedConsulta.id)}
          style={{ background: '#ef4444', color: 'white', border: 'none', padding: '8px 12px', borderRadius: 6, cursor: 'pointer' }}
        >
          Recusar
        </button>
      </div>
    </div>
  )}
  ```

- [ ] **Step 3: Adicionar indicador de status da IA no chat**
  No painel superior da conversa selecionada em `cliniflow-components.jsx`, adicione o badge de status e controle da IA:
  ```javascript
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
            onClick={() => window.SupabaseService.updateConversaStatus(selectedConversa.id, 'resolved')}
            style={{ fontSize: 10, padding: '2px 6px', cursor: 'pointer' }}
          >
            Reativar IA
          </button>
        )}
      </div>
    );
  };
  ```

---

### Task 5: Roteamento n8n Inbound - Novos Pacientes
**Files:**
- Modify: `c:\Users\Remute\Desktop\Software Clínicas\Projeto Clínica - Evo-Go - Corrigido.json`

- [ ] **Step 1: Integrar nó de consulta do paciente**
  No início do fluxo do n8n, após o nó de normalização de telefone, configure o nó Supabase de busca de paciente para verificar a existência do número.
  Se o paciente não existir (saída vazia do get de `patients`):
  1.  **Adicionar nó Supabase**: Operação `Insert` na tabela `patients`, enviando `telefone` e `nome` (mapeado com `pushName` vindo da Evolution API webhook).
  2.  **Adicionar nó Supabase**: Operação `Insert` na tabela `conversations` (com `patient_id` = ID recém-criado, `status = 'open'`, e `clinic_id` buscado via `instance`).
  3.  **Adicionar nó Supabase**: Operação `Insert` na tabela `sessoes_ativas`, criando a sessão com `atendimento_humano = false` e `expira_em` = `now + 16 horas`.
  4.  Encaminhe a mensagem para o processamento do **AI Agent (Gemini)**.

- [ ] **Step 2: Gravar mensagem de entrada em mensagem_logs**
  Para todas as mensagens válidas que entram, adicione um nó do Supabase `Create a row` em `mensagem_logs`:
  *   `conversation_id` = UUID da conversa encontrada/criada.
  *   `patient_id` = UUID do paciente.
  *   `mensagem` = texto da mensagem do paciente.
  *   `direcao` = `'entrada'`
  *   `tipo` = `'manual'`

---

### Task 6: Roteamento n8n Inbound - Processamento RAG & LLM
**Files:**
- Modify: `c:\Users\Remute\Desktop\Software Clínicas\Projeto Clínica - Evo-Go - Corrigido.json`

- [ ] **Step 1: Lógica do AI Agent com RAG e Ferramenta Personalizada**
  No nó `AI Agent` do n8n:
  *   Defina as instruções do sistema indicando para sempre buscar informações da clínica na ferramenta de Banco Vetorial (`match_documentos_clinica`).
  *   Crie a ferramenta `criar_pre_agendamento` no n8n. No script da ferramenta, faça uma chamada SQL/HTTP para o Supabase para inserir na tabela `consultas`:
      ```javascript
      // Código do nó de ferramenta no n8n
      const payload = {
        patient_id: $json.patient_id,
        status: "solicitado",
        tipo: $json.especialidade,
        notas: `Solicitação IA: Botox. Preferência: ${$json.periodo_preferencia}. Obs: ${$json.observacoes || ""}`
      };
      // Executa chamada de insert na tabela de consultas
      ```
  *   O nó `AI Agent` retorna a resposta final em texto.

- [ ] **Step 2: Gravar resposta de saída do Bot em mensagem_logs**
  Abaixo da saída do nó `AI Agent` e dos nós de confirmação de Regex:
  Adicione um nó do Supabase `Create a row` na tabela `mensagem_logs` para registrar a resposta enviada ao paciente:
  *   `conversation_id` = UUID da conversa.
  *   `mensagem` = resposta gerada pela IA ou Regex.
  *   `direcao` = `'saida'`
  *   `tipo` = `'auto'`
  *   `status` = `'sent'`
