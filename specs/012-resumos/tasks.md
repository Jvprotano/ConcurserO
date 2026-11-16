# Tarefas

- [x] T01 — Implementar persistência, API, controle de versão e arquivamento (RF-01, RF-02; aceites 1–2).
- [x] T02 — Implementar tela, editor, pesquisa e criação contextual na agenda com referência à apostila (RF-01, RF-02; aceites 1–2).
- [x] T03 — Implementar exportação, gravação automática opcional em pasta, feedback e restauração idempotente (RF-03, RF-04; aceites 3–4).
- [x] T04 — Validar build, fluxo completo e cenários de perda de dados. Documentar como configurar a pasta do Drive e restaurar uma cópia (aceites 1–4).

## Verificação

- Build de produção concluído.
- Chrome com banco e perfil isolados. Conferidos abertura pela sessão de teoria, metadados da apostila, formatação persistida, aviso de edição pendente, busca sem acentos, arquivamento, restauração e gravação em pasta. O teste abriu a URL gerada pelo atalho contextual e conferiu que o link usa uma nova aba.
- API com dois bancos temporários. Conferidos cópia manual, falha de pasta, retentativa, versão concorrente, validação de arquivo, portabilidade dos metadados, conflito e restauração repetida.
- As migrações de teste de v3 e v5 passaram na retestagem com os esquemas históricos atualizados para simular a ausência das tabelas novas.
- A sincronização com uma conta real do Google Drive depende da instalação e configuração do cliente do Drive e não foi exercitada.
