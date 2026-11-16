# Plano técnico · 001

## Aplicação e armazenamento

- Aplicação web responsiva em TypeScript, com React na interface e um servidor Node.js no mesmo projeto. O servidor escuta somente em loopback. A UI e a API usam a mesma origem. Validar origem e host em operações de escrita.
- SQLite com migrações, chaves estrangeiras e transações. Guardar PDFs originais em um diretório de dados do app, com nomes internos e identificados por SHA-256. O repositório contém apenas documentos de teste sintéticos e código.
- Documentar inicialização no Windows e backup com o serviço parado, copiando o diretório de dados completo. A restauração usa uma cópia do mesmo diretório e mantém a versão original do backup.

## Modelo de domínio

| Módulo | Dados e invariantes |
| --- | --- |
| Objetivo e edital | Objetivos de estudo com seleção de trilha persistente, disponibilidade diária pessoal e edições de edital por trilha. Cada tópico preserva a origem e pode ser vinculado explicitamente ao tópico correspondente de outra edição ou trilha. Ativar uma edição usa os vínculos confirmados para reaproveitar materiais e revisões. |
| Importação | Documento, contexto do envio, execução, rascunho e linhas de conferência. Estados da execução incluem pendente, processando, em conferência, concluída, cancelada e falhou. Retentar a execução reaproveita o arquivo e as correções já salvas. |
| Prova e gabarito | Prova, bloco, versão do caderno, cargos aplicáveis, questão, alternativas, tópicos, comandos compartilhados, páginas de apoio e versões publicadas. A confirmação referencia a versão exata do caderno e do gabarito. Revisões publicadas são imutáveis. |
| Estudo | Tentativa, versão da questão e chave aplicada, resposta, resultado, confiança e motivo do erro. Cada envio tem identificador único. Guardar horário do evento e o dia local em que foi concluído. |
| Flashcards | Cartão, tópicos vinculados e eventual tentativa de origem. Um cartão compartilhado tem um agendamento. Evento de revisão guarda a avaliação, o vencimento anterior, o novo vencimento e a versão da regra de agendamento. Atualizar evento e próxima data na mesma transação. |

## Processamento de PDFs

1. Validar tipo e legibilidade, limitar tamanho, páginas e tempo de processamento. Começar com limites configuráveis de 50 MB e 400 páginas por arquivo, sujeitos à validação com os documentos dos dois concursos. Guardar bytes com nome interno.
2. Usar PDF.js como candidato para renderização e extração de texto com posição. Usar Tesseract com modelo português como candidato a OCR local para páginas selecionadas sem texto aproveitável. A tarefa inicial confirma o funcionamento no Windows e a disponibilidade dos arquivos locais depois da instalação. [API do PDF.js](https://mozilla.github.io/pdf.js/api/index.html) · [Manual do Tesseract](https://tesseract-ocr.github.io/tessdoc/Home.html)
3. Processar em tarefa separada da requisição interativa. Salvar progresso por página e exibir avisos sobre colunas, quebras, numeração incerta ou chaves inválidas. Preservar a proposta extraída e as edições confirmadas. Em falha, manter a visualização do original e os campos editáveis.
4. Separar extração, associação e publicação. Conferir os campos obrigatórios e o caderno novamente no servidor. Gerar a prévia com inclusões e pendências. Publicar as linhas escolhidas em transação, com uma chave de idempotência. Um reenvio recupera o resultado já gravado.
5. Nas telas de prática, servir enunciado, alternativas e páginas de apoio, sem chave ou comentário de correção antes da tentativa. A ação de responder grava a tentativa e retorna o resultado da mesma versão.

## Regras iniciais do agendamento

- Intervalos propostos de 1, 3, 7, 14 e 30 dias. **Lembrei** avança um estágio, com 30 dias como teto. **Não lembrei** volta ao primeiro estágio, com revisão no dia seguinte. Cartão novo começa antes do primeiro estágio e fica disponível para revisão imediata. As datas usam dias de calendário local, inclusive após reinício.
- Em **Hoje**, usar estimativas iniciais de 1 minuto por cartão, 2 por questão e 10 por bloco de leitura. Aplicar a ordem da especificação e reservar o orçamento disponível após o consumo das atividades concluídas. Mostrar pendências excedentes e permitir acesso direto. Intervalos e estimativas são decisões de produto para validar no piloto.

## Verificação

Executar os cenários de aceite, testes de integração para o armazenamento e publicação, e testes de regras para agenda, versões e correção. Testar a retomada após falha e a restauração do backup no Windows. Validar com documentos sintéticos e depois com os [arquivos de referência](../../docs/concursos-piloto.md). Conferir separação de versões no IBFC, blocos e comandos compartilhados na PF, estados de anulação e preservação do histórico ao trocar a edição do edital.
