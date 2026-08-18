# AGENTS.md — mapa do Cliniflow (leia isto primeiro)

> Índice do projeto. Leia inteiro (é curto de propósito) e depois abra só o doc/arquivo que a
> tarefa exige. **NÃO releia o código todo para se situar.**
>
> O histórico de sessões anteriores saiu daqui em 15/08/2026 (eram ~550 linhas de "Estado
> anterior"). Ele vive no `git log`, que não mente. Este arquivo descreve o AGORA.

## O que é
Atendimento de clínica por WhatsApp. Paciente escreve → webhook da **Meta Cloud API** cai no n8n
→ agente de IA (Gemini + RAG) responde, ou o roteiro determinístico de confirmação atua → tudo
grava no Supabase → um CRM em React (HTML + CDN, sem build step) mostra e deixa a recepção
assumir. Multi-clínica por `clinic_id`. Lembretes saem por Edge Function + `pg_cron`, fora do n8n.

## 🛑 LEIA ANTES DE TOCAR EM QUALQUER COISA

| Armadilha | Por quê |
|---|---|
| **Sistema "parou"? Cheque se o Supabase pausou** | Free tier pausa sozinho e o DNS some. Parece problema de rede/instância. `ARMADILHAS.md` §1 |
| **`update_workflow` NÃO vai para produção** | Escreve no rascunho. Sem `publish_workflow` nada muda. §5d |
| **Telefone tem 2 formatos** | `patients` = 11 díg · `sessoes_ativas`/`mensagem_logs` = 13 díg. Não casam sozinhos. §3 |
| **Não reimporte o JSON do workflow** | O export não tem credenciais. Use o MCP do n8n. §5 |
| **Nó Supabase usa `create`, não `insert`** | `insert` é PostgREST, não n8n. §5e |
| **`cron.schedule` não valida o comando** | Aceita SQL quebrado e só falha ao rodar. Custou 48 dias de lembretes mortos. §10 |
| **Fechar RLS de `consultas` quebra a IA em silêncio** | A tool de agendamento usa chave anon. `docs/plano-auth-rls.md` §3.2 |
| **Tabela fechada ≠ dado protegido** | View/função `SECURITY DEFINER` passa por cima do RLS. `clinics` estava "fechada" e vazava a `evolution_apikey`. §16 |
| **`REVOKE ... FROM PUBLIC` não basta** | O Supabase concede a `anon` por fora. São duas concessões — leia o `proacl` depois. §17 |
| **Mudar o `RETURNS TABLE` de uma RPC reabre o ACL dela** | Exige `DROP`+`CREATE`, e isso apaga os REVOKEs. Reaplique no mesmo script. §23 |
| **Webhook da Meta reenvia a própria mensagem do bot** | `statuses[]` no mesmo endpoint. Sem filtrar, o bot responde a si mesmo em loop. §24 |
| **Fora da janela de 24h só passa TEMPLATE** | Texto livre é recusado (131047). Lembrete é sempre fora da janela. §31 |
| **O idioma do template é o da Meta, não o do texto** | `consulta_amanha` foi aprovado como `en` com corpo em português. §31 |
| **"Ligado" no painel de lembretes ≠ "envia"** | Sem `meta_template_nome` a config é pulada em silêncio. Confira no banco, não no toggle. §39 |
| **Antecedência é configurável; o texto do template NÃO** | `confirmao_horas_antes` tem "4 horas" cravado no corpo aprovado. Mudou para 2h? A mensagem mente. §41 |
| **O RAG é de uma clínica FICTÍCIA** | Preço, convênio, endereço e CRO que o bot cita são inventados. Não ligue divulgação de preço. §40 |
| **`list_tables` mente sobre contagem de linhas** | Reportou 0 numa tabela com 3. Use `count(*)` antes de concluir que está vazia. §32 |
| **Nó Supabase que não acha nada mata o ramo** | Execução fica `success` e para no meio. O `If` seguinte nunca roda. `alwaysOutputData`. §25 |
| **`Busca Paciente` casa só por telefone** | Sem `clinic_id` no filtro, a 2ª clínica pega paciente da 1ª. §26 |
| **`DROP COLUMN` quebra função em silêncio** | plpgsql só valida na execução. E a sonda com UUID falso diz "funciona". §27 |
| **Print do dono no tema claro não prova nada** | Autofill do Chrome pinta o campo e esconde contraste de 2,2:1. Meça, ou abra anônima. §44 |
| **Conta nova sempre cria clínica NOVA e vazia** | Não existe "entrar na clínica que já existe". Vincule por SQL, não pelo onboarding. §43 |
| **Apagar clínica desloga o usuário** | CASCADE em `clinic_users` → CRM cai no onboarding e você cria clínica vazia. §28 |
| **Tabela nova nasce com RLS ligado e SEM policy** | Event trigger `ensure_rls`. Anon lê `[]` com HTTP 200. §13 |
| **Não tire o TTL do buffer de debounce** | Sem ele, falha de envio gruda a conversa velha na nova. §12 |
| **1º login por Google pode cair no onboarding em vez da clínica real** | Só teste com `iagodeoliveirabatista@gmail.com`; se aparecer "Cadastre sua clínica", PARE. §19 |
| **"Bot parou de responder" quase nunca é desconexão** | 503 do Gemini mata a execução e o paciente não recebe NADA. Cheque a execução antes de suspeitar de pausa/toggle. §33 |
| **`retryOnFail` não é aplicável pelo MCP do n8n** | É config de nó, não parâmetro. Só na UI. §33 |
| **RPC que devolve escalar quebra o nó HTTP Request** | `RETURNS uuid` → "not valid JSON". A linha É criada; só a leitura falha. §34 |
| **Memória da IA re-registra pedido a cada mensagem** | Um "Oi" virava pré-agendamento novo. Exija `intencao` também. §35 |
| **Lembrete disparado = bot mudo por 16h** | Sessão em `sessoes_ativas` desvia TUDO pro roteiro de confirmação. §36 |
| **Execução `success` ≠ paciente recebeu algo** | Ramo que morre em nó sem saída fecha verde. Olhe `lastNodeExecuted`. §36 |
| **A ordem das regras em `Valida contexto` É a lógica** | Regra ancorada (`^...$`) acima de uma `\b...\b` que divide vocabulário torna a de baixo inalcançável. §38 |

## Estado atual (15/08/2026)

✅ **15/08 (detalhe no git log e nos §/D citados):** §37 · §38 · D-23 · lembretes
ressuscitados e multi-tenant (§39, `docs/db/09`) · D-26 · D-28 · D-29 · CRM ganhou profissionais,
tema claro e agenda de sábado (D-30, specs em `docs/superpowers/specs/2026-08-15-*`).
⚠️ `dea36506` é **piso** do n8n: voltar para antes dele reabre o §37 e quebra o D-23.
⚠️ `node --check` não valida `.jsx` — o Babel do browser é o gate (§42).

⛔ **O RAG é de uma clínica FICTÍCIA e está no ar** (§40). O dono ficou de produzir o documento
real da Anaruthe. Até lá: não ligue divulgação de preço, e trate toda resposta específica do
bot como potencialmente falsa.

⏸️ **Decidido e NÃO implementado:** D-27 (consultar RAG por especificidade, não por fase da
conversa). Texto pronto lá — aplicar **junto com os documentos reais, na mesma publicação**.

⚠️ **Paciente real já escreveu (17/08), mas o ciclo nunca fechou.** `consulta_amanha` (24h)
nunca enviou; o de 4h provou 1 envio (14/08).

✅ **Lembrete: antecedência virou campo livre** (1–720h, D-28) — ⚠️ **manter em 4h** enquanto o
template for `confirmao_horas_antes` (§41). 🧹 **Legado Evolution apagado** (D-29, ver commit).

⚠️ **§36 REGREDIU e foi corrigido de novo (17/08, `activeVersion ee3828f6`)** — a correção de
13/08 tinha sido sobrescrita por um publish posterior. Reaplicados `Consulta Encontrada?` e o
filtro de `Busca Consulta`; detalhe em `ARMADILHAS.md` §36. **Pendente:** pontos 3 e 4 (texto do
`ENCAMINHAR MENSAGEM` e do `MSG - NAO ENTENDI`) — texto novo precisa de revisão antes do ar.
**Ciclo com paciente real ainda não fechou:** as 2 mensagens de teste rodaram pela versão
quebrada.

✅ **Autocadastro por e-mail e senha (17/08, D-31), exercitado de ponta a ponta** contra o
Supabase real (conta e clínica de teste criadas e apagadas). Cadastro é **público**. ⚠️ **"Confirm
email" está LIGADO** — o `signUp` volta sem sessão e a tela pede o link; o dono ficou de desligar
em Authentication → Providers → Email. 🐛 Junto veio o conserto do §44 (login ilegível no tema
claro). Detalhe em `DECISIONS.md` D-31.

⛔ **Não existe 2ª clínica** — mas o isolamento teve a **1ª prova real** (17/08, durante o teste
do D-31): logado numa clínica recém-criada, o CRM mostrou 0 pacientes e 0 consultas enquanto a
Anaruthe tinha 2 e 3. Vale para a leitura de `patients`/`consultas` via CRM; escrita, Realtime,
conversas e o n8n continuam sem prova. Hoje: 1 clínica (`Clinica Anaruthe`), 1 conta
(`iagodeoliveirabatista@gmail.com`).

### 🏥 Vale para o 1º dia na clínica (revisão de 18/08)
- **Verificado:** entrar, criar conta, cadastrar clínica, ler agenda/pacientes.
- **NUNCA exercitado logado:** cadastrar paciente e criar consulta **pela tela** (o conserto do
  `docs/db/08` só foi testado no papel; os 2 pacientes do banco vieram do bot). Teste isso antes.
- **Bloqueio:** a conta da recepção não pode passar pelo onboarding (§43) — vincule à Anaruthe
  por SQL, senão ela cai numa clínica vazia e acha que "sumiu tudo".
- **Sem "esqueci minha senha"** (não existe tela) e **"Confirm email" ligado** — a 1ª entrada
  depende do link no e-mail e o destravamento depende do dono.
- **Bot ativo + RAG fictício** (§40) e **lembretes ligados** (24h e 4h, §31/§41) disparam sozinhos.
- ⚠️ **`consultas` está VAZIA** (0 linhas em 18/08 03:55 UTC; eram 3 às 20:47 de 17/08). Não fui
  eu — confirme com quem mexeu antes de concluir que sumiu dado.

## 🎯 Próximos passos (comece por aqui)

0. 🔥 **Trocar os 7 documentos do RAG pelos dados reais da Anaruthe** (§40). Hoje o bot responde
   paciente real com preço, convênio, endereço e CRO de uma clínica fictícia — é o único item que
   **já causa dano**, e nenhum agente resolve: depende de conteúdo que o dono ficou de produzir.
   **Aplique o D-27 na mesma publicação.**
1. **Antes de a clínica usar:** criar a conta da recepção, **vincular à Anaruthe por SQL** (§43) e
   cadastrar um paciente + uma consulta pela tela, logado. É o único caminho que a recepção vai
   usar amanhã e o único que ninguém exercitou.
2. **Fechar o ciclo de ponta a ponta, com paciente real.** Aprovar pedido → esperar o lembrete →
   responder "ok" → conferir se `consultas.status` virou `confirmado`. Um teste valida §37, §38,
   §39 e D-23 de uma vez. **É o item mais valioso do projeto agora.**
3. **Revogar `anon` das RPCs `SECURITY DEFINER` e passar o n8n para `service_role`.**
   `append_whatsapp_buffer` e `criar_pre_agendamento` são chamáveis por qualquer um com a chave
   anon, que é pública (vai no `config.js` servido ao browser). §17
4. **Terminar a config externa do Google OAuth** (código e banco prontos — D-12). Falta criar o
   OAuth Client no Google Cloud e colar no Supabase → Providers. Roteiro em `docs/db/05`.
   Testar com `iagodeoliveirabatista@gmail.com` e ler §19 antes.
5. **Decidir preço no RAG** (§15). A busca não traz a tabela de valores e a IA desvia para
   "depende de avaliação". Se é estratégia comercial, feche em `DECISIONS.md`.
6. **LGPD além do RLS.** Faltam aviso de privacidade na 1ª mensagem, base legal para dado
   sensível (art. 11), retenção/expurgo (arts. 15-16) e via de exclusão (art. 18). O bot
   pergunta "o que mais te incomoda" e grava — é dado de saúde. Depende de decisão, não de código.
7. **Envio travado em `sending`**: mensagem que falha nunca mais é reenviável. §5c

## Como rodar
- **CRM:** `cliniflow-export/servir-local.bat` (HTML + React via CDN, sem build). Config em
  `cliniflow-export/config.js`.
- **n8n:** via MCP. `update_workflow` → conferir rascunho → `publish_workflow` → **conferir a
  `activeVersion`**. Rascunho não é produção (§5d).
- **Supabase:** MCP. DDL por `apply_migration`, e todo script fica versionado em `docs/db/`.
  Edge Function por `deploy_edge_function`, preservando `verify_jwt`.
- Se algo "parou": cheque se o projeto Supabase pausou (§1) antes de qualquer outra hipótese.

## Mapa de arquivos

| Preciso mexer em… | Vá para |
|---|---|
| O que já custou horas | `docs/ARMADILHAS.md` |
| Decisões e o que foi rejeitado | `docs/DECISIONS.md` |
| Schema, funções, triggers, RLS | `docs/db/` (numerados na ordem de aplicação) |
| Login / fechamento de RLS | `docs/plano-auth-rls.md` · executar: `docs/db/04` |
| Frontend do CRM | `cliniflow-export/` |
| Edge Functions | `cliniflow-export/supabase/functions/` |
| Specs e planos | `docs/superpowers/` |

**IDs úteis:** n8n `ZAQ6I2CiBGh8swye` — nome real **"Project Clinica - Migração para Meta"**,
**78 nós**, `activeVersion ee3828f6` (corrente) · Supabase `mxvaufkqijdkapvtkvee` · clínica única
`7936105a-b198-419f-bad7-a65e2e60725b` (`Clinica Anaruthe`)

## Regras para agentes (CONTRATO)
1. **Antes de codar:** leia `docs/DECISIONS.md` (o que já foi rejeitado) e `docs/ARMADILHAS.md`.
2. **Confira a realidade:** `git log --oneline -10` e `git status --short`. Trabalho solto de
   outro agente? **PARE e pergunte ao usuário.**
3. **Nunca commite segredos.** `.mcp.json` tem o PAT do Supabase e o JWT do n8n.
4. **Ao terminar (obrigatório):** commite · atualize "Estado atual" e "Próximos passos" aqui ·
   grave armadilha/decisão nova nos docs.
5. **Honestidade:** "publicado" ≠ "funciona". Só marque ✅ o que você **viu rodando**, e diga
   explicitamente o que não testou.
6. **Mudanças cirúrgicas:** não refatore o que não foi pedido.
7. **Teto de ~100 linhas FORA a tabela de alerta.** A tabela cresce com o que doeu e não se
   corta — o resto sim: passou do teto, é detalhe demais, mova para um doc e aponte daqui.
   Histórico vai no commit, nunca aqui. (Hoje: 169 no total, ~127 fora a tabela — **ainda acima
   do teto**. Em 18/08 cortei 19 e acrescentei 17: o recital de 15/08 virou 3 linhas e o §36 foi
   comprimido pro `ARMADILHAS`. Continue cortando — o próximo alvo é "Como rodar".)
