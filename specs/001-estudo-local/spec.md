# 001 · Importação e estudo local

**Estado** — Primeira versão implementada para os [dois concursos de referência](../../docs/concursos-piloto.md). Consulte as tarefas abertas para a validação final.

## Resultado

No Windows, o estudante seleciona uma trilha, importa o edital, os cadernos e os gabaritos, confere o que foi reconhecido e usa os dados para estudar. Após fechar o app, consegue reabrir seu plano, encontrar a correção anterior e revisar os cartões na data prevista.

## Requisitos

| ID | Comportamento |
| --- | --- |
| RF-01 | Criar, editar e alternar entre objetivos de estudo. Cada objetivo tem concurso ou área, cargo e banca opcionais, e data de prova opcional. Usar um orçamento diário pessoal em minutos para cada dia da semana. Cadastrar ou editar disciplinas, tópicos, prioridades e notas de estudo à mão. |
| RF-02 | Enviar PDFs locais identificados como edital, prova ou gabarito. Cada arquivo tem visualização por página, progresso e rascunho recuperável. A importação extrai texto nativo e oferece OCR local em português nas páginas digitalizadas. A digitação e a conferência pela página original continuam disponíveis quando a extração falhar. |
| RF-03 | No edital, conferir e editar a hierarquia de disciplinas e tópicos do cargo escolhido. No caderno, conferir numeração, enunciados, alternativas e páginas de apoio. No gabarito, conferir número, resposta ou anulação. O estudante pode incluir campos faltantes, remover linhas espúrias e corrigir a extração antes de publicar. |
| RF-04 | Associar caderno e gabarito pelo concurso, edição, cargo ou conjunto de cargos aplicáveis, bloco e versão do caderno quando houver. Alertar sobre números duplicados, itens sem correspondência e respostas incompatíveis. Salvar as linhas válidas e mostrar as pendências. As entregas 004 e 009 permitem salvar todas em uma ação e corrigir com preliminar compatível, identificado como tal. |
| RF-05 | Preservar arquivo, página, número original e versão do gabarito publicado. Reimportar o mesmo arquivo no mesmo contexto sem duplicar dados. Uma correção posterior cria nova versão para tentativas futuras e mantém acessível a correção registrada em tentativas anteriores. |
| RF-06 | Em **Hoje**, listar revisões vencidas e sugerir um bloco de conteúdo ou questões dentro do tempo disponível. Priorizar revisões vencidas mais antigas e, para conteúdo, tópicos de maior prioridade ainda não praticados. Oferecer acesso direto ao acervo e às revisões mesmo em dias sem minutos planejados. |
| RF-07 | Abrir um tópico com notas, resumo e referências disponíveis. Na prática, mostrar questões objetivas de múltipla escolha ou certo/errado, com o comando comum, texto ou página de apoio do caderno quando necessários. Após enviar a resposta, mostrar resultado, gabarito aplicado (identificando o preliminar), fonte e comentário se cadastrado. |
| RF-08 | Registrar no caderno de erros tentativas incorretas e acertos marcados como chute. Permitir anotar o motivo, abrir o tópico ou praticar outra questão. Um acerto posterior aparece no histórico sem apagar a tentativa anterior. |
| RF-09 | Criar e editar flashcards vinculados a um tópico, inclusive a partir de um erro. Na revisão, revelar a resposta sob ação do estudante e registrar se lembrou. Mostrar a próxima data e recuperar os cartões vencidos na fila. |
| RF-10 | Preservar objetivos, acervo publicado, rascunhos, tentativas, notas, cartões e fila entre reinícios. Exibir histórico por tópico e evitar duplicação por envio repetido da mesma ação. |
| RF-11 | Disponibilizar as trilhas Paraná Área 3 e PF Área 3 em modo pré-edital, com referência histórica identificada. Permitir vincular material e flashcards a tópicos equivalentes das duas trilhas, com confirmação. Permitir adicionar um novo edital à trilha, comparar tópicos mantidos, novos e removidos e ativar a nova edição preservando o histórico. |

## Regras de comportamento

- **Identificação da prova.** A questão é única por bloco e versão do caderno, com o número original. No Paraná, selecione Área 3, código IBFC_03 e a versão correspondente dentro do arquivo. Na PF, mantenha os pares básico e específico distintos e aceite o caderno básico compartilhado apenas quando o cargo estiver coberto pelo gabarito. Uma letra ou número sozinho jamais resolve a associação entre documentos. Se os identificadores não estiverem legíveis, o estudante informa o caderno e confere a correspondência. Se houver divergência explícita entre os identificadores do caderno e do gabarito, a associação fica bloqueada até correção ou substituição.
- **Publicação parcial.** Linhas sem tópico confirmado podem ficar no rascunho para classificação posterior. Questões sem chave definitiva válida, com mídia indispensável sem referência ou com campos obrigatórios faltantes não entram na prática corrigida. Questões anuladas aparecem no acervo com esse status e ficam fora da fila de prática corrigida.
- **Origem e edição.** A alteração manual de um campo importado preserva a referência ao original. A prova pode ser consultada pelo caderno publicado. O arquivo de gabarito fica disponível na conferência e na correção, sem link na tela da questão antes do envio.
- **Hoje.** A trilha selecionada determina a oferta de conteúdo e questões. O orçamento diário é compartilhado e inclui atividades já concluídas em qualquer trilha. O cartão compartilhado tem uma única próxima revisão e aparece nas trilhas vinculadas, com um único evento por revisão. Revisões acima do orçamento continuam pendentes. Entre tópicos equivalentes, mostrar primeiro o menos recentemente praticado e usar a ordem do edital como desempate. Tópicos sem material e sem questões ficam visíveis no edital como lacuna.
- **Revisões.** Cartões novos ficam disponíveis no dia da criação. Uma avaliação registra a próxima data no calendário local. A fila inclui itens com vencimento até hoje. Reabrir o app após um dia perdido mantém os itens pendentes e não inventa sessões concluídas.
- **Arquivos e interrupções.** PDF corrompido, protegido ou acima do limite mostra erro recuperável. Cancelamento ou falha não altera conteúdo publicado. Uma interrupção preserva os rascunhos já gravados e permite retomar a conferência ou reprocessar o arquivo.

## Requisitos não funcionais

| ID | Comportamento |
| --- | --- |
| RNF-01 | Rodar localmente no Windows, em português, sem conta e sem internet durante o estudo e a importação depois da instalação. Dados, arquivos e OCR permanecem no computador. |
| RNF-02 | Permitir navegar, responder e revisar por teclado, com foco visível e mensagens de resultado que não dependam apenas da cor. |
| RNF-03 | Exibir estado do processamento e manter a navegação disponível durante a extração. Proteger a consistência em falhas de gravação, reinício e tentativas concorrentes. Documentar como salvar e restaurar os dados. |

## Fora desta entrega

Simulado cronometrado e regras de nota, discursivas, painel comparativo, sincronização, hospedagem, contas e geração de conteúdo por IA. A importação usa PDFs selecionados pelo estudante. Provas anteriores já podem ser usadas para prática objetiva depois de publicadas.

## Validação

Os [cenários de aceitação](acceptance.md) definem os resultados que a implementação deve demonstrar. A validação editorial usa os editais, cadernos e gabaritos das [duas referências históricas](../../docs/concursos-piloto.md).
