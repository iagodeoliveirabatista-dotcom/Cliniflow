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

**Armadilha extra encontrada no meio da correção:** `evolution_api_reference.md` (§C)
documenta a resposta como `data.connected` (minúsculo), mas a instância viva devolve
`data.Connected` (maiúsculo). A função lê as duas chaves (`Connected ?? connected`) para não
repetir o erro. **Se for usar esse endpoint em outro lugar, confira a resposta real antes de
confiar na doc.**

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
