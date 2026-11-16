# Correção com gabarito preliminar

Substitui a exigência de gabarito definitivo das entregas 001 e 004, conforme orientação do usuário de 11/11/2026.

## Requisitos e aceite

1. Gabarito preliminar da própria prova permite “Salvar todas as questões” e corrigir respostas pelo mesmo fluxo do definitivo, sem confirmação adicional. PDFs já importados passam a funcionar sem reimportação.
2. Preservar validações de trilha, concurso, bloco, versão, número, alternativas e ambiguidade. Gabarito ausente ou incompatível mantém o item visível e pendente, sem correção nem nota.
3. Identificar o preliminar na importação, seleção de gabarito, prática e resultado/histórico. Em PDFs mistos, determinar a condição pela página do gabarito aplicado; não tratar páginas definitivas de outras áreas como se fossem da prova selecionada.
4. Cada revisão guarda a condição preliminar, arquivo e página do gabarito usado. Aplicar outro gabarito compatível cria revisão quando necessário, mantém a identidade da questão e preserva tentativas e resultados anteriores. Repetir a gravação não duplica questões ou revisões.
5. Textos do produto e documentação explicam a possibilidade de usar o preliminar sem exigir o pós-recurso. Manter a interface simples: aviso curto e a ação habitual.
6. Recuperar automaticamente alternativas cujo marcador separado por espaço, como “c )”, ficou incorporado na alternativa anterior. Corrigir a leitura de novas importações e a projeção de rascunhos existentes, somente quando a separação recompõe A–E completos, ordenados e não vazios; preservar conteúdo, fontes e histórico. No caderno A real, conferir as questões 7, 22 e 61 junto com as demais 77.

## Validação

- Integração de importação preliminar → gravação em lote/API → resposta, sem reimportação.
- Publicação individual, PDF misto, versão/cargo incompatível, ausência/ambiguidade, anuladas, repetição e substituição por definitivo com histórico preservado.
- Migração de banco existente e build de produção. Conferência dos dados reais somente em cópia isolada.
