# Amostra das duas primeiras páginas do Gran no navegador

- **R1.** Abrir a página 1 pública da IBFC em uma sessão isolada do Chrome e avançar pelo endereço do link de paginação para a página 2 da mesma busca.
- **R2.** Usar os dados da listagem que o Gran já envia com cada página. Conferir a banca, os IDs exibidos, a unicidade das questões e a correspondência entre cada gabarito e uma alternativa da questão.
- **R3.** Gerar um JSON com as duas páginas validadas e encerrar o navegador. Num erro de navegação, limite HTTP 429 ou ausência de gabarito verificável, encerrar com diagnóstico e sem exportação parcial.
- **R4.** Preservar a origem, os enunciados, as alternativas, o texto de apoio disponível e o gabarito com ID e rótulo. A operação usa apenas navegação pública e grava o arquivo localmente.

## Aceite

1. A execução visita somente as páginas 1 e 2 da busca e encerra após salvar um arquivo (R1, R3).
2. O arquivo contém questões distintas da IBFC, cada uma com um gabarito que aponta para uma alternativa válida e com a sua página de origem (R2, R4).
3. Uma falha HTTP ou inconsistência de conteúdo encerra a execução sem gerar uma amostra incompleta (R2, R3).
