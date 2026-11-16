# Plano

1. Migração aditiva com registro de remoções por tipo/ID e vistas de conteúdo ativo. Revisões e PDFs permanecem intactos. A questão atual projeta pendência quando o gabarito foi removido; tentativas históricas consultam a revisão original.
2. Serviço único de remover/restaurar e listagem, com validação de dependências e transações. Cancelar extração antes de remover documentos; impedir que callbacks retomem processamento. Leituras, treino, banco, incidência e disponibilidade usam o conteúdo ativo.
3. Componente reutilizável de confirmação com nome/efeito e estado de envio. Botões contextuais em Acervo, Concursos, Edital, materiais e cartões; restauração em seção recolhida no Acervo. Tratar estado vazio sem concursos.
4. Testes de integração do ciclo de remoção/restauração e regressão de histórico/gabaritos. Build após o conjunto de alterações; verificar visualmente e aplicar retirada do piloto com backup SQLite consistente.

Cobertura: T01 → RF-01/02/03/04; T02 → RF-01/03/04; T03 → RF-01–04; T04 → RF-05.
