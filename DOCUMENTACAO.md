# Documentação da Arquitetura do Sistema Cliniflow (Evo-Go + IA)

Bem-vindo à documentação oficial do **Cliniflow**. O sistema evoluiu de uma estrutura baseada em Regex e Google Sheets para uma arquitetura robusta Multi-Tenant focada em Inteligência Artificial (Agentes Autônomos RAG) e CRM em Tempo Real via WebSockets.

---

## 1. Visão Geral da Nova Arquitetura

O sistema é dividido em três grandes pilares perfeitamente integrados:

1. **Backend / Banco de Dados (Supabase)**: Banco PostgreSQL estruturado para suportar centenas de clínicas simultâneas (Multi-Tenancy via `clinic_id`), com segurança nativa de políticas RLS (Row Level Security) e banco de dados vetorial (`pgvector`) para armazenar o conhecimento de cada clínica.
2. **Orquestração RAG & Automação (n8n)**: Fluxos que interceptam os webhooks do WhatsApp (via Evolution API), avaliam o contexto via Inteligência Artificial (LangChain + Google Gemini) e respondem de forma natural, consultando a base da clínica e agendando consultas via *Custom Tools*.
3. **Frontend / CRM (React)**: Uma interface Single-Page Application (SPA) para os recepcionistas da clínica interagirem em tempo real com as mensagens dos pacientes, com indicadores visuais do status da IA.

---

## 2. Banco de Dados e Multi-Tenancy

O isolamento de dados ocorre primariamente pela vinculação obrigatória ao `clinic_id`. As tabelas núcleo da operação são:

- **`clinics`**: Armazena as clínicas cadastradas (instâncias do n8n / Evolution API mapeadas por nome).
- **`patients`**: Pacientes atendidos, vinculados ao seu WhatsApp, nome (`pushName`) e `clinic_id`.
- **`conversations`**: Agrupa mensagens trocadas. Possui os status:
  - `open`: Em andamento.
  - `resolved`: Atendimento concluído.
- **`mensagem_logs`**: O histórico completo de todas as mensagens. Identificadas como `entrada` ou `saida`, possuem um flag de origem (`tipo: 'manual'` quando enviada por humanos no CRM, ou `tipo: 'auto'` quando pela IA).
- **`consultas`**: A agenda de fato. Pode ter diversos status. Um deles é `solicitado`, atribuído quando a IA recomenda um agendamento prévio que necessita de aprovação manual pela recepção.
- **`sessoes_ativas`**: Define de quem é o controle atual da conversa. Controla a flag `atendimento_humano`: se `true`, a IA é ignorada e entra em modo silencioso (Pausada). *Nota de performance: Esta tabela possui a coluna `telefone` indexada unicamente via chave primária (`sessoes_ativas_pkey`), após a remoção de índices únicos e btree redundantes em auditoria de estabilidade.*
- **`whatsapp_buffer`**: Acumula mensagens picadas durante a janela de debounce (25s) antes de acionar a IA. Escrita pela RPC atômica `append_whatsapp_buffer`.

> ⚠️ **O telefone tem dois formatos e eles não são intercambiáveis:**
> - `patients.telefone` → **11 dígitos** (`DDD9XXXXXXXX`, sem DDI)
> - `sessoes_ativas.telefone` e `mensagem_logs.telefone` → **13 dígitos** (`55DDD9XXXXXXXX`)
>
> Use o helper `telefoneSessao()` de `supabase-client.js` sempre que filtrar `sessoes_ativas`
> a partir de um telefone de paciente. Ver `docs/ARMADILHAS.md` §3.
- **`documentos_clinica`**: A base de conhecimento (Vector Store) com embeddings de 3072 dimensões (Gemini).
- **`logs_erro`**: Tabela que armazena os erros de execução dos fluxos com colunas estruturadas (`workflow_name`, `node_name`, `error_message`, `execution_id` e `criado_em`).

---

## 3. Fluxos de Automação e IA (n8n)

A mágica ocorre dentro do n8n através de dois workflows primários:

### 3.1. Workflow Inbound: "Projeto Clínica - Evo-Go"
Responsável por processar a mensagem que chega do WhatsApp.

1. **Tratamento Inicial**: Verifica se a mensagem é um texto válido (ignorando áudios e imagens que o LLM não suporta nativamente nesta versão de texto), e formata os dados do contato.
2. **Novo Paciente?**: Consulta o Supabase para checar se o número do paciente já existe. Se for um *Novo Paciente*:
   - Cria o registro na tabela `patients`.
   - Cria uma `conversation` nova (`status='open'`).
   - Abre a `sessao_ativa` apontando que a máquina tem o controle.
   - Faz o registro da mensagem em `mensagem_logs`.
3. **Agente de IA (LangChain)**: Se o paciente já existe, a mensagem entra direto no *AI Agent*. O agente é instruído com o contexto do Paciente e da Clínica.
   - **Vector Store Tool**: O agente obrigatoriamente pesquisa a dúvida do paciente na tabela `documentos_clinica` usando RAG (Retrieval-Augmented Generation).
   - **Agendamento Tool (`criar_pre_agendamento`)**: Caso o paciente solicite e concorde com um horário com base nas regras, a IA invoca esta ferramenta de *Custom Code* nativa para executar um `INSERT` HTTP direto na tabela `consultas` com status `solicitado`.
4. **Log de Resposta Automática**: Antes de entregar a resposta do agente à Evolution API, um *Code Node* interceptador (`Prepara Log Saída`) captura exatamente o que a IA falou e armazena na tabela `mensagem_logs` como `saida`/`auto`.
5. **Observabilidade e Tratamento de Erros**: O workflow monitora falhas através do nó `Error Trigger`. Se algum nó falhar:
   - O nó `LOG DE ERRO` grava de forma atômica no Supabase os metadados do erro (workflow, nó, mensagem de erro e ID da execução).
   - O nó `Formata Diagnóstico de Erro` lê essas colunas limpas, envia uma análise para o Gemini elaborar a causa raiz e a correção técnica, e despacha um e-mail estruturado via Gmail para os administradores.

### 3.2. Workflow Outbound: "Cliniflow - Enviar Mensagem CRM"
Responsável por enviar mensagens digitadas manualmente por humanos lá na tela do Frontend do React.

> **Atualizado em 26/07/2026.** O React **não chama mais o webhook do n8n**. O disparo
> passou a ser feito por um trigger `pg_net` dentro do próprio Postgres. A descrição
> anterior desta seção estava desatualizada.

O caminho real hoje é:

1. O React grava em `mensagem_logs` com `tipo='manual'`, `direcao='saida'` e `status='pending'`. **Só isso.** Ele não conhece o n8n.
2. O trigger `secretary_message_trigger` dispara em cima desse INSERT e chama a função `trigger_secretary_webhook()`.
3. Essa função faz um `net.http_post` assíncrono para `https://n8n.iagobatista.cloud/webhook/enviar-mensagem`, mandando apenas `{ "message_id": <uuid> }`.
4. O n8n chama a RPC `process_secretary_message(id)`, que aplica uma **trava atômica**: só devolve os dados se conseguir mudar o status para `sending` (condição: `evo_message_id IS NULL AND status != 'sending'`). Isso é o que impede envio duplicado. A RPC devolve telefone, mensagem e as credenciais Evolution da clínica.
5. O n8n despacha para a Evolution API e atualiza `status` e `evo_message_id` no log.
6. O WebSocket propaga a mudança de status de volta para a tela.

Definições SQL completas em [`docs/db/02-functions-triggers.sql`](docs/db/02-functions-triggers.sql).

---

## 4. O CRM e Lógica Frontend (React)

O CRM (`cliniflow-components.jsx`) é a central de operações e trabalha reativamente:

### 4.1. Comunicação em Tempo Real
- **WebSocket Subscriptions**: O Supabase Client (`subscribeToMensagens`) escuta os eventos do banco. Assim que a IA grava uma resposta ou um novo paciente fala algo, o canal WebSocket propaga um evento `INSERT` que faz o chat do React piscar imediatamente com o novo "balão de mensagem".
- **Status das Mensagens**: Da mesma forma, escuta eventos de `UPDATE`. Quando um humano digita "Olá", aparece translúcido (`sending`) na tela e, assim que a rede confirma o envio, muda o CSS para confirmado (`sent`).
- **Auto-Gerenciamento de Conversas via Lembrete**: Sempre que um lembrete (automático ou manual de consulta) é disparado a partir da agenda (`enviarWhatsApp`), o frontend localiza ou cria o paciente por telefone, verifica a existência de uma conversa ativa (`status='open'`) ou cria uma nova, vinculando os respectivos `patient_id` e `conversation_id` no log de mensagens. Isso garante consistência de dados e faz o chat do paciente surgir instantaneamente no painel de Atendimentos assim que um lembrete é enviado.

### 4.2. Status da IA na Barra Superior
O componente de cabeçalho reflete o banco em tempo real:
- **Verde**: IA Ativa.
- **Vermelho**: IA Pausada (Atendimento Humano).
Quando a recepção envia qualquer mensagem manual para o paciente, a interface invoca `atualizarSessaoAtiva` marcando `atendimento_humano=true`, calando a IA para que ela não se intrometa no meio de uma resolução particular. A recepção pode retomar a IA pelo botão "Reativar IA" a qualquer momento.

### 4.3. Interface de Solicitação de Consulta
Na Agenda e na Barra Lateral, consultas em status `solicitado` (aquelas criadas autonomamente pelo LLM) ganham cor e realce **Roxo Pontilhado**. O recepcionista visualiza as notas extraídas magicamente pelo Agente (ex: *Solicitação IA: Cardiologia. Preferência: Terça a tarde*) e com um clique pode "Aprovar e Definir Horário" definitivo na agenda.

### 4.4. Gerenciamento e Edição de Pacientes
- **Edição de Cadastro**: A aba de pacientes lista todos os pacientes da clínica. Cada linha da tabela exibe de forma discreta o botão de lápis (que acende no hover). O clique em qualquer lugar da linha abre o modal `EditPatientModal` para gerenciar os dados cadastrais.
- **Data de Nascimento e Idade**: O cadastro e a edição coletam a **Data de Nascimento** de forma nativa (input `date`). A tabela exibe o formato `DD/MM/AAAA (X anos)`, o que mantém o banco populado de forma precisa e possibilita futuras campanhas de aniversário automatizadas.
  * O telefone é gravado sem formatação especial no banco de dados para os fluxos do WhatsApp no n8n.
  * E-mail, Convênio e Status cadastral (ativo, novo, inativo) também são editáveis.
- **Sincronização em Tempo Real**: As alterações persistem no Supabase através do método `updatePaciente` e se propagam via WebSocket (`subscribeToPacientes`) instantaneamente para todos os CRM ativos, mantendo a listagem atualizada sem recarregar a página.

---

---

## 4.5. O que a documentação NÃO cobre (estado em 26/07/2026)

Itens conhecidos e **em aberto**. Detalhes e correções em [`docs/ARMADILHAS.md`](docs/ARMADILHAS.md).

| Item | Impacto | Onde |
|---|---|---|
| Ingestão RAG usa embedding de 768d contra coluna de 3072d | Documento novo do Drive não entra na base | ARMADILHAS §4 |
| Edge function `enviar-whatsapp` grava coluna inexistente | Sessão de 16h não abre após lembrete | ARMADILHAS §7 |
| RLS `allow_all` em `patients`/`consultas`/`mensagem_logs` | Dados de paciente legíveis com a chave pública | ARMADILHAS §9 |
| Token do n8n em `.mcp.json` retorna 401 | Impossível auditar o n8n por ferramenta | ARMADILHAS §6 |

**Notas internas privadas foram removidas do CRM em 26/07/2026** (eram apenas cosméticas e
o trigger de envio não as filtrava). A coluna `mensagem_logs.private` continua no banco,
sem uso, com default `false`.

---

## 5. Cuidados Futuros e Escalabilidade
- **Manutenção de Prompt**: A `systemMessage` do Agente dita a personalidade da clínica. Ajustes finos de tom de voz (ex: formal vs descontraído) devem ser feitos diretamente no nó "AI Agent".
- **Novas Clínicas**: Para cadastrar uma Clínica N.º 2, basta adicionar a instância em `clinics` e injetar no Supabase Vetorial (`documentos_clinica`) os dados da Clínica 2. O n8n é agnóstico e roteará com base no campo `instance` ou ID provido, sem misturar os pacientes de clínicas diferentes graças ao RLS de arquitetura.
