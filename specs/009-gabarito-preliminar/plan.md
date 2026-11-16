# Plano

- Remover o filtro que descarta páginas preliminares do catálogo e das duas formas de gravação; manter a correspondência existente entre caderno e gabarito. Renomear indicadores que pressupõem gabarito definitivo.
- Calcular a condição preliminar a partir das páginas das respostas extraídas, limitar os candidatos às versões/blocos presentes no caderno e informar a condição nas opções e no resumo da importação.
- Persistir `key_preliminary` em cada revisão por migração aditiva, expondo um booleano na prática e nas tentativas. Incluir a condição na comparação idempotente; preservar a vista de conteúdo ativo e as regras de remoção.
- Atualizar mensagens, orientações e documentação antiga afetada antes de validar os testes de integração e compilar.
- Corrigir marcadores de alternativa com espaço no parser e recuperar conservadoramente rascunhos existentes ao lê-los, compartilhando a leitura entre projeção, detalhes e gravação. Validar a recuperação das 80 questões reais em cópia isolada, sem modificar o banco original.
