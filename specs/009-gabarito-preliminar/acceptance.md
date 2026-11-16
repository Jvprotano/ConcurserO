# Verificação — 11/11/2026

- Importação, banco e estudo: 24 testes aprovados após a implementação final. Incluem gravação pelo endpoint com preliminar já importado, resposta, identificação na prática/histórico, publicação individual, substituição por definitivo, idempotência, ausência/incompatibilidade/ambiguidade, anuladas e migração v5 → v6 preservando dados.
- Incidência, preparação unificada, remoção/restauração e parsers de PF/IBFC: 21 testes aprovados após a recuperação das alternativas. A leitura/OCR de PDF também passou na execução anterior; o OCR não foi repetido após a mudança de marcadores de alternativas.
- `npm.cmd run build` aprovado para a interface entregue. Após a alteração final no parser e na leitura de rascunhos do servidor, `tsc --noEmit` aprovado. O servidor executa TypeScript diretamente.
- Em uma cópia do banco, o gabarito preliminar da Área 3, caderno A, habilitou a prática dos 80 itens. Salvar novamente preservou as tentativas e a revisão das questões.
- A verificação real identificou as alternativas E da questão 7 e C das questões 22 e 61 incorporadas à alternativa anterior por marcadores com espaço. A recuperação usa somente o texto existente e exige A–E completos, ordenados e não vazios. Os rascunhos originais permanecem armazenados; detalhes, projeção e gravação compartilham a leitura corrigida.
- Banco original preservado; nenhuma questão foi salva ou respondida nele pela verificação. Nenhum PDF precisa ser reimportado.
- A conferência visual interativa ficou pendente nessa entrega.
