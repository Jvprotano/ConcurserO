import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { Store } from '../server/db.ts';
import { exportGranQuestions, granImportInput, importGranQuestions } from '../server/gran-import.ts';

const input = { token: 'header.payload.signature', clientId: 'test-client', firstPage: 1, pageSize: 2, maxPages: 0 };
const options = { ...input, pauseSeconds: 1, allSubjects: true };
const row = (id: number, board = 277) => ({
  id, enunciado: 'Questão de teste', bancas: [{ id: board, nome: 'Banca' }],
  itens: [{ id: 11, rotulo: 'A', corpo: 'Alternativa A' }, { id: 12, rotulo: 'B', corpo: 'Alternativa B' }],
  resposta: 12,
});
const response = (page: number, rows: ReturnType<typeof row>[], perPage = 2) =>
  Response.json({ data: { total: 4, pages: 2, page, perPage, rows } });

test('imports IBFC pages sequentially, preserving previous copies and removals', async t => {
  const directory = mkdtempSync(join(tmpdir(), 'concursero-gran-import-'));
  const store = new Store(directory);
  t.after(() => { store.db.close(); rmSync(directory, { recursive: true, force: true }); });
  const pages: number[] = [];
  const requestedAt: number[] = [];
  const upstream: typeof fetch = async (input, init) => {
    const url = new URL(String(input));
    assert.equal(url.origin + url.pathname, 'https://rota-api.grancursosonline.com.br/v1/elastic/questao');
    assert.equal(url.searchParams.get('banca[]'), '277');
    assert.equal(url.searchParams.get('perPage'), '2');
    assert.equal(url.searchParams.has('assunto[]'), false);
    assert.equal(new Headers(init?.headers).get('authorization'), 'Bearer header.payload.signature');
    const page = Number(url.searchParams.get('page'));
    pages.push(page);
    requestedAt.push(performance.now());
    return page === 1 ? response(1, [row(101), row(102)]) : response(2, [row(102), row(103)]);
  };
  assert.equal(granImportInput.parse(input).pauseSeconds, 5);
  const result = await importGranQuestions(store, { ...options, pauseSeconds: 2 }, upstream, () => {});
  assert.deepEqual(pages, [1, 2]);
  assert.ok(requestedAt[1] - requestedAt[0] >= 1_990, 'the second request waits for the configured pause');
  assert.deepEqual(result, { processed: 2, saved: 3, existing: 1, received: 3, total: 4, nextPage: undefined });
  assert.equal(store.get<{ answer_key: string }>("SELECT answer_key FROM gran_saved_questions WHERE id='102'")?.answer_key, '12');
  store.run("INSERT INTO removed_items VALUES ('gran-question', '102', '2026-11-23')");
  const repeat = await importGranQuestions(store, { ...options, maxPages: 1 }, upstream, () => {});
  assert.equal(repeat.saved, 0);
  assert.equal(repeat.nextPage, 2);
  assert.ok(store.get("SELECT id FROM removed_items WHERE kind='gran-question' AND id='102'"));
});

test('keeps prior pages and stops on 429, size change, or results outside IBFC', async t => {
  const directory = mkdtempSync(join(tmpdir(), 'concursero-gran-interrupted-'));
  const store = new Store(directory);
  t.after(() => { store.db.close(); rmSync(directory, { recursive: true, force: true }); });
  const count = () => store.get<{ n: number }>('SELECT count(*) AS n FROM gran_saved_questions')?.n;
  const queries: number[] = [];
  const rateLimited: typeof fetch = async input => {
    const page = Number(new URL(String(input)).searchParams.get('page'));
    queries.push(page);
    return page === 1 ? response(1, [row(101), row(102)]) : new Response(null, { status: 429, headers: { 'retry-after': '20' } });
  };
  await assert.rejects(importGranQuestions(store, options, rateLimited, () => {}),
    /Página 2:.*429.*20 s.*-PaginaInicial 2.*-TodasDisciplinas/);
  assert.deepEqual(queries, [1, 2]);
  assert.equal(count(), 2);

  const resumed = { ...options, firstPage: 2 };
  await assert.rejects(importGranQuestions(store, resumed, async () => response(2, [row(103)], 1), () => {}), /tamanho diferente/);
  await assert.rejects(importGranQuestions(store, resumed, async () => response(2, [row(103), row(104, 500)]), () => {}), /fora do filtro/);
  assert.equal(count(), 2);
  const result = await importGranQuestions(store, resumed, async () => response(2, [row(103), row(104)]), () => {});
  assert.equal(result.saved, 2);
  assert.equal(count(), 4);
});

test('filters IBFC by the syllabus across exams and rejects pages outside the scope', async t => {
  const directory = mkdtempSync(join(tmpdir(), 'concursero-gran-syllabus-'));
  const store = new Store(directory);
  t.after(() => { store.db.close(); rmSync(directory, { recursive: true, force: true }); });
  const filtered = granImportInput.parse({ ...input, pauseSeconds: 1, maxPages: 1 });
  const samples = [
    { ...row(101), provas: [{ nome: 'IBFC · Universidade · Analista de TI · 2026' }], assuntos: [
      { id: 559999, nome: 'Sistemas Operacionais', materia: false, assunto_raiz: 14 },
      { id: 14, nome: 'Tecnologia da Informação', materia: true },
    ] },
    { ...row(102), provas: [{ nome: 'IBFC · Assembleia · Técnico Legislativo · 2019' }], assuntos: [
      { id: 1211, nome: 'Legislação Estadual, Distrital e Municipal', materia: true },
      { id: 395121, nome: 'Estatuto dos Funcionários Públicos do Paraná', materia: false, pai: { id: 395526 }, assunto_raiz: 1211 },
    ] },
  ];
  const upstream: typeof fetch = async input => {
    const params = new URL(String(input)).searchParams;
    assert.deepEqual([...new Set(params.keys())].sort(), ['assunto[]', 'banca[]', 'page', 'perPage', 'resolucao', 'sort']);
    assert.deepEqual(params.getAll('banca[]'), ['277']);
    const subjects = params.getAll('assunto[]');
    assert.ok(['403587', '404257', '405030', '14', '429985', '406602', '395526', '401480']
      .every(id => subjects.includes(id)));
    assert.equal(new Set(subjects).size, subjects.length);
    return response(1, samples);
  };
  const imported = await importGranQuestions(store, filtered, upstream, () => {});
  assert.equal(imported.saved, 2);
  const saved = store.all<{ document: string }>('SELECT document FROM gran_saved_questions ORDER BY id')
    .map(({ document }) => JSON.parse(document));
  assert.equal(saved[0].materia.nome, 'Tecnologia da Informação');
  assert.equal(saved[0].topico.nome, 'Sistemas Operacionais');
  assert.equal(saved[1].nomeProva, samples[1].provas[0].nome);
  assert.equal(saved[1].topico.nome, 'Estatuto dos Funcionários Públicos do Paraná');
  const outside = { ...row(103), assuntos: [{ id: 700000, nome: 'Outra disciplina', materia: true }] };
  await assert.rejects(importGranQuestions(store, filtered, async () => response(1, [samples[0], outside]), () => {}),
    /fora dos assuntos do edital/);
  assert.equal(store.get<{ total: number }>('SELECT count(*) AS total FROM gran_saved_questions')?.total, 2);
});

test('reports transport, HTTP, format and SQLite failures without copying raw error messages', async t => {
  const directory = mkdtempSync(join(tmpdir(), 'concursero-gran-diagnostics-'));
  const store = new Store(directory);
  t.after(() => { store.db.close(); rmSync(directory, { recursive: true, force: true }); });
  const messages: string[] = [];
  const log = (message: string) => messages.push(message);
  const sensitive = 'unexpected private request metadata';
  const dns = Object.assign(new Error(sensitive), { code: 'ENOTFOUND' });
  await assert.rejects(importGranQuestions(store, options, async () => {
    throw new TypeError(sensitive, { cause: new AggregateError([dns], sensitive) });
  }, log), error => error instanceof Error && /antes da resposta HTTP.*DNS.*ENOTFOUND/.test(error.message) &&
    !error.message.includes(sensitive));

  await assert.rejects(importGranQuestions(store, options, async () =>
    new Response(sensitive, { status: 302, headers: { location: 'https://example.invalid/' + options.token } }), log), /redirecionou.*HTTP 302/);
  await assert.rejects(importGranQuestions(store, options, async () => new Response(sensitive), log), /JSON válido/);
  await assert.rejects(importGranQuestions(store, options, async () => Response.json({
    data: { total: 1, page: 1, pages: 1, perPage: 2, rows: [{ ...row(101), resposta: sensitive }] },
  }), log), /data\.rows\.0\.resposta/);
  await assert.rejects(importGranQuestions(store, options, async () =>
    new Response(null, { status: 429, headers: { 'retry-after': 'Wed, 21 Oct 2026 07:28:00 GMT' } }), log), /2026-10-21T07:28:00.000Z/);

  store.db.exec('PRAGMA query_only = ON');
  await assert.rejects(importGranQuestions(store, options, async () => response(1, [row(101), row(102)]), log),
    /Falha ao gravar.*SQLite 8.*somente para leitura/);
  assert.ok(messages.some(message => /HTTP 302/.test(message)));
  assert.ok(messages.some(message => /HTTP 429.*Retry-After 2026/.test(message)));
  assert.ok(messages.every(message => !message.includes(sensitive) && !message.includes(options.token) && !message.includes(options.clientId)));
});

test('exports validated JSON pages, stops on 429 and preserves previous files on retry', async t => {
  const directory = mkdtempSync(join(tmpdir(), 'concursero-gran-export-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const exportOptions = { ...options, exportDirectory: directory };
  const target = join(directory, 'ibfc-todas-disciplinas-2');
  const observed: number[] = [];
  const firstRows = [{ ...row(101), token: options.token }, row(102)];
  const first = () => response(1, firstRows);
  const limited: typeof fetch = async input => {
    const page = Number(new URL(String(input)).searchParams.get('page'));
    observed.push(page);
    return page === 1 ? first() : new Response(null, { status: 429 });
  };
  await assert.rejects(exportGranQuestions(exportOptions, limited, () => {}),
    /Página 2:.*HTTP 429.*-PaginaInicial 2.*-TodasDisciplinas.*-ExportarPara/);
  assert.deepEqual(observed, [1, 2]);
  const files = readdirSync(target);
  assert.equal(files.length, 1);
  const document = readFileSync(join(target, files[0]), 'utf8');
  assert.equal(JSON.parse(document).data.rows[0].resposta, 12);
  assert.ok(!document.includes(options.token));

  assert.equal((await exportGranQuestions({ ...exportOptions, firstPage: 2 },
    async () => response(2, [row(103), row(104)]), () => {})).saved, 2);
  const one = { ...exportOptions, maxPages: 1 };
  assert.equal((await exportGranQuestions(one, async () => first(), () => {})).saved, 0);
  assert.equal((await exportGranQuestions(one,
    async () => response(1, [{ ...row(101), resposta: 11 }, row(102)]), () => {})).saved, 2);
  assert.equal(readdirSync(target).length, 3);
  assert.equal(readFileSync(join(target, files[0]), 'utf8'), document);
});
