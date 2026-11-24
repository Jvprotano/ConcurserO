# Plano

Reaproveitar a consulta autenticada e a gravação de questões do Gran. Adicionar um comando PowerShell que solicite as credenciais e as envie pela entrada padrão a um processo Node. O processo verifica cada resposta, grava a página em uma transação e informa a próxima página ao parar.

Validar o comando e testar páginas simuladas com um banco temporário, incluindo duplicatas, mudança de banca, redução de tamanho e limite de consultas.

Passar o parâmetro de pausa do PowerShell para o processo Node. Aguardar somente entre páginas de uma mesma execução e preservar o valor ao imprimir o comando de retomada.
