# Tarefas

- [x] T1 (R1, C1) Criar os assets e atualizar o atalho.
- [x] T2 (R2, R3, R4) Mostrar o carregamento nativo e executar a preparação em segundo plano.
- [x] T3 (C1–C4) Verificar o atalho e os cenários de inicialização.

## Verificação no Windows

- C1. O atalho existente aponta para o lançador e para o ICO de sete tamanhos, de 16 a 256 px.
- C2. Com o build existente e dados isolados, a tela apareceu em cerca de 5 s e fechou quando a janela principal abriu em cerca de 28 s. A página inicial retornou HTTP 200. Uma chamada concorrente terminou sem criar outra sessão.
- C3. Um processo ocupando a porta 4183 permaneceu ativo e o lançador mostrou o aviso em português.
- C4. Fechar a janela dedicada encerrou o lançador com sucesso e liberou a porta.
- A recompilação de uma cópia sem build ficou pendente de verificação de ponta a ponta.
