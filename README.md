# ConcurserO

Aplicação local para estudar para concursos públicos brasileiros. Organiza o plano pelo edital, reúne provas e gabaritos em PDF e acompanha questões, resumos e revisões.

## Instalar e abrir

No Windows, com Git e Node.js 24 ou superior, execute no PowerShell:

```powershell
git clone https://github.com/Jvprotano/ConcurserO.git
cd ConcurserO
npm.cmd ci
npm.cmd run build
npm.cmd start
```

Abra [127.0.0.1:4183](http://127.0.0.1:4183). Use Ctrl+C no terminal para encerrar. Para abrir em uma janela dedicada com Chrome ou Edge, veja o [lançador do Windows](specs/011-abertura-desktop/plan.md#compilar-o-lançador-no-windows).

## Começar a estudar

1. Em **Edital**, importe o PDF e use **Salvar tópicos** para definir os assuntos do plano.
2. Em **Acervo**, importe um caderno e o gabarito correspondente. As questões extraídas já ficam disponíveis para consulta e análise. Com gabarito, use **Salvar todas as questões** para praticar com correção.
3. Abra **Hoje** para estudar e revisar conforme o tempo disponível. Use **Resumos** para guardar anotações por disciplina e assunto.

A instalação inclui exemplos e referências de perícia em informática do Paraná e da Polícia Federal. Em **Acervo → Baixar provas disponíveis**, é possível obter cadernos e gabaritos oficiais da PF pela internet.

## Dados e documentação

O banco SQLite e os PDFs ficam em `data/`. Para fazer backup, encerre o app e copie a pasta inteira. Para restaurar, inicie o app com `CONCURSERO_DATA` apontando para uma cópia do backup.

- [Concursos e documentos de referência](docs/concursos-piloto.md) · [Fontes de questões](docs/fontes-de-questoes.md)
- [Incidência nas provas](docs/historico-de-provas.md) · [Taxonomia de concursos](docs/padroes-de-concursos.md)
- [Resumos e backup](docs/resumos.md)
- [Visão do produto](docs/produto.md) · [Especificações](specs/) · [Constituição](.specify/memory/constitution.md)

Para rodar os testes, use `npm.cmd test`.
