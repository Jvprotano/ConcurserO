import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { Store } from '../server/db.ts';
import { createApp } from '../server/index.ts';

test('Gran opens and pages a local practice session with correction tied to the displayed question', async t => {
  const directory = mkdtempSync(join(tmpdir(), 'concursero-gran-'));
  const store = new Store(directory);
  const request = globalThis.fetch;
  let upstreamStatus = 200;
  const upstream = t.mock.method(globalThis, 'fetch', async (input: string, init?: RequestInit) => {
    const url = new URL(input);
    assert.equal(url.origin + url.pathname, 'https://rota-api.grancursosonline.com.br/v1/elastic/questao');
    assert.equal(new Headers(init?.headers).get('authorization'), 'Bearer header.payload.signature');
    assert.equal(new Headers(init?.headers).get('x-client-id'), 'client-test-id');
    assert.equal(init?.redirect, 'manual');
    assert.deepEqual(Object.fromEntries(url.searchParams), {
      perPage: '20', page: url.searchParams.get('page'), marcarResolvidas: '1',
      'assunto[]': '404257', 'banca[]': '277', 'comentarios[]': 'aluno',
      resolucao: 'TODAS', anulada: '0', desatualizada: '0', sort: '[{"anos":"desc"},{"_score":"desc"}]',
    });
    if (upstreamStatus !== 200) return new Response(null, { status: upstreamStatus });
    const page = Number(url.searchParams.get('page'));
    const row = {
      id: 501, enunciado: '<p>Enunciado</p>', anos: [2026],
      bancas: [{ id: 277, nome: 'Instituto Brasileiro de Formação e Capacitação', sigla: 'IBFC' }],
      assuntos: [{ id: 404257, nome: 'Raciocínio Lógico', materia: true }],
      grupoQuestao: { enunciado: '<p>Texto de apoio</p>' },
      itens: [{ id: 102, ordem: 2, rotulo: 'B', corpo: '<b>Segunda</b>' },
        { id: 101, ordem: 1, rotulo: 'A', corpo: 'Primeira' }],
      resposta: page === 1 ? 102 : 101, resolvida: true,
    };
    return Response.json({
      pagination: true,
      data: { total: 21, page, pages: 2, rows: [
        row, { ...row, id: 502, resposta: 999 }, { ...row, id: 503, anulada: true },
      ] },
    });
  });
  const server = createApp(store).listen(0, '127.0.0.1');
  t.after(async () => {
    await new Promise<void>(resolve => server.close(() => resolve()));
    store.db.close();
    rmSync(directory, { recursive: true, force: true });
  });
  await once(server, 'listening');
  const address = server.address();
  assert.ok(address && typeof address === 'object');
  const api = 'http://127.0.0.1:' + address.port + '/api';
  const gran = api + '/online-questions/gran';
  const status = () => request(gran + '/status').then(res => res.json());
  const post = (path: string, body: object) => request(gran + path, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
  });
  const login = () => post('/session', { token: 'Bearer header.payload.signature', clientId: 'client-test-id' });
  const answer = (page: string, id: number, choice: string) =>
    post('/pages/' + page + '/questions/' + id + '/answer', { choice });

  assert.deepEqual(await status(), { connected: false });
  for (const path of ['/online-questions', '/online-questions/status', '/online-questions/filters']) {
    assert.equal((await request(api + path)).status, 404);
  }
  assert.equal((await request(gran)).status, 401);
  assert.equal((await post('/session', { token: 'invalid', clientId: 'id' })).status, 400);
  assert.equal(upstream.mock.callCount(), 0);
  const response = await login();
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  const first = await response.json();
  assert.deepEqual(await status(), { connected: true });
  assert.equal(first.page, 0);
  assert.equal(first.totalElements, 21);
  assert.equal(first.totalPages, 2);
  assert.deepEqual(first.content[0], {
    id: 501, enunciado: '<p>Enunciado</p>', ano: 2026, banca: { id: 277, nome: 'IBFC' },
    materia: { id: 404257, nome: 'Raciocínio Lógico' }, textoBase: { texto: '<p>Texto de apoio</p>' },
    options: [{ key: '101', label: 'A', text: 'Primeira' }, { key: '102', label: 'B', text: '<b>Segunda</b>' }],
  });
  const second = await request(gran + '?page=2').then(res => res.json());
  assert.equal(second.page, 1);
  assert.notEqual(second.pageId, first.pageId);
  assert.equal((await answer(first.pageId, 501, '999')).status, 400);
  assert.deepEqual(await answer(first.pageId, 501, '102').then(res => res.json()),
    { status: 'corrected', correct: true, key: '102' });
  assert.deepEqual(await answer(second.pageId, 501, '102').then(res => res.json()),
    { status: 'corrected', correct: false, key: '101' });
  assert.deepEqual(await answer(first.pageId, 502, '102').then(res => res.json()), { status: 'pending' });
  assert.deepEqual(await answer(first.pageId, 503, '102').then(res => res.json()), { status: 'annulled' });
  assert.deepEqual(await post('/pages/' + first.pageId + '/save', {}).then(res => res.json()), { saved: 3, existing: 0 });
  assert.deepEqual(await post('/pages/' + second.pageId + '/save', {}).then(res => res.json()), { saved: 0, existing: 3 });
  assert.equal(upstream.mock.callCount(), 2);
  upstreamStatus = 429;
  assert.equal((await request(gran + '?page=2')).status, 429);
  assert.deepEqual(await status(), { connected: true });
  upstreamStatus = 401;
  assert.equal((await request(gran + '?page=2')).status, 401);
  assert.deepEqual(await status(), { connected: false });
  upstreamStatus = 200;
  assert.equal((await login()).status, 200);
  assert.equal((await answer(first.pageId, 501, '102')).status, 404);
  assert.deepEqual(await request(gran + '/session', { method: 'DELETE' }).then(res => res.json()), { connected: false });
  assert.equal((await answer(first.pageId, 501, '102')).status, 401);
  const offlinePage = () => request(gran + '/saved').then(res => res.json());
  const offlineAnswer = (id: number) => post('/saved/' + id + '/answer', { choice: '102' });
  const saved = await offlinePage();
  assert.equal(saved.totalElements, 3);
  assert.deepEqual(saved.content.find((item: { id: number }) => item.id === 501), first.content[0]);
  assert.deepEqual(await offlineAnswer(501).then(res => res.json()), { status: 'corrected', correct: true, key: '102' });
  assert.deepEqual(await offlineAnswer(502).then(res => res.json()), { status: 'pending' });
  assert.deepEqual(await offlineAnswer(503).then(res => res.json()), { status: 'annulled' });
  const calls = upstream.mock.callCount();
  assert.equal((await request(api + '/items/batch-remove', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ items: [{ kind: 'gran-question', id: '501' }, { kind: 'gran-question', id: '502' }] }),
  })).status, 200);
  assert.equal((await offlinePage()).totalElements, 1);
  assert.equal((await offlineAnswer(501)).status, 404);
  assert.equal((await request(api + '/items/gran-question/501/restore', { method: 'POST' })).status, 200);
  assert.equal((await offlinePage()).totalElements, 2);
  assert.equal(upstream.mock.callCount(), calls);
  assert.deepEqual(await request(api + '/state').then(res => res.json()).then(state => state.attempts), []);
});
