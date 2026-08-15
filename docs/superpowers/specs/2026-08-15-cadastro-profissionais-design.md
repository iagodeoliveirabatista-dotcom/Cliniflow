# Especificação de Design: Cadastro de profissionais (médicos/dentistas)

**Data**: 15 de Agosto de 2026
**Status**: Aprovado pelo usuário (brainstorming em chat, mesma sessão) — escrito para ser implementado por **outro agente**, sem contexto desta conversa. Leia `AGENTS.md`, `docs/DECISIONS.md` e `docs/ARMADILHAS.md` antes de começar, como o contrato de agentes deste projeto já exige.

---

## 1. Contexto e motivação

Hoje o campo "Médico(a)" em todo formulário de agendamento é uma lista **fixa e fictícia**, hardcoded em `cliniflow-export/patients-components.jsx:621`:
```js
<Select value={f.doctor} onChange={v => set('doctor', v)}
  options={['Dr. Carlos Mendes','Dra. Fernanda Costa','Dr. Paulo Ribeiro']} />
```
Não existe tabela de profissionais no banco — `consultas.medico` é uma coluna `text` livre (`cliniflow-export/supabase-schema.sql:54`), preenchida a partir dessa lista fixa (`NewAppointmentModal`) ou de texto livre (`AprovarPedidoModal`, `patients-components.jsx:462`). O usuário quer poder cadastrar os profissionais reais da clínica (médicos e dentistas) e que esses nomes fictícios deixem de aparecer.

Este spec é o segundo de dois nascidos da mesma conversa — o primeiro (`2026-08-15-contraste-tema-claro-e-duracao-design.md`) cobre contraste do tema claro e duração editável, e é só frontend. Este aqui exige tabela nova no Supabase (com `clinic_id`, RLS), por isso foi separado.

**Decisões de escopo tomadas em chat (15/08/2026), não reabra sem confirmar com o usuário:**
- Campos do profissional: **só nome** (+ ativo/inativo, ver §3). Especialidade e cor de identificação foram consideradas e explicitamente deixadas de fora por ora — mesmo raciocínio já registrado em `docs/DECISIONS.md` D-25 ("com um cliente não se sabe o que varia de verdade — abstrair agora garante abstrair errado").
- Onde gerenciar (adicionar/editar/desativar): dentro de **Configurações**, não uma tela nova na sidebar, e sem afordance de "+ adicionar" dentro dos seletores de agendamento.

---

## 2. Escopo e não-escopo

**Dentro do escopo:**
- Tabela nova `public.profissionais` no Supabase, multi-tenant por `clinic_id`, RLS fechado desde o nascimento (ver §3 — por quê isto é diferente de `patients`/`consultas`).
- Funções CRUD em `cliniflow-export/supabase-client.js`: `fetchProfissionais()`, `createProfissional(nome)`, `updateProfissional(id, dados)` (nome e/ou `ativo`).
- Uma seção nova dentro do painel de Configurações (`tweaks-panel.jsx`/uso em `Cliniflow.html`) para listar, adicionar e desativar profissionais (ver §4 — por que isso **não** usa os controles `Tweak*` prontos).
- Trocar as duas listas fixas de "Médico(a)" (`NewAppointmentModal` e `AprovarPedidoModal`, ambas em `patients-components.jsx`) para consumir a lista real, carregada do Supabase.
- Estado vazio: clínica sem nenhum profissional cadastrado mostra aviso, não uma lista vazia sem explicação (mesmo padrão do D-24 para lembretes).

**Fora do escopo (não fazer sem novo spec):**
- Especialidade, cor de identificação por profissional, foto, CRM/CRO, horário de trabalho — nenhum campo além de nome/ativo.
- Vincular `consultas.medico` a `profissionais.id` por chave estrangeira. `consultas.medico` **continua `text` livre** — ao escolher um profissional no seletor, grava-se o **nome** dele (string), não o id. Ver §3.3 para o porquê e quando reabrir isso.
- Migrar/casar os nomes fictícios já gravados em `consultas.medico` de agendamentos existentes com as novas linhas de `profissionais`. A tabela nova nasce vazia por clínica — mesma decisão já tomada para `config_automacao` no D-24 (vazio com explicação, não seed automático).
- Qualquer afordance de "+ adicionar profissional" dentro do formulário de agendamento — cadastro é só em Configurações (decisão do usuário, §1).
- O trabalho do outro spec (contraste/duração) — específico e já em implementação separada.

---

## 3. Banco de dados

### 3.1 Tabela

```sql
CREATE TABLE public.profissionais (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id  uuid NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE
               DEFAULT public.auth_clinic_id(),
  nome       text NOT NULL,
  ativo      boolean NOT NULL DEFAULT true,
  criado_em  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX profissionais_clinic_idx ON public.profissionais (clinic_id);
```
`clinic_id` com `DEFAULT public.auth_clinic_id()` segue exatamente o padrão que `docs/db/08-clinic-id-default.sql` já aplicou em `patients`/`consultas`/`conversations`: um insert autenticado que não mandar a coluna herda a clínica da sessão — um ponto de estrangulamento no banco em vez de depender do frontend lembrar sempre.

### 3.2 RLS — fechado desde o início, não `USING (true)`

`patients`/`consultas`/`mensagem_logs` ainda estão com RLS permissivo (`D-OPEN-1`, em aberto — dependendo do usuário decidir a data de corte). **Esta tabela não repete isso.** Ela nasce hoje (15/08/2026), no mesmo padrão que `config_automacao` acabou de ganhar nesta mesma data (`docs/db/09-config-automacao-multi-tenant.sql`):

```sql
CREATE POLICY profissionais_rw ON public.profissionais
  FOR ALL TO authenticated
  USING      (clinic_id = public.auth_clinic_id())
  WITH CHECK (clinic_id = public.auth_clinic_id());

REVOKE ALL ON public.profissionais FROM anon;
```
Não é uma decisão nova a justificar — é seguir o padrão mais recente do projeto em vez do mais antigo. Depois de criar, confira o `proacl` (não só o `Success` do `REVOKE`) — ver `ARMADILHAS.md` §17, ele já mordeu este projeto duas vezes.

⚠️ **Risco a verificar antes de considerar isto pronto:** o RLS acima só funciona se a sessão autenticada da recepção realmente existir (`auth.uid()` preenchido). Por `AGENTS.md` (item 3 dos Próximos Passos), **o login por Google ainda não está com a config externa terminada em produção** (falta o OAuth Client no Google Cloud + colar no Supabase). Enquanto isso não estiver pronto, `auth_clinic_id()` pode devolver `NULL` para a sessão real, e a tela de profissionais funcionará apenas em modo demonstração (dados fake, sem Supabase) — não contra o projeto real. Não é bug deste spec; é dependência já conhecida do projeto. Registre isso no `AGENTS.md` ao terminar, não finja que "publicado" quer dizer "testado contra produção" (regra de honestidade do `AGENTS.md`).

### 3.3 Por que `consultas.medico` continua texto livre, sem FK

Ligar `consultas.medico` a `profissionais.id` seria mais "correto" estruturalmente, mas custa uma migração de dado (decidir o que fazer com os nomes fictícios já gravados) para um benefício que ninguém pediu ainda — mesmo raciocínio do D-25. O seletor grava o **nome** do profissional escolhido, exatamente como grava hoje um nome digitado à mão. **Reabrir quando:** se um dia precisar filtrar agenda por profissional, calcular carga por médico, ou impedir que o texto diverja do cadastro (ex.: alguém desativa um profissional e agendamentos antigos "esquecem" quem foi), aí vale a FK — não antes.

---

## 4. Frontend

### 4.1 Gerenciar profissionais — dentro de Configurações, mas NÃO como um `Tweak*`

`tweaks-panel.jsx` é um shell de prototipagem para preferências visuais efêmeras (tema, cor de destaque, densidade) — os controles `TweakToggle`/`TweakSlider`/`TweakColor` etc. são pensados para um valor único por chave, persistido local (`useTweaks`), não para uma **lista** de registros com CRUD contra o Supabase (adicionar linha, desativar, recarregar). Forçar uma lista de profissionais dentro de `TweakRow`/`TweakButton` não encaixa no que esses componentes fazem.

**O que fazer:** dentro do mesmo painel que hoje abre com "Configurações" (`TweaksPanel` em `Cliniflow.html`, em torno da linha 597), adicionar uma `TweakSection label="Profissionais"` (esse componente É só um título de seção, serve normalmente) e, dentro dela, um bloco **custom** — não um `Tweak*` — reaproveitando os primitivos que o resto do app já usa para listas com CRUD (`Input`/`Field`/botão de estilo consistente, de `patients-components.jsx`, o mesmo padrão de `PatientsView`): uma lista simples (nome + toggle ativo/inativo) e um campo de texto com botão "Adicionar" abaixo dela. Sem modal — cabe inline dentro do painel de Configurações, que já é um overlay.

### 4.2 Fetch e estado

Em `Cliniflow.html`, ao lado de onde `patients`/`appts` já são buscados no mount do `App`, buscar `profissionais` (via `SB.fetchProfissionais()`) e guardar em estado (`profissionais`, `setProfissionais`). Passar para baixo:
- Para o novo bloco de gerenciamento em Configurações (lista completa, inclusive inativos, para poder reativar).
- Para `NewAppointmentModal` e `AprovarPedidoModal` (só os **ativos** — `profissionais.filter(p => p.ativo)`).

### 4.3 Selects de "Médico(a)"

Em `patients-components.jsx`:
- `NewAppointmentModal` (linha ~619-621): a lista fixa `['Dr. Carlos Mendes','Dra. Fernanda Costa','Dr. Paulo Ribeiro']` vira `profissionaisAtivos.map(p => p.nome)`.
- `AprovarPedidoModal` (linha ~461-462): hoje é um `<Input>` de texto livre — vira um `<Select>` igual ao de `NewAppointmentModal`, pela mesma razão de fundo do spec (parar de depender de texto digitado à mão / nomes inventados). Mantém a opção de o valor vir vazio se a clínica não tiver profissional cadastrado (ver estado vazio, §4.4) — não torne o campo obrigatório, já que hoje não é.

### 4.4 Estado vazio

Se `profissionaisAtivos` estiver vazio (clínica nova, ou todos desativados), os dois seletores acima não devem virar um `<Select>` sem opção nenhuma (isso é confuso, parece bug). Mostrar em vez disso um texto fixo tipo "Nenhum profissional cadastrado — adicione em Configurações", sem bloquear o resto do formulário (o campo "Médico(a)" não é obrigatório para agendar hoje, e este spec não muda isso).

---

## 5. Verificação

Mesma receita dos specs anteriores (`docs/superpowers/plans/2026-08-05-ui-tema-claro-e-motion.md`, "Receita de verificação") — cópia isolada em modo demonstração para o frontend. Para o banco:

1. `node --check` nos arquivos `.jsx`/`.js` tocados.
2. Aplicar a migração via `apply_migration` (MCP do Supabase), depois conferir com `list_tables` e uma leitura de `pg_policy`/`proacl` — não confie no `Success` do `REVOKE` sozinho (`ARMADILHAS.md` §17).
3. Modo demonstração: abrir Configurações, adicionar 2-3 profissionais fictícios de teste, desativar um, confirmar que ele some do seletor de agendamento mas continua na lista de gerenciamento (para poder reativar).
4. **Contra o projeto real só depois de confirmar que o login Google está de fato terminado** (ver risco no §3.2) — não marque "testado" se isso ainda depender dos passos externos pendentes do D-12.
5. Console do navegador sem erros, nos dois temas (claro/escuro) — o bloco novo em Configurações precisa ler os tokens de tema como o resto do app.

---

## 6. Arquivos afetados (para o plano de implementação)

| Arquivo | Natureza da mudança |
|---|---|
| `docs/db/10-profissionais.sql` (novo) | `CREATE TABLE profissionais` + índice + RLS + revoke de `anon`, seguindo o padrão de `docs/db/09-config-automacao-multi-tenant.sql`. |
| `cliniflow-export/supabase-client.js` | `fetchProfissionais()`, `createProfissional(nome)`, `updateProfissional(id, dados)`. |
| `cliniflow-export/Cliniflow.html` | Fetch de `profissionais` no mount do `App`; novo bloco de gerenciamento dentro do `TweaksPanel` de Configurações; passa a lista para os dois modais. |
| `cliniflow-export/patients-components.jsx` | `NewAppointmentModal` e `AprovarPedidoModal`: trocam lista fixa/input livre por `<Select>` alimentado pela lista real; tratam o estado vazio (§4.4). |

A decomposição em tarefas bite-sized fica para o plano de implementação (`writing-plans`) — que pode rodar no outro agente, junto com este spec.

---

## 7. Decisões do usuário registradas nesta sessão

- Split em 2 specs (chat, 15/08/2026): este é o segundo, mais estrutural (tabela nova + RLS).
- Campos do profissional: só nome, sem especialidade/cor por ora (chat, 15/08/2026) — mesmo raciocínio do D-25.
- Gerenciamento vive em Configurações, não em tela nova da sidebar nem inline nos seletores de agendamento (chat, 15/08/2026).
- Este spec é escrito para ser entregue a outro agente/sessão sem o contexto desta conversa — por isso cita explicitamente os arquivos/linhas atuais e os padrões do projeto (`D-25`, `D-24`, `docs/db/08`/`09`) em vez de assumir que quem implementa já sabe.
