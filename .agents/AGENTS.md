# Regras Gerais do Agente (Workspace: Software Clínicas)

- **Prioridade Máxima para MCPs:** Sempre que houver uma tarefa que envolva banco de dados (Supabase), automação (n8n), ou qualquer outro serviço externo, **verifique proativamente se os MCPs estão configurados e disponíveis** no seu `mcp_config.json`. Se estiverem, utilize-os obrigatoriamente para automatizar a tarefa ao invés de delegar a execução manual para o usuário. Invoque um subagent equipado com MCPs se necessário. Nunca esqueça de checar a disponibilidade de ferramentas MCP antes de assumir que você não tem acesso.
