# Validação — 11/11/2026

- 31 testes passaram nas suítes de preparação, questões, foco, importação e estudo. Após acrescentar a projeção de cartões originados em tentativas classificadas, os 7 testes de preparação passaram novamente. Os 4 testes de taxonomia também haviam passado na execução anterior, sem mudança na taxonomia.
- Build de produção com TypeScript e Vite aprovado; artefatos locais em dist.
- Migração v3 → v4 testada isoladamente: tentativas, leitura, revisões, cartões, material e IDs preservados. Testes cobrem equivalência exata, aliases de disciplina, equivalência manual reversível sem transitividade, denominação genérica sem crédito automático, troca de edital, banco único, cadastro de terceiro concurso, pausa e persistência após reinício.
- Classificação revisada por conteúdo encontra o assunto do edital mesmo com vínculo pessoal antigo genérico; a tentativa conserva o caminho da revisão respondida quando o conteúdo atual é substituído. Leitura e prática são distintas; última resposta por questão determina erros/chutes. Revisão compartilhada conta uma vez.
- A migração de uma cópia do SQLite preservou o histórico, os vínculos e os identificadores. Os objetivos sem edital cadastrado indicaram a pendência.
- Um cenário com dois objetivos confirmou o reaproveitamento de leitura e prática com uma única tentativa registrada.
- Revisão visual inicial no Chrome nativo: painel único, navegação sem seletor global, dois cards de concursos, pendência de edital, fila única de revisões e demonstração identificada. Layout desktop observado sem sobreposição no painel inicial.
- Limite: a ferramenta interrompeu automaticamente a conferência visual adicional porque não conseguiu confirmar a URL do Chrome com segurança. O cenário com progresso preenchido e o restante dos fluxos não receberam revisão visual completa. Foram verificados por projeções, API e testes; não se afirma validação mobile ou de PDFs nesta entrega.

O painel mede cobertura dos assuntos cadastrados. Datas e prioridade pessoal orientam o plano, e a incidência histórica fica disponível para consulta separada.
