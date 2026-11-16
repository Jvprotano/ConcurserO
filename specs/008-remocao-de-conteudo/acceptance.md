# Evidências de entrega — 11/11/2026

- 43 testes de estudo, questões, importação, preparação, incidência, taxonomia e remoção passaram. Após reforçar o bloqueio de substituição automática de gabarito e a preservação da classificação histórica, os 13 testes afetados de remoção/preparação passaram novamente.
- `npm.cmd run build` passou (TypeScript e Vite), incluindo os ajustes finais de comportamento.
- Em uma cópia do banco, remover e restaurar o caderno piloto retirou e recuperou as questões sem alterar as demais linhas do histórico.
- A verificação de chaves estrangeiras confirmou a integridade após a remoção.
- A API confirmou a saída do caderno das consultas, a disponibilidade para restauração e a preservação do PDF original.
- A UI oferece Remover em documentos (lista e documento aberto), concursos ativos/pausados, edições inativas, tópicos, materiais compartilhados e cartões. Confirmação usa diálogo nativo com nome e efeito; Itens removidos permite restauração. O histórico editorial de referência permanece separado do acervo.
- Limite: a inspeção visual não foi concluída. O host de acesso a navegadores estava indisponível; a tentativa de usar a janela do Chrome foi encerrada pelo computer-use por não conseguir determinar a URL com segurança. Nenhuma remoção foi executada por UI. O fluxo de remover/restaurar e o cancelamento da extração foram exercitados pela API, com banco isolado.
