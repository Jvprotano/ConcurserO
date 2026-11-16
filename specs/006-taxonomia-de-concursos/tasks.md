# Tarefas

- [x] **T01** Documentar pesquisa e registrar foco de produto e convenções em contexto durável.
- [x] **T02** Implementar a taxonomia e rever os vínculos dos 410 itens, separando versão editorial de assinaturas.
- [x] **T03** Unificar disciplinas/assuntos/subassuntos entre visão geral e Questões, com filtros e agregação por nível; novos vínculos automáticos usam a classificação revisada, preservando os existentes (RF-03a).
- [x] **T04** Validar integridade, cobertura, preservação, navegação e compilação; registrar limites.

## Evidência — 11/11/2026

- Ambas as páginas do QConcursos acessíveis publicamente, a do Paraná sem os parâmetros de retorno de autenticação. Pesquisa complementada com as páginas de suporte oficiais de QConcursos, Gran e Tec. Fontes e escolhas registradas em `docs/padroes-de-concursos.md`.
- Taxonomia `concursos-2`: os 410 itens têm caminho válido; a distribuição por disciplina reproduz os totais públicos de PR 2024 (80 itens em 18 disciplinas) e PF 2025 (120 em 19). O detalhamento é editorial próprio; não foi alegada equivalência integral de todos os subassuntos externos.
- 33 testes aprovados, incluindo os quatro novos cenários de integridade, conferência de distribuição, agregação sem duplicatas e correspondência entre seleção do ranking e filtros do banco em todos os níveis. Após o ajuste final de novos vínculos automáticos, 23 testes relacionados a taxonomia, análise, importação e consulta passaram novamente.
- Build TypeScript/Vite aprovado. O ajuste final de servidor teve verificação adicional de tipos.
- Cópia consistente do banco real criada a partir de conexão somente leitura: PR continua com 80 itens únicos detalhados; PF, com 240. A hierarquia foi atualizada sem mudar as assinaturas de conteúdo, reimportar ou gravar no banco original.
- A navegação foi verificada pela composição real dos filtros compartilhados e pelos conjuntos de itens, sem cliques em navegador. Conferência visual desta entrega permanece pendente; não foi afirmada validação de layout ou interação física.
- Diretriz durável em AGENTS.md, constituição, visão do produto e nota de memória solicitada pelo usuário. O ranking continua limitado à incidência histórica: pesos do edital, distribuição de horas e desempenho individual ainda não são combinados automaticamente.
