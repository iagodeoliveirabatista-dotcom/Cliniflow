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
**Decisão:** escrever o plano de execução em `docs/plano-auth-rls.md` e passar para o Gemini
implementar, em vez de implementar aqui.
**Por quê:** decisão do usuário, para economizar tokens desta sessão. O plano é autocontido:
inclui as armadilhas, a ordem de fechamento tabela por tabela com teste entre cada passo, e o
rollback.

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

---

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
