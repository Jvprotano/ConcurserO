# ConcurserO

Aplicação local para estudar para concursos públicos brasileiros. Organiza o plano pelo edital, reúne provas e gabaritos em PDF e acompanha questões, resumos e revisões.

## Abrir no Windows

Extraia a pasta `ConcurserO-win32-x64` e abra `ConcurserO.exe`. Mantenha os arquivos do pacote juntos. O aplicativo abre em uma janela própria e encerra ao fechar a última janela.

Para compilar o pacote a partir do código-fonte em Windows x64, use Git e Node.js 24 ou superior. Feche o aplicativo antes de recompilar na mesma pasta.

```powershell
git clone https://github.com/Jvprotano/ConcurserO.git
cd ConcurserO
npm.cmd ci
npm.cmd run package
```

O executável fica em `release\ConcurserO-win32-x64\ConcurserO.exe`. A partir do repositório, `.\Abrir-ConcurserO.ps1` abre o pacote com os dados de `data\`. Para atualizar um atalho existente, use `"<pasta do projeto>\release\ConcurserO-win32-x64\ConcurserO.exe" "--data-dir=<pasta do projeto>\data"` como destino. Feche a sessão anterior antes de passar a usar o atalho atualizado.

Para desenvolvimento web, execute `npm.cmd run build` e `npm.cmd start`. Abra [127.0.0.1:4183](http://127.0.0.1:4183) e use Ctrl+C para encerrar. `npm.cmd run desktop` abre o build local no Electron em desenvolvimento.

## Começar a estudar

1. Em **Edital**, importe o PDF e use **Salvar tópicos** para definir os assuntos do plano.
2. Em **Acervo**, importe um caderno e o gabarito correspondente. As questões extraídas já ficam disponíveis para consulta e análise. Com gabarito, use **Salvar todas as questões** para praticar com correção.
3. Abra **Hoje** para estudar e revisar conforme o tempo disponível. Use **Resumos** para guardar anotações por disciplina e assunto.

A instalação inclui exemplos e referências de perícia em informática do Paraná e da Polícia Federal. Em **Acervo → Baixar provas disponíveis**, é possível obter cadernos e gabaritos oficiais da PF pela internet.

## Questões e provas

Abra **Questões → Banco local** para resolver questões importadas do Gran ou de cadernos PDF. Filtre por disciplina, assunto, banca ou tentativa. Os resultados alimentam o **Caderno de erros**, as sessões do edital e a **Revisão intercalada** quando há correspondência de conteúdo. Use **Provas** para praticar com os cadernos do Acervo.

Em **Questões → Buscar no Gran**, informe o token da sessão ativa e o X-Client-ID e escolha **Conectar e buscar**. A consulta carrega Raciocínio Lógico da IBFC. Use **Salvar página offline** para copiar as questões e seus gabaritos para o banco local. As credenciais ficam em memória até a desconexão ou o encerramento do servidor.

O banco local funciona sem sessão do Gran. Figuras externas precisam de internet. Questões removidas podem ser restauradas em **Acervo → Itens removidos**.

### Importar páginas da IBFC pelo PowerShell

Execute na pasta do ConcurserO. O comando solicita o token e o X-Client-ID com entrada mascarada.

```powershell
.\scripts\Importar-QuestoesIBFC.ps1
```

Por padrão, o script busca questões da **IBFC de todos os concursos** nas disciplinas e nos assuntos do edital Paraná 2024, Área 3. Entra Português e Redação Oficial, Lógica e Metodologia Científica, Informática e TI, Criminalística e Medicina Legal, Direito aplicado e legislação selecionada. A cobertura depende da classificação do Gran. Use `-TodasDisciplinas` para consultar a banca inteira.

O script começa na página 1, solicita 100 itens por página e aguarda 5 segundos entre consultas. Use `-PausaSegundos 10` para aumentar o intervalo. As questões aparecem em **Questões → Banco local**, com deduplicação por ID do Gran. O script interrompe a carga se o Gran recusar a sessão, retornar HTTP 429 ou alterar a estrutura das páginas. Cada página já gravada é preservada.

Para uma primeira execução de apenas uma página, use `-MaxPaginas 1`. Para retomar, use os parâmetros que o script mostra na saída. Comece na página 1 se mudar o tamanho ou o recorte.

O caminho do log aparece na primeira linha. Os registros em `work/gran-import` mostram a etapa, o status HTTP ou o erro de rede e os valores usados para validar a página. As credenciais ficam fora dos logs.

Para exportar as páginas em JSON, indique uma pasta de saída. O comando grava os arquivos no recorte escolhido e preserva o progresso ao parar. Para retomar, use os parâmetros mostrados no log.

```powershell
.\scripts\Importar-QuestoesIBFC.ps1 -ExportarPara .\exportacao-ibfc
```

### Amostra de duas páginas no Chrome

Com o Chrome instalado, execute `node scripts/exportar-questoes.ts 2`. O Playwright abre as páginas 1 e 2 da IBFC e encerra. O JSON fica em `work/gran-amostra` e inclui os enunciados, as alternativas, o texto associado disponível, a origem e os gabaritos fornecidos pelo Gran. O arquivo é gravado depois de validar as duas páginas e o gabarito de cada questão.

## Dados e documentação

O banco SQLite e os PDFs ficam em `%APPDATA%\ConcurserO\data` em uma instalação desktop nova e em `data/` ao abrir pelo script do projeto. `CONCURSERO_DATA` escolhe outra pasta. O argumento `--data-dir=<pasta>` tem prioridade no executável desktop. Para fazer backup, encerre o app e copie a pasta de dados inteira. Para restaurar, abra o app apontando para uma cópia desse backup.

- [Concursos e documentos de referência](docs/concursos-piloto.md) · [Fontes de questões](docs/fontes-de-questoes.md)
- [Incidência nas provas](docs/historico-de-provas.md) · [Taxonomia de concursos](docs/padroes-de-concursos.md)
- [Resumos e backup](docs/resumos.md)
- [Visão do produto](docs/produto.md) · [Especificações](specs/) · [Constituição](.specify/memory/constitution.md)

Para rodar os testes, use `npm.cmd test`.
