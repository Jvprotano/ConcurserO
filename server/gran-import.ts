import { createHash, randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { setTimeout } from 'node:timers/promises';
import { z } from 'zod';
import { Problem, type Store } from './db.ts';
import { granStorageError } from './gran-diagnostics.ts';
import { fetchGranPage, granCredentials, granPracticeEntries, granSubjectMatches, ibfcBoardId, saveGranQuestions } from './gran-questions.ts';

// Identificadores do catálogo do Gran para o Anexo IV do edital Paraná 2024, Área 3.
const parana2024Subjects = [
  403587, // Língua Portuguesa
  406881, // Redação Oficial
  404257, // Raciocínio Lógico
  400315, // Metodologia Científica
  405030, // Informática
  14,     // Tecnologia da Informação
  402256, // Sistemas de Informação
  429985, // Criminalística
  429609, // Medicina Legal
  450576, // Noções de Medicina Legal
  405199, // Direito Constitucional
  406223, // Direito Penal
  406602, // Direito Processual Penal
  446072, // Direito Digital
  406458, // Lei de Execução Penal
  421855, // Legislação de Trânsito e CTB
  394547, // Lei de Propriedade Industrial
  395526, // Legislação estadual do Paraná
  401480, // Lei da Perícia Oficial
  401868, // Lei do Susp
];

export const granImportInput = granCredentials.extend({
  firstPage: z.number().int().min(1),
  pageSize: z.number().int().min(1).max(100),
  maxPages: z.number().int().nonnegative(),
  pauseSeconds: z.number().int().min(1).max(2_147_483).default(5),
  allSubjects: z.boolean().default(false),
  exportDirectory: z.string().trim().min(1).optional(),
});

type GranImportOptions = z.infer<typeof granImportInput>;
type Page = Awaited<ReturnType<typeof fetchGranPage>>;
type RecordPage = (page: Page, subjects: ReadonlySet<number>) => { saved: number; existing: number };

export function granResumeFlags(page: number, { pageSize, pauseSeconds, allSubjects, exportDirectory }: GranImportOptions) {
  return '-PaginaInicial ' + page + ' -TamanhoPagina ' + pageSize + ' -PausaSegundos ' + pauseSeconds +
    (allSubjects ? ' -TodasDisciplinas' : '') +
    (exportDirectory ? " -ExportarPara '" + exportDirectory.replaceAll("'", "''") + "'" : '');
}

async function collectGranPages(
  options: GranImportOptions, record: RecordPage, request: typeof fetch, log: (message: string) => void,
) {
  const { firstPage, pageSize, maxPages, pauseSeconds } = options;
  const subjects = new Set(options.allSubjects ? [] : parana2024Subjects);
  let page = firstPage;
  let total: number | undefined;
  let totalPages = 0;
  let processed = 0;
  let saved = 0;
  let existing = 0;
  const seen = new Set<number>();
  try {
    for (;;) {
      const query = new URLSearchParams({
        'banca[]': String(ibfcBoardId), page: String(page), perPage: String(pageSize), resolucao: 'TODAS',
        sort: JSON.stringify([{ anos: 'desc' }, { _score: 'desc' }]),
      });
      for (const id of subjects) query.append('assunto[]', String(id));
      log('Página ' + page + ' · solicitando ' + pageSize + ' itens · banca ' + ibfcBoardId +
        ' · ' + (subjects.size ? subjects.size + ' filtros de assunto' : 'todas as disciplinas'));
      const result = await fetchGranPage(options, query, request, log);
      log('Gran · página ' + result.page + '/' + result.pages + ' · ' + result.rows.length + ' recebidas · total ' + result.total);
      if (result.perPage !== pageSize) {
        throw new Problem('O Gran devolveu um tamanho diferente do solicitado (' + (result.perPage ?? 'sem tamanho') + ').', 502);
      }
      if (result.total === 0 && result.rows.length === 0 && page === 1 && total === undefined && result.pages <= 1) {
        log('A busca não retornou questões da IBFC.');
        break;
      }
      const expectedPages = Math.ceil(result.total / pageSize);
      const expectedRows = Math.min(pageSize, result.total - (page - 1) * pageSize);
      if (page > expectedPages || result.pages !== expectedPages || result.rows.length !== expectedRows ||
          (total !== undefined && result.total !== total)) {
        const previous = total === undefined ? '' : ', total anterior ' + total;
        throw new Problem('A paginação do Gran mudou ou a página veio incompleta. Esperados ' + expectedRows +
          ' itens e ' + expectedPages + ' páginas para o total atual' + previous + '.', 502);
      }
      const wrongBoard = result.rows.find(item => !item.bancas?.some(board => board.id === ibfcBoardId));
      if (wrongBoard) {
        throw new Problem('O Gran retornou questões fora do filtro da IBFC. Primeira ocorrência: questão ' + wrongBoard.id +
          ', bancas recebidas ' + (wrongBoard.bancas?.map(board => board.id).join(', ') || 'nenhuma') + '.', 502);
      }
      const wrongSubject = subjects.size ? result.rows.find(item =>
        !item.assuntos?.some(subject => granSubjectMatches(subject, subjects))) : undefined;
      if (wrongSubject) {
        throw new Problem('O Gran retornou questões fora dos assuntos do edital ou sem classificação verificável. ' +
          'Primeira ocorrência: questão ' + wrongSubject.id + ', assuntos recebidos ' +
          (wrongSubject.assuntos?.map(subject => subject.id).join(', ') || 'nenhum') + '.', 502);
      }
      total = result.total;
      totalPages = result.pages;
      const recorded = record(result, subjects);
      processed++;
      saved += recorded.saved;
      existing += recorded.existing;
      for (const item of result.rows) seen.add(item.id);
      log('Página ' + page + '/' + totalPages + ' · ' + recorded.saved + ' novas · ' + recorded.existing + ' já registradas');
      page++;
      if (page > totalPages || (maxPages > 0 && processed >= maxPages)) break;
      await setTimeout(pauseSeconds * 1_000);
    }
  } catch (error) {
    const reason = error instanceof Problem ? error.message : 'Falha interna durante a importação.';
    throw new Problem('Página ' + page + ': ' + reason + ' Novas gravadas nesta execução: ' + saved +
      '. Para retomar, use ' + granResumeFlags(page, options) + '.', error instanceof Problem ? error.status : 500);
  }
  return { processed, saved, existing, received: seen.size, total: total ?? 0, nextPage: page <= totalPages ? page : undefined };
}

export function importGranQuestions(store: Store, options: GranImportOptions, request = fetch, log = console.log) {
  return collectGranPages(options, (page, subjects) => {
    const entries = granPracticeEntries(page.rows, subjects);
    try {
      return saveGranQuestions(store, entries);
    } catch (error) {
      throw new Problem('Falha ao gravar a página no banco local' + granStorageError(error) + '.', 500);
    }
  }, request, log);
}

export function exportGranQuestions(
  options: GranImportOptions & { exportDirectory: string }, request = fetch, log = console.log,
) {
  const scope = options.allSubjects ? 'ibfc-todas-disciplinas' : 'ibfc-parana-2024';
  const target = join(options.exportDirectory, scope + '-' + options.pageSize);
  try {
    mkdirSync(target, { recursive: true });
  } catch (error) {
    throw new Problem('Falha ao abrir a pasta de exportação' + granStorageError(error) + '.', 500);
  }
  log('Arquivos JSON em ' + target);
  return collectGranPages(options, page => {
    const document = JSON.stringify({ data: page }, null, 2) + '\n';
    const hash = createHash('sha256').update(document).digest('hex');
    const path = join(target, 'pagina-' + String(page.page).padStart(6, '0') + '-' + hash + '.json');
    if (existsSync(path)) {
      if (readFileSync(path, 'utf8') !== document) throw new Problem('O JSON já existe com conteúdo diferente: ' + path, 409);
      return { saved: 0, existing: page.rows.length };
    }
    const temp = path + '-' + randomUUID() + '.tmp';
    try {
      writeFileSync(temp, document, { flag: 'wx', encoding: 'utf8' });
      renameSync(temp, path);
    } catch (error) {
      throw new Problem('Falha ao exportar a página em JSON' + granStorageError(error) + '.', 500);
    } finally {
      rmSync(temp, { force: true });
    }
    return { saved: page.rows.length, existing: 0 };
  }, request, log);
}
