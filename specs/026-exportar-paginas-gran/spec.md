# Exportar páginas consultadas no Gran

- **R1.** Aceitar uma pasta de saída para exportar as respostas validadas da IBFC em JSON. Manter enunciado, alternativas, gabarito e procedência. O modo de exportação usa arquivos locais para gravar o resultado.
- **R2.** Reusar os filtros, a pausa e a validação de páginas existentes. Parar no HTTP 429 e informar como retomar. Preservar as páginas já exportadas.
- **R3.** Guardar uma cópia por conteúdo de página e preservar versões diferentes. Manter credenciais fora do JSON e dos logs.

## Aceite

1. O modo de exportação grava um JSON por página recebida sem abrir o SQLite (R1).
2. Um erro após uma página mantém o arquivo e mostra o mesmo recorte, pasta e paginação na retomada (R2).
3. Repetir a mesma resposta não cria cópia. A alteração de uma página gera outro arquivo e preserva o anterior (R3).
