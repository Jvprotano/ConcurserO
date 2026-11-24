import { randomUUID } from 'node:crypto';
import { Router } from 'express';
import { z } from 'zod';
import { Problem, required, type Store } from './db.ts';
import { granRetryAfter, granTransportError } from './gran-diagnostics.ts';

const endpoint = 'https://rota-api.grancursosonline.com.br/v1/elastic/questao';
export const ibfcBoardId = 277;
const subjectId = 404257;
const onlineSubjects = new Set([subjectId]);
const pageSize = 20;
const positiveId = z.number().int().positive();
const label = z.object({ id: positiveId, nome: z.string(), sigla: z.string().nullish() });
const granSubject = label.extend({
  materia: z.boolean().nullish(),
  assunto_raiz: positiveId.nullish().catch(undefined),
  pai: z.union([positiveId, z.object({ id: positiveId })]).nullish().catch(undefined),
});
const item = z.object({
  id: positiveId, ordem: z.number().int().nullish(), rotulo: z.string().nullish(),
  corpo: z.string().nullish(), corpo_clean: z.string().nullish(),
});
const question = z.object({
  id: positiveId,
  enunciado: z.string().nullish(),
  enunciado_clean: z.string().nullish(),
  anos: z.array(z.number().int()).nullish(),
  bancas: z.array(label).nullish(),
  orgaos: z.array(label).nullish(),
  assuntos: z.array(granSubject).nullish(),
  provas: z.array(z.object({ nome: z.string().nullish() })).nullish(),
  grupoQuestao: z.object({ enunciado: z.string().nullish(), texto: z.string().nullish() }).nullish(),
  itens: z.array(item).nullish(),
  resposta: z.number().int().nullish(),
  anulada: z.boolean().nullish(),
});
export const granQuestionRows = z.array(question).max(100);
const granPage = z.object({
  data: z.object({
    page: positiveId,
    pages: z.number().int().nonnegative(),
    total: z.number().int().nonnegative(),
    perPage: z.number().int().min(1).max(100).optional(),
    rows: granQuestionRows,
  }),
});
export const granCredentials = z.object({
  token: z.string().trim().max(4096).transform(value => value.replace(/^Bearer\s+/i, ''))
    .pipe(z.string().regex(/^[\w-]+\.[\w-]+\.[\w-]+$/)),
  clientId: z.string().trim().regex(/^[\w-]{1,128}$/),
});
const pageNumber = z.string().regex(/^[1-9]\d{0,6}$/).transform(Number);
const questionId = z.string().regex(/^[1-9]\d{0,14}$/).transform(Number);
const choiceInput = z.object({ choice: z.string().regex(/^\d{1,15}$/) });

type PracticeQuestion = { question: GranQuestion; key?: string | null };
type SavedRow = { document: string; answer_key: string | null };
type GranCredentials = z.infer<typeof granCredentials>;
type Session = GranCredentials & { pages: Map<string, Map<number, PracticeQuestion>> };
export type GranQuestion = ReturnType<typeof normalize>;
export type GranResultsPage = {
  content: GranQuestion[];
  page: number;
  totalPages: number;
  totalElements: number;
};
export type GranQuestionPage = GranResultsPage & { pageId: string };
export type GranAnswer =
  | { status: 'corrected'; correct: boolean; key: string }
  | { status: 'annulled' | 'pending' };

export function granSubjectMatches(subject: z.infer<typeof granSubject>, selected: ReadonlySet<number>) {
  const parent = typeof subject.pai === 'number' ? subject.pai : subject.pai?.id;
  return selected.has(subject.id) || (subject.assunto_raiz != null && selected.has(subject.assunto_raiz)) ||
    (parent !== undefined && selected.has(parent));
}

function normalize(row: z.infer<typeof question>, selected: ReadonlySet<number>) {
  const board = row.bancas?.find(value => value.id === ibfcBoardId) ?? row.bancas?.[0];
  const subjects = row.assuntos ?? [];
  const preferred = subjects.filter(subject => granSubjectMatches(subject, selected));
  const matchedTopic = preferred.find(subject => !subject.materia);
  const discipline = subjects.find(subject => subject.materia && subject.id === matchedTopic?.assunto_raiz)
    ?? preferred.find(subject => subject.materia)
    ?? subjects.find(subject => subject.materia);
  const topic = matchedTopic ?? subjects.find(subject => !subject.materia &&
    (selected.size === 0 || preferred.length === 0 || subject.assunto_raiz === discipline?.id));
  const support = row.grupoQuestao?.enunciado || row.grupoQuestao?.texto;
  const options = [...new Map((row.itens ?? []).map(value => [value.id, value])).values()]
    .sort((a, b) => (a.ordem ?? Infinity) - (b.ordem ?? Infinity))
    .map((value, index) => ({
      key: String(value.id), label: value.rotulo?.trim() || String.fromCharCode(65 + index),
      text: value.corpo || value.corpo_clean || '',
    }));
  return {
    id: row.id, enunciado: row.enunciado || row.enunciado_clean || '',
    ano: row.anos?.[0], nomeProva: row.provas?.[0]?.nome,
    banca: board && { id: board.id, nome: board.sigla || board.nome },
    instituicao: row.orgaos?.[0] && { id: row.orgaos[0].id, nome: row.orgaos[0].nome },
    materia: discipline && { id: discipline.id, nome: discipline.nome },
    topico: topic && { id: topic.id, nome: topic.nome },
    textoBase: support ? { texto: support } : undefined,
    anulada: row.anulada, options,
  };
}

export async function fetchGranPage(auth: GranCredentials, query: URLSearchParams, request = fetch, log?: (message: string) => void) {
  const started = performance.now();
  const elapsed = () => Math.round(performance.now() - started) + ' ms';
  let response: Response;
  try {
    response = await request(endpoint + '?' + query, {
      headers: { Accept: 'application/json', Authorization: 'Bearer ' + auth.token, 'x-client-id': auth.clientId },
      redirect: 'manual',
      signal: AbortSignal.timeout(15_000),
    });
  } catch (error) {
    throw new Problem('Falha na consulta a rota-api.grancursosonline.com.br antes da resposta HTTP, após ' + elapsed() +
      '. ' + granTransportError(error) + '.', 502);
  }
  const retryAfter = granRetryAfter(response.headers.get('retry-after'));
  log?.('Gran · HTTP ' + response.status + ' · cabeçalhos em ' + elapsed() +
    (response.status === 429 ? ' · Retry-After ' + (retryAfter ?? 'ausente ou inválido') : ''));
  if (!response.ok) void response.body?.cancel().catch(() => {});
  if (response.status === 401 || response.status === 403) {
    throw new Problem('O Gran recusou a sessão (HTTP ' + response.status + '). Confira as credenciais ou use uma sessão atualizada.', 401);
  }
  if (response.status === 429) {
    const when = retryAfter?.endsWith(' s') ? ' Aguarde pelo menos ' + retryAfter + '.'
      : retryAfter ? ' Aguarde até ' + retryAfter + '.' : ' Tente mais tarde.';
    throw new Problem('O Gran retornou HTTP 429 (limite de consultas).' + when, 429);
  }
  if (response.status >= 300 && response.status < 400) throw new Problem('O Gran redirecionou a consulta (HTTP ' + response.status + ').', 502);
  if (!response.ok) throw new Problem('A busca no Gran falhou (HTTP ' + response.status + ').', 502);
  let payload: unknown;
  try {
    payload = await response.json();
  } catch (error) {
    const detail = error instanceof SyntaxError ? 'O corpo da resposta não é um JSON válido.' : granTransportError(error) + '.';
    throw new Problem('Falha ao ler a resposta do Gran após ' + elapsed() + '. ' + detail, 502);
  }
  const parsed = granPage.safeParse(payload);
  if (!parsed.success) {
    const fields = parsed.error.issues.slice(0, 4).map(issue => (issue.path.join('.') || 'resposta') + ' (' + issue.code + ')');
    throw new Problem('Formato inesperado na resposta do Gran. Campos: ' + fields.join(', ') + '.', 502);
  }
  if (parsed.data.data.page !== Number(query.get('page'))) {
    throw new Problem('O Gran retornou a página ' + parsed.data.data.page + ' em vez da solicitada.', 502);
  }
  return parsed.data.data;
}

export function granPracticeEntries(rows: z.infer<typeof question>[], selected: ReadonlySet<number> = onlineSubjects) {
  const entries = new Map<number, PracticeQuestion>();
  for (const row of rows) {
    if (entries.has(row.id)) continue;
    const question = normalize(row, selected);
    const key = String(row.resposta);
    entries.set(row.id, { question, key: question.options.some(option => option.key === key) ? key : undefined });
  }
  return entries;
}

export function saveGranQuestions(store: Store, entries: Map<number, PracticeQuestion>, restoreRemoved = false) {
  return store.transaction(() => {
    let saved = 0;
    for (const { question, key } of entries.values()) {
      const id = String(question.id);
      saved += Number(store.run('INSERT OR IGNORE INTO gran_saved_questions VALUES (?,?,?)',
        id, JSON.stringify(question), key ?? null).changes);
      if (restoreRemoved) saved += Number(store.run("DELETE FROM removed_items WHERE kind='gran-question' AND id=?", id).changes);
    }
    return { saved, existing: entries.size - saved };
  });
}

function correct({ question, key }: PracticeQuestion, choice: string): GranAnswer {
  if (!question.options.some(option => option.key === choice)) throw new Problem('Selecione uma alternativa desta questão.');
  if (question.anulada) return { status: 'annulled' };
  return key ? { status: 'corrected', correct: key === choice, key } : { status: 'pending' };
}

export function granQuestionRoutes(store: Store, request = fetch) {
  const router = Router();
  let session: Session | undefined;
  let connectionRevision = 0;

  async function loadPage(current: Session, number: number): Promise<GranQuestionPage> {
    const query = new URLSearchParams({
      perPage: String(pageSize), page: String(number), marcarResolvidas: '1', 'assunto[]': String(subjectId),
      'banca[]': String(ibfcBoardId), 'comentarios[]': 'aluno', resolucao: 'TODAS', anulada: '0', desatualizada: '0',
      sort: JSON.stringify([{ anos: 'desc' }, { _score: 'desc' }]),
    });
    const { rows, total, pages } = await fetchGranPage(current, query, request).catch(error => {
      if (error instanceof Problem && error.status === 401 && session === current) session = undefined;
      throw error;
    });
    if (rows.length > pageSize) throw new Problem('O Gran retornou mais questões do que o solicitado.', 502);
    const pageId = randomUUID();
    const entries = granPracticeEntries(rows);
    if (current.pages.size >= 8) current.pages.delete(current.pages.keys().next().value!);
    current.pages.set(pageId, entries);
    return { pageId, content: [...entries.values()].map(entry => entry.question), page: number - 1, totalPages: pages, totalElements: total };
  }

  router.get('/status', (_req, res) => res.json({ connected: Boolean(session) }));
  router.post('/session', async (req, res) => {
    const current: Session = { ...granCredentials.parse(req.body), pages: new Map() };
    const revision = ++connectionRevision;
    const page = await loadPage(current, 1);
    if (revision !== connectionRevision) throw new Problem('A conexão com o Gran mudou. Tente novamente.', 409);
    session = current;
    res.json(page);
  });
  router.delete('/session', (_req, res) => {
    connectionRevision++;
    session = undefined;
    res.json({ connected: false });
  });
  router.get('/', async (req, res) => {
    const current = session;
    if (!current) throw new Problem('Conecte sua sessão do Gran Questões.', 401);
    const page = await loadPage(current, pageNumber.parse(req.query.page ?? '1'));
    if (session !== current) throw new Problem('A conexão com o Gran mudou. Tente novamente.', 409);
    res.json(page);
  });
  router.post('/pages/:page/save', (req, res) => {
    const id = z.uuid().parse(req.params.page);
    const entries = required(session?.pages.get(id), 'Recarregue esta página no Gran para salvar.');
    res.json(saveGranQuestions(store, entries, true));
  });

  const active = "FROM gran_saved_questions q WHERE NOT EXISTS (SELECT 1 FROM removed_items r WHERE r.kind='gran-question' AND r.id=q.id)";
  router.get('/saved', (req, res) => {
    const requested = pageNumber.parse(req.query.page ?? '1');
    const totalElements = store.get<{ total: number }>('SELECT count(*) AS total ' + active)!.total;
    const totalPages = Math.ceil(totalElements / pageSize);
    const page = Math.min(requested, Math.max(1, totalPages)) - 1;
    const content = store.all<SavedRow>('SELECT document ' + active + ' ORDER BY q.rowid DESC LIMIT ? OFFSET ?',
      pageSize, page * pageSize).map(row => JSON.parse(row.document) as GranQuestion);
    res.json({ content, page, totalElements, totalPages } satisfies GranResultsPage);
  });
  router.post('/saved/:question/answer', (req, res) => {
    const id = questionId.parse(req.params.question);
    const { choice } = choiceInput.parse(req.body);
    const row = required(store.get<SavedRow>('SELECT document,answer_key ' + active + ' AND q.id=?', String(id)),
      'Questão offline inexistente.');
    res.json(correct({ question: JSON.parse(row.document), key: row.answer_key }, choice));
  });
  router.post('/pages/:page/questions/:question/answer', (req, res) => {
    if (!session) throw new Problem('Conecte sua sessão do Gran Questões.', 401);
    const page = session.pages.get(z.uuid().parse(req.params.page));
    const id = questionId.parse(req.params.question);
    const { choice } = choiceInput.parse(req.body);
    const entry = required(page?.get(id), 'Recarregue esta página de questões para responder.');
    res.json(correct(entry, choice));
  });

  return router;
}
