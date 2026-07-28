# DECISIONS.md — decisões do projeto

> Decisões EM ABERTO no topo (é o que precisa de escolha). Ao fechar uma, mova para "Tomadas"
> com data e o porquê. **Nunca implemente uma decisão aberta sem confirmar com o usuário.**

---

## 🟡 Em aberto

### D-OPEN-1 — Quando fechar o acesso aos dados de paciente
**Contexto:** `patients`, `consultas` e `mensagem_logs` estão com RLS `USING (true)`. A chave anon
é pública (está no `config.js` servido ao browser). Verificado em 26/07/2026: um `GET
/rest/v1/patients` com essa chave devolveu pacientes reais.

Fechar exige login no CRM, que não existe. Fechar antes do login derruba a tela.

| Opção | Prós | Contras |
|---|---|---|
| Login antes da clínica | Fecha de verdade | Atrasa a implantação |
| Implantar e fechar depois | Não atrasa | Dados reais de paciente expostos no intervalo |

**Recomendação:** login antes de atender paciente real. O plano está pronto
(`docs/plano-auth-rls.md`), a execução foi delegada (D-3).
**Status:** aguardando o usuário definir a data de corte.

### D-OPEN-3 — Por onde o alerta de erro chega até você
**Contexto:** o detector de silêncio já grava tudo em `logs_erro` e o painel da aba
**Automações → Status** mostra. Falta o *push* — hoje ninguém é avisado sem abrir a tela.

Restrição descoberta em 26/07/2026: `enviar-whatsapp` **não fala com a Evolution direto**,
ele chama o webhook do n8n. Alertar por esse caminho faz uma queda do n8n silenciar
justamente o alerta de que o n8n caiu.

| Opção | Prós | Contras |
|---|---|---|
| Evolution API direto da função | Contorna o n8n; credenciais já estão em `clinics` | Mais um lugar que fala com a Evolution |
| E-mail (Resend) | Independente de tudo | Precisa de chave nova |
| Só o painel (estado atual) | Zero dependência | Você só sabe se abrir a tela |

**Recomendação:** Evolution direto, gravando a linha no banco de qualquer forma para o
painel não depender do push. **Status:** aguardando o usuário.

### D-OPEN-2 — A pasta `apify/` pertence a este projeto?
`apify/blueoceansem-posts.json` e `captions-ranked.txt` não têm relação com o Cliniflow.
Parecem de outro trabalho. Foram **mantidos** na limpeza de 26/07/2026 por precaução.
**Status:** aguardando o usuário confirmar se pode remover.

---

## 🟢 Tomadas

### D-1 — Restaurar o Supabase e versionar o schema · 26/07/2026
**Decisão:** restaurar o projeto pausado e extrair schema, funções, triggers e RLS para `docs/db/`.
**Por quê:** funções e triggers (incluindo o disparo `pg_net` que envia as mensagens do CRM)
**só existiam dentro do banco**. Um projeto pausado que fosse deletado levaria a lógica junto.

### D-2 — Remover as notas internas privadas do CRM · 26/07/2026
**Decisão:** remover o recurso inteiro do frontend (estado, seletor de canal, balão amarelo,
parâmetro na função de envio).
**Por quê:** o usuário avaliou que era cosmético no momento. Efeito colateral positivo: o trigger
`secretary_message_trigger` não filtra `private`, então uma nota interna seria **enviada ao
paciente** pelo WhatsApp. Sem o recurso, nada grava `private=true` e o vazamento não tem como
ocorrer. **O trigger continua sem o filtro** — ver `ARMADILHAS.md` §2 antes de reintroduzir.

### D-3 — O login (Auth + RLS) será executado por outro agente · 26/07/2026
### ↳ REABERTA E REVERTIDA em 28/07/2026 — voltou para o Claude
**Decisão original:** escrever o plano de execução em `docs/plano-auth-rls.md` e passar para o
Gemini implementar, em vez de implementar aqui.
**Por quê:** decisão do usuário, para economizar tokens da sessão de 26/07. O plano é
autocontido: inclui as armadilhas, a ordem de fechamento tabela por tabela com teste entre
cada passo, e o rollback.

**Reversão (28/07/2026):** o usuário escolheu "eu assumo o login + RLS inteiro" durante a
auditoria de LGPD. A execução voltou para esta sessão.
⚠️ **O Gemini precisa ser avisado** — se ele estiver com o plano em mãos, dois agentes vão
escrever nas mesmas tabelas. As etapas 1 e 2 do plano já estão aplicadas no banco.

### D-4 — Aplicar correções do n8n via MCP, não pela interface · 26/07/2026
**Decisão:** usar `update_workflow` + `publish_workflow` do MCP do n8n.
**Por quê:** a orientação anterior era "aplique pela UI", porque o export local não carrega
credenciais e reimportar quebraria o workflow. O MCP resolve isso: opera sobre o workflow vivo,
preserva credenciais e sub-nós, e as operações são atômicas. Validado em 5 correções.

### D-5 — Limpeza de arquivos: apagar o regenerável, preservar o irrecuperável · 26/07/2026
**Decisão:** removidos os dois executáveis do Supabase CLI (212 MB), `scratch/` e `graphify-out/`.
Antes de apagar o `scratch/`, os 19 arquivos puxados do n8n vivo foram movidos para
`docs/n8n-evidencia/`. SQL histórico e workflow morto foram para `docs/legado/`.
**Por quê:** critério = apagar o que se regenera, preservar o que não se regenera.
Resultado: 220 MB / 620 arquivos → 3,8 MB / ~100 arquivos.

### D-6 — Formato do login: uma conta por clínica, criada à mão · 26/07/2026
**Decisão:** (a) **um login compartilhado por clínica**, não por pessoa; (b) contas criadas
pelo dono no painel do Supabase, sem autocadastro nem tela de admin; (c) sessão **não expira**.
**Por quê:** o alvo agora é uma clínica só. Gestão de usuários e timeout de inatividade são
complexidade que não se paga nesse tamanho, e sessão que expira no meio do expediente derruba
o Realtime — a recepção lê isso como "o sistema travou".

**Consequência assumida:** `mensagem_logs.sender_id` fica sempre NULL (com uma conta só, gravar
o uid não informa quem escreveu). `conversations.assignee_id` continua em uso, mas seu
significado degrada de *"quem assumiu"* para *"se alguém assumiu"* — ainda alimenta o rótulo
`Humano` no cabeçalho e as abas de filtro do CRM.

**Reabrir quando:** entrar a segunda clínica, ou quando a recepção tiver mais de uma pessoa e
alguém perguntar "quem respondeu esse paciente?".

---

### D-7 — O n8n é executor, não observador · 26/07/2026
**Decisão:** o n8n fica **só** com o fluxo conversacional inbound (AI Agent + RAG + memória +
debounce). Agendamento e observabilidade passam para o Supabase (`pg_cron` + funções SQL +
Edge Functions). O `Error Trigger` continua, mas rebaixado a **escritor** em `logs_erro` — o
cérebro do alerta sai de dentro do workflow de 71 nós.

**Por quê:** o `Error Trigger` só enxerga exceção do próprio n8n. Já era cego para as duas
Edge Functions, para o frontend e — o que mais importa num bot de WhatsApp — para o modo de
falha dominante, que é o **silêncio** (webhook não chega, envio preso, cron morto). Nada
disso lança exceção. Somado a isso, o n8n é instância única: usá-lo como vigia faz o vigia
morrer junto com o paciente. O Supabase não adiciona ponto único novo, já que é dependência
dura de tudo.

**Consequência prática:** ao criar automação nova neste projeto, o default é função SQL ou
Edge Function agendada por `pg_cron` — não workflow n8n.

### D-9 — Remover o handoff de urgência do workflow · 27/07/2026
**Decisão:** removidos os nós `Pausa IA (Urgência)` e `AVISO URGÊNCIA` do workflow
`ZAQ6I2CiBGh8swye`. Publicado e conferido na `activeVersion` (71 → 69 nós).
**Por quê:** decisão do usuário — o recurso era "praticamente cosmético". Somado a isso, a
auditoria de 27/07 mostrou que ele era **ativamente perigoso**: `Pausa IA (Urgência)` fazia
`INSERT` em `sessoes_ativas`, cuja PK é o telefone. Na segunda urgência do mesmo paciente
daria violação de chave e, como o nó não tinha `onError`, **derrubaria o workflow inteiro** —
justamente no caso em que o paciente mais precisa de resposta.

**O que ficou:** o switch `Filtra urgência` continua no fluxo, mas agora as duas saídas vão
para `Veio do Webhook?` — ou seja, **é um passa-tudo inerte**, o mesmo estado de antes de
26/07. Isso é intencional, **não é bug**: mantê-lo custa zero e evitou cirurgia de conexão
num workflow que tinha acabado de provar que funciona.

⚠️ **Ao próximo agente:** se você notar que `[ACIONAR_HUMANO]` "não faz nada", **isso é de
propósito**. Não reintroduza os nós — foi exatamente esse o ciclo que aconteceu em 26/07
(alguém viu o marcador decorativo, "consertou", e criou o bug de chave duplicada).
Se um dia o handoff voltar, ele precisa ser **upsert**, não insert, e ter
`onError: continueRegularOutput`.

### D-8 — O detector de silêncio é função SQL, não Edge Function · 26/07/2026
**Decisão:** `public.detectar_silencio()` em plpgsql, agendada direto por `pg_cron`
(`select public.detectar_silencio()`), em vez da Edge Function + `net.http_post` que eu
havia planejado.

**Por quê:** `cron.job_run_details` não é exposto via PostgREST, então uma Edge Function
precisaria de uma RPC de qualquer jeito — a chamada HTTP só somava peças que podem quebrar.
Do jeito escolhido o detector não depende de HTTP, de JWT, nem das Edge Functions estarem no
ar. E elimina de vez a classe de bug da `ARMADILHAS.md` §10, que nasceu justamente de montar
header com chave dentro de um comando de cron.

### D-10 — Views `kpi_*`: `security_invoker`, não revogar o `SELECT` de anon · 28/07/2026
**Decisão:** aplicar `ALTER VIEW ... SET (security_invoker = on)` nas 4 views de KPI, em vez
de revogar o `SELECT` da role `anon`.

**Por quê:** as duas opções fecham o mesmo vazamento (`kpi_retencao` entregava nome +
telefone + convênio + histórico por fora do RLS — `ARMADILHAS.md` §16). Mas revogar o
`SELECT` **quebraria a aba de Relatórios hoje**, porque o CRM ainda não tem login e lê as
views com a chave anon. Já o `security_invoker` é **no-op enquanto as policies forem
`USING (true)`** e fecha sozinho, automaticamente, no dia em que as tabelas forem fechadas.

**Consequência:** a correção não precisou esperar o login — e não existe um intervalo em que
alguém "esqueça" de voltar para fechar a view. Verificado: consultadas como role `anon` as 4
views continuam respondendo.

**Reabrir quando:** depois do login estar no ar, revogar o `SELECT` de `anon` nas 4 views
vira uma limpeza barata e vale fazer (defesa em profundidade). Está na etapa 9 do
`docs/db/04-fechamento-rls.sql`.

### D-11 — `data_hora` do pré-agendamento fica `now()` como placeholder · 28/07/2026
**Decisão:** a RPC `criar_pre_agendamento` grava `data_hora = now()`.

**Por quê:** a coluna é `NOT NULL` sem default e a IA não negocia horário — ela captura só
turno de preferência ("manhã"/"tarde"), que vai para `notas`. Quem define o horário real é a
recepção, ao aprovar o `solicitado`.

**Consequência assumida:** um pré-agendamento aparece na agenda no instante em que foi pedido,
não no horário desejado. Se a aba de agenda ordenar por `data_hora`, ele aparece "agora".
**Confirme isso na primeira vez que um `solicitado` real cair na tela** — se incomodar, a
alternativa é tornar `data_hora` nullable e a agenda tratar `solicitado` como lista separada.

## 🚫 Rejeitadas (NÃO reintroduza)

### R-1 — Reimportar o JSON do workflow por cima do n8n · 26/07/2026
`Projeto Clínica - Evo Go ....json` **não contém o bloco `credentials`** em nenhum dos 71 nós.
Reimportar deixaria todo nó Supabase/Gemini/Gmail desconectado da credencial. O arquivo é
**referência**, não fonte de deploy. Use o MCP (D-4).

### R-2 — Tratar a chave anon exposta como não sendo problema · 26/07/2026
O registro de 23/06 em `SYNC_STATUS.md` afirmava que a chave anon exposta "não representa falha de
segurança de produção". **Isso é incorreto** e foi corrigido. Chave anon só é segura sob RLS
restritivo; aqui o RLS é `USING (true)`. Testado: devolve dados reais de paciente.

### R-3 — Culpar a instância Evolution pelo sistema fora do ar · 26/07/2026
A hipótese inicial era de que a instância de teste do Evolution Go estava com problema.
A causa real era o **projeto Supabase pausado**. A instância e o n8n estavam no ar o tempo todo.
Antes de trocar de instância, cheque o status do Supabase (`ARMADILHAS.md` §1).
