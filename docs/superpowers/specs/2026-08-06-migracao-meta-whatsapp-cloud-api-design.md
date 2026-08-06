# Especificação: Migração do canal WhatsApp — Evolution API → Meta WhatsApp Cloud API

**Data**: 06 de Agosto de 2026
**Status**: Rascunho para revisão do usuário (decisões de arquitetura já fechadas em sessões anteriores — D-14 a D-18 — este spec consolida e completa o que falta)
**Prazo**: sem data fixa (confirmado pelo usuário em 06/08/2026) — o corte de produção só acontece quando o template estiver aprovado pela Meta **e** o teste ponta a ponta passar. Não force uma janela.

---

## 1. Visão geral do objetivo

O Cliniflow atende pacientes via WhatsApp usando a **Evolution API** (self-hosted, não oficial) desde o lançamento (05-06/08/2026, clínica da tia do usuário — ver correção em `AGENTS.md`: "irmã" e "tia" são a mesma clínica). Esta migração troca esse canal pela **Meta WhatsApp Cloud API** (oficial), mantendo intacta toda a lógica já construída em cima do Supabase: RAG, debounce, detector de silêncio, RLS, CRM.

**Por que migrar** (contexto, não decisão nova): API não oficial tem risco de banimento e não escala para múltiplas clínicas com suporte formal. A Cloud API é o caminho oficial da Meta para WhatsApp Business.

**O que já está provado, não é mais design** (checkpoints de 04-06/08/2026, ver `AGENTS.md` "Estado atual"):
- App `Agente_Wpp` criado no Meta for Developers (App ID `1653660183429533`), produto WhatsApp adicionado, número de teste gratuito funcionando.
- Webhook de recebimento validado pela Meta de verdade (handshake `hub.challenge`), workflow temporário `Meta WhatsApp - Verificação de Webhook (temporário)`. Armadilha resolvida: `ARMADILHAS.md` §20 (dot-notation nos query params).
- Envio real provado via workflow próprio (não mais só pelo assistente da Meta): nó HTTP Request → `POST /{phone-number-id}/messages` da Graph API, retornou `wamid...` real. Workflow temporário `Meta WhatsApp - Teste de Envio (temporário)`. Armadilhas resolvidas: `ARMADILHAS.md` §21 (`=` duplicado em expressão, header `Authorization` trocado).
- Template de lembrete **já submetido pelo usuário à Meta para aprovação** (06/08/2026) — dependência externa mais lenta, já em andamento. Este spec não bloqueia nisso.

**Não-objetivo explícito**: isto não reabre nenhuma decisão já fechada (D-13 a D-18 em `docs/DECISIONS.md`). Não é redesign do CRM, não muda o fluxo conversacional (RAG, debounce, detector de silêncio) — só troca o canal de transporte da mensagem.

---

## 2. Escopo e não-escopo

**Dentro do escopo:**
- Novo fluxo n8n de **recebimento** (webhook Meta → mesma pipeline de debounce/AI Agent/RAG que já existe).
- Novo fluxo n8n de **envio** (Graph API via HTTP Request, substituindo a chamada à Evolution).
- Colunas novas em `clinics` para credenciais Meta por clínica (D-17, D-18).
- Adaptação de `disparar-lembretes`/`enviar-whatsapp` (Edge Function) para usar **template aprovado** quando a mensagem for fora da janela de 24h (D-16).
- Plano de corte único, sem tráfego real simultâneo nos dois canais (D-15), como **substituição definitiva**, não alternância permanente (D-19).
- Remoção do código/config da Evolution assim que o corte for confirmado funcionando (D-20) — sem período de fallback estendido.
- Widget "Status do bot" do CRM (`status-evolution`, `ARMADILHAS.md` §11) — precisa de equivalente para Meta ou de generalização.

**Fora do escopo (não fazer sem decisão nova):**
- Migrar o número atual/manual da clínica (D-14 — fica no app comum do WhatsApp Business, intocado).
- Suportar duas clínicas em canais diferentes simultaneamente — hoje existe uma clínica em produção; a arquitetura é desenhada para multi-tenant nas credenciais (D-17, D-18), mas coexistência permanente de provedores foi explicitamente rejeitada (D-19).
- Qualquer mudança no RAG, debounce, RLS, ou no CRM frontend além do widget de status.
- Manter a Evolution API disponível como rede de segurança de longo prazo — D-20 já fecha isso: ela sai assim que o corte for confirmado, não fica desligada "só por via das dúvidas".

---

## 3. Arquitetura alvo

### 3.1 Credenciais por clínica (D-17, D-18 — já decidido)

Novas colunas em `public.clinics` (nullable, mesmo padrão de `evolution_instance`/`evolution_apikey`):

```sql
ALTER TABLE public.clinics
  ADD COLUMN meta_access_token   text,   -- token do usuário de sistema (D-18: compartilhado por ora, mas por clínica no banco)
  ADD COLUMN meta_phone_number_id text,  -- ID do número (Configuração da API do App — NÃO o WABA ID, ver ARMADILHAS.md §22)
  ADD COLUMN meta_waba_id         text;  -- ID da WhatsApp Business Account (usado pra templates, não pro envio)
```

Lidas por execução no n8n via expressão (`{{ $('Busca Clinica').item.json.meta_access_token }}`), nunca fixadas num nó de credencial — mesmo padrão já usado para `evolution_apikey`.

**Achado ao ler o banco/n8n de verdade em 06/08/2026:** existem dois caminhos de leitura de credencial hoje, e só um precisa de mudança de código além das colunas:
- `Busca Clinica` (workflow `Evo-Go`, inbound + resposta do AI Agent) é um nó Supabase `get` genérico — devolve **todas** as colunas de `clinics` automaticamente, incluindo as novas, sem precisar de alteração.
- `process_secretary_message` (RPC `SECURITY DEFINER`, chamada pelo nó `Busca Credenciais e Trava (RPC)1` no workflow `Cliniflow - Enviar Mensagem CRM`, envio manual da recepção) tem `RETURNS TABLE(telefone, mensagem, evolution_apikey, evolution_instance)` **explícito** — essa função precisa ser recriada com as colunas Meta na assinatura, ou o envio manual nunca vê as credenciais novas (ver Task 1/Step 5 do plano).

### 3.2 Sem coluna de canal por clínica — substituição direta (D-19, fechado em 06/08/2026)

**Decisão fechada:** não existe `clinics.canal_whatsapp`. O usuário confirmou que a Evolution deixará de existir no sistema — não é coexistência permanente entre dois provedores, é substituição completa. O corte (D-15) acontece a nível de **workflow/nó**, não de dado por linha: o nó de envio da Evolution é trocado pelo nó Meta diretamente (Task 8 do plano de implementação), sem `Switch`/`If` por canal convivendo no workflow.

**Reabrir quando:** se um dia fizer sentido rodar clínicas em provedores diferentes ao mesmo tempo (não é o cenário de hoje, uma clínica só em produção), essa decisão volta à mesa — ver D-19 em `docs/DECISIONS.md`.

### 3.3 Fluxo de recebimento (inbound)

Novo workflow de produção `Meta WhatsApp - Producao` (D-21, a nascer do que foi provado no temporário `Meta WhatsApp - Verificação de Webhook`), publicado, `Active`, path a definir (usuário entrega a URL própria da Meta em 07/08/2026 — ver seção 7).

Pipeline reaproveitada **sem mudança de lógica**, só troca a origem do payload:
1. Webhook recebe `POST` da Meta (payload de mensagem, formato diferente do payload da Evolution — precisa de um nó de normalização novo equivalente a `Normalizar Dados v2`, mapeando o payload da Meta para o mesmo formato interno que `Centraliza Dados`/debounce/AI Agent já esperam).
2. Handshake `GET` de verificação continua ativo no mesmo path (a Meta reverifica periodicamente) — reaproveita a correção do §20 (`hub.challenge` via colchete, resposta em texto puro). **Confirmado contra o webhook de produção real da Evolution (leitura direta em 06/08/2026):** o nó `Webhook` do `Evo-Go` usa `authentication: basicAuth`; o webhook Meta **não** usa — a autenticação do lado da Meta é o próprio handshake `hub.verify_token`, não credencial HTTP básica. Não copiar o padrão `basicAuth`.
3. **Identificação da clínica:** o inbound da Evolution (`Busca Clinica`, workflow `Evo-Go`) filtra `clinics` por `evolution_instance = {{ instancia recebida }}`. O equivalente Meta filtra por **`meta_phone_number_id`**, lido de `entry[].changes[].value.metadata.phone_number_id` no payload — é o campo que identifica pra qual número da clínica a mensagem chegou.
4. Dali em diante: debounce, AI Agent, RAG, gravação em `mensagem_logs` — **inalterado**.

### 3.4 Fluxo de envio (outbound)

Dois pontos de saída existentes hoje chamam a Evolution e, no dia do corte (D-19: substituição direta, não branch permanente), têm o nó de chamada **trocado** por Meta:
- `Envia Resposta do Agent` (workflow principal, resposta da IA).
- `Enviar via Evolution API1` (workflow `Enviar Mensagem CRM`, envio manual da recepção).
- Edge Function `enviar-whatsapp` (lembretes, chamada por `pg_cron`).

Até o corte, a versão Meta desses nós é construída e testada **isolada** (workflow/cópia de teste, não nos nós de produção — D-15), reaproveitando a configuração já provada no teste manual. Para essa versão, replicar o nó provado no teste (`ARMADILHAS.md` §21): `HTTP Request` → `POST https://graph.facebook.com/v20.0/{{ $json.meta_phone_number_id }}/messages`, header `Authorization: Bearer {{ $json.meta_access_token }}`, body:
```json
{
  "messaging_product": "whatsapp",
  "to": "{{ $json.destinatario }}",
  "type": "text",
  "text": { "body": "{{ $json.mensagem }}" }
}
```
sem `=` extra dentro dos campos já em modo expressão (armadilha já paga).

**Mensagem com aspas/quebra de linha:** aplicar o mesmo cuidado do `ARMADILHAS.md` §5b (`JSON.stringify` no corpo, não interpolação direta) — o bug daquela armadilha era específico da Evolution, mas o risco (JSON inválido por caractere não escapado) é genérico a qualquer `HTTP Request` montando JSON por expressão de texto.

### 3.5 Lembretes fora da janela de 24h (D-16)

`disparar-lembretes`/`enviar-whatsapp` precisa saber se a última mensagem do paciente foi há mais ou menos de 24h:
- **Dentro da janela:** texto livre, como hoje.
- **Fora da janela:** obrigatório usar o template aprovado (`type: "template"` em vez de `type: "text"` no body da Graph API), com as variáveis do template preenchidas (nome do paciente, data/hora da consulta — depende do texto exato submetido pelo usuário).

**Bloqueado por dependência externa:** o corpo exato desse branch só pode ser implementado depois que o template for aprovado e o usuário confirmar o texto final e os nomes das variáveis (a Meta pode pedir ajustes no texto antes de aprovar).

### 3.6 Status do bot por canal

`status-evolution` (Edge Function, `ARMADILHAS.md` §11) hoje só consulta a Evolution. Duas opções:
- Trocar `status-evolution` por uma versão que consulta o endpoint de saúde do número via Graph API (Meta) em vez do endpoint da Evolution — coerente com D-19 (substituição, não seletor por canal).
- Deixar como está até o corte acontecer e só então trocar, junto da Task 8 do plano.

**Recomendação:** não bloquear o corte por isso — é observabilidade, não funcionalidade crítica. Fica como item do plano, mas de prioridade menor que inbound/outbound/lembretes.

---

## 4. Testes antes do corte (D-15 — isolamento total)

Nenhum paciente real passa pelo canal Meta antes do corte. Toda validação usa o número de teste gratuito do App `Agente_Wpp` e os workflows temporários (ou as versões de produção ainda **inativas**):

1. Handshake de webhook revalidado no path de produção (não só no temporário).
2. Mensagem de teste enviada do número de teste → recebida pelo workflow → debounce → AI Agent responde → resposta chega de volta no WhatsApp real do número de teste.
3. Envio manual simulando o CRM (inserir em `mensagem_logs` como faria a recepção) → trigger → workflow → Graph API → `wamid` recebido.
4. Pelo menos uma execução do branch de lembrete fora da janela, contra o template aprovado (depende da seção 3.5).
5. Verificar `logs_erro`/`detectar_silencio()` continuam vendo esse canal (a arquitetura de observabilidade do D-7/D-8 não é específica de provedor, mas confirmar que nada assume Evolution implicitamente).

Só depois de 1-3 passarem (4 também, se o template já estiver aprovado a essa altura) é que o corte (seção 5) é cogitado.

---

## 5. Corte de produção (D-15, D-19, D-20)

No dia decidido pelo usuário:
1. Trocar, via `update_workflow` + `publish_workflow`, o nó de envio da Evolution pelo nó Meta (já validado isolado) nos dois workflows de outbound — substituição direta, não coexistência.
2. Desativar (`Active: false`) o trigger/webhook de recebimento da Evolution.
3. Ativar (`Active: true`) o workflow Meta de recebimento em produção (`Meta WhatsApp - Producao`, D-21), se ainda não estava.
4. Observar `mensagem_logs`/`logs_erro` nas primeiras interações reais.
5. **Assim que confirmado funcionando** (D-20): remover os nós/config específicos da Evolution dos workflows. Não é uma janela de observação estendida — é "funcionou, tira fora".

**Rollback:** só existe entre os passos 4 e 5 — nesse intervalo, reverter a troca do passo 1 e reativar o trigger Evolution é rápido (minutos, sem redeploy). **Depois do passo 5, não há rollback rápido**: reverter significa reconstruir a integração Evolution a partir do histórico do git, não reativar algo pronto. Isso eleva a importância dos testes da seção 4 — o corte precisa estar bem testado *antes*, porque a rede de segurança pós-corte é deliberadamente curta.

---

## 6. Riscos e dependências

| Risco | Mitigação |
|---|---|
| Aprovação de template demora ou é rejeitada | Já submetido, iniciado cedo (dependência mais lenta). Se rejeitado, ajustar texto e resubmeter — não é bloqueio definitivo. |
| Token de usuário de sistema não alcança o WABA certo | `ARMADILHAS.md` §22 — confirmar em Business Settings → Usuários do sistema quais ativos estão atribuídos antes de qualquer teste. |
| Payload da Meta difere do da Evolution em algum campo não previsto | Só se descobre testando de verdade (seção 4) — não assumir simetria total com o payload documentado. |
| Corte único falha no meio (paciente manda mensagem durante a troca) | Janela de corte deve ser curta e fora de horário de pico; se a clínica tem horário de menor movimento, preferir esse. |
| D-20 encurta a janela de rollback (Evolution sai do código logo após o corte) | Testes da seção 4 precisam estar completos e passando **antes** do corte — não há margem para "corrigir em produção" depois da limpeza. |

---

## 7. Decisões — status em 06/08/2026

Resolvidas na sessão de 06/08/2026 (ver `docs/DECISIONS.md`):
1. ✅ **D-19** — sem `clinics.canal_whatsapp`; substituição direta.
2. ✅ **D-20** — Evolution removida do código assim que o corte for confirmado, sem período de fallback.
3. ✅ **D-21** — workflow de produção se chama `Meta WhatsApp - Producao`.

Ainda pendente:
4. **Path do webhook de produção** — o usuário vai entregar isso junto com a URL própria da Meta (previsto 07/08/2026). Bloqueia o Step 1 da Task 3 do plano, não bloqueia as Tasks 1-2.
5. Quando o template for aprovado, o usuário precisa colar o texto final e os nomes das variáveis para a seção 3.5 ser implementada (Task 5 do plano).

---

## 8. Arquivos e artefatos afetados (para o plano de implementação)

| Artefato | Natureza da mudança |
|---|---|
| `docs/db/01-schema.sql` | Novas colunas em `clinics` (seção 3.1 — só `meta_*`, sem `canal_whatsapp` por D-19). |
| n8n — workflow novo de recebimento Meta (`Meta WhatsApp - Producao`, D-21) | Novo workflow (nasce do temporário de verificação), normalização de payload equivalente a `Normalizar Dados v2`. |
| n8n — workflow principal (`ZAQ6I2CiBGh8swye`) | Nó `Envia Resposta do Agent` **substituído** pelo nó Meta no corte (D-19) — não convive com branch por canal. |
| n8n — `Enviar Mensagem CRM` (`snHQtmgTKLgQEpqk`) | Nó `Enviar via Evolution API1` **substituído** pelo nó Meta no corte. |
| Edge Function `enviar-whatsapp` | Branch de template quando fora da janela de 24h (bloqueado até template aprovado). |
| Edge Function `status-evolution` | Trocar pelo equivalente Meta no corte — prioridade menor, não bloqueia. |
| `public.process_secretary_message` (`docs/db/02-functions-triggers.sql:79-112`) | `RETURNS TABLE` estendido com as colunas Meta — achado ao ler o banco real (ver seção 3.1). |
| `docs/DECISIONS.md` | D-19, D-20, D-21 já registradas (06/08/2026). |
| Branch `meta-api-migration` | Recriar a partir do master atual (a existente é obsoleta — diverge antes do fechamento de RLS e do tema claro). |

A decomposição em tarefas bite-sized, com passo de teste isolado entre cada uma, fica para o plano de implementação (`writing-plans`).
