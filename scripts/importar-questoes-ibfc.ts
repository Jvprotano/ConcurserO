import { closeSync, existsSync, mkdirSync, openSync, writeSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Problem, Store } from '../server/db.ts';
import { granStorageError } from '../server/gran-diagnostics.ts';
import { exportGranQuestions, granImportInput, granResumeFlags, importGranQuestions } from '../server/gran-import.ts';

async function run(log: (message: string) => void, root: string) {
  process.stdin.setEncoding('utf8');
  let input = '';
  for await (const chunk of process.stdin) input += chunk;
  let data: unknown;
  try { data = JSON.parse(input); } catch { throw new Problem('Entrada inválida. Use o comando PowerShell.'); }
  const options = granImportInput.safeParse(data);
  if (!options.success) {
    const fields = [...new Set(options.error.issues.map(issue => issue.path.join('.') || 'entrada'))];
    throw new Problem('Parâmetros inválidos. Confira os campos: ' + fields.join(', ') + '.');
  }

  const scope = options.data.allSubjects ? 'todas as disciplinas' : 'disciplinas do edital Paraná 2024 · todos os concursos';
  const settings = 'IBFC · ' + scope + ' · até ' + options.data.pageSize + ' itens por página · pausa de ' +
    options.data.pauseSeconds + ' s entre consultas';
  if (options.data.exportDirectory) {
    const exportOptions = { ...options.data, exportDirectory: resolve(options.data.exportDirectory) };
    log(settings);
    const result = await exportGranQuestions(exportOptions, fetch, log);
    log(result.processed + ' páginas consultadas · ' + result.saved + ' registros em novos arquivos · ' +
      result.received + ' questões únicas recebidas nesta execução · total informado pelo Gran ' + result.total);
    if (result.nextPage) log('Próxima página: ' + result.nextPage + '. Retome com ' + granResumeFlags(result.nextPage, exportOptions) + '.');
    return;
  }
  const directory = resolve(root, process.env.CONCURSERO_DATA ?? 'data');
  const database = resolve(directory, 'concursero.sqlite');
  if (!existsSync(database)) throw new Problem('Banco do ConcurserO não encontrado em ' + database);
  log(settings + ' · banco em ' + database);
  let store: Store;
  try {
    store = new Store(directory, { recoverImports: false });
  } catch (error) {
    throw new Problem('Falha ao abrir o banco local' + granStorageError(error) + '.', 500);
  }
  try {
    const result = await importGranQuestions(store, options.data, fetch, log);
    log(result.processed + ' páginas gravadas · ' + result.saved + ' questões novas · ' +
      result.received + ' questões únicas recebidas nesta execução · total informado pelo Gran ' + result.total);
    if (result.nextPage) log('Próxima página: ' + result.nextPage + '. Retome com ' + granResumeFlags(result.nextPage, options.data) + '.');
  } finally {
    store.db.close();
  }
}

async function main() {
  const root = fileURLToPath(new URL('../', import.meta.url));
  const directory = resolve(root, 'work', 'gran-import');
  mkdirSync(directory, { recursive: true });
  const path = resolve(directory, 'ibfc-' + new Date().toISOString().replaceAll(':', '-') + '-' + process.pid + '.log');
  const file = openSync(path, 'wx');
  function log(message: string, error = false) {
    const line = new Date().toISOString() + ' · ' + (error ? 'ERRO · ' : '') + message;
    writeSync(file, line + '\n', undefined, 'utf8');
    if (error) console.error(line);
    else console.log(line);
  }
  try {
    log('Log em ' + path + ' · Node ' + process.version);
    await run(log, root);
  } catch (error) {
    log(error instanceof Problem ? error.message : 'Falha interna na importação' + granStorageError(error) + '.', true);
    process.exitCode = 1;
  } finally {
    closeSync(file);
  }
}

await main().catch(error => {
  console.error('Não foi possível gravar o log em work/gran-import' + granStorageError(error) + '.');
  process.exitCode = 1;
});
