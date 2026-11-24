# Plano

Usar o Chrome instalado pelo canal do Playwright. Ler o estado de hidratação do documento público, `window.__NUXT__.data[0].questoes.displayed`, e conferir os IDs contra os cartões renderizados. Reutilizar o validador e o mapeamento de alternativas do Gran. O campo `resposta` do documento corresponde ao ID de um item de `itens`.

Validar o link da página 2, navegar para seu endereço e validar o documento. Gravar um JSON em `work/gran-amostra` depois que as duas páginas forem conferidas. Exercitar com respostas simuladas a sequência 1 → 2, o gabarito inválido e a interrupção por HTTP 429. Conferir a amostra real.

[Navegação em páginas no Playwright](https://playwright.dev/docs/api/class-page#page-goto)
