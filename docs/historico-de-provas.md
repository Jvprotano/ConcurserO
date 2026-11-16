# Visão geral do concurso

## Organização atual: disciplinas, assuntos e subassuntos

A organização segue **disciplina → assunto → subassunto**, com vocabulário de concursos. A [pesquisa e as decisões de classificação](padroes-de-concursos.md) registram fontes públicas de QConcursos, Gran e Tec. A revisão `concursos-2` mantém os 410 itens de referência e as assinaturas dos 320 itens importáveis. Os filtros de Questões e os rótulos usam a mesma classificação da análise; os vínculos pessoais originais permanecem disponíveis em opções recolhidas.

Use **Disciplina**, **Assunto** e **Comparar** para alternar a incidência entre disciplinas, assuntos ou subassuntos. “Ver questões” preserva o nível e o recorte. Uma questão conta uma vez em cada nível, e cada ranking usa apenas um nível. A incidência continua sendo um sinal histórico, sem integração automática com pesos ou desempenho individual.

A tela abre **Onde focar primeiro**, com subassuntos específicos do acervo importado: interpretação, concordância e colocação pronominal, por exemplo, dentro de Português. Os dez primeiros resultados aparecem inicialmente; **Ver todos** expande a lista. Filtre por prova, bloco, disciplina e assunto. Cada resultado mostra quantidade, participação média por prova e recorrência; abra para conferir itens e páginas ou usar **Ver questões**, que leva o mesmo conteúdo, edição e bloco à consulta de questões.

Questões extraídas entram imediatamente, mesmo sem gabarito; salvar para prática não duplica a amostra. Uma versão principal por prova e bloco é contada (A ou Única quando disponível, depois B e demais versões em ordem de nome). Se ela estiver incompleta, seus números não são preenchidos com outra versão. Itens sem classificação revisada aparecem nas pendências, continuam no total do recorte quando não há filtro específico de assunto e não recebem posição no ranking. Demonstrações ficam fora. Em **Ver histórico de referência**, consulte a amostra editorial abaixo. Distribuição por disciplina, metodologia e fontes ficam recolhidas.

| Trilha | Cadernos analisados | Itens objetivos |
| --- | --- | ---: |
| Paraná | Área 1 (Computação) de 2017 e Área 3 (Informática) de 2024 | 170 |
| Polícia Federal | Área 3 (Informática) de 2018 e Área 3 (Informática Forense) de 2025 | 240 |

A área de computação do Paraná mudou de número entre as duas edições. Em 2024 a análise usa o caderno A. As demais versões são apresentações do mesmo certame e ficam fora da contagem. Os itens anulados entram na análise de incidência por terem sido aplicados. A contagem usa questões, sem multiplicar pelos pesos da nota.

Os 410 itens de referência receberam um caminho principal com base no que o enunciado e as alternativas exigem. A taxonomia usa nomes comuns entre edições, respeitando o contexto: um exame de vestígio digital pode pertencer a Criminalística → Computação Forense, enquanto o conhecimento genérico de um sistema operacional pertence à disciplina Sistemas Operacionais. Os vínculos pessoais de disciplina e assunto continuam preservados. Os números dos itens e páginas permitem revisar a classificação no PDF; esta classificação não valida as afirmações nem substitui o gabarito.

A prioridade é a **participação média por prova**: dividir a quantidade do resultado pelo total do recorte em cada prova e calcular a média dessas proporções. Ausência vale zero. Cada prova tem o mesmo peso, para que uma edição maior não domine o resultado. Empates consideram recorrência, quantidade e nome. Por exemplo, 5 de 10 itens em uma prova e nenhum de 100 na outra resultam em 25% de participação média. Não equivalem a 5/110 do acervo. Filtros de disciplina e assunto recalculam o denominador. Se uma prova selecionada não tiver itens no recorte, sua contribuição à média é zero. Assuntos e subassuntos só podem ser filtrados quando conhecidos; itens sem classificação revisada continuam visíveis nas consultas amplas. Os detalhes mostram a proporção individual de cada prova. A distribuição por disciplina usa a quantidade agregada do recorte.

Frequência passada não é previsão da próxima prova. A análise não aplica pesos oficiais, recência presumida, correspondência automática com o edital vigente ou desempenho individual. Uma amostra de uma ou duas edições limita conclusões sobre recorrência. Confira também o conteúdo e os pesos do edital de estudo antes de decidir o tempo a dedicar.

O catálogo amplo original permanece em [exam-history.ts](../shared/exam-history.ts). A classificação atual usa [contest-taxonomy.ts](../shared/contest-taxonomy.ts), versão `concursos-2`, os itens de [theme-catalog.ts](../shared/theme-catalog.ts) e as páginas de [reference-pages.ts](../shared/reference-pages.ts). A análise do acervo reconhece a prova pela procedência e exige uma assinatura SHA-256 do enunciado, contexto, formato e alternativas igual à de um item revisado. Somente espaços em branco e normalização Unicode são desconsiderados; número, nome do arquivo ou palavras-chave isoladas não atribuem subassunto. As assinaturas de 320 itens atualmente importáveis (Paraná 2024 e PF 2018/2025), incluindo seis variantes de extração revisadas, ficam em [theme-signatures.json](../server/theme-signatures.json), versão de conteúdo `temas-1`. Rever a hierarquia não altera as assinaturas. Os 90 itens de Paraná 2017 integram o histórico editorial; a inclusão deles no acervo ainda depende de extração e assinaturas revisadas compatíveis.

Questão editada cujo conteúdo não coincide com a versão revisada fica com tema pendente. Novas provas também ficam pendentes até ampliar o catálogo editorial, sem bloquear importação ou estudo. O detalhamento é projetado na consulta; não regrava tópicos, revisões, tentativas, arquivos ou gabaritos, e não exige reimportação. Todo o processamento continua local, sem serviço de IA nem envio de documentos a terceiros. A cobertura visível indica quantos itens receberam tema, evitando confundir uma análise parcial com uma análise completa.

## Fontes

- [Edital do Paraná 2017](https://www.policiacientifica.pr.gov.br/sites/policia-cientifica/arquivos_restritos/files/documento/2020-10/2017_edital_abertura_concurso_retificado.pdf) · [Caderno da Área 1 em espelho](https://arquivos.qconcursos.com/prova/arquivo_prova/53511/ibfc-2017-policia-cientifica-pr-perito-criminal-area-1-prova.pdf).
- [Paraná 2024 e PF 2025](concursos-piloto.md).
- [Provas da Polícia Federal de 2018](https://www.gov.br/pf/pt-br/acesso-a-informacao/servidores/concursos/provas-e-gabaritos-de-concursos-anteriores/concurso-carreira-policial-2018/perito).
