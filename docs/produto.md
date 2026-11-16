# Visão do produto

O ConcurserO é 100% voltado à preparação para concursos. Seu objetivo é facilitar o estudo, reduzir tempo gasto sem necessidade e aumentar o desempenho com o tempo disponível, transformando o edital em estudo e prática direcionados. Uma sessão deve terminar com feedback e um próximo passo claro.

A organização deve ser familiar a quem usa plataformas de concursos: **disciplina → assunto → subassunto**, com concurso, cargo/área e bloco como dimensões separadas. Nomes equivalentes aceitam aliases; o produto não cria uma taxonomia isolada. Referências públicas e decisões editoriais estão em [Padrões de concursos](padroes-de-concursos.md).

O edital de destino define o conteúdo. Incidência de questões comparáveis por banca/cargo/área, pesos oficiais e lacunas individuais devem orientar a priorização quando houver dados suficientes. Atualmente, a visão geral calcula incidência histórica e recorrência na amostra; não combina automaticamente o edital vigente, pesos, dificuldade, tempo por assunto ou desempenho em um otimizador de estudos. A aplicação deve mostrar essa distinção e não sugerir abandonar conteúdo do edital por aparecer pouco em uma amostra pequena.

## Decisões registradas

| Decisão | Resultado |
| --- | --- |
| Uso inicial | Pessoal, no computador do estudante. |
| Entrada de conteúdo | Importação assistida de edital, prova e gabarito em PDF desde a primeira versão. |
| UI/UX | KISS e minimalismo. Objetivo, ação e próximo passo claros, com o mínimo de informação necessário. |
| Cadernos importados | Questões visíveis e usadas nas análises assim que extraídas. Sem gabarito, pendência explícita; com gabarito, salvar todas em uma ação. |
| Trilhas iniciais | Polícia Científica do Paraná, Área 3, e Polícia Federal, Área 3 (Informática Forense). Os concursos de 2024 e 2025 servem como [referência pré-edital](concursos-piloto.md). |
| Preparação atual | Uma aplicação, um banco de questões, um histórico e uma fila de revisões. Concursos são objetivos acompanhados, com prioridade pessoal, data e edital próprios. Cadastro e pausa preservam o acervo. |

## Jornadas e evolução

| Entrega | Jornada |
| --- | --- |
| [001 · Importação e estudo local](../specs/001-estudo-local/spec.md) | Alternar entre as duas trilhas, importar os documentos de referência, conferir os tópicos e as questões, praticar com correção, registrar dificuldades e revisar flashcards agendados. |
| [007 · Preparação unificada](../specs/007-preparacao-unificada/spec.md) | Substitui a troca global de trilha: estudar uma vez e acompanhar cobertura, lacunas, treino e revisões por edital. Editais, importação e incidência mantêm um seletor local de concurso; questões, erros e revisões ficam reunidos. |
| [010 · Agenda e revisão por assunto](../specs/010-agenda-e-revisao/spec.md) | Liga apostilas locais a tópicos do edital, distribui estudo e revisões na semana e registra sessões e próximos retornos. |
| Acervo e planejamento ampliados | Reunir múltiplas provas, filtrar por banca, cargo, ano e assunto, acompanhar cobertura do edital e ajustar o plano semanal. |
| Simulados | Reproduzir uma prova ou montar um conjunto inédito, aplicar cronômetro e regras da banca e analisar nota, erros e tempo. |
| Expansão | Discursivas com espelho, material de apoio assistido por IA e sincronização se houver demanda. |

## Medidas de evolução

- **Cobertura por concurso** conta assuntos cadastrados no edital ativo com leitura ou prática registrada, com o mesmo peso. Mostra leitura e prática separadamente; contato não significa domínio ou cadastro completo do edital. Sem edital, demonstrações e categorias automáticas de questões não geram percentual.
- **Reaproveitamento** relaciona registros por disciplina/assunto idênticos, aliases conhecidos de disciplina ou equivalência confirmada e reversível. Questões com conteúdo revisado também encontram o assunto/subassunto canônico, preservando a classificação pessoal. Uma tentativa atende N concursos, mas conta uma vez no histórico e no tempo.
- **Lacunas** mostram assuntos sem prática, erros/chutes na última tentativa por questão e revisões pendentes. A amostra reúne treino compatível de outras bancas; não representa nota prevista para o concurso.
- **Acerto em questão nova** usa somente a primeira tentativa, com total de questões exibido junto ao percentual. Acertos por chute aparecem como sinal separado.
- **Retomada** acompanha erros e acertos por chute em novas tentativas e questões relacionadas.
- **Revisão** acompanha pendências e conclusões ao longo dos dias.

O plano diário reúne assuntos dos editais acompanhados, reserva revisões primeiro e ordena por lacunas, prioridade pessoal, aproveitamento comum e prioridade do assunto, sem excluir tópicos do edital. A incidência histórica continua separada por concurso e não é combinada automaticamente com pesos oficiais. As datas ficam visíveis como referência; não há previsão de aprovação nem promessa de cronograma ótimo.
