# Status de Sincronização entre Agentes (Antigravity & Claude Code)

Este arquivo serve como ponte de comunicação entre os agentes de IA que trabalham no projeto **Cliniflow**.

---

## 📅 Auditoria Completa + Restauração (Claude Code — 26/07/2026)

### 0. O sistema estava FORA DO AR
O projeto Supabase `mxvaufkqijdkapvtkvee` estava com status **INACTIVE** (pausado
por inatividade do free tier). O subdomínio não resolvia em DNS. Isso derrubava
tudo: n8n, CRM, RAG, debounce.

**Restaurado nesta sessão.** Status `ACTIVE_HEALTHY`, dados intactos:
3 pacientes, 22 mensagens, 7 documentos RAG, 1 clínica, 0 consultas.

> Se o WhatsApp "parar de funcionar", **cheque isto antes de culpar a instância
> Evolution.** Ver `docs/ARMADILHAS.md` §1.

### 1. Schema do banco agora está versionado (era o maior risco)
Até hoje, funções, triggers e políticas RLS **só existiam dentro do banco**.
Um projeto pausado que fosse deletado levaria junto toda a lógica de envio.

Criado `docs/db/`:
- `01-schema.sql` — schema real (difere dos `supabase-schema-fase*.sql`, que são históricos)
- `02-functions-triggers.sql` — **as 5 funções + 4 triggers**, incluindo o `pg_net`
- `03-rls-policies.sql` — estado real do RLS + esboço do alvo

### 2. Como o envio do CRM realmente funciona (a DOCUMENTACAO §3.2 está desatualizada)
Não é mais o React chamando o webhook. O caminho real é:

```
CRM insere em mensagem_logs (tipo='manual', direcao='saida')
  → trigger secretary_message_trigger
  → trigger_secretary_webhook()  [pg_net]
  → POST n8n /webhook/enviar-mensagem  body={message_id}
  → n8n chama process_secretary_message(id)  [trava atômica anti-duplicata]
```

### 3. Correções aplicadas
| # | Onde | O quê |
|---|---|---|
| 3 | `supabase-client.js:444` | `return` prematuro tornava morto o código que pausa a IA. A IA nunca era silenciada quando a recepção assumia. |
| 5 | n8n `Cleanup de Sessão` | `"ATIVA"` faltava na lista de status aceitos → histórico vazio e sessão nunca deletada. |
| 6 | n8n `Filtra urgência` | `[ACIONAR_HUMANO]` era decorativo (ambas as saídas iam ao mesmo nó). Adicionados `Pausa IA (Urgência)` e `AVISO URGÊNCIA`. |
| 8 | n8n `REGISTRO OUTLIER1` | `tableId` vazio → falha em runtime. Apontado para `historico_confirmacoes` com mapeamento de campos. |
| 9 | `supabase-client.js` | Helper `telefoneSessao()` — o CRM filtrava `sessoes_ativas` com 11 dígitos enquanto o n8n grava 13. |

⚠️ **Itens 5, 6 e 8 estão só no arquivo JSON local, NÃO no n8n vivo.**
O export não carrega credenciais — reimportar quebraria o workflow. Aplicar pela UI.
Ver `docs/ARMADILHAS.md` §5 e §6.

### 3b. Auditoria do n8n vivo (token novo, 26/07/2026)

Com credencial válida, os workflows foram lidos direto da instância. IDs:
`ZAQ6I2CiBGh8swye` (Evo-Go, 69 nós) e `snHQtmgTKLgQEpqk` (Enviar Mensagem CRM, 5 nós).
Ambos **ativos**.

**Confirmado quebrado no vivo** (não era só o arquivo local):

| Item | Evidência no n8n vivo |
|---|---|
| 4 — embeddings | ingestão `models/text-embedding-004`, consulta `models/gemini-embedding-2` |
| 5 — Cleanup de Sessão | aceita `["VALIDA","VÁLIDA","Validada","EXPIRADA","Expirada"]`; `Valida Expiração` emite `"ATIVA"` |
| 6 — `[ACIONAR_HUMANO]` | `Filtra urgência` out0 e out1 vão ambos para `Veio do Webhook?` |
| 8 — REGISTRO OUTLIER1 | `tableId` vazio, 0 campos mapeados |

**Resolvido / correções ao que eu havia dito antes:**
- O endereço da Evolution é **único e correto** nos dois workflows:
  `https://n8n-evolution-evo-go.1qkdsj.easypanel.host/send/text`. O host responde.
  O `api.iagobatista.cloud` só existia no arquivo local defasado — **nunca foi um problema real**.
- O workflow do CRM vivo **chama** `process_secretary_message` (nó `Busca Credenciais e Trava (RPC)1`),
  confirmando a arquitetura de trava atômica descrita na §2.
- O debounce vivo é de **15 segundos**, não 25 como registrado em 23/06.

**Dois bugs novos encontrados no workflow do CRM** — ver `ARMADILHAS.md` §5b e §5c:
mensagem com aspas quebra o envio; envio que falha trava a mensagem em `sending` para sempre.

**Sobre estabilidade — o dado mais importante:** os dois workflows do Cliniflow têm
**zero execuções** no histórico. A instância n8n está saudável e executando (o workflow
de captação de leads roda com sucesso várias vezes ao dia), mas **nenhuma mensagem passou
pelo Cliniflow** dentro da janela de retenção. Não há histórico para provar estabilidade
— só um teste real ponta a ponta na instância nova vai dizer.

### 4. Bugs ABERTOS encontrados (não corrigidos)
1. **Notas internas vazam para o paciente** — o trigger não filtra `private`. `ARMADILHAS.md` §2.
2. **Ingestão RAG quebrada** — nó de ingestão em `text-embedding-004` (768d) contra coluna de 3072d. §4.
3. **Edge function `enviar-whatsapp` grava `google_event_id`**, coluna que não existe mais. §7.
4. **RLS `allow_all`** em `patients`/`consultas`/`mensagem_logs` — confirmado que a chave anon lê dados reais de paciente. §9.

### 5. Correção ao registro de 23/06
O item "Segurança das Chaves de Acesso" abaixo afirma que a chave anon exposta
"não representa falha de segurança de produção". **Isso está incorreto.**
Chave anon só é segura sob RLS restritivo; aqui o RLS é `USING (true)`.
Testado nesta sessão: `GET /rest/v1/patients` com a anon key devolveu pacientes reais.
(`clinics` está protegida — a `evolution_apikey` não vaza.)

---

## 📅 Últimas Alterações Realizadas (Antigravity - 23/06/2026)

### 1. Estabilização e Higiene do Ecossistema
- **Logs de Erro n8n**:
  - Mapeamos os campos obrigatórios `workflow_name`, `node_name`, `error_message` e `execution_id` no nó `LOG DE ERRO` do workflow principal (ID `ZAQ6I2CiBGh8swye`), resolvendo a falha técnica HTTP 400 Bad Request.
  - Renomeamos o nó de formatação JavaScript para `Formata Diagnóstico de Erro` e atualizamos seu código para ler as colunas de banco em letras minúsculas (corrigindo as antigas chaves de planilhas).
  - Atualizamos as referências de expressão no nó Gmail `Send a message2` downstream.
- **Limpeza de Índices no Supabase**:
  - Eliminamos o índice redundante de chave única `sessoes_ativas_telefone_key` e o índice btree redundante `idx_sessoes_telefone` da tabela `sessoes_ativas`, mantendo apenas a Primary Key `sessoes_ativas_pkey` e prevenindo lentidão de escrita.

### 2. Roteamento Dinâmico (AVISO SECRETÁRIA)
- **O problema:** O nó `AVISO SECRETÁRIA` no n8n buscava `telefone_notificacao` de `Busca Clinica` (tabela `clinics`), mas essa coluna não existia no banco de dados.
- **Solução:** 
  1. Alteramos a tabela `public.clinics` para incluir a coluna `telefone_notificacao` (tipo `text`).
  2. Atualizamos a linha da clínica `Teste-Wpp_B` para associar o número da instância correspondente (`5588981458633`).
  3. O nó no n8n agora lê dinamicamente a propriedade `telefone_notificacao` vinda da consulta da clínica.

### 3. Validação do Debounce e Fluxo Inbound
- **Fluxo semântico:** Confirmamos que `Valida contexto` e `AI Agent` estão lendo a mensagem acumulada de `$('Centraliza Dados').first().json.mensagem_usuario`.
- **Fidelidade de Histórico:** O nó `Grava Mensagem Inbound`  grava a mensagem individual crua de `Normalizar Dados v2` no log. Isso garante que cada mensagem apareça como uma bolha separada no chat do CRM.
- **Tempo de Debounce:** O tempo de espera do nó `Wait Debounce` foi aumentado pelo usuário para **25 segundos** (anteriormente 5 segundos). Isso garante um agrupamento muito mais robusto de mensagens enviadas de forma picada ou sequencial pelos pacientes antes da resposta ser gerada.

### 4. Cleanup e Deleção de Sessões
- Confirmamos que a tabela `historico_confirmacoes` possui as colunas `telefone`, `nome_paciente`, `acao`, `mensagem_usuario`, `intencao_detectada` e `confianca_percentual`.
- O nó `Cleanup de Sessão` v1.6 foi normalizado para retornar chaves exatamente com estes nomes minúsculos, garantindo compatibilidade de 100% no insert de `HISTÓRICO`.
- A deleção de sessões na tabela `sessoes_ativas` está filtrando corretamente pela chave primária `telefone`.

### 5. Dimensão de Embeddings (Google Gemini)
- **Confirmação:** A coluna `embedding` na tabela `documentos_clinica` está configurada com a dimensão **3072** (atttypmod = 3072).
- **Modelo:** A seleção do modelo `models/gemini-embedding-2` no nó de embeddings do Gemini gera exatamente **3072 dimensões**, solucionando o erro de mismatch de vetores que ocorria ao utilizar modelos de 768 dimensões (como o `models/embedding-001`).

---

## 🔒 Segurança das Chaves de Acesso
- As chaves de acesso expostas nos nós do n8n `Append Buffer (RPC)` e `criar_pre_agendamento` são chaves com permissão **anon** (pública). Não são a chave `service_role`. Elas servem para chamadas públicas seguras e não representam falha de segurança de produção.

---

## 📝 Próximos Passos Recomendados (Terreno para Amanhã)

### 1. Toggle de Bot Ativo por Clínica (Tarefa 4)
- **Banco de Dados**: Criar a coluna `bot_ativo` (`boolean`, `NOT NULL`, `DEFAULT true`) na tabela `public.clinics` para permitir ligar/desligar o chatbot por clínica.
- **Workflow n8n (`Evo-Go`)**: Ajustar a lógica após `Busca Clinica` para ler este campo e desviar o fluxo direto para a equipe humana se a clínica estiver com `bot_ativo = false`.
- **CRM Frontend**: Adicionar o componente visual (Toggle) no CRM para consultar e alterar a coluna `bot_ativo` da clínica logada via Supabase.

### 2. Autenticação no CRM React & RLS Multi-Tenant (Tarefa 2)
- **Estratégia de Auth**: Planejar e estruturar o login de usuários no CRM usando o Supabase Auth.
- **Vínculo de Inquilino**: Mapear cada conta de usuário autenticada ao respectivo `clinic_id`.
- **Políticas RLS**: Com o login ativo, converter as políticas das tabelas (atualmente em `allow_all`) para restringir o acesso por clínica (ex: `clinic_id = usuario.clinic_id`), blindando o isolamento de dados.

### 3. Testes de Fluxo
- Rodar simulações completas de inbound e outbound para garantir a robustez do tempo de debounce de 25 segundos sob carga de mensagens picadas.
