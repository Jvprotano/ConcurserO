# Abertura do ConcurserO no Windows

## Objetivo

Reconhecer o ConcurserO na Área de Trabalho e receber retorno visual logo ao iniciar o estudo.

## Requisitos

- R1. O atalho existente exibe um ícone próprio que remete à dedicação aos estudos.
- R2. A abertura mostra uma janela de carregamento antes das verificações e da inicialização do servidor. A janela permanece responsiva durante a preparação, inclusive quando o build é necessário.
- R3. A janela de carregamento fecha automaticamente quando a janela principal aparece. Se a abertura falhar, o usuário recebe o motivo. Cliques repetidos iniciam uma única sessão.
- R4. Fechar a janela principal encerra o servidor da sessão e preserva o armazenamento local e o perfil dedicado.

## Critérios de aceite

- C1 (R1). O atalho aponta para um arquivo ICO válido com tamanhos para o Windows.
- C2 (R2, R3). Ao abrir pelo atalho com o servidor parado, o carregamento fica visível antes da janela principal. Em nova tentativa durante a abertura, continua existindo uma única sessão.
- C3 (R3). Uma porta ocupada encerra o carregamento com uma mensagem e preserva o processo que já ocupava a porta.
- C4 (R4). Fechar a janela principal libera a porta e não afeta outras janelas do navegador.
