# Tarefas

- [x] T01 — Ajustar navegação e margens da rota Resumos e preservar o acesso ao menu (RF-01).
- [x] T02 — Reorganizar biblioteca, cabeçalho e editor, preservando rascunho, filtros e ações secundárias (RF-02 e RF-04).
- [x] T03 — Manter formatação e salvamento acessíveis e dimensionar a área de escrita (RF-03).
- [x] T04 — Validar larguras, edição, salvamento e navegação com dados isolados (RF-01 a RF-04).

No Chrome, a área de texto teve 779 px úteis em uma janela de 960 px. A biblioteca ficou ao lado do editor a 1280 px. A 320 e 375 px, a navegação e os controles couberam sem rolagem horizontal. Também foram verificados rascunho, filtros, confirmação de descarte, formatação, salvamento durante a rolagem, reabertura, vínculo à apostila, arquivamento, restauração e acesso ao backup.

`npm run build` e `node --test tests/summaries.test.ts` passaram.
