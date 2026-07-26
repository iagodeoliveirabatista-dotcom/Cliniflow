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

## 7. Edge function grava coluna que não existe mais

**Sintoma:** lembrete é enviado mas a sessão de 16h não abre; paciente responde
"CONFIRMAR" e cai no fluxo do agente de vendas em vez do fluxo de confirmação.

**Causa:** `enviar-whatsapp` (deployada, v7) faz upsert em `sessoes_ativas` com
`google_event_id` — coluna **removida** do schema. O Postgres devolve
`42703: column "google_event_id" does not exist` e o upsert inteiro falha.

A tabela hoje tem `consulta_id` para esse papel.

**Status:** ABERTO. Correção: trocar `google_event_id` por `consulta_id` e
redeployar a função.

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
