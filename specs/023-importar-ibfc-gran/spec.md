# Importar questões IBFC pelo Gran

O [recorte pelas disciplinas do edital](../024-ibfc-disciplinas-do-edital/spec.md) passa a ser o padrão. A busca por banca deste documento está disponível com `-TodasDisciplinas`.

- **R1.** Disponibilizar um script manual para consultar a IBFC no Gran, sem filtro de disciplina. Começar na página 1 por padrão, com tamanho padrão de 100 e tamanho ajustável.
- **R2.** Consultar uma página por vez e aguardar um intervalo fixo e configurável de 5 segundos por padrão entre páginas. Confirmar banca, página, tamanho e total antes de gravar. Ao receber limitação, recusa de sessão ou resposta incompatível, manter as páginas gravadas e informar onde retomar.
- **R3.** Gravar no mesmo banco SQLite usado pela prática offline, por meio da normalização e da gravação já usadas pelo app. Preservar gabaritos e cópias existentes, inclusive itens removidos.
- **R4.** Solicitar token e X-Client-ID com entrada mascarada. Manter as credenciais apenas durante a execução.

## Aceite

1. O script envia a banca 277 e a paginação, sem enviar assunto. Uma execução com duas páginas salva ambas em sequência e respeita a pausa configurada antes da segunda consulta (R1–R3).
2. Repetir uma página preserva os registros existentes. Uma página de outra banca ou com paginação inconsistente não é gravada (R2, R3).
3. Um HTTP 429 interrompe as consultas e indica a próxima página, sem perder resultados anteriores (R2).
4. O script usa o banco indicado por CONCURSERO_DATA ou o banco padrão do projeto e não exige servidor em execução (R3, R4).
