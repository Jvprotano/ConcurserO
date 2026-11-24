# Aplicativo desktop para Windows

## Objetivo

Abrir o ConcurserO pelo atalho existente como aplicativo instalado no Windows e continuar o estudo com o acervo e o progresso atuais.

## Requisitos

- R1. Distribuir uma pasta executável com a interface, a lógica local e os runtimes incluídos. A abertura usa uma janela do ConcurserO e dispensa Chrome, Edge, Node.js e compilação no computador de destino.
- R2. Usar o SQLite e os PDFs existentes na origem indicada pelo atalho. Uma instalação nova mantém os dados em uma pasta de usuário fora do pacote.
- R3. Abrir PDFs, referências de estudo, resumos auxiliares e downloads na experiência desktop. Links externos usam o navegador padrão.
- R4. Reabrir o atalho foca a instância existente. O encerramento da última janela termina a sessão e os processos locais do aplicativo. A comunicação interna dispensa portas TCP para escuta.
- R5. Manter o modo web de desenvolvimento e documentar o empacotamento, o caminho de dados e a troca do atalho.

## Critérios de aceite

- C1 (R1, R4). O executável empacotado abre e exibe a área de estudo, inclusive com a porta 4183 ocupada. A instância duplicada termina e fechar as janelas encerra o aplicativo.
- C2 (R2). Uma cópia do acervo atual continua legível, com os mesmos registros e arquivos. Uma gravação na cópia permanece após reiniciar.
- C3 (R3). A janela empacotada importa um PDF, extrai ou reconhece texto e abre um PDF local. O backup de resumos pode ser baixado.
- C4 (R5). Build, testes compatíveis e documentação cobrem o modo web e a distribuição desktop. O atalho Windows aponta para o executável validado e a pasta de dados já utilizada.
