# Tarefas

- [x] Adicionar janela Electron, instância única e comunicação interna por pipe nomeado. (R1, R3, R4)
- [x] Configurar seleção de dados, empacotamento Windows e documentação. (R1, R2, R5)
- [x] Validar interface, leitura e gravação de dados, PDFs, OCR, downloads e encerramento no executável. (C1–C3)
- [x] Verificar modo web e atualizar o atalho para o build validado. (C4)

O build Vite e os 71 testes passaram. O executável empacotado abriu com a porta 4183 ocupada, encerrou a instância duplicada, importou e exibiu um PDF, executou OCR em português e baixou o backup de resumos. A cópia do banco atual preservou o acervo e as gravações feitas durante a validação após reiniciar. As verificações de integridade e chaves estrangeiras passaram.

A abertura normal no Windows confirmou zero portas TCP em escuta e o encerramento ao fechar a janela. O atalho `ConcurserO` da Área de Trabalho abriu o executável empacotado com a pasta `data` existente.
