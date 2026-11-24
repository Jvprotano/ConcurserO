# Diagnóstico da importação do Gran

- **R1.** Mostrar no terminal e em um arquivo por execução o início, a página solicitada, o status HTTP, o tempo de resposta, o resultado da validação e o resumo de gravação.
- **R2.** Distinguir falha de conexão, falha de leitura ou JSON, recusa HTTP, resposta incompatível e erro no SQLite. Mostrar códigos técnicos e campos inválidos quando disponíveis.
- **R3.** Registrar apenas metadados de diagnóstico. O token, o X-Client-ID, os conteúdos da resposta e as mensagens internas brutas ficam fora dos logs.
- **R4.** Preservar a pausa, a deduplicação e a interrupção em HTTP 429. Informar `Retry-After` quando válido e manter os dados já gravados.

## Aceite

1. Uma falha de DNS ou timeout informa a etapa e o código detectado (R1, R2).
2. Uma resposta HTTP recusa a consulta com o código original registrado. Uma página inválida informa os campos ou valores de paginação que causaram a rejeição (R1, R2, R4).
3. O arquivo contém o mesmo diagnóstico do terminal. Texto de amostra inserido em uma mensagem interna e credenciais de teste ficam fora do arquivo (R1, R3).
