# Remoção reversível de conteúdo

## Objetivo
Retirar do acervo a importação PR 2024 que reúne A/B/C e permitir desfazer cadastros pela interface, sem perder procedência nem estudo registrado. As versões são cadernos alternativos; a numeração não comprova identidade de conteúdo entre versões.

## Requisitos e aceites
- RF-01: Acervo oferece Remover ao lado de cada documento e no documento aberto, inclusive durante processamento. Confirmar com o nome e o efeito; cancelar não altera dados. Cadernos removidos deixam Questões, treino e incidência do acervo. Editais removidos retiram seus tópicos do plano. Gabaritos removidos tornam questões dependentes pendentes, sem correção nova.
- RF-02: Remoção é lógica e transacional. Conservar PDF, páginas, rascunhos, revisões, tentativas, leituras, cartões e revisões de cartões. Não alterar respostas antigas nem aplicar outro gabarito automaticamente. Reimportação idêntica restaura o mesmo documento e IDs.
- RF-03: Concursos, edições, tópicos, materiais compartilhados e cartões cadastráveis também oferecem Remover no contexto. Remover um concurso/edição retira seu conteúdo das listas ativas; conteúdo compartilhado com outro objetivo permanece. Remover tópico não apaga estudo. Edição ativa só pode ser removida após ativar outra. Deve ser possível remover todos os concursos e cadastrar novamente.
- RF-04: Itens removidos ficam recolhidos no Acervo e podem ser restaurados, com o mesmo histórico. Restaurar filho com pai removido pede restaurar o pai primeiro. Restaurar não restaura outros itens removidos individualmente.
- RF-05: Remover apenas o PDF piloto PR 2024 A/B/C existente, após cópia de segurança. Não remover outros documentos, gabaritos ou o histórico editorial de referência, que é uma fonte separada e explicitamente identificada.

## Validação
API e banco isolado: remover/restaurar caderno salvo e sem gabarito; sumiço das listas e análises; preservação de histórico/IDs; gabarito removido bloqueia correção sem afetar outra prova; cancelamento de worker; pais/filhos e conteúdo compartilhado; todos concursos removidos. Build e inspeção visual do fluxo. Conferir banco real antes/depois da retirada do piloto.
