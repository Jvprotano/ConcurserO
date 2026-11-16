# Tarefas · 001

## Fundação

- [x] **T01** Montar aplicação local em TypeScript com React e servidor Node.js, migrações SQLite, diretório de dados e configuração para Windows. Documentar inicialização, backup e restauração. **RNF-01, RNF-03**
- [x] **T02** Implementar cadastro e seleção das duas trilhas, agenda semanal e editor de disciplinas, tópicos e materiais. Incluir edições de edital com comparação e ativação. Criar PDFs sintéticos com resultados esperados. **RF-01, RF-03, RF-11, CA-01, CA-12**

## Importação e acervo

- [x] **T03** Validar leitura e renderização de PDFs no Windows e OCR em português sem rede após a instalação. Implementar upload, visualização, progresso, cancelamento e recuperação de rascunhos. Depende de T01. **RF-02, RF-10, RNF-01, RNF-03, CA-03**
- [x] **T04** Implementar extração e editor de edital, prova e gabarito com referência por página, correção manual e seleção de cargo. Depende de T02 e T03. **RF-03, RF-05, CA-01, CA-02**
- [x] **T05** Implementar pareamento por caderno, bloco, cargos aplicáveis e versão, prévia de publicação, validação de chaves e anulações, deduplicação, versões e catálogo local. Depende de T04. **RF-04, RF-05, RF-10, RNF-03, CA-02, CA-04, CA-05, CA-10**

## Estudo e revisão

- [x] **T06** Implementar prática por tópico, renderização da página de apoio, correção após a resposta, caderno de erros e histórico de tentativas. Depende de T05. **RF-07, RF-08, RF-10, CA-05, CA-07**
- [x] **T07** Implementar editor de cartões, revisão, agendamento e persistência do histórico. Vincular criação de cartão ao caderno de erros e permitir materiais e cartões compartilhados entre tópicos confirmados. Depende de T06. **RF-08, RF-09, RF-10, RF-11, RNF-03, CA-08, CA-10, CA-12**
- [x] **T08** Implementar Hoje com tempo disponível, revisões prioritárias, sugestão de estudo e retomada após dias perdidos. Depende de T02, T06 e T07. **RF-06, CA-06, CA-12**

## Entrega e validação

- [ ] **T09** Validar ponta a ponta com PDFs sintéticos, teclado, rede desconectada, reinício, backup e recuperação de falhas. Testes de integração executados. A sessão visual e a conferência de navegação por teclado seguem abertas. **RF-10, RNF-01, RNF-02, RNF-03, CA-01 a CA-10, CA-12**
- [ ] **T10** Validar os [dois conjuntos de referência](../../docs/concursos-piloto.md), incluindo as versões IBFC e os blocos da PF. Registrar divergências e ajustes ao importador. O gabarito pós-recurso da Área 3 do Paraná segue pendente. **RF-02, RF-03, RF-04, RF-05, RF-07, CA-01 a CA-05, CA-11**
