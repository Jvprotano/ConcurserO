import { mkdir, rename, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { chromium, type Page } from 'playwright';
import { z } from 'zod';
import { granPracticeEntries, granQuestionRows, ibfcBoardId } from '../server/gran-questions.ts';

const source = new URL('https://questoes.grancursosonline.com.br/questoes');
source.search = new URLSearchParams({ anulada: '0', banca: String(ibfcBoardId), desatualizada: '0' }).toString();
const listing = z.object({
  displayed: granQuestionRows,
  pagination: z.object({ page: z.number().int().positive(), pages: z.number().int().nonnegative() }),
});
const cards = '.page__results__question .ds-question';

type GranWindow = Window & {
  __NUXT__?: { data?: { questoes?: { displayed?: unknown; pagination?: unknown; searching?: boolean } }[] };
};

function isListing(url: URL, number: number) {
  return url.origin === source.origin && url.pathname === source.pathname &&
    (url.searchParams.get('pagina') ?? '1') === String(number) &&
    [...source.searchParams].every(([name, value]) => url.searchParams.get(name) === value);
}

async function readPage(page: Page, url: URL, number: number, log: (message: string) => void) {
  log(`Abrindo ${url.href}`);
  const response = await page.goto(url.href, { waitUntil: 'domcontentloaded', timeout: 20_000 });
  log(`HTTP ${response?.status() ?? 'indisponível'}`);
  if (!response?.ok()) {
    const retry = response?.status() === 429 ? response.headers()['retry-after'] : undefined;
    throw new Error('O Gran retornou HTTP ' + (response?.status() ?? 'indisponível') +
      (retry ? ' (Retry-After ' + retry + ')' : '') + '.');
  }

  const opened = new URL(page.url());
  if (!isListing(opened, number)) {
    const filters = new URLSearchParams();
    for (const name of ['pagina', ...source.searchParams.keys()]) {
      const value = opened.searchParams.get(name);
      if (value !== null) filters.set(name, value);
    }
    throw new Error(`O Gran abriu outra página ou alterou os filtros. URL recebida: ${opened.origin}${opened.pathname}${filters.size ? '?' + filters : ''}`);
  }

  log('Aguardando questões e dados de paginação');
  const snapshot = await page.waitForFunction(() => {
    const data = (window as GranWindow).__NUXT__?.data?.[0]?.questoes;
    if (!data || data.searching || !Array.isArray(data.displayed) || !data.pagination) return false;
    return JSON.stringify({ displayed: data.displayed, pagination: data.pagination });
  }, undefined, { timeout: 10_000 }).catch(error => {
    if (error instanceof Error && error.name === 'TimeoutError') {
      throw new Error('A página não apresentou os dados da listagem em 10 s.', { cause: error });
    }
    throw error;
  });
  const raw: unknown = JSON.parse(await snapshot.jsonValue() as string);
  await snapshot.dispose();
  const parsed = listing.safeParse(raw);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const field = issue.path.join('.');
    throw new Error('Formato inesperado na listagem do Gran (' + (field || 'lista') + ', ' + issue.code + ').');
  }

  const { displayed: rows, pagination } = parsed.data;
  log(`O Gran informou página ${pagination.page} de ${pagination.pages}`);
  if (pagination.pages === 0 && rows.length === 0) {
    throw new Error('O Gran não encontrou questões para os filtros da exportação.');
  }
  if (number > pagination.pages) {
    throw new Error(`A página solicitada está além da última página informada pelo Gran (${pagination.pages}).`);
  }
  if (pagination.page !== number || rows.length === 0) {
    throw new Error(`A listagem da página ${number} veio vazia ou com numeração incompatível.`);
  }
  log(`${rows.length} questões na listagem. Aguardando cartões visíveis`);
  const questionCards = page.locator(cards);
  await questionCards.first().waitFor({ state: 'visible', timeout: 10_000 });
  const links = await questionCards.evaluateAll(nodes => nodes.map(node => {
    const link = node.querySelector<HTMLAnchorElement>('.ds-question__header__top__id a');
    return { id: Number(link?.innerText.trim().match(/^Q(\d+)$/)?.[1]), url: link?.href ?? '' };
  }));
  log(`${links.length} cartões encontrados. Conferindo IDs e gabaritos`);
  const cardIds = new Set(links.map(link => link.id));
  const entries = granPracticeEntries(rows, new Set());
  if (rows.length !== links.length || cardIds.size !== links.length || entries.size !== rows.length) {
    throw new Error(`Contagens incompatíveis: ${rows.length} questões na listagem, ${links.length} cartões, ${cardIds.size} IDs de cartão distintos e ${entries.size} questões convertidas.`);
  }

  for (const row of rows) {
    if (!row.bancas?.some(board => board.id === ibfcBoardId) || row.anulada) {
      throw new Error('A questão Q' + row.id + ' é de outra banca ou está anulada.');
    }
  }
  const questions = links.map(link => {
    const entry = entries.get(link.id);
    if (!entry || !link.url) throw new Error('Um cartão exibido não corresponde a uma questão da listagem.');
    const { question, key } = entry;
    const correct = question.options.find(option => option.key === key);
    if (!correct) throw new Error('A questão Q' + question.id + ' veio sem gabarito verificável.');
    if (!question.enunciado.trim()) throw new Error('A questão Q' + question.id + ' veio sem enunciado.');

    return {
      id: question.id,
      url: link.url,
      ano: question.ano ?? null,
      banca: question.banca?.nome,
      prova: question.nomeProva ?? null,
      disciplina: question.materia ?? null,
      assunto: question.topico ?? null,
      enunciado: question.enunciado,
      textoAssociado: question.textoBase?.texto ?? null,
      alternativas: question.options.map(option => ({ id: option.key, letra: option.label, texto: option.text })),
      gabarito: { id: correct.key, letra: correct.label },
    };
  });
  return { pageCount: pagination.pages, result: { url: opened.href, pagina: number, questoes: questions } };
}

export async function exportGranSample(page: Page, directory: string, log = console.log, maxPage?: number, firstPage = 1) {
  if (!Number.isSafeInteger(firstPage) || firstPage < 1) {
    throw new Error('Informe a página inicial com --inicio e um inteiro positivo.');
  }
  if (maxPage !== undefined && (!Number.isSafeInteger(maxPage) || maxPage < firstPage)) {
    throw new Error('O limite informado deve ser um inteiro maior ou igual à página inicial.');
  }

  const pages: Awaited<ReturnType<typeof readPage>>['result'][] = [];
  const questionPages = new Map<number, number>();
  log(`Iniciando exportação na página ${firstPage}${maxPage === undefined ? ' até o fim da listagem' : ` com limite na página ${maxPage}`}`);
  let lastPage = maxPage;
  for (let number = firstPage; lastPage === undefined || number <= lastPage; number++) {
    const startedAt = Date.now();
    const logPage = (message: string) => log(`Página ${number} · ${((Date.now() - startedAt) / 1000).toFixed(1)} s · ${message}`);
    try {
      const url = new URL(source);
      if (number > 1) url.searchParams.set('pagina', String(number));
      const { pageCount, result } = await readPage(page, url, number, logPage);
      lastPage = Math.min(pageCount, maxPage ?? pageCount);
      for (const question of result.questoes) {
        const previousPage = questionPages.get(question.id);
        if (previousPage !== undefined) {
          throw new Error(`A questão Q${question.id} já apareceu na página ${previousPage}. A exportação foi interrompida.`);
        }
        questionPages.set(question.id, number);
      }
      pages.push(result);
      logPage(`${result.questoes.length} questões com gabarito. Total acumulado: ${questionPages.size}`);
      if (number === lastPage) {
        logPage(number === pageCount ? 'Fim da listagem do Gran' : 'Limite de páginas atingido');
      }
    } catch (error) {
      throw new Error('Página ' + number + ' · ' + (error instanceof Error ? error.message : 'Falha na leitura.'), { cause: error });
    }
  }

  const lastExportedPage = firstPage + (pages.length - 1);
  const capturedAt = new Date().toISOString();
  await mkdir(directory, { recursive: true });
  const path = join(directory, `ibfc-paginas-${firstPage}-${lastExportedPage}-${capturedAt.replaceAll(':', '-')}.json`);
  const temporary = path + '.' + process.pid + '.tmp';
  log(`Gravando ${questionPages.size} questões em ${path}`);
  try {
    const data = { fonte: 'Gran Questões', capturadoEm: capturedAt, paginas: pages };
    await writeFile(temporary, JSON.stringify(data, null, 2) + '\n', { encoding: 'utf8', flag: 'wx' });
    await rename(temporary, path);
  } finally {
    await rm(temporary, { force: true });
  }
  return { path, count: questionPages.size, firstPage, lastPage: lastExportedPage };
}

async function main() {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: { inicio: { type: 'string', default: '1' } },
  });
  if (positionals.length > 1) {
    throw new Error('Uso: node scripts/exportar-questoes.ts [--inicio PÁGINA] [LIMITE]');
  }
  const firstPage = Number(values.inicio);
  const maxPage = positionals[0] === undefined ? undefined : Number(positionals[0]);
  console.log('Iniciando o Chrome');
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    const directory = fileURLToPath(new URL('../work/gran-amostra/', import.meta.url));
    console.log('Chrome iniciado. Abrindo uma aba');
    const result = await exportGranSample(await browser.newPage(), directory, console.log, maxPage, firstPage);
    console.log(`Exportação concluída · páginas ${result.firstPage} a ${result.lastPage} · ${result.count} questões · ${result.path}`);
  } finally {
    await browser.close();
  }
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  await main().catch(error => {
    console.error('Falha na exportação.', error);
    process.exitCode = 1;
  });
}
