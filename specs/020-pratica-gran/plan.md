# Plano

Integrar o Gran ao Banco de questões existente. A primeira entrega oferece o recorte de Raciocínio Lógico da IBFC informado para estudo pessoal. Conectar e consultar já carrega a primeira página. A paginação mantém os filtros.

O servidor local consulta exclusivamente o endereço HTTPS do Gran com a sessão fornecida pelo estudante, valida a página e normaliza o conteúdo. A chave de cada questão fica no servidor, vinculada à página consultada, com memória limitada. Desconexão, recusa da sessão e encerramento do servidor liberam a sessão e as chaves mantidas em memória. Não persistir questões, respostas ou credenciais.

Renderizar as figuras na própria questão quando o endereço pertence ao CDN observado no recorte. O navegador carrega as imagens sem receber o token da sessão.

Validar com a resposta real e com testes do contrato local, incluindo paginação, gabarito ausente, credencial recusada e preservação do acervo. Compilar e verificar o fluxo de conexão, resposta e desconexão.
