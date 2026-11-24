# Prática com Gran Questões

A [prática offline](../022-gran-offline/spec.md) acrescenta a opção de salvar as questões da página consultada.

## Requisitos

- **R1.** Em **Praticar provas → Banco de questões**, conectar uma sessão do Gran para buscar e resolver dentro do ConcurserO o recorte de Raciocínio Lógico da IBFC com os filtros informados. Identificar a fonte, mostrar o total informado e navegar página por página.
- **R2.** Exibir enunciado, alternativas, texto de apoio, figuras do CDN do Gran e procedência quando entregues pelo Gran. Revelar a correção somente após uma resposta. Indicar pendência quando o gabarito não corresponder às alternativas e indicar anulação sem pontuar.
- **R3.** Usar a sessão fornecida pelo estudante para consultas sob demanda ao Gran. Manter credenciais e dados das questões em memória durante o uso local. Oferecer desconexão e orientar a renovação quando o Gran recusar a sessão.
- **R4.** Preservar as provas locais e os atalhos públicos do Gran.

## Aceite

1. Conectar e buscar a primeira página com os parâmetros informados. Avançar e voltar por página, com fonte e contagem visíveis (R1).
2. Enviar ao navegador os dados de prática sem a chave. Corrigir com o identificador da alternativa da página exibida. Questão sem chave compatível permanece respondível com correção pendente (R2).
3. Desconectar e invalidar a sessão e as correções em memória. Exibir mensagens específicas para credencial recusada, limite de consultas e falhas de rede. As questões e tentativas ficam fora do acervo local (R3).
4. A prática local mantém suas rotas e fluxos (R4).

## Referências

- [Banco e filtros do Gran Questões](https://questoes.grancursosonline.com.br/questoes)
- [Termos do Gran](https://www.grancursosonline.com.br/termos-de-uso)
- A consulta autorizada do recorte em 23/11/2026 retornou 736 resultados e 20 questões na página 1. A paginação veio em `data` e `resposta` apontou para o ID de um item da própria questão.
