# Plano de implementação

- Usar Electron com janela própria, ícone existente e instância única. Montar a pasta executável a partir do runtime Electron, como no TanoPlayer, com o build Vite e as dependências de produção listadas no lockfile npm. React, ícones e fontes já entram no build Vite e suas dependências ficam no ambiente de compilação. (R1, R4)
- Manter as rotas, validações e arquivos estáticos do Express. Um protocolo interno do Electron encaminha as requisições por um pipe nomeado Windows autenticado. A interface roda com isolamento e sandbox, e as janelas locais e links externos seguem destinos explícitos. (R3, R4)
- Atualizar a versão do PDF.js que acompanha o pacote para incorporar a correção GHSA-hq66-cqwq-w95j, usar a mesma dependência nativa de canvas no OCR e revalidar ambos os fluxos. (R3)
- Aceitar a pasta existente por argumento de atalho ou variável de ambiente. A pasta padrão do executável empacotado fica no perfil do Windows. Usar uma cópia do acervo para gravações de validação. (R2)
- Preservar o comando web para desenvolvimento. Validar o pacote real, atualizar o README e apontar o atalho existente para o executável. (R1–R5)
