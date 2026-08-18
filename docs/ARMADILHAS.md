# Armadilhas do Cliniflow

Coisas que já custaram tempo. Sintoma → causa → correção.
Leia antes de debugar qualquer coisa.

---

## 1. "O sistema todo parou / a instância do WhatsApp não funciona"

**Sintoma:** nada responde, o CRM não carrega, o n8n falha em todo nó Supabase.
Fácil confundir com problema da instância Evolution.

**Causa:** o projeto Supabase do free tier **pausa sozinho** por inatividade.
Quando pausa, o subdomínio `<ref>.supabase.co` **para de existir no DNS** — o erro
que aparece é "nome não resolvido", que parece problema de rede.

**Como confirmar em 10 segundos:**
```powershell
Resolve-DnsName mxvaufkqijdkapvtkvee.supabase.co
# "O nome DNS não existe" = projeto pausado, não é a sua rede.
```
Ou via Management API: `GET https://api.supabase.com/v1/projects` → campo `status`
(`INACTIVE` = pausado, `ACTIVE_HEALTHY` = no ar).

**Correção:** `POST https://api.supabase.com/v1/projects/<ref>/restore`.
Leva ~5 min (`COMING_UP` → `RESTORING` → `ACTIVE_HEALTHY`). Os dados voltam intactos.

**Ocorrido em:** 2026-07-26. Restaurado com 3 pacientes, 22 mensagens e 7 docs RAG preservados.

---

## 2. Notas internas privadas seriam enviadas ao paciente ⚠️ NEUTRALIZADO, NÃO CORRIGIDO

**Sintoma:** (ainda não ocorreu — 0 notas privadas no banco até hoje)
Uma nota interna escrita no CRM chega no WhatsApp do paciente.

**Causa:** o trigger `secretary_message_trigger` em `mensagem_logs` dispara com
`tipo='manual' AND direcao='saida'` — e **não checa `private`**. O CRM grava nota
interna exatamente com esses valores.

**Situação em 26/07/2026:** o recurso de nota interna foi **removido do CRM**, então nada mais grava `private=true` e o trigger não tem como disparar nesse caso. **Mas o trigger continua sem o filtro.** Se alguém reintroduzir notas internas sem corrigir o trigger, o vazamento volta.

**Correção definitiva (1 linha):**
```sql
DROP TRIGGER secretary_message_trigger ON public.mensagem_logs;
CREATE TRIGGER secretary_message_trigger
  AFTER INSERT ON public.mensagem_logs
  FOR EACH ROW
  WHEN (new.tipo = 'manual' AND new.direcao = 'saida' AND new.private IS NOT TRUE)
  EXECUTE FUNCTION trigger_secretary_webhook();
```

---

## 3. Telefone tem DOIS formatos e eles não conversam

**Sintoma:** o botão "IA Pausada" nunca acende; a IA continua respondendo mesmo
depois da recepção assumir; `.eq('telefone', ...)` não acha linha nenhuma.

**Causa:**
| Tabela | Formato | Quem grava |
|---|---|---|
| `patients.telefone` | **11 díg** `DDD9XXXXXXXX` | n8n `Cria Paciente` (`.slice(-11)`) |
| `sessoes_ativas.telefone` | **13 díg** `55DDD9XXXXXXXX` | n8n `Normalizar Dados v2` |
| `mensagem_logs.telefone` | **13 díg** | n8n `Grava Mensagem Inbound` |

O CRM lia `patient.telefone` (11) e filtrava `sessoes_ativas` (13). Nunca casava.

**Correção aplicada (2026-07-26):** helper `telefoneSessao()` em
`cliniflow-export/supabase-client.js`, usado em todo `.eq('telefone', ...)` que
toca `sessoes_ativas`. **Não remova sem antes unificar o formato no banco.**

---

## 4. Embeddings: dois modelos, duas dimensões

**Sintoma:** documento novo no Google Drive não entra na base RAG; erro de
dimensão de vetor no n8n.

**Causa:** `documentos_clinica.embedding` é `vector(3072)`. O nó de **consulta**
usa `models/gemini-embedding-2` (3072 ✅), mas o nó de **ingestão** ficou em
`models/text-embedding-004` (768 ❌).

Corrigiram só o lado da consulta em 23/06 e deram o problema por resolvido.
**Ao mexer em embeddings, confira os DOIS nós.**

**Status:** ✅ CORRIGIDO em 26/07/2026 — o nó de ingestão foi para `models/gemini-embedding-2` e publicado em produção. Documento novo no Drive volta a entrar.

---

## 5. O export do workflow principal não tem credenciais

**Sintoma:** ao importar `Projeto Clínica - Evo Go ....json` no n8n, todo nó
Supabase / Gemini / Gmail aparece sem credencial.

**Causa:** esse arquivo foi exportado (ou montado) sem o bloco `credentials`.
Os workflows menores (`fluxo-n8n-enviar-mensagem.json`) têm.

**Consequência prática:** **não reimporte esse arquivo por cima do workflow vivo.**
O arquivo é referência, não fonte de deploy.

> **15/08/2026 — os dois arquivos foram REMOVIDOS do repo** (D-29). A regra continua valendo
> para qualquer export que você venha a gerar: export do n8n não carrega credencial, então
> reimportar sempre desconecta os nós. Deploy é pelo MCP (D-4). Se precisar ver como era antes
> da migração para a Meta: `git show 4e401ee:"Projeto Clínica - Evo Go - Manipular esse arquivo
> se necessário.json"`.

**Como aplicar mudanças (validado em 26/07/2026):** use o MCP do n8n —
`update_workflow` (operações atômicas) seguido de `publish_workflow`. Preserva credenciais
e sub-nós. Leia a §5d antes: sem o publish, a correção fica só no rascunho.

---

## 5b. Mensagem do CRM com aspas quebra o envio ✅ CORRIGIDO

**Sintoma:** a recepcionista manda uma mensagem normal e ela não chega. Outras chegam.

**Causa:** no workflow **Cliniflow - Enviar Mensagem CRM** (`snHQtmgTKLgQEpqk`), o nó
`Enviar via Evolution API1` monta o corpo assim:

```
"text": "{{ $('Busca Credenciais e Trava (RPC)1').item.json.mensagem }}"
```

O texto entra **dentro de aspas, sem escape**. Se a mensagem tiver `"`, quebra de linha
ou `\`, o JSON fica inválido e a requisição falha. O workflow principal faz certo — usa
`JSON.stringify(...)`. Este não.

**Correção:** trocar por
```
"text": {{ JSON.stringify($('Busca Credenciais e Trava (RPC)1').item.json.mensagem) }}
```
(sem as aspas externas — o `JSON.stringify` já as coloca).

**Status:** ✅ aplicado e publicado em produção em 26/07/2026, verificado na `activeVersion`.

---

## 5c. Envio que falha fica travado para sempre ⚠️ ABERTO

**Sintoma:** mensagem some, aparece como não enviada no CRM, e reenviar não adianta.

**Causa:** a RPC `process_secretary_message` marca `status='sending'` para travar contra
duplicata. Se o envio à Evolution falhar depois disso, ninguém reverte o status. E como a
trava só libera quando `status != 'sending'`, **nenhuma tentativa futura consegue pegar
aquela mensagem**. Ela fica permanentemente em `sending`.

**Já existe detecção (não correção):** `detectar_silencio()` roda a cada 10 min e grava em
`logs_erro` quando há mensagem de saída presa em `pending`/`sending` há mais de 5 min.
Isso faz você **saber**; não desfaz a trava. A correção abaixo continua pendente.

**Correção sugerida:** tratar o erro no nó de envio (`onError: continueErrorOutput`) e
gravar `status='failed'` na saída de erro, para que a mensagem volte a ser elegível.
Alternativamente, um job que devolva a `pending` mensagens presas em `sending` há mais de
X minutos.

---

## 5d. `update_workflow` altera o RASCUNHO, não a produção ⚠️ LEIA ANTES DE MEXER NO n8n

**Sintoma:** você aplica uma correção via MCP, o retorno diz `appliedOperations: 1`,
você relê o workflow e o campo está corrigido — mas o comportamento em produção não muda.

**Causa:** este n8n tem separação **draft / active version**. `update_workflow` escreve no
rascunho. O que roda em produção é a `activeVersion`, que só muda com `publish_workflow`.

`get_workflow_details` devolve os dois: `nodes` (rascunho) e `activeVersion.nodes` (produção).
Se você conferir só `nodes`, vai achar que está tudo certo.

**Como verificar de verdade:**
```powershell
$w.versionId -eq $w.activeVersionId   # false = a correção NÃO está no ar
```
E compare `activeVersion.nodes`, não `nodes`.

**Fluxo correto:** `update_workflow` (quantas vezes precisar) → conferir o rascunho →
`publish_workflow` → conferir `activeVersion`.

**Ocorrido em:** 26/07/2026, na primeira correção aplicada. O rascunho estava certo e a
produção seguia com o bug.

---

## 5f. O MCP do n8n NÃO escreve configuração de nó (retry, onError)

**Sintoma:** você quer ligar `retryOnFail` ou `onError` num nó, procura a operação no
`update_workflow` e não acha. Fica tentando enfiar dentro de `parameters` e não pega.

**Causa:** no modelo de dados do n8n, `retryOnFail`, `maxTries`, `waitBetweenTries`,
`onError`, `alwaysOutputData` e `executeOnce` são **irmãos** de `parameters` no objeto do
nó, não filhos. As operações do `update_workflow` (`updateNodeParameters`,
`setNodeParameter`) só alcançam `node.parameters`. Nenhuma das 11 operações mexe em
configuração de nó.

**O que fazer:** essas mudanças são **manuais, pela UI** — abra o nó → aba *Settings*.
Não vale a pena hand-rollar um `PUT` na API REST: exigiria reenviar o workflow inteiro
(69 nós) numa instância com versionamento draft/active, e um campo perdido no caminho
derruba produção. Risco alto para uma mudança de um campo.

**Verificado em:** 27/07/2026, tentando ligar retry no `Envia Resposta do Agent`.

---

## 5e. O nó Supabase usa `create`, não `insert`

**Sintoma:** `INVALID_PARAMETER: Invalid value for "parameters.operation": got "insert",
expected one of: "create"`.

**Causa:** o discriminador de operação do nó Supabase do n8n é `create`. Vários nós deste
projeto foram escritos com `insert` — que é o nome no PostgREST, não no n8n.

**Onde apareceu:** `REGISTRO OUTLIER1`. Corrigido em 26/07/2026.
A validação do `update_workflow` sinaliza isso — leia os `validationWarnings` do retorno,
eles pegam erro real.

---

## 6. Arquivos locais do n8n estão defasados do n8n vivo

**Sintoma:** você lê o JSON, conclui uma coisa, e o comportamento real é outro.

**Exemplo concreto:** `fluxo-n8n-enviar-mensagem.json` faz um `select` direto em
`clinics` com ID hardcoded. Mas o banco tem a função `process_secretary_message()`
com trava atômica, que só faz sentido se o workflow vivo a chamar. Ou seja: o
workflow vivo evoluiu e o arquivo não acompanhou.

> **15/08/2026:** esses arquivos locais foram removidos justamente por isso (D-29). A armadilha
> não morreu — ela vira "não confie em cópia local do n8n", inclusive nas que você baixar hoje.
> Fonte de verdade é o workflow vivo, pelo MCP.

**Regra:** antes de afirmar qualquer coisa sobre o n8n, valide contra a instância.
O MCP do n8n em `.mcp.json` está retornando **401** — token revogado/expirado.

---

## 7. Edge function gravava coluna que não existe mais ✅ CORRIGIDO E DEPLOYADO

**Sintoma:** lembrete é enviado mas a sessão de 16h não abre; paciente responde
"CONFIRMAR" e cai no fluxo do agente de vendas em vez do fluxo de confirmação.

**Causa:** `enviar-whatsapp` (deployada, v7) faz upsert em `sessoes_ativas` com
`google_event_id` — coluna **removida** do schema. O Postgres devolve
`42703: column "google_event_id" does not exist` e o upsert inteiro falha.

A tabela hoje tem `consulta_id` para esse papel.

**Status:** ✅ resolvido em 26/07/2026. `enviar-whatsapp` **v8** está ACTIVE com `consulta_id`.
Na mesma mudança foi criado o helper `logErro()` e a coluna `logs_erro.origem`
(`NOT NULL DEFAULT 'n8n'`), para que o erro do upsert deixe de ser engolido.

**Não remova o default de `origem`:** o nó `LOG DE ERRO` do n8n não mapeia essa coluna.
Sem o default, todo log de erro do n8n passa a violar NOT NULL — e você perde justamente
a observabilidade no momento em que mais precisa dela.

---

## 8. `Cleanup de Sessão` só aceitava status que ele nunca recebia

**Sintoma:** `historico_confirmacoes` sempre vazio; sessão nunca deletada após o
paciente confirmar; paciente preso no fluxo de regex por 16h.

**Causa:** `Valida Expiração` emite `sessao_status = "ATIVA"`, mas a lista de
aceitos era `["VALIDA","VÁLIDA","Validada","EXPIRADA","Expirada"]`. Sem `"ATIVA"`,
o nó retornava `[]` silenciosamente — sem erro, sem log.

**Correção aplicada (2026-07-26):** `"ATIVA"` adicionado à lista, no arquivo local **e** publicado no n8n de produção.

---

## 9. Chave anon ≠ chave segura

**Sintoma:** ninguém reclama. É por isso que é perigoso.

**Causa:** a chave anon é pública por design (está no `config.js` servido ao
browser). Ela só é segura se o RLS restringir. Sete tabelas estão com
`FOR ALL USING (true)` — incluindo `patients`, `consultas` e `mensagem_logs`.

**Verificado em 2026-07-26:** um `GET /rest/v1/patients` com a chave anon
devolveu linhas reais de paciente. `clinics` está protegida (sem policy), o que
salva a `evolution_apikey`.

**Status:** ABERTO. Depende de Supabase Auth no CRM (Tarefa 2).
Ver `docs/db/03-rls-policies.sql`.

---

## 10. `cron.schedule` aceita comando quebrado e só falha na hora de rodar

**Sintoma:** o recurso simplesmente não acontece. Nenhum erro em lugar nenhum, nenhuma
requisição chega ao destino, o job aparece `active = true` na `cron.job`.

**Causa:** `cron.schedule` guarda o comando como **texto** e **não valida a sintaxe**.
O job dos lembretes foi criado substituindo o placeholder `<ANON_KEY>` pela chave **com as
aspas simples junto**, produzindo:

```sql
headers := '{"Authorization": "Bearer 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...'"}'::jsonb
```

A string SQL fecha em `Bearer '` e o token vira lixo sintático. Agendar funcionou;
executar nunca funcionou.

**Custo real:** 744 execuções, 744 falhas, **zero sucessos entre 08/06 e 26/07/2026**.
48 dias com o recurso morto e a tela de automações mostrando os lembretes como ativos.
Ninguém percebeu porque nada vigiava o `pg_cron`.

**Como confirmar em 10 segundos:**
```sql
select status, count(*), max(return_message)
from cron.job_run_details where jobid = <id> group by status;
```
Se só existir `failed`, o job nunca rodou — não importa o que a `cron.job` diga.

**Correção:** ao criar job com `net.http_post`, montar o header sem aspas simples internas
e **testar rodando o comando à mão** antes de confiar no agendamento. Depois conferir a
resposta em `net._http_response`.

**Não faça:** supor que `cron.schedule` retornar um `jobid` significa que o job funciona.
Retorna igual para comando válido e inválido.

**Prevenção instalada em 26/07/2026:** a função `public.detectar_silencio()` (job
`detector-silencio`, a cada 10 min) varre `cron.job_run_details` e grava qualquer falha em
`logs_erro`. Teria pego este bug no dia 08/06 em vez de 48 dias depois.

**Status:** ✅ CORRIGIDO E VERIFICADO em 27/07/2026 — `cron.job` já guarda o comando com o
header montado sem a quebra de aspas, e `cron.job_run_details` mostra 26 execuções
`succeeded` seguidas desde o fix (nenhuma `failed`). O erro que ainda aparece no painel
"Saúde do sistema" (26/07/2026 17:21) é histórico, de antes da correção — não recorreu.

---

## 11. Widget "Status do bot" no CRM chamava um webhook n8n que nunca existiu

**Sintoma:** aba Automações → Status sempre mostrava "Bot offline" / "Desconectado",
mesmo com a Evolution genuinamente conectada. Console do browser acusava erro de CORS em
`https://n8n.iagobatista.cloud/webhook/status-evo`.

**Causa real:** não era falta de header CORS — esse webhook **nunca foi criado** no n8n.
Das 5 workflows que existem de fato na instância (`search_workflows` sem filtro), só
`enviar-mensagem` e `conta-pessoal` existem como paths de webhook. `verificarStatusEvo()`
em `supabase-client.js` chamava uma rota morta; o erro de CORS era só o efeito colateral de
bater num 404.

**Correção aplicada (27/07/2026):** seguindo D-7 (observabilidade é do Supabase, não do
n8n), criada a Edge Function `status-evolution` — guarda a `evolution_apikey` no servidor
(nunca no browser), chama `GET {EVOLUTION_BASE_URL}/instance/status` direto e devolve
`{ok, connected, instance}` com CORS próprio. `verificarStatusEvo()` agora chama
`client.functions.invoke('status-evolution')` em vez do webhook n8n.

**Armadilha extra encontrada no meio da correção:** a doc da Evolution (`evolution_api_reference.md`,
§C — arquivo removido em 15/08/2026, D-29) documentava a resposta como `data.connected`
(minúsculo), mas a instância viva devolve `data.Connected` (maiúsculo). A função lê as duas
chaves (`Connected ?? connected`) para não repetir o erro. **Se for usar esse endpoint em outro
lugar, confira a resposta real antes de confiar na doc.**

**Verificado rodando:** Playwright abriu o CRM local, painel mostrou "Bot online" /
"Conectado", zero erros de console — confirmado contra a Evolution real
(`{"data":{"Connected":true,"LoggedIn":true,"Name":"Iago Batista"}}`).

---

## 14. `tool_calls.requested` mente — use `completed` ou o runData

**Sintoma:** você abre uma execução do AI Agent, lê
`"ai.agent.tool_calls.requested": 0` e conclui que a IA respondeu sem consultar o RAG.
**Quase sempre errado.**

**Evidência (execução 79160, 28/07/2026):**
```
"ai.agent.tool_calls.requested": 0     <-- mente
"ai.agent.tool_calls.completed": 1     <-- verdade
```
Na mesma execução o nó `Consulta na database` aparece no `runData` com `input: "clareamento"`
e 4 documentos retornados. A tool **foi** chamada.

**Causa provável:** o contador `requested` não é incrementado no caminho de streaming
(`ai.agent.streaming.enabled: true`) desta versão do n8n.

**Como verificar de verdade — em ordem de confiabilidade:**
1. O nó `Consulta na database` **aparece no `runData`** da execução? Essa é a prova.
2. `tool_calls.completed >= 1`.
3. `subNodeExecutionData.actions[]` lista a chamada com o input usado.

**Custo real:** esta armadilha quase fez a auditoria de 27/07 registrar "o RAG pode estar
mudo" como bug aberto, quando o RAG estava funcionando.

---

## 15. O RAG funciona, mas a recuperação erra a tabela de preços ⚠️ ABERTO

**Status do RAG:** ✅ **funcionando** — provado na execução 79160. A credencial do nó
`Consulta na database` atravessa o RLS de `documentos_clinica` (não é a chave anon).
Isso **fecha** o ponto cego #1 levantado em 27/07.

**O que ainda está torto:** na pergunta *"Quanto custa o clareamento?"*, a busca vetorial
devolveu 4 documentos — profissionais, regras+FAQ, contato de emergência e estrutura+planos.
**O documento 22 (`Procedimentos e Valores`), que contém literalmente
`| Clareamento dental | R$ 950 | 3 |`, não veio.**

Ou seja: para a pergunta mais óbvia de preço, o chunk com o preço não entrou no top-4.

**Hipótese:** tabelas markdown embedam mal comparadas a texto corrido — a similaridade de
um termo solto ("clareamento") puxa parágrafos narrativos antes de linhas de tabela.

**Por que não foi "corrigido":** não dá para saber se é bug ou estratégia. A IA respondeu
*"o valor exato depende de uma avaliação"* e desviou para agendamento, o que é comportamento
comum (e possivelmente desejado) de bot de clínica estética. **Se a intenção for dar preço,
isto é bug.** Se for sempre desviar para avaliação, o documento 22 é inútil no RAG.
Decisão do dono — ver `DECISIONS.md`.

**Se for para corrigir:** aumentar o `match_count`, ou quebrar a tabela de valores em um
chunk por procedimento (linha vira frase: "Clareamento dental custa em média R$ 950 em 3
sessões"), que embeda muito melhor.

---

## 12. Buffer de debounce sem TTL corrompia a conversa ✅ CORRIGIDO

**Sintoma:** o paciente manda "oi" e a IA responde chamando ele por um nome errado, ou
respondendo a uma pergunta que ele fez semanas atrás. **Nenhum erro em lugar nenhum** — a
execução aparece `success` no n8n e a mensagem sai com `status='sent'`.

**Causa:** `append_whatsapp_buffer()` concatenava sem olhar a idade do buffer. O único
lugar que limpava a tabela era o nó `Limpa Buffer (Fim)`, que **só roda no caminho feliz**.
Quando um fluxo morria no meio (o nó `Envia Resposta do Agent` falhou 15x entre 25/06 e
02/07 com "The service was not able to process your request"), o texto ficava na tabela
para sempre. A mensagem seguinte daquele telefone era colada no lixo antigo.

**Custo real observado em 27/07/2026:** o paciente mandou um único "oi". O agente recebeu
`"Oi Oi Oi Oi oi oi Jn bom dia oi oi"` — 10 mensagens de 30/06, 02/07 e 27/07 grudadas — e
respondeu **"Bom dia, Jn!"**, tratando um "Jn" digitado por engano 25 dias antes como o
nome do paciente. O paciente real se chama "iago de oliveira".

**Por que ninguém pegou isso:** não gera exceção, não gera log, o n8n marca `success`.
O `detectar_silencio()` também não vê — ele procura *ausência* de resposta, e aqui a
resposta existe, só está errada.

**Correção aplicada (27/07/2026):** `CASE` de TTL dentro do `ON CONFLICT DO UPDATE` —
buffer com mais de 5 min vira mensagem nova em vez de ser concatenado
(`docs/db/02-functions-triggers.sql` §1). Debounce é 15s, então 5 min é 20x a janela:
rajada legítima nunca é truncada. Testado nos dois sentidos (buffer de 10 min → descartado;
buffer recente → concatena normal). Os 2 buffers órfãos de junho foram removidos.

**Não remova o `CASE`.** Sem ele o bug volta na primeira falha de rede da Evolution.

---

## 13. Toda tabela nova em `public` nasce com RLS ligado e SEM policy ⚠️ ATIVO

**Sintoma:** você cria uma tabela, popula, e o n8n/CRM lê **zero linhas** com a chave anon.
Sem erro — `HTTP 200` e `[]`.

**Causa:** existe um event trigger `ensure_rls` (função `public.rls_auto_enable`) que roda
em todo `CREATE TABLE` no schema `public` e executa `enable row level security`. Ele **não**
cria policy nenhuma. RLS ligado sem policy = ninguém lê nada, exceto `service_role`.

**Confirmado em 27/07/2026** — teste com a chave anon via PostgREST:

| Tabela | Linhas reais | Anon enxerga |
|---|---|---|
| `patients`, `mensagem_logs`, `conversations`, `config_automacao`, `logs_erro` | 3 / 24 / 3 / 3 / 34 | tudo (policy `allow_all`) |
| `clinics` | 1 | **0** — mas isso NÃO protegia a `evolution_apikey`. Ver §16 |
| `documentos_clinica` (RAG) | 7 | **0** ⚠️ |
| `whatsapp_buffer`, `n8n_chat_histories` | 2 / 2 | **0** (ok: as funções são SECURITY DEFINER) |

**A pegar antes de confiar:** `match_documentos_clinica()` é SECURITY **INVOKER**, então
respeita o RLS de quem chama. Testado com a chave anon: devolve `[]`. Se a credencial
Supabase do nó `Consulta na database` no n8n for a chave anon, **o RAG devolve zero
documentos e a IA responde sem a base de conhecimento, em silêncio.** O MCP redige
credenciais, então isso **não foi possível verificar** — ver "Pontos cegos" no `AGENTS.md`.

**Ao criar tabela nova:** ou crie a policy junto, ou saiba que só `service_role` vai ler.

---

## 16. Fechar a TABELA não fecha o dado: `SECURITY DEFINER` passa por cima ✅ CORRIGIDO

**Sintoma:** o RLS está ligado, a tabela não tem policy nenhuma, você confere com a chave
anon e vê `[]`. Conclui que o dado está protegido. **Não está.**

**Causa:** `SECURITY DEFINER` roda com os privilégios do **dono** do objeto, não de quem
chamou. Então qualquer view ou função marcada assim ignora o RLS das tabelas que ela lê.
Havia duas passagens assim, ambas alcançáveis pela chave anon pública do `config.js`:

| Objeto | O que entregava |
|---|---|
| view `kpi_retencao` | `nome`, `telefone`, `convenio`, nº de sessões, primeira/última — por fora do RLS de `patients` e `consultas` |
| RPC `process_secretary_message(uuid)` | **`clinics.evolution_apikey`** — a chave da instância WhatsApp da clínica, apesar de `clinics` estar com RLS e zero policy |

A cadeia completa da segunda, só com a chave pública: `GET /rest/v1/conversations` →
`POST /rest/v1/mensagem_logs` (`tipo=manual`, `direcao=saida`, o que já dispara um envio
real pelo trigger) → `POST /rest/v1/rpc/process_secretary_message` → apikey na mão →
Evolution API direto, sem passar mais pelo Cliniflow.

**Por que passou despercebido:** o `docs/db/03-rls-policies.sql` listava `clinics` como
"fechada ✅ protege evolution_apikey", e estava certo **sobre a tabela**. O vazamento não
era pela tabela.

**Como confirmar em 10 segundos:**
```sql
-- views SECURITY DEFINER (Postgres: ausência de security_invoker = definer)
select c.relname, c.reloptions from pg_class c join pg_namespace n on n.oid=c.relnamespace
where n.nspname='public' and c.relkind='v';

-- funções SECURITY DEFINER e quem pode executar
select proname, prosecdef, array_to_string(proacl,' | ')
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public' and p.prosecdef;
```

**Correção aplicada em 28/07/2026:**
- as 4 views `kpi_*` receberam `ALTER VIEW ... SET (security_invoker = on)`. Escolha
  deliberada em vez de revogar o `SELECT` de `anon`: revogar quebraria a aba de Relatórios
  **hoje** (não há login ainda), enquanto `security_invoker` é no-op enquanto as policies
  forem `USING (true)` e fecha sozinho no dia do fechamento. Ver `DECISIONS.md` D-10.
- `process_secretary_message` teve o `EXECUTE` revogado de `PUBLIC`, `anon` e
  `authenticated`. ACL final: `postgres | service_role`.

**Não faça:** auditar RLS olhando só `pg_policy`. Uma tabela sem policy pode estar
sangrando por uma view ou por uma RPC.

---

## 17. `REVOKE ... FROM PUBLIC` não basta no Supabase — são DUAS concessões ⚠️ LEIA ANTES DE REVOGAR

**Sintoma:** você revoga, o comando volta `Success`, e o acesso continua exatamente igual.

**Causa:** toda função no Postgres nasce com `EXECUTE` para `PUBLIC` (pseudo-papel que
significa "todo mundo"). **Além disso**, o Supabase tem `ALTER DEFAULT PRIVILEGES` que
concede `EXECUTE` **nominalmente** a `anon`, `authenticated` e `service_role`. São duas
concessões independentes: matar uma não mata a outra.

Aconteceu duas vezes seguidas em 28/07/2026, nas duas direções:

```
REVOKE ... FROM anon, authenticated;   -- ACL: =X/postgres | ... ainda tem PUBLIC
REVOKE ... FROM PUBLIC;                -- ACL: ... | anon=X/postgres  ainda tem anon
```

**Como confirmar — sempre depois de revogar, nunca antes:**
```sql
select proname, coalesce(array_to_string(proacl,' | '),'sem ACL explicita')
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public' and proname = '<funcao>';
```
No ACL, `quem=oquê/quem_concedeu`. **Nome vazio antes do `=` é `PUBLIC`** (`=X/postgres`).
Só considere fechado quando `anon` **e** o `=X` sumirem dos dois.

**Correção:** revogar de `PUBLIC` **e** de `anon`/`authenticated`, e depois **ler o
`proacl`**. O `Success` do comando não é evidência de nada.

**Isto corrige o `docs/plano-auth-rls.md` §4.2**, que manda só
`REVOKE ALL ON FUNCTION public.auth_clinic_id() FROM public;` — insuficiente sozinho.

**Deixado aberto de propósito:** `append_whatsapp_buffer` mantém `anon` (o nó
`Append Buffer (RPC)` do n8n depende, plano §2). `trigger_secretary_webhook` e
`rls_auto_enable` não foram tocadas: são funções de trigger/event trigger, não são
chamáveis fora do contexto do trigger, e mexer no grant delas arrisca quebrar o
`INSERT` em `mensagem_logs` em silêncio.

---

## 18. A ferramenta de pré-agendamento da IA já estava quebrada, não "vai quebrar" ✅ CORRIGIDO NO BANCO

**Sintoma:** a IA diz ao paciente que separou o horário e **nada** aparece em `consultas`.

**Causa:** `consultas.data_hora` é `NOT NULL` **sem default**, e o nó `criar_pre_agendamento`
(toolCode) nunca mandava esse campo. Todo insert morria com `23502`. O `catch` do nó
devolvia `{success:false}` para o modelo, que — sem instrução do contrário — segue a
conversa como se tivesse dado certo.

**Confirmado em 28/07/2026** por sonda que não grava nada:
```sql
do $$ declare v text; begin
  begin insert into public.consultas (patient_id,clinic_id,status,tipo)
        values (null,null,'solicitado','sonda'); v:='PASSOU';
  exception when others then v:='FALHOU -> '||SQLSTATE||' : '||SQLERRM; end;
  raise exception '%', v;   -- aborta e mostra
end $$;
-- 23502 : null value in column "data_hora" violates not-null constraint
```

**Isto corrige o `docs/plano-auth-rls.md` §5**, que diz "hoje isso só não estoura porque a
tabela está vazia". Tabela vazia não evita violação de `NOT NULL`. A ferramenta estava
morta independente de RLS.

**Correção:** RPC `public.criar_pre_agendamento(uuid,uuid,text,text)`, `SECURITY DEFINER`,
que valida que o paciente pertence à clínica e preenche `data_hora` com `now()` como
placeholder (a recepção define o horário real ao aprovar o `solicitado`).
`EXECUTE` só para `anon` (a chave que o nó usa) e `service_role`.

**Status:** ✅ no banco, testada com paciente real (transação abortada).
⚠️ **O nó do n8n está com a troca SÓ NO RASCUNHO** — sem `publish_workflow`, produção
continua fazendo `POST /rest/v1/consultas` e continua falhando. Ver §5d.

## 19. Login com Google pode "perder" a clínica existente no primeiro acesso ⚠️ VERIFICAR NO PRIMEIRO LOGIN REAL

**Contexto:** a conta da clínica (`iagodeoliveirabatista@gmail.com`) foi criada à mão no
PASSO 0 do `docs/plano-auth-rls.md`, com provider `email` e `email_confirmed_at` preenchido
— confirmado por query direta em `auth.users`/`auth.identities` em 29/07/2026.

**O risco:** o onboarding (D-12) decide "clínica nova ou existente" checando só se
`auth.uid()` já tem linha em `clinic_users`. Isso pressupõe que logar com Google usando o
**mesmo e-mail** da conta antiga devolve o **mesmo `auth.uid()`**. O Supabase Auth faz esse
link automático de identidade quando o e-mail já está confirmado — mas isso **não foi
observado rodando**, só verificado por leitura de schema. Se por algum motivo o link
automático não disparar (configuração de projeto, comportamento de versão do GoTrue), o
primeiro login por Google cria um **novo** `auth.users` sem vínculo, cai no onboarding, e
convida a "criar uma clínica" que já existe — o usuário acabaria com uma clínica vazia
duplicada em vez de acessar os pacientes reais.

**Como verificar (fazer isso ANTES de confiar no fluxo):** depois de configurar o provider
Google no Supabase (passos B1-B3 de `docs/db/05-onboarding-google-oauth.sql`), o primeiro
login deve ser com `iagodeoliveirabatista@gmail.com`. Se aparecer a tela "Cadastre sua
clínica" em vez do CRM com os dados existentes, **pare** — não crie a clínica nova. Rode
`SELECT id, email FROM auth.users;` e `SELECT * FROM public.clinic_users;`: se dois
`auth.users.id` existirem para o mesmo e-mail, o link automático falhou e a solução é
`supabase.auth.linkIdentity()` ou vincular manualmente (`UPDATE clinic_users SET user_id =
<novo-id> WHERE user_id = <antigo-id>` e apagar o `auth.users` órfão), não recriar dados.

**Status:** não corrigido porque não há nada a corrigir sem antes ver o comportamento real
— é uma armadilha de infraestrutura de terceiro (Supabase Auth), não de código deste
projeto. Ver `docs/DECISIONS.md` D-12.

---

## 20. Webhook de verificação da Meta falha mesmo com URL certa: dot-notation nos query params ✅ CORRIGIDO

**Sintoma:** a Meta devolve "Não foi possível validar a URL de callback ou o token de
verificação" ao clicar "Verificar e salvar", mesmo com a URL do n8n parecendo correta.

**Causa (duas, não uma):**
1. A URL testada era `.../webhook-test/...` — a rota de teste do n8n só escuta enquanto o
   workflow está aberto no editor em modo "Listen for test event". Fora disso, falha
   silenciosamente. A rota que fica sempre no ar é `.../webhook/...`, com o workflow **Active**.
2. A Meta manda `hub.mode`, `hub.verify_token`, `hub.challenge` como **chaves literais com
   ponto** na query string — não como objeto aninhado. Em n8n/Express isso significa que
   `{{$json.query.hub.verify_token}}` **não existe** (retorna vazio, sem erro visível). É
   obrigatório usar colchete: `{{$json.query['hub.verify_token']}}`.

**Correção:**
- URL de callback = `/webhook/<path>`, workflow **Active**.
- Nó Webhook: `Respond` = "Using Respond to Webhook Node", método `GET`.
- Comparação do token via colchete, nunca via ponto.
- Resposta final: nó `Respond to Webhook` com body = `{{$json.query['hub.challenge']}}`
  (texto puro, `Content-Type: text/plain`, status 200) — se vier como JSON
  `{"challenge": "..."}`, a Meta rejeita.

**Não faça:** não assuma que a URL de teste (`webhook-test`) serve para qualquer verificação
feita fora do editor do n8n aberto na hora — ela só serve para teste manual ao vivo.

**Status:** corrigido e confirmado — a Meta validou o webhook depois dos ajustes acima
(workflow `Meta WhatsApp - Verificação de Webhook (temporário)`, produção `/webhook/...`,
Active, token `hub.verify_token` batendo dos dois lados).

---

## 21. Nó HTTP Request do n8n: dois erros de expressão ao montar a chamada pra Graph API da Meta ✅ CORRIGIDO NO TESTE

**Sintoma:** a chamada pra Meta falha (401 ou 400), mesmo com token e URL certos.

**Causa (duas, no mesmo nó):**
1. **`=` duplicado dentro de um campo já em modo expressão.** O `=` no começo do campo (`jsonBody`, por
   exemplo) já diz "isto é uma expressão". Um `=` de novo *dentro* do texto, na frente de um `{{ }}`,
   não é sintaxe válida — vira caractere literal no resultado.
   `"to": "={{$json.destinatario}}"` gera `"to": "=5588..."` (com um `=` sobrando), não o número puro.
2. **Nome e valor do header trocados.** O header de autenticação precisa se chamar `Authorization`, com
   valor `Bearer <token>` (os dois juntos, um espaço no meio). Um header chamado literalmente `Bearer`
   com o token puro como valor não autentica nada — a Meta não reconhece esse header.

**Correção:**
- Dentro de um campo já marcado como expressão, use só `{{ $json.campo }}` — sem `=` extra na frente.
- Header: Name = `Authorization`; Value = `=Bearer {{ $json.meta_access_token }}`.

**Ocorrido em:** 06/08/2026, workflow de teste de envio via Graph API. Corrigido antes do teste real dar
certo — ficou provado funcionando com `messages[0].id` retornado.

---

## 22. Usuário de sistema da Meta só abre a porta dos ativos atribuídos a ele — não é global entre BMs ⚠️ ATIVO

**Sintoma:** um token de usuário de sistema funciona pra um número/WABA, mas dá erro de permissão pra
outro — mesmo tendo sido gerado "certo".

**Causa:** o token não é uma chave mestra. Ele só age nos ativos (Apps, WABAs) explicitamente atribuídos
àquele usuário de sistema, dentro da BM onde ele foi criado. Se o App e o WABA de teste vivem numa BM
(ex: BM pessoal do usuário) e outro WABA vive em **outra** BM (ex: Grangeiro001, dona do número
atual/manual da clínica — D-14), o mesmo token **não** alcança esse segundo WABA sem alguém compartilhar
o ativo entre as BMs, ou sem criar um usuário de sistema novo direto na outra BM.

**Armadilha extra, no mesmo fluxo:** a tela de "Contas do WhatsApp" no Business Settings mostra um **ID
da conta (WABA ID)** — visualmente parecido com o **ID do número de telefone**, mas são valores
diferentes, usados em lugares diferentes. O WABA ID não entra na URL da chamada de envio
(`/{phone-number-id}/messages`); o phone-number-id só aparece dentro do **App** → WhatsApp →
Configuração da API.

**Como confirmar:** antes de assumir que um token vale pra um WABA, confira em Business Settings →
Usuários do sistema → aquele usuário → quais ativos estão atribuídos a ele. Se o WABA que você quer usar
não estiver na lista, o token não alcança.

**Ocorrido em:** 06/08/2026, ao configurar o teste de envio — App/número de teste na BM pessoal do
usuário, número real da clínica em Grangeiro001.

---

## 23. Mudar o `RETURNS TABLE` de uma função REABRE o ACL dela em silêncio ⚠️ LEIA ANTES DE MEXER EM RPC

**Sintoma:** você adiciona uma coluna ao retorno de uma RPC, tudo funciona, nenhum erro em lugar
nenhum — e a função volta a ser chamável pela **chave anon pública**, entregando credenciais.

**Causa (dois passos encadeados):**
1. O Postgres **recusa** `CREATE OR REPLACE` quando o `RETURNS TABLE` muda:
   `cannot change return type of existing function`. A única saída é `DROP FUNCTION` + `CREATE`.
2. Uma função **recém-criada nasce com privilégios default** — `PUBLIC` ganha `EXECUTE`, e o
   `ALTER DEFAULT PRIVILEGES` do Supabase concede a `anon`/`authenticated` por cima (§17).
   Ou seja: **o DROP joga fora todo `REVOKE` que já tinha sido aplicado àquela função.**

Concretamente, em 06/08/2026 `process_secretary_message` precisou ganhar `meta_access_token` e
`meta_phone_number_id` no retorno. Sem reaplicar os REVOKEs, a cadeia inteira do §16 voltaria a
funcionar — e agora entregando **o token da Meta** junto com a `evolution_apikey`.

**Correção (no MESMO script da migração, nunca "depois"):**
```sql
DROP FUNCTION public.minha_funcao(uuid);
CREATE FUNCTION public.minha_funcao(uuid) RETURNS TABLE(...) ... ;
REVOKE ALL ON FUNCTION public.minha_funcao(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.minha_funcao(uuid) FROM anon, authenticated;
```

**Como confirmar (o `Success` não é evidência de nada — §17):**
```sql
select proname, coalesce(array_to_string(proacl,' | '),'SEM ACL = PUBLIC PODE!') from pg_proc p
join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and proname='<funcao>';
```
Só considere fechado quando sobrar `postgres=X/postgres | service_role=X/postgres` — sem `anon`
e sem o `=X` solto (que é o `PUBLIC`). O `get_advisors` do Supabase é uma segunda checagem boa:
a função **não pode** aparecer em `anon_security_definer_function_executable`.

**Não faça:** não separe o `DROP/CREATE` do `REVOKE` em migrações diferentes. Entre as duas, a
função fica publicamente executável — e se a segunda migração falhar ou for esquecida, o vazamento
fica de pé sem nenhum sintoma.

**Ocorrido em:** 06/08/2026, Task 1 da migração Meta. Pego antes de aplicar; ACL conferido depois
(`postgres | service_role`) e confirmado pelo advisor.

---

## 24. O webhook da Meta reenvia SUA PRÓPRIA mensagem — sem filtrar `statuses`, o bot entra em loop

**Sintoma:** o bot responde o paciente, e então responde a si mesmo, e de novo, e de novo. Rajada de
mensagens até alguém desativar o workflow. Cada volta gasta token de LLM e queima reputação do número.

**Causa:** a Cloud API **notifica no mesmo webhook** dois tipos de evento completamente diferentes:

| Campo em `entry[].changes[].value` | O que é |
|---|---|
| `messages[]` | mensagem que **o paciente** mandou — é isto que deve acordar o bot |
| `statuses[]` | recibo (`sent`/`delivered`/`read`) de mensagem que **nós** mandamos |

Toda resposta que o bot envia gera pelo menos 2-3 callbacks de `statuses`. Se o filtro de entrada não
distinguir, cada resposta do bot vira uma "mensagem nova" que dispara o bot outra vez.

**Isto não tem equivalente na Evolution.** Lá o anti-loop era `IsFromMe === true`, um campo booleano na
própria mensagem. Na Meta a informação não está num campo — está em **qual chave existe no payload**.
Quem migra procurando por `fromMe` não acha e conclui que não precisa de anti-loop.

**Correção (no `FILTRO ANTI-LOOP`, primeira validação):**
```js
if (value.statuses && !value.messages) {
  return [];   // recibo de entrega, não é mensagem de paciente
}
```

**Como confirmar antes de ir pro ar:** mande um payload de `statuses` pelo nó e verifique que ele
devolve `[]`. Testado em 06/08/2026 com 4 cenários (texto passa, `statuses` bloqueia, payload sem
`entry` bloqueia, notificação sem mensagem bloqueia).

**Não faça:** não assine o campo `message_status` no painel da Meta achando que é opcional pra
observabilidade — ele chega no mesmo webhook e é justamente o que causa o loop. Assine só `messages`
enquanto não houver tratamento próprio para recibo.

---

## 25. Nó Supabase que não acha nada MATA o ramo — o `If` seguinte nunca roda ⚠️ ATIVO

**Sintoma:** a execução aparece **`success`** no n8n, mas simplesmente para no meio. O nó mostra
*"No output data returned"*. O `If` logo depois — que existe justamente para tratar o caso "não
achou" — nunca executa, e o caminho `false` dele fica inalcançável. Nada em `logs_erro`, nada no
`detectar_silencio()` (a execução foi um sucesso, afinal).

**Causa:** um nó Supabase `get` que não encontra linha devolve **zero itens**, e o n8n encerra aquele
ramo quando um nó não emite item. Não é erro — é o comportamento padrão. A opção que muda isso é
`alwaysOutputData` (aba *Settings* do nó): com ela ligada, o nó emite um item **vazio** `{}`, o `If`
roda, `$json.id` é `undefined`, e o caminho `false` finalmente é alcançado.

**O detalhe que engana:** neste workflow os autores **sabiam disso** — `Busca Clinica` e
`Busca Paciente` estão com `alwaysOutputData: true`. Só `Busca Conversa Ativa` ficou de fora. Então
quem olha o workflow vê o padrão certo em dois lugares e não desconfia do terceiro.

**Por que demorou a aparecer:** só quebra na combinação "paciente **existe** mas **não tem** conversa
aberta". Paciente novo vai pelo ramo `Cria Paciente` → `Cria Conversa`; paciente com conversa aberta
segue normal. O vão só aparece quando a tabela `conversations` é limpa e o `patients` não.

**Ocorrido em:** 07/08/2026, primeiro teste real do canal Meta. `conversations` estava vazia e o
paciente de 27/06 (sobra da Evolution) ainda existia. Execução `82608`, `success`, morreu em
`Busca Conversa Ativa`.

**Correção:** ligar **Always Output Data** no nó → salvar → **publicar**.
⚠️ Isso **não é aplicável pelo MCP** — `alwaysOutputData` é irmão de `parameters`, não filho, e
nenhuma operação do `update_workflow` alcança. É mudança manual pela UI. Ver §5f.

**Ao criar nó de busca novo:** decida conscientemente. Se existe um `If` depois tratando "não achou",
o `alwaysOutputData` é **obrigatório**, senão esse `If` é decorativo.

---

## 26. `Busca Paciente` casa só por telefone — sem `clinic_id`, o multi-tenant vaza ⚠️ ABERTO

**Sintoma:** (ainda não ocorreu com dado real — hoje só existe uma clínica em produção)
Uma clínica enxerga o paciente — e o histórico de conversa — de outra clínica.

**Causa:** o nó `Busca Paciente` do workflow principal filtra `patients` **apenas** por telefone:
```
keyName: "telefone"   keyValue: {{ ...telefone_whatsapp.replace(/\D/g,'').slice(-11) }}
```
Não há condição de `clinic_id`. Como `patients.telefone` não é único por clínica, o primeiro paciente
com aquele telefone é retornado — independente de a qual clínica pertence. Dali em diante o fluxo usa
esse `patient_id` para achar conversa, gravar mensagem e alimentar a memória do AI Agent.

**Visto na prática em 07/08/2026:** mensagem enviada ao número da clínica de **teste**
(`7936105a-…`) encontrou o paciente `52c34c91-…`, criado em 27/06 na era Evolution, com
`clinic_id: NULL` e `origem_lead: "Teste-Wpp_B"`. Nenhuma barreira impediu o cruzamento.

**Por que o RLS não salva:** o nó usa credencial de serviço, não a chave anon — RLS não se aplica.
O isolamento aqui depende do **filtro da query**, não da política do banco.

**Correção:** adicionar segunda condição ao nó (`clinic_id` = `{{ $('Busca Clinica').first().json.id }}`)
e conferir o mesmo em `Cria Paciente`/`Busca Conversa Ativa`. **Fazer isso antes da segunda clínica
entrar** — depois, os dados já estarão cruzados e a correção vira limpeza de dado, não só de código.

**Status:** ABERTO. Registrado em 07/08/2026, fora do escopo da migração Meta.

---

## 27. `DROP COLUMN` não avisa que quebrou uma função — e a sonda ingênua diz que está tudo bem

**Sintoma:** você remove uma coluna que "não é mais usada". Nenhum erro. Dias depois, um recurso
específico para de funcionar — e só ele.

**Causa:** o corpo de uma função `plpgsql` **não é validado no `CREATE`**, e muito menos quando uma
coluna que ele usa é removida depois. O Postgres só resolve os nomes de coluna **na hora de executar
aquela linha**. Então `DROP COLUMN` passa limpo, e a função só estoura (`42703`) quando alguém a
chama pelo caminho que toca a coluna morta.

**Ocorrido em 07/08/2026:** o usuário removeu `clinics.evolution_instance` (limpeza pós-migração
Meta). A `process_secretary_message` continuava com `SELECT ... c.evolution_instance` no `RETURN
QUERY`. Resultado: **todo envio manual do CRM quebraria**, e nada acusava.

**A armadilha dentro da armadilha — a sonda que mente:**
```sql
-- ❌ ISTO DIZ "FUNCIONA" MESMO COM A FUNÇÃO QUEBRADA
SELECT * FROM public.process_secretary_message('00000000-0000-0000-0000-000000000000');
```
Com um UUID inexistente a trava não pega, a função faz `RETURN` **antes** do `RETURN QUERY`, e a
linha defeituosa nunca é alcançada. A sonda passa. A função está quebrada.

**Sonda correta — force o caminho real e aborte no fim:**
```sql
DO $$
DECLARE r record; v text; alvo uuid;
BEGIN
  SELECT id INTO alvo FROM public.mensagem_logs
   WHERE evo_message_id IS NULL AND status <> 'sending' LIMIT 1;
  BEGIN
    SELECT * INTO r FROM public.process_secretary_message(alvo);   -- caminho REAL
    v := 'OK';
  EXCEPTION WHEN others THEN v := 'QUEBRADA -> '||SQLSTATE||' : '||SQLERRM; END;
  RAISE EXCEPTION 'SONDA -> %', v;   -- aborta: a trava 'sending' é revertida
END $$;
```

**Antes de qualquer `DROP COLUMN`, ache quem depende:**
```sql
SELECT proname FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE n.nspname='public' AND pg_get_functiondef(p.oid) ILIKE '%nome_da_coluna%';
```
Views, triggers e RLS policies também precisam ser conferidos — nenhum deles é validado no drop.

---

## 28. Apagar uma clínica desloga o usuário sem avisar (CASCADE em `clinic_users`)

**Sintoma:** o login continua funcionando, mas o CRM abre na tela **"Cadastre sua clínica"** em vez
dos dados reais. Parece que o Auth quebrou.

**Causa:** `clinic_users.clinic_id` tem `ON DELETE CASCADE`. Apagar a linha em `clinics` apaga junto
o vínculo conta ↔ clínica. `auth_clinic_id()` passa a devolver `NULL`, e o `Root` do CRM interpreta
isso como "usuário novo, sem clínica" e mostra o onboarding.

**O estrago se você seguir o fluxo:** clicar em "Cadastre sua clínica" cria uma clínica **nova e
vazia**, vinculada ao seu login — enquanto o número do WhatsApp continua apontando para a clínica que
tem os dados. Você fica olhando uma clínica vazia e achando que perdeu tudo. É o mesmo desfecho
descrito na §19, por outro caminho.

**Ocorrido em:** 07/08/2026, ao consolidar duas clínicas em uma depois da migração Meta.

**Correção (não recrie nada pelo onboarding):**
```sql
INSERT INTO public.clinic_users (user_id, clinic_id, nome, papel)
VALUES ('<auth.users.id>', '<clinics.id que TEM os dados>', '<nome>', 'admin')
ON CONFLICT (user_id) DO UPDATE SET clinic_id = EXCLUDED.clinic_id;
```

**Como confirmar que voltou** — chame a função que o CRM realmente usa, não a tabela:
```sql
SELECT set_config('request.jwt.claims','{"sub":"<user_id>","role":"authenticated"}', true);
SELECT public.auth_clinic_id();   -- tem que devolver a clínica certa, não NULL
```

**Ao apagar clínica:** confira antes `SELECT * FROM clinic_users WHERE clinic_id = '<id>'` e
replaneje o vínculo **junto** com o delete, na mesma transação.

## 29. O toggle "IA Pausada" do CRM não pausava nada

**Sintoma:** secretária desliga "IA Pausada" no painel Atendimentos (grava
`patients.bot_pausado = true`, confirmado na tela: "A IA está silenciada"), mas o bot
continua respondendo o paciente em tempo real. Achado ao vivo em 09/08/2026, pego em
produção com um paciente real no meio da conversa.

**Causa:** `patients.bot_pausado` **nunca era lido em lugar nenhum do workflow n8n**
(`ZAQ6I2CiBGh8swye`) — zero ocorrências no JSON do workflow. O único gate real era
`sessoes_ativas.atendimento_humano`, checado só dentro do nó `Valida Expiração`, e só
quando **já existe uma linha** em `sessoes_ativas` para aquele telefone. Sem sessão ativa
(patient novo no ciclo, ou sessão já expirada/limpa pelo `Cleanup de Sessão`), o código cai
em `if (!row || !row.expira_em) return sessao_status: "NAO_ENCONTRADA"` — e o nó `Status da
sessão?` (Switch) tem uma regra explícita que roteia `NAO_ENCONTRADA` **direto pro AI
Agent**, sem checar `bot_pausado` em nenhum ponto do caminho.

**Por que não dava erro:** o Switch não tem fallback — item que não bate em nenhuma regra
é descartado em silêncio (é assim que `ATIVA_HUMANA` já funcionava, corretamente, de
propósito). `NAO_ENCONTRADA` bate numa regra própria que manda pro AI Agent, então nunca
foi descartado. Execução aparecia como `success`.

**Correção:** `Valida Expiração` agora lê `$('Busca Paciente').first().json.bot_pausado`
**antes** de qualquer outra checagem. Se `true`, devolve `sessao_status: "BOT_PAUSADO"` —
não bate em nenhuma regra do Switch (nem "Validada", nem "Expirou", nem "NAO_ENCONTRADA"),
então é descartado do mesmo jeito que `ATIVA_HUMANA`. Cobre os dois casos: com sessão ativa
e sem sessão. `Busca Paciente` já tem `alwaysOutputData: true`, então `.first()` não quebra
pra paciente que ainda não existe em `patients` (`bot_pausado` vem `undefined`, tratado como
"não pausado").

**Mitigação imediata aplicada no incidente:** inserida à mão uma linha em `sessoes_ativas`
com `atendimento_humano = true` pro telefone da conversa em andamento, pra conter o bot
enquanto a correção no n8n era publicada.

**Se reabrir:** ao adicionar qualquer campo de controle novo no `patients` (ex: um futuro
"pausar por N horas"), lembre que **nenhum campo de `patients` é lido pelo n8n por padrão**
— precisa ser explicitamente buscado via `$('Busca Paciente')` e checado onde o gate real
mora (`Valida Expiração`), não assumido só porque o CRM grava a coluna.

## 30. A IA dizia "agendei" sem nunca ter agendado nada

**Sintoma:** numa conversa de teste real (09/08/2026), a IA respondeu "Recebido, Iago! Tudo
certo, agendei sua avaliação para segunda-feira, às 14h" — mas `consultas` estava (e continuou)
vazia. A recepção nunca teria visto esse pedido.

**Causa:** o prompt do `AI Agent` nunca instruía explicitamente a IA a chamar a tool
`criar_pre_agendamento` — só dizia "confirme e siga para registrar" em prosa. A tool está
corretamente conectada (`ai_tool: criar_pre_agendamento → AI Agent`, confirmado nas
conexões do workflow) — **não é bug de wiring**, é lacuna de instrução. Provado via
`get_execution`: em toda a conversa de teste, `ai.agent.tool_calls.requested` ficou em **0**
em todos os turnos. A IA também inventou pedir "sobrenome e telefone de contato" — dado que a
tool não usa e que já é conhecido via WhatsApp — porque, sem instrução, ela improvisou seu
próprio conceito de "finalizar o agendamento".

**Como diagnosticar isso de novo, se voltar:** `mcp__n8n-mcp__get_execution` com
`includeData: true` e `nodeNames: ["AI Agent"]` na execução suspeita — o campo
`metadata.tracing["ai.agent.tool_calls.requested"]` mente por omissão do jeito oposto do
§14 (aquele mentia dizendo 0 quando a tool FOI chamada; aqui achamos 0 porque a tool
genuinamente nunca foi chamada) — então **os dois casos exigem conferir a tabela de destino
(`consultas`) além da métrica**, nunca confiar só num dos dois sinais.

**Correção (09/08/2026):** nova seção `[REGISTRAR O AGENDAMENTO - OBRIGATÓRIO USAR A TOOL]`
no prompt, mandando chamar a tool no mesmo turno em que o paciente confirma um período, e
proibindo a IA de dizer "agendei"/"confirmado"/"reservado" sem tê-la chamado antes. Publicado
na `activeVersion` `54133dd0-da3f-4a9d-ad0a-706ac22f0e16`.

**Ainda não verificado com execução real pós-correção** — ver `AGENTS.md`, próximo passo
obrigatório antes de confiar nisso em produção.

**Atualização (mesmo dia, teste real revelou uma 2ª camada do mesmo bug):** com a correção
acima já publicada, uma nova conversa de teste mostrou a IA chamando a tool de verdade
(`ai.agent.tool_calls.completed: 1`, com os parâmetros certos) — mas `consultas` continuou
vazia. A tool em si (`criar_pre_agendamento`, um Custom Code Tool) estava quebrada:
- O `jsCode` inteiro estava envolto em `{{ \`...\` }}` — isso faz o n8n tratar o campo como
  uma **expressão** (que resolve para uma string, com os `${...}` internos avaliados por
  fora), não como código a ser executado de verdade. O resultado é blocos `{ { "texto que
  parece código" } }` que nunca rodam como JS real — o `return` fica preso dentro de uma
  template string, nunca é um `return` de verdade.
- Mesmo corrigindo isso, o código dependia de `this.helpers.httpRequest`, que **não existe**
  no sandbox do Custom Code Tool (`n8n-code-tool` skill, tabela de capacidades — só o Code
  node normal tem `$helpers`). Confirmado que a chamada HTTP nunca disparou de verdade:
  `consultas` nunca recebeu nada, nem uma vez, desde que o recurso existe.

**Correção definitiva:** o nó foi recriado como `@n8n/n8n-nodes-langchain.toolHttpRequest`
(HTTP Request Tool — o nó oficialmente suportado para "tool de IA que chama uma API"), com
os campos da IA vindo via `$fromAI('campo', 'descrição', 'string')` e os dados de contexto
(`patient_id`/`clinic_id`) vindo de `$('Centraliza Dados')`, do mesmo jeito que os outros
nós HTTP deste workflow já fazem. Publicado na `activeVersion` `1067f7e7-ecd2-4ddc-91c3-93f3c9919b0d`.

**Se reabrir:** `n8n-nodes-base.httpRequest` comum **não pode** ser ligado como `ai_tool` —
o n8n recusa a conexão (`Invalid connection: ... its node type does not produce an
'ai_tool' output`). Tem que ser um nó com sufixo "Tool" (`toolHttpRequest`,
`toolCode`, `toolCalculator`, etc.). E dentro do `toolCode`, nunca chame API externa — é
sandbox puro, sem `$helpers`, sem `$input`, sem `$node`. Ver a skill `n8n-code-tool` antes
de mexer em qualquer Custom Code Tool.

**Ainda não verificado com execução real pós-2ª-correção.**

## 31. Lembrete de consulta nunca chegaria — três quebras em série no mesmo caminho

**Sintoma:** nenhum. É o pior tipo: `disparar-lembretes` respondia `{"ok":true,"disparados":0}`
todo hora cheia, o cron marcava `succeeded`, e ninguém recebia nada. Descoberto em 09/08/2026
numa varredura, não por alguém reclamar.

**Causa — três falhas independentes, em sequência, no caminho
`pg_cron → disparar-lembretes → enviar-whatsapp → n8n → Meta`:**

1. **O trigger não dispara para lembrete.** `secretary_message_trigger` tem
   `WHEN (new.tipo = 'manual' AND new.direcao = 'saida')`. Lembrete grava
   `tipo = 'lembrete_24h'` — nunca casa. O caminho que entrega mensagem manual
   simplesmente não existia para lembrete.
2. **A chamada direta ao n8n ia sem `message_id`.** `enviar-whatsapp` chamava
   `/webhook/enviar-mensagem` com `{telefone, mensagem, tipo}`, mas o primeiro nó daquele
   workflow faz `process_secretary_message(p_message_id := $json.body.message_id)`. Recebia
   NULL, devolvia vazio, e o envio ia para `graph.facebook.com/v20.0/undefined/messages`.
   Pior que falhar: no caminho **manual** o trigger entregava a mensagem e essa chamada
   direta falhava logo depois, marcando o log como `failed` — mensagem entregue aparecendo
   como erro no CRM.
3. **Texto livre fora da janela de 24h é recusado pela Meta** (erro 131047). Lembrete é, por
   definição, fora da janela — o paciente não escreveu nas últimas 24h. **Nada no sistema
   inteiro enviava template**: zero referências a `type: "template"` em qualquer lugar.
   Ter os templates aprovados na WABA não adianta se ninguém os usa. A D-16 previa exatamente
   isso ("trocar `disparar-lembretes` para chamar o template") e nunca foi implementada.

**Correção (09/08/2026):** `enviar-whatsapp` v9 ganhou dois caminhos explícitos —
recebendo `template`, fala **direto** com a Graph API (sem n8n, que não tinha como servir
esse caso); sem `template`, apenas grava o log e deixa o trigger fazer o envio manual, sem
a chamada direta que corrompia o status. O de-para lembrete→template mora em
`config_automacao` (`meta_template_nome`/`meta_template_idioma`/`meta_template_params`).

**Verificado de verdade, não só publicado:** consulta de teste criada para +24h20,
`disparar-lembretes` disparado à mão, `disparados: 1`, `mensagem_logs.status = 'sent'` com
`evo_message_id` real (`wamid.HBgMNTU4ODgxNDU4NjMzFQIAERgSM0VEMjYzMEQ3MEFFRjZFM0Y3AA==`) e
mensagem entregue no WhatsApp. Consulta de teste apagada depois
(`mensagem_logs.consulta_id` é `ON DELETE SET NULL`, então o log da prova sobreviveu).

**Pegadinhas de template que vão morder de novo:**
- **O idioma do template é o que está cadastrado na Meta, não o idioma do texto.**
  `consulta_amanha` foi aprovado como **`en`** com corpo em português. Mandar `pt_BR` nele
  devolve 132001 ("template does not exist in that language"). Está registrado em
  `config_automacao.meta_template_idioma`, com comentário na coluna.
- **Os templates aprovados usam parâmetros NOMEADOS** (`parameter_format: NAMED`), então cada
  parâmetro vai com `parameter_name`. Formato posicional é recusado.
- **Mandar parâmetro a mais ou a menos** dá 132000. Por isso `meta_template_params` lista
  exatamente os que aquele template declara: `consulta_amanha` usa nome/data/hora/medico,
  `confirmao_horas_antes` usa só nome/hora/medico (não tem `data`).
- Para ler os templates reais sem expor o token: `net.http_get` com o token vindo de
  `SELECT meta_access_token FROM clinics` dentro do próprio SQL — o segredo nunca sai do banco.

**Ainda quebrado de propósito (não corrigido nesta rodada):** o botão "enviar WhatsApp" da
Agenda manda **texto livre** pelo caminho manual. Para um paciente que não escreveu nas
últimas 24h, a Meta vai recusar do mesmo jeito (131047) e a mensagem fica presa em
`sending` (§5c). Só é seguro usar esse botão dentro da janela de 24h. Resolver isso é o
mesmo trabalho: fazer aquele botão escolher um template.

## 32. `list_tables` disse "0 linhas" numa tabela que tinha 3 — e isso quase virou decisão errada

**Sintoma:** `list_tables` (MCP do Supabase) reportou `config_automacao` com `rows: 0`. Conclusão
tirada: "não existe nenhuma configuração de lembrete, preciso criar". Criadas 2 configs novas.
Aí o teste real acusou uma config `reminder_24h` que ninguém tinha visto — havia **3 configs
de 04/06/2026** o tempo todo.

**Causa:** essa contagem vem de estatística do planejador (`pg_class.reltuples`), não de um
`COUNT(*)`. Em tabela que nunca sofreu `ANALYZE` depois de ser populada, ela fica em zero
indefinidamente.

**Consequência real:** duas configs de 24h e duas de 4h ativas ao mesmo tempo — o paciente
receberia o mesmo lembrete duas vezes assim que alguém preenchesse o template nas antigas.
As 3 antigas foram **desativadas** (`ativo = false`), não apagadas: guardam o texto original
e a volta é um `UPDATE`.

**Correção de método:** antes de concluir que uma tabela está vazia, rode
`SELECT count(*)` de verdade. `list_tables` serve para descobrir *que* tabelas existem e se
têm RLS — não para saber se têm dado.

## 33. Um 503 de 2 segundos do Gemini abandona o paciente no meio da conversa

**Sintoma:** o dono mandou uma mensagem do número de teste, o bot respondeu uma vez e depois
**nunca mais respondeu**. Parecia que o número tinha sido desconectado do agente, ou que o
toggle "IA Pausada" tinha voltado a dar problema. Não era nada disso: `patients.bot_pausado`
estava `false`, `sessoes_ativas` vazia, webhook da Meta recebendo normalmente.

**Causa:** execução 83403 (14/08/2026 01:07 UTC) morreu no nó `AI Agent` com
`[GoogleGenerativeAI Error]: 503 Service Unavailable` — *"gemini-3.1-flash-lite is currently
experiencing high demand"*. O nó `Google Gemini Chat Model1` não tinha `retryOnFail` e o
`AI Agent` não tinha saída de erro. O modelo engasgou por alguns segundos, a execução abortou
inteira, e **nada foi enviado ao paciente**. Sem aviso, sem log visível pra recepção.

**Por que é traiçoeiro:** o sintoma ("parou de responder") aponta para desconexão/pausa, que
é o que se investiga primeiro. A causa real só aparece abrindo a execução específica — e
mensagem que não gerou resposta não deixa rastro em `mensagem_logs` (só a linha de entrada,
`status='pending'`, igual a qualquer outra).

**Correção (13/08/2026):** `needsFallback: true` no `AI Agent` (typeVersion 3.1 tem fallback
nativo de modelo) + nó `Gemini Fallback` com `models/gemini-3.1-flash` ligado no
`ai_languageModel` índice **1**. O principal continua sendo o `flash-lite` no índice 0.
Publicado, `activeVersion` `a4bfe1ff-1912-42c0-8e4a-a5e14aa3d6c1`.

⚠️ **`retryOnFail` NÃO é aplicável pelo MCP do n8n.** É configuração de nó, não parâmetro, e
`update_workflow` só opera sobre parâmetros/conexões/nós. Tem que ser na mão no editor
(`AI Agent` → Settings → Retry On Fail). Mesmo caso do `Envia Resposta do Agent`, que também
foi ligado na UI pelo usuário. Não tente contornar com `PUT` cru na API — ver §5.

## 34. Nó HTTP Request quebra lendo RPC que devolve escalar — e a execução vira `error` tendo funcionado

**Sintoma:** toda conversa em que o paciente pedia horário terminava com a execução marcada
`error` no nó `Grava Pre-Agendamento`: *"Response body is not valid JSON. Change Response
Format to Text"*. Dava a impressão de que o pré-agendamento não estava sendo criado.

**Causa:** a RPC `criar_pre_agendamento` tem `RETURNS uuid` — escalar, não tabela. O PostgREST
devolve o valor cru, e o nó HTTP Request tenta `JSON.parse` em cima disso e estoura.

**O pedido É criado.** Prova na execução 83389: a linha `d708ca7f` nasceu em `consultas` às
`22:40:06.703` e o erro estourou às `22:40:06.823` — 120 ms depois. O `INSERT` já tinha
commitado; quem falhou foi só a leitura da resposta.

**Consequência real:** não é cosmético. Cada pedido registrado dispara o `Error Trigger`, manda
e-mail de erro e enche `logs_erro` — o que treina qualquer um a ignorar erro no painel. Além
disso mascara falhas de verdade no mesmo caminho.

**Correção (13/08/2026):** `options.response.response.responseFormat = "text"` no nó. É o
último nó do ramo; ninguém consome a saída dele, então não parsear não custa nada.

**Regra geral:** nó HTTP Request apontando pra RPC do Supabase que devolve escalar (`uuid`,
`int`, `bool`, `text`) precisa de `responseFormat: text`. Só RPC com `RETURNS TABLE`/`SETOF`
devolve JSON que o n8n parseia sozinho.

## 35. A memória da IA re-registra o mesmo pedido a cada mensagem nova do paciente

**Sintoma:** o paciente mandou só **"Oi"** e nasceu um pedido de agendamento novo em
`consultas`. A recepção vê pedidos duplicados do mesmo paciente na aba "Solicitadas".

**Causa:** o `If` `Pediu Agendamento?` checava uma condição só — `periodo_preferencia` não
vazio. Quem preenche esse campo é a IA, que tem memória da conversa inteira: quando o Iago
disse "Oi" em 13/08, ela respondeu lembrando do contexto e **devolveu `periodo_preferencia:
"manhã"` de novo**, porque continua sendo verdade que ele prefere manhã. O workflow não
distinguia "o paciente acabou de dizer isso" de "eu lembro disso de quatro dias atrás".

**Rastro:** `9c32cf3a` (09/08 19:31, do "Manhã" legítimo) e `d708ca7f` (13/08 22:40, do "Oi").
Mesmo padrão com a paciente Laís em 11/08: dois pedidos (00:46:17 e 00:47:26), o segundo
disparado por *"Combinado, obrigada!!"*.

**Por que o dedup de 60h não resolve:** ele pega repetição dentro da janela — o caso do Iago
teve 4 dias de intervalo e passou reto. Dedup é rede de segurança, não a correção.

**Correção (13/08/2026):** segunda condição no mesmo `If` (combinator `and`) exigindo
`intencao == 'quer_agendar'`. O prompt já mandava a IA marcar `quer_agendar` quando o paciente
diz QUANDO; no "Oi" ela marcou `saudacao` — conferido no metadata da execução 83389, essa
condição sozinha teria barrado exatamente este caso.

⚠️ **A correção depende da IA classificar certo.** Se ela marcar `quer_agendar` por engano, o
pedido duplicado volta. Por isso o dedup de 60h da §"triagem" fica de pé junto — são duas
camadas, não uma substituindo a outra.

## 36. O roteiro de confirmação nunca funcionou — e por 16h ele bloqueia o bot inteiro

**Sintoma:** o dono aprovou um pedido, o lembrete saiu, ele respondeu "Oi", "Certo" e "Ok" —
três execuções `success`, **zero resposta útil**, e o `AI Agent` não rodou nenhuma vez. Como
as execuções ficam verdes, nada disso aparece em nenhum painel.

**Causa raiz nº1 — o desvio modal.** `Status da sessão?` só encaminha pro `AI Agent` na saída
**2** (`sessao_status == 'NAO_ENCONTRADA'`). O lembrete cria linha em `sessoes_ativas` com TTL
de 16h → durante 16h **toda** mensagem do paciente vai pro roteiro de confirmação, e ele não
consegue falar com o bot sobre mais nada (preço, dúvida, outro procedimento).

**Causa raiz nº2 — o roteiro estava morto desde sempre.** `Consulta Encontrada?` testava:

```
{{ $json.length > 0 }}
```

`$json` aí é a **linha** da consulta (item n8n), não um array. `length` é `undefined`, e
`undefined > 0` é `false`. **Sempre falso.** Confirmado na execução 83417: a linha veio
preenchida e saiu pela saída 1. Logo `Análise de evento - Claude` e o `Switch`
CONFIRMADO/CANCELADO/REMARCAR **nunca rodaram**. Ninguém jamais confirmou consulta por WhatsApp
— e `CONFIRMAR` digitado pelo paciente daria no mesmo lugar. O CTA do próprio lembrete não
funcionava.

**Causa raiz nº3 — `Busca Consulta` pegava a consulta errada.** Filtro `patient_id` +
`status='pendente'`, `limit 1`, **sem ordenação**. Com duas consultas `pendente` do mesmo
paciente, veio a de 09/08 em vez da que estava sendo confirmada.

**E o pior — a mensagem mentirosa.** O nó `ENCAMINHAR MENSAGEM` respondia:

> *"Para te atender melhor, encaminhei sua mensagem para a nossa equipe humana. Em alguns
> minutos a gente continua por aqui, tá bem?"*

Ele manda para `$('Normalizar Dados v2').telefone_whatsapp` — **o próprio paciente**, apesar do
nome. Ninguém era notificado, e o nó não grava em `mensagem_logs`, então a recepção não via
nem que a mensagem existiu.

**Correção (13/08/2026, `activeVersion` `6945f2a8-a3df-42de-b4d2-d1d3da606b86`):**
1. `Consulta Encontrada?` → `={{ !!$json.id }}`.
2. `Busca Consulta` → filtra por `id eq {{ $('Get a row').first().json.consulta_id }}`, que é a
   consulta da própria sessão. Sem ambiguidade de ordenação.
3. `ENCAMINHAR MENSAGEM` → texto que não promete o que não acontece.
4. Nó novo `MSG - NAO ENTENDI` ligado no `REGISTRO OUTLIER1`, que era **beco sem saída** (sem
   conexão de saída). SAUDACAO/PERGUNTA/DESCONHECIDO caíam ali e o paciente ficava no silêncio.

**Continua quebrado de propósito (vai no redesenho B — `docs/superpowers/specs/2026-08-13-confirmacao-organica-pela-ia-design.md`):**

- **"ok" e "certo" não confirmam nada.** Em `Valida contexto`, a regra 10 (SAUDAÇÕES) casa
  `^(oi|...|legal|certo|ok|tá bom)$` e vem **antes** da regra 12 (CONFIRMAÇÃO FRACA), que lista
  `sim|vou|beleza|pode ser|ok|tá bom|certo|combinado`. A 10 ganha. As duas respostas mais
  naturais a um lembrete são descartadas como saudação.
- **Mensagens escritas e jogadas fora.** `Análise de evento - Claude` monta 3
  `mensagem_para_usuario` e `Valida contexto` monta 3 `mensagem_para_paciente`. **Nenhum nó
  consome esses campos.** "Sua consulta já foi confirmada anteriormente" nunca chegou a
  ninguém.

**Lição de método:** execução `success` no n8n não quer dizer que o paciente recebeu alguma
coisa. Um ramo que termina num nó sem conexão de saída fecha verde. Ao auditar, olhe
`lastNodeExecuted` — na 83417 ele era `ENCAMINHAR MENSAGEM`, e isso entregou o caso inteiro.

**REGREDIU e foi corrigido de novo em 17/08/2026.** O usuário testou confirmação por WhatsApp,
zero resposta, zero mudança de cor na Agenda — sintoma idêntico ao original. Causa: entre
13/08 (`activeVersion 6945f2a8`, fix aplicado) e 15/08 (`activeVersion 96f84442`, provavelmente
sobrescrito ao publicar o fix do #37 no mesmo dia), os pontos 1 e 2 da correção voltaram ao
estado quebrado — `Consulta Encontrada?` de volta a `{{ $json.length > 0 }}`, `Busca Consulta`
de volta ao filtro `patient_id + status` sem ordenação. Os pontos 3 e 4 (texto do
`ENCAMINHAR MENSAGEM` e o nó `MSG - NAO ENTENDI`) também desapareceram e **não foram
reaplicados** — `ENCAMINHAR MENSAGEM` está com o texto mentiroso de novo e agora também
`disabled: true`; `MSG - NAO ENTENDI` não existe mais no workflow; `REGISTRO OUTLIER1` voltou a
ser beco sem saída. Confirmado nó a nó via `get_workflow_details`, comparando com o que este
documento descreve como correção.

Reaplicados agora (`activeVersion ee3828f6`): ponto 1 (`Consulta Encontrada?` →
`={{ !!$json.id }}`) e ponto 2 (`Busca Consulta` → filtra por
`id eq {{ $('Get a row').first().json.consulta_id }}`). Validado contra dado real: o paciente de
teste tinha duas consultas `pendente` (`9c32cf3a…` Botox 09/08, `f111b1e8…` rotina 18/08) — o
filtro antigo pegaria a errada (Botox); o corrigido usa a da sessão ativa (rotina). **Pontos 3 e
4 continuam pendentes** — não reaplicados por falta da cópia/wiring exato original no diff;
precisam de um texto novo revisado com o usuário antes de ir pro ar, não só copiar o que este
documento resume.

**Lição de método nº2:** este documento registra a correção pela **data em que foi decidida**,
não pelo que está rodando agora. Publicar um workflow por cima de outro (ex.: fix do #37 em
cima de uma versão sem o fix do #36) reverte silenciosamente correções anteriores sem deixar
rastro nenhum no n8n — a única defesa é reconferir nó a nó contra este arquivo antes de confiar
nele, especialmente depois de qualquer redeploy/import de workflow.

## 37. "IA Inativa" não silencia a IA — mata o WhatsApp do paciente, confirmação inclusive

**Status: CORRIGIDO e publicado em 15/08/2026** (`activeVersion dea36506`, 78 nós). Achado por
leitura de código, **nunca observado com paciente real** — porque o cenário que o dispara ainda
não aconteceu (ver "Por que ninguém viu ainda"). A correção também **não** foi exercitada por
conversa real: está provada só por execução da lógica fora do n8n (9 casos, ver o fim desta
seção).

**Sintoma esperado:** paciente com `bot_pausado = true` recebe o lembrete de 24h, responde
"ok", e **nada acontece**. A consulta nunca vira `confirmado`. A execução fecha `success`.

**Causa:** `Valida Expiração` checa `bot_pausado` **antes de tudo** e devolve
`sessao_status: "BOT_PAUSADO"` com `deve_processar: false`:

```js
const paciente = $('Busca Paciente').first().json;
if (paciente && paciente.bot_pausado === true) {
  return [{ json: { ...items[0].json, sessao_status: "BOT_PAUSADO", deve_processar: false } }];
}
```

O Switch `Status da sessão?` tem exatamente três regras — `deve_processar === true`
(*Validada*), `sessao_status === 'EXPIRADA'`, `sessao_status === 'NAO_ENCONTRADA'` — e
**nenhum fallback**. `BOT_PAUSADO` não bate em nenhuma e o item é descartado em silêncio.
Isso é intencional para o AI Agent. O efeito colateral **não** é: o roteiro de confirmação
fica atrás da saída *Validada*, então ele também nunca roda.

Ou seja, o toggle do CRM não significa "a IA não conversa". Significa **"toda mensagem desse
telefone é jogada fora"**, inclusive a resposta a um lembrete que a própria clínica mandou.

**Por que ninguém viu ainda:** os 2 pacientes do banco vieram do bot, e o fluxo do n8n cria
paciente com `bot_pausado = false`. Quem nasce pausado é quem é cadastrado **pela tela** —
`createPaciente()` força `bot_pausado = true` desde `3324bc0` (14/08). Como ninguém tinha
cadastrado paciente pela tela até então, a combinação "paciente pausado + lembrete" nunca
existiu. **Ela passa a existir no momento em que a dona cadastrar a base de pacientes**, que
é o próximo passo declarado do projeto — e aí atinge a base inteira de uma vez.

**Correção aplicada:** `bot_pausado` agora silencia o **AI Agent**, não a resposta a um
lembrete. O gate abre exceção quando existe sessão viva apontando para uma consulta:

```js
const sessaoViva = !!(row && row.expira_em && new Date() <= new Date(row.expira_em));
const confirmacaoPendente = sessaoViva && !!row.consulta_id && row.atendimento_humano !== true;

if (paciente && paciente.bot_pausado === true && !confirmacaoPendente) { /* BOT_PAUSADO */ }
```

O `!!row.consulta_id` é o que impede o vazamento: sem ele, qualquer sessão residual de um
paciente pausado passaria a ser roteada para o roteiro, que cairia no ramo "consulta não
encontrada" e poderia responder a quem a clínica silenciou de propósito. O
`atendimento_humano !== true` garante que takeover humano continua vencendo tudo.

**Prova (não é conversa real — é a lógica publicada rodando fora do n8n, 9 casos):**

| Situação | `sessao_status` |
|---|---|
| pausado + sem sessão (escreve espontaneamente) | `BOT_PAUSADO` |
| pausado + sessão viva **com** `consulta_id` | `ATIVA` ✅ confirma |
| pausado + sessão viva **sem** `consulta_id` | `BOT_PAUSADO` (não vaza) |
| pausado + sessão expirada com `consulta_id` | `BOT_PAUSADO` |
| pausado + `atendimento_humano` | `BOT_PAUSADO` |
| ativo + sem sessão (lead novo) | `NAO_ENCONTRADA` → AI Agent |
| ativo + sessão viva com consulta | `ATIVA` |
| ativo + `atendimento_humano` | `ATIVA_HUMANA` |
| ativo + sessão expirada | `EXPIRADA` |

⛔ **O que continua sem prova:** nenhuma conversa real de WhatsApp exercitou isto. O primeiro
paciente pausado que responder a um lembrete é o teste de verdade — confira em `consultas` se
o status virou `confirmado`.

**Relacionado:** §29 (a correção que introduziu esta checagem e resolveu o problema oposto),
§36 (o roteiro de confirmação em si), §38 ("ok" não confirmava), D-23 (a decisão que depende
desta correção).

## 38. "ok" e "certo" eram saudação, não confirmação — e a regra 12 nunca era alcançada

**Status: CORRIGIDO e publicado em 15/08/2026** (`activeVersion dea36506`). Provado só por
execução da lógica fora do n8n, **não** por conversa real.

**Sintoma:** paciente responde "ok" ao lembrete de 24h e recebe *"Desculpe, não entendi.
Responda: CONFIRMAR / CANCELAR / REMARCAR"*. A consulta não vira `confirmado`. Execução
`success`.

**Causa:** em `Valida contexto`, a regra **10 (SAUDAÇÕES)** vinha antes da **12 (CONFIRMAÇÃO
FRACA)** e as duas listavam as mesmas palavras. A regex da 10 é **ancorada**:

```js
/^(oi|olá|...|legal|certo|ok|tá bom)$/i    // ← casa a mensagem INTEIRA
```

Então "ok" sozinho — que é exatamente como as pessoas respondem — casava na 10 e retornava
`SAUDACAO`. A regra 12, que listava `ok|tá bom|ta bom|certo` justamente para tratar isso,
**era código morto para essas palavras**. `SAUDACAO` não bate em nenhuma regra do `Switch`
(que só conhece CONFIRMADO/CANCELADO/REMARCAR/DESCONHECIDO/MIDIA_SEM_TEXTO) → cai no
`Fallback` → `REGISTRO OUTLIER1` → `MSG - NAO ENTENDI`.

**Correção:** `certo`, `ok` e `tá bom` **removidos da regra 10**. Agora caem na 12 e viram
`CONFIRMADO` (confiança 75). `oi`, `bom dia`, `obrigado`, `valeu`, `legal` e `tudo bem`
continuam saudação de propósito — agradecer não é confirmar.

**Prova (13 casos, lógica publicada rodando fora do n8n):** `ok`, `Ok`, `certo`, `tá bom`,
`sim`, `confirmo`, `👍` → `CONFIRMADO`. `oi`, `bom dia`, `obrigado` → `SAUDACAO`.
`cancelar` → `CANCELADO`. `remarcar` → `REMARCAR`. `quanto custa?` → `PERGUNTA`.

⚠️ **Ao mexer nesta função:** a ordem das regras **é** a lógica. Toda regra ancorada (`^...$`)
colocada acima de uma regra `\b...\b` que compartilha vocabulário torna a de baixo inalcançável
para aquelas palavras. Foi assim que a 12 morreu sem ninguém notar.

⛔ **Sem prova real:** ninguém confirmou consulta por WhatsApp neste projeto **até hoje** (§36).
Isto continua valendo até uma conversa real fechar o ciclo.

## 39. O painel de automações mostrava 4 lembretes, os 2 ligados não enviavam nada

**Status: CORRIGIDO em 15/08/2026** (dado no banco + UI). Achado por print do dono, que leu a
tela ao contrário — e a tela tinha todo motivo para enganar.

**Sintoma:** o painel Automações lista 4 lembretes. Os dois com nome bonito ("Lembrete 24 horas
antes", "Lembrete 2 horas antes") aparecem **ligados**, com ícone e descrição. Os dois com nome
cru (`lembrete_24h`, `lembrete_4h`) aparecem **desligados**, com ícone genérico 📩, parecendo
sobra de teste. Conclusão natural de quem olha: apagar os dois de cima.

**É o inverso.** Os de nome cru são os ÚNICOS que enviam:

| linha | criada | template Meta | enviava? |
|---|---|---|---|
| `reminder_24h`, `reminder_2h`, `reminder_custom` | 04/06/2026 | **null** | **não** |
| `lembrete_24h` → `consulta_amanha` (`en`) | 09/08/2026 | sim | sim |
| `lembrete_4h` → `confirmao_horas_antes` (`pt_BR`) | 09/08/2026 | sim | sim |

**Causa da aparência invertida:** o mapa `tipoLabel` em `automation-components.jsx` só tinha as
chaves `reminder_*`. As `lembrete_*` caíam no fallback `{ titulo: config.tipo_lembrete }` — nome
cru, sem ícone. **A UI premiava visualmente exatamente as configs quebradas.**

**Causa do envio morto:** `disparar-lembretes/index.ts:116` pula qualquer config sem
`meta_template_nome` — lembrete cai sempre fora da janela de 24h da Meta, e ali só passa
template aprovado (§31). Com só as `reminder_*` ativas, **zero lembrete saía**, e nada no painel
denunciava isso. Isso desfez o que o commit `9f6d775` provou ponta a ponta em 09/08.

**Duas mentiras menores que vieram junto:**
- O título era fixo no código e a antecedência vinha do banco: **"Lembrete 2 horas antes" com
  `antecedencia_horas = 4`**. Agora o título não cita horas.
- O campo **"Horário de envio"** era editável e **nunca foi lido** por ninguém — a janela é só
  `agora + antecedencia_horas` (+1h). Removido da UI; a coluna segue no banco.

**Correção:** `lembrete_24h`/`lembrete_4h` reativadas e as 3 `reminder_*` desativadas (UPDATE,
reversível). Na UI, a aba passou a listar **só configs com `meta_template_nome`** — o que o
sistema não consegue enviar não aparece como se fosse enviar.

⚠️ **Regra que fica:** neste painel, "ligado" nunca significou "envia". Ao mexer em lembrete,
confira `meta_template_nome` no banco antes de acreditar no toggle.

⛔ **Sem prova real:** o religamento não foi exercitado — nenhum lembrete novo saiu desde o
UPDATE. A prova é a próxima consulta entrar na janela de 24h e o paciente receber.

**Relacionado:** §31 (só template fora da janela), §10 (lembretes mortos por 48 dias sem ninguém
ver), §38.

## 40. O RAG inteiro é de uma clínica fictícia — e o bot já responde com ele

**Status: ATIVO em produção, sem correção possível por agente** (depende de conteúdo real da
clínica). Achado em 15/08/2026 ao investigar se dava para divulgar preço.

**Sintoma:** nenhum. É esse o problema. O bot responde perguntas específicas com confiança
total, citando valores, convênios, endereço e nomes de profissionais — **de outra clínica, que
não existe.**

**Causa:** `clinics.name` é `Clinica Anaruthe` (cliente real, e é esse nome que o prompt
interpola). Os 7 documentos de `documentos_clinica` descrevem a **"Clínica Sorriso & Essência"**,
e o próprio texto do documento 20 diz: *"é uma clínica fictícia"*. São dados de teste que nunca
foram trocados.

O que está no ar sendo dito para paciente real:

| Tema | O que o RAG devolve |
|---|---|
| Preços | Limpeza R$ 180 · Clareamento R$ 950 · Invisalign R$ 8.500 · Botox R$ 1.200 · Implante R$ 3.200 |
| Convênios | OdontoPrev, SulAmérica Odonto, Hapvida, Bradesco Saúde Dental, Uniodonto |
| Profissional | "Dra. Mariana Albuquerque — **CRO-PE 15422**" (registro profissional inventado) |
| Endereço | Avenida das Palmeiras, 1450 — Centro, Petrolina/PE |
| Emergência | (87) 99911-4455 |

**Por que ninguém viu:** o prompt manda usar o RAG em toda pergunta específica, e a resposta
volta bem escrita e plausível. Não há erro, não há log, e quem testou conhecia o sistema — não
ia conferir se o CRO existe. A ordem de gravidade prática é convênio > preço > CRO: o paciente
que pergunta "aceita OdontoPrev?" recebe "sim", falta ao trabalho e descobre no balcão.

**Correção:** substituir os 7 documentos pelos dados reais da Anaruthe. Não dá para um agente
fazer — é conteúdo que só a clínica tem.

⚠️ **Enquanto os documentos forem fictícios, NÃO ligue divulgação de preço** e considere que
toda resposta específica do bot é potencialmente falsa. O `[PREÇO]` do prompt já autoriza citar
valor do documento — a permissão existe, o que falta é o documento estar certo.

**Relacionado:** §15 (o chunking da tabela de preços não é recuperado) — é problema real, mas
só passa a importar DEPOIS que os documentos forem verdadeiros. Hoje é o menor dos dois.

## 41. A antecedência do lembrete é configurável; o texto que o paciente recebe, não

**Status: LIMITE CONHECIDO, não corrigido** (depende de template novo na Meta, que o dono
assumiu). Achado em 15/08/2026 ao liberar a antecedência livre (D-28).

**Sintoma que vai acontecer:** alguém muda a antecedência do lembrete curto de 4h para 2h no
painel, o card passa a dizer "Lembrete 2 horas antes", o disparo realmente sai 2h antes — e o
paciente recebe **"Sua consulta é daqui a 4 horas"**.

**Causa:** o corpo aprovado do template é fixo. Conferido direto na Graph API:

```
confirmao_horas_antes (pt_BR, APPROVED)
"Olá {{nome}}! Sua consulta é daqui a 4 horas ({{hora}}) com {{medico}}.

Te esperamos! 😊"
```

As "4 horas" são **texto**, não parâmetro — os params declarados são só `nome`, `hora`,
`medico`. Fora da janela de 24h a Meta só entrega template aprovado, então não há como o
Cliniflow reescrever isso em tempo de envio.

**Confusão extra:** `config_automacao.template_mensagem` tem o mesmo texto e É editável na tela,
com preview. Mas ele alimenta só o histórico do CRM (`disparar-lembretes/index.ts:111`) — o que
o paciente recebe é o template da Meta. Editar ali conserta a aparência e não conserta o envio.

**Correção quando quiserem antecedência de verdade livre:** aprovar na Meta um template com as
horas como variável (`daqui a {{horas}} horas`) ou sem citar horas, apontar
`meta_template_nome`/`meta_template_params` para ele e só então usar valores diferentes de 4.

**Para ler o corpo real de um template sem expor o token** (mesma receita do §31, agora com o
detalhe de que o `net.http_get` é assíncrono — o `_http_response` não existe no mesmo statement):

```sql
-- 1) dispara e guarda o id
with c as (select meta_waba_id w, meta_access_token t from clinics where id = '<clinic>')
select net.http_get(
  url := 'https://graph.facebook.com/v20.0/' || c.w || '/message_templates?fields=name,language,status,components',
  headers := jsonb_build_object('Authorization', 'Bearer ' || c.t)
) from c;
-- 2) num segundo statement, lê o corpo
select status_code, jsonb_pretty(content::jsonb -> 'data') from net._http_response where id = <id>;
```

**Relacionado:** §39 (a família toda: painel dizendo uma coisa e o WhatsApp fazendo outra) e
D-28 (a decisão que abriu o campo).

---

## 42. `node --check` não valida NADA em arquivo `.jsx` — nem tenta ⚠️ ATIVO

**Sintoma:** um plano de implementação manda rodar `node --check arquivo.jsx` como gate de
sintaxe depois de editar um `.jsx` do CRM. O comando falha com `ERR_UNKNOWN_FILE_EXTENSION`
(Node recusa a extensão antes mesmo de abrir o arquivo) — ou, se você renomear para `.js` para
contornar isso, falha com `SyntaxError: Unexpected token '<'` na primeira tag JSX.

**Causa:** JSX nunca foi JavaScript válido. `node --check` roda o parser puro do V8, que não
sabe o que fazer com `<div>` dentro de código. Isso vale pros 5 arquivos de componente do CRM
(`cliniflow-components.jsx`, `patients-components.jsx`, `reports-components.jsx`,
`automation-components.jsx`, `tweaks-panel.jsx`) — todos usam JSX puro, sem pré-compilação.

**Por que isto engana:** planos anteriores (`docs/superpowers/plans/2026-08-05-*.md`) listam
`node --check` como passo de verificação com "Expected: sem output" — nunca foi validado que o
comando de fato passa; nenhuma sessão registrou o erro. Confirmado em 15/08/2026 rodando de
verdade: falha sempre, em qualquer um desses arquivos, com ou sem edição.

**O gate de sintaxe real deste projeto:** o Babel standalone no navegador. Se um `.jsx` tiver
erro de sintaxe, o `<script type="text/babel">` falha ao transpilar e o console do navegador
mostra o erro — a tela fica em branco ou o React não monta. Suba a cópia de teste (receita nos
planos de UI) e confira o console, não tente `node --check`.

**Não faça:** copiar o passo "`node --check <arquivo>.jsx`" de um plano antigo achando que já
foi provado — nenhum foi. Se quiser um gate de sintaxe fora do navegador, seria preciso Babel
CLI ou `@babel/parser` com o plugin JSX — nenhum dos dois está instalado neste projeto hoje.

## 43. Conta nova ⇒ clínica NOVA e VAZIA — o onboarding nunca liga alguém à clínica existente ⚠️ ATIVO

**Sintoma (OBSERVADO em 17/08/2026, num teste que criou e depois apagou a conta):** alguém cria
uma conta no CRM para a *mesma* clínica
que já existe, cai no "Cadastre sua clínica", digita o nome e entra num CRM **vazio** — sem
paciente, sem consulta, sem conversa. Parece perda de dados. Não é: os dados estão na clínica
antiga, e a conta nova está numa clínica nova.

**Causa:** `registrar_clinica` (D-12) só recusa se `auth.uid()` **já** tiver linha em
`clinic_users`. Duas contas diferentes pedindo o mesmo nome de clínica geram **duas** linhas em
`clinics` — o nome não é único, e não existe fluxo de "entrar numa clínica que já existe"
(convite, código, domínio de e-mail: nada). Com o autocadastro por e-mail e senha (D-31), essa
porta ficou aberta para qualquer um.

**Agravante:** o `clinic_id` da Anaruthe (`7936105a-b198-419f-bad7-a65e2e60725b`) está **cravado
no n8n**. Mesmo que a clínica nova pareça funcionar no CRM, o WhatsApp continua gravando tudo na
antiga.

**Correção:** não passe pelo onboarding. Crie a conta (ou peça para a pessoa criar), e depois
vincule à clínica que já existe:
```sql
insert into clinic_users (user_id, clinic_id)
select u.id, '7936105a-b198-419f-bad7-a65e2e60725b'
from auth.users u where u.email = 'email-da-pessoa@exemplo.com';
```
Só então ela entra — `auth_clinic_id()` devolve a clínica certa e o onboarding não aparece.

**Cuidado ao limpar:** se uma clínica duplicada for criada por engano, apagar a linha de `clinics`
faz CASCADE em `clinic_users` e desloga o usuário de volta pro onboarding (§28). Antes de apagar,
confira se a clínica errada não recebeu dado — a varredura que lista toda tabela com `clinic_id`
e conta as linhas está no commit deste parágrafo (`query_to_xml` sobre `pg_attribute`).

**O lado bom que apareceu no mesmo teste:** com a sessão da clínica nova, o CRM mostrou 0
pacientes e 0 consultas enquanto a Anaruthe tinha 2 e 3. É a **primeira prova real** de que o RLS
isola de verdade a leitura dessas duas tabelas entre clínicas — até então o multi-tenant era só
escrito, nunca exercitado.

---

## 44. O autofill do Chrome esconde bug de contraste na tela de login ⚠️ ATIVO

**Sintoma:** o dono abre o site publicado no tema claro, tira print, tudo parece certo — campos
de e-mail e senha com fundo claro e texto legível. Num navegador **sem senha salva** (o da
recepção, o do celular da clínica) os mesmos campos aparecem **pretos**, com o texto digitado em
cinza-escuro por cima. Contraste medido: **2,2:1** (o mínimo legível é 4,5:1).

**Causa:** `LoginScreen` e `OnboardingClinica` cravavam `background:'#161616'` — literal do tema
escuro — em vez do token `var(--supabase-bg-input)`, que troca para `#eef0f2` no claro. O texto
usava token (`--supabase-text-light`, que no claro vira `#4b5563`, escuro). Resultado: fundo
preso no escuro + texto que acompanha o tema = cinza sobre preto.

**Por que o print mentiu:** o Chrome pinta campo autopreenchido com fundo azul-claro próprio,
que **sobrepõe o inline style**. Quem já logou uma vez naquele navegador nunca vê o bug. Quem
está criando conta pela primeira vez — exatamente o público da tela — vê sempre.

**Correção:** trocado pelos tokens (`var(--supabase-bg-input)`), 3 ocorrências. Verificado com
`getComputedStyle` nos dois temas: claro `#eef0f2`/`#4b5563` (≈7,5:1), escuro inalterado.

**Não faça:** validar tema claro só por print do dono. Meça com `getComputedStyle` no navegador,
ou abra numa janela anônima — sem autofill, sem senha salva, como o usuário real chega.

**Onde mais isso pode estar:** qualquer literal hex em `style={{}}` nos `.jsx`. Procure por
`grep -n "'#[0-9a-f]\{6\}'" cliniflow-export/*.jsx cliniflow-export/index.html` antes de dar o
tema claro por pronto.

---

## 45. `clinics` "fechada" por RLS sem policy escondia GRANT total, incluindo `meta_access_token` ⚠️ CORRIGIDO EM 18/08/2026

**Sintoma:** ao planejar um toggle simples ("bot ativo") lido/editado pelo CRM, checagem de
`information_schema.column_privileges` mostrou `anon` e `authenticated` com SELECT/INSERT/UPDATE
em **todas** as colunas de `clinics` — inclusive `meta_access_token` (o token de acesso da Meta
Cloud API) — desde a criação da tabela.

**Por que ninguém tinha visto:** `clinics` tem RLS ligado e **zero policies**. Com RLS on e sem
policy, Postgres nega toda linha por padrão — então nenhum dado vazava até agora, mas por
acidente de omissão, não por design. É a mesma família do §16/§17 (tabela "fechada" que não está,
por baixo), só que aqui o gatilho não foi alguém abrir uma view ou esquecer o segundo GRANT — foi
literalmente nunca ter existido policy nenhuma nessa tabela.

**O risco que isso abriria:** qualquer policy nova em `clinics` — mesmo uma inocente, tipo "deixa
a própria clínica ler sua linha" — reabriria acesso a **todas** as colunas de uma vez, porque RLS
só filtra linha, não coluna. Os GRANTs largos por baixo ficariam ativos de novo. Com autocadastro
público (D-31), isso significa: qualquer pessoa cria conta, e se algum dia uma policy genérica
"minha própria clínica" for adicionada sem cuidado, ela lê o token do WhatsApp da própria clínica
pelo `fetch` do browser — não é vazamento cross-tenant, mas ainda é o **token de produção da API
da Meta** parando num app com autocadastro aberto.

**Correção aplicada (migração `clinics_bot_ativo_kill_switch`):** antes de abrir qualquer policy,
`REVOKE ALL` de `anon` e `REVOKE` das colunas sensíveis (`cnpj`, `rules_config`,
`telefone_notificacao`, `meta_access_token`, `meta_phone_number_id`, `meta_waba_id`) de
`authenticated`. Só depois `GRANT SELECT (id, name, bot_ativo)` e `GRANT UPDATE (bot_ativo)`, e só
então as duas policies (`clinics_select_own`, `clinics_update_bot_ativo`, ambas
`id = auth_clinic_id()`).

**Não faça:** adicionar uma policy em `clinics` sem antes checar `information_schema.column_privileges`
para essa tabela. RLS e GRANT são camadas independentes — fechar uma sem a outra não fecha nada.

**Verificado:** `anon` sem nenhuma linha em `column_privileges` para `clinics`; `authenticated`
só com SELECT/UPDATE em `bot_ativo` (mais SELECT em `id`/`name`) — as colunas sensíveis mantêm só
`REFERENCES`, que não é exposto via PostgREST.

---

## 46. Apagar clínica NÃO apaga paciente e consulta — vira registro fantasma ⚠️ ATIVO

**Sintoma:** você apaga uma clínica de teste com `delete from clinics where id = …`, confere e o
banco parece limpo — mas `select count(*) from patients` devolve **mais linhas do que antes do
teste**. Nenhum erro, nenhuma FK violada. Pela tela do CRM os registros **não aparecem em lugar
nenhum**, em nenhuma conta.

**Causa:** as FKs de `clinic_id` não são todas iguais (medido em 18/08/2026):

| CASCADE (some junto) | SET NULL (fica órfão) |
|---|---|
| `clinic_users` · `config_automacao` · `conversations` · `profissionais` | **`patients`** · **`consultas`** |

Com `clinic_id` NULL, a policy `clinic_id = auth_clinic_id()` nunca casa — o registro fica
invisível para toda conta, inclusive a sua. Ele não sumiu: só não tem mais dono.

**Por que é pior que sujeira:** `Busca Paciente` no n8n casa **só por telefone**, sem filtrar
`clinic_id` (§26). Um paciente órfão com telefone real continua sendo encontrável pelo bot — de
qualquer clínica. Órfão com dado de paciente de verdade é vazamento esperando acontecer.

**Correção (rode SEMPRE depois de apagar qualquer clínica):**
```sql
delete from consultas where clinic_id is null;
delete from patients  where clinic_id is null;
```

**Não faça:** concluir "limpei" só porque `clinics` e `auth.users` voltaram à contagem certa —
foi exatamente esse o erro. Confira `count(*) where clinic_id is null` nas duas tabelas.

**Em aberto:** ninguém decidiu se `SET NULL` é intencional (preservar histórico de paciente se a
clínica sai do sistema) ou descuido. Enquanto não decidir, a limpeza é manual.
