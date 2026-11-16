import assert from 'node:assert/strict';
import { once } from 'node:events';
import { cpSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { Store, localDate, nextDate } from '../server/db.ts';
import { Imports } from '../server/imports.ts';
import { createApp } from '../server/index.ts';
import { answerQuestion, listQuestions, reviewCard, setEdition, studyState } from '../server/study.ts';

function fixture() {
  const directory = mkdtempSync(join(tmpdir(), 'concursero-'));
  const store = new Store(directory);
  return { directory, store, close() { store.db.close(); rmSync(directory, { recursive: true, force: true }); } };
}

test('applies a single review to shared cards and preserves data through backup', () => {
  const context = fixture();
  const { store } = context;
  const copy = mkdtempSync(join(tmpdir(), 'concursero-copy-'));
  try {
    const card = studyState(store).cards[0];
    assert.equal(card.topicIds.length, 2);
    const now = new Date();
    assert.equal(card.due, localDate(now));
    const first = reviewCard(store, card.id, 'review-1', true, now);
    assert.equal(first.due, nextDate(1, now));
    assert.deepEqual(reviewCard(store, card.id, 'review-1', true, now), first);
    assert.throws(() => reviewCard(store, card.id, 'review-2', false, now), /já foi revisado/);
    assert.equal(studyState(store).spent, 1);
    store.db.exec('PRAGMA wal_checkpoint(TRUNCATE)');
    cpSync(context.directory, copy, { recursive: true });
    const restored = new Store(copy);
    try { assert.equal(studyState(restored).cards[0].due, first.due); }
    finally { restored.db.close(); }
  } finally {
    context.close();
    rmSync(copy, { recursive: true, force: true });
  }
});

test('publishes historical editions separately through the API and rejects mismatched keys', async () => {
  const context = fixture();
  const { store } = context;
  const server = createApp(store).listen(0, '127.0.0.1');
  try {
    await once(server, 'listening');
    const address = server.address();
    assert.ok(address && typeof address === 'object');
    const imports = new Imports(store);
    for (const [id, kind, exam, pair] of [
      ['p25','prova','01/2025','pf-2025:basico'],
      ['k25','gabarito','01/2025','pf-2025:basico'],
      ['e25','gabarito','01/2025','pf-2025:especifico'],
      ['p18','prova','01/2018','pf-2018:basico'],
      ['k18','gabarito','01/2018','pf-2018:basico'],
    ]) {
      store.run(`INSERT INTO imports (id,kind,name,trail_id,hash,status,created,total)
        VALUES (?,?,?,'pf',?,'review',?,1)`, id, kind, id + '.pdf', id, new Date().toISOString());
      imports.attachSource(id, exam, pair, 'https://example.org/' + id + '.pdf');
      const item = { page: 1, number: 1, version: 'Única', block: 'basico' };
      imports.saveDraft(id, { topics: [],
        keys: kind === 'gabarito' ? [{ ...item, key: id === 'k18' ? 'E' : 'C' }] : [],
        questions: kind === 'prova' ? [{ ...item, context: '', prompt: 'Item de ' + exam, type: 'boolean',
          options: [{ key: 'C', text: 'Certo' }, { key: 'E', text: 'Errado' }] }] : [],
      });
    }
    const publish = (jobId: string, keyId: string) => fetch(
      'http://127.0.0.1:' + address.port + '/api/imports/' + jobId + '/publish', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ confirmed: true, editionId: 'pf-referencia', keyId, requestId: jobId + ':' + keyId,
          selected: [{ index: 0, topicId: 'pf-demo-0' }] }),
      });
    for (const keyId of ['k18', 'e25']) {
      const response = await publish('p25', keyId);
      assert.equal(response.status, 400);
      assert.match((await response.json()).error, /mesmo concurso e bloco/);
    }
    for (const [jobId, keyId] of [['p25', 'k25'], ['p18', 'k18']]) {
      const response = await publish(jobId, keyId);
      assert.equal(response.status, 200);
      assert.equal((await response.json()).published, 1);
    }
    const official = listQuestions(store, 'pf-demo-0').filter(item => item.source);
    assert.deepEqual(official.map(item => item.exam), ['01/2018', '01/2025']);
    assert.equal(new Set(official.map(item => item.id)).size, 2);
  } finally {
    await new Promise<void>(resolve => server.close(() => resolve()));
    context.close();
  }
});

test('publishes confirmed version and retains original feedback on a revised key', () => {
  const context = fixture();
  const { store } = context;
  try {
    const imports = new Imports(store);
    for (const [id, kind] of [['exam','prova'], ['key','gabarito']]) store.run(
      'INSERT INTO imports (id,kind,name,trail_id,hash,status,created,total) VALUES (?,?,?,?,?,?,?,?)',
      id, kind, id + '.pdf', 'pr', id, 'review', new Date().toISOString(), 1);
    imports.saveDraft('exam', { topics: [], keys: [], questions: [{
      page: 1, number: 41, version: 'A', block: 'especifico', prompt: 'Enunciado de teste.',
      context: '', type: 'choice', options: Array.from('ABCDE', key => ({ key, text: 'Alternativa ' + key })),
    }] });
    function key(version: string, key: string) {
      imports.saveDraft('key', { topics: [], questions: [], keys: [{ page: 1, number: 41, version, block: 'especifico', key }] });
    }
    const input = { confirmed: true as const, editionId: 'pr-referencia', keyId: 'key', selected: [{ index: 0, topicId: 'pr-demo-0' }] };
    key('B', 'A');
    assert.equal(imports.publish('exam', { ...input, requestId: 'pub-1' }).published, 0);
    key('A', 'A');
    store.run("INSERT INTO pages (import_id,page,text,needs_ocr) VALUES ('key',1,'GABARITO PRELIMINAR',0)");
    const preliminary = imports.publish('exam', { ...input, requestId: 'pub-prelim' });
    assert.equal(preliminary.published, 1);
    const published = imports.publish('exam', { ...input, requestId: 'pub-2' });
    assert.equal(published.published, 1);
    assert.deepEqual(imports.publish('exam', { ...input, requestId: 'pub-2' }), published);
    const question = listQuestions(store, 'pr-demo-0').find(question => question.number === 41)!;
    assert.equal(Object.hasOwn(question, 'key'), false);
    const first = answerQuestion(store, question.id, { id: 'answer-1', answer: 'A', revision: 1, guess: true });
    assert.equal(first.correct, true);
    assert.equal(first.guess, true);
    assert.equal(question.keyPreliminary, true);
    assert.equal(first.keyPreliminary, true);
    store.run("UPDATE pages SET text='GABARITO PÓS RECURSO' WHERE import_id='key' AND page=1");
    key('A', 'B');
    imports.publish('exam', { ...input, requestId: 'pub-3' });
    assert.equal(answerQuestion(store, question.id, { id: 'answer-1', answer: 'A', revision: 1, guess: true }).key, 'A');
    assert.throws(() => answerQuestion(store, question.id, { id: 'stale', answer: 'A', revision: 1, guess: false }), /atualizada/);
    const second = answerQuestion(store, question.id, { id: 'answer-2', answer: 'A', revision: 2, guess: false });
    assert.equal(second.correct, false);
    assert.equal(second.key, 'B');
    assert.equal(second.keyPreliminary, false);
    const historical = studyState(store).attempts.find(row => row.id === first.id)!;
    assert.equal(historical.keyPreliminary, true);
    assert.equal(historical.key, 'A');
    assert.equal(historical.correct, true);
    key('A', 'X');
    imports.publish('exam', { ...input, requestId: 'pub-4' });
    assert.equal(listQuestions(store, 'pr-demo-0').find(item => item.id === question.id)?.status, 'annulled');
  } finally { context.close(); }
});

test('keeps history and flashcard links when the reference edition changes', () => {
  const context = fixture();
  const { store } = context;
  try {
    const old = studyState(store).topics.find(topic => topic.id === 'pr-demo-0')!;
    store.run('INSERT INTO editions VALUES (?,?,?)', 'pr-new', 'pr', 'Nova edição');
    store.run('INSERT INTO topics (id,edition_id,discipline,title,priority,position) VALUES (?,?,?,?,?,?)',
      'pr-new-1', 'pr-new', old.discipline, old.title, 3, 0);
    setEdition(store, 'pr', 'pr-new');
    assert.equal(studyState(store).trails.find(trail => trail.id === 'pr')?.editionId, 'pr-new');
    assert.ok(studyState(store).cards[0].topicIds.includes('pr-new-1'));
    assert.ok(studyState(store).cards[0].topicIds.includes('pr-demo-0'));
  } finally { context.close(); }
});

test('serves the local API and rejects cross-origin writes', async () => {
  const context = fixture();
  const server = createApp(context.store).listen(0, '127.0.0.1');
  try {
    await once(server, 'listening');
    const address = server.address();
    assert.ok(address && typeof address === 'object');
    const base = 'http://127.0.0.1:' + address.port;
    const response = await fetch(base + '/api/state');
    assert.equal(response.status, 200);
    const state = await response.json();
    assert.deepEqual(state.trails.map((trail: { id: string }) => trail.id), ['pr', 'pf']);
    const rejected = await fetch(base + '/api/settings', {
      method: 'PUT', headers: { Origin: 'https://example.com', 'Content-Type': 'application/json' },
      body: JSON.stringify({ activeTrail: 'pf', schedule: state.schedule }),
    });
    assert.equal(rejected.status, 403);
  } finally {
    await new Promise<void>(resolve => server.close(() => resolve()));
    context.close();
  }
});
