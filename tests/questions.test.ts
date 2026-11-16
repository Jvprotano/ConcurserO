import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { Store } from '../server/db.ts';
import { createApp } from '../server/index.ts';
import { questionBank, answerQuestion, setEdition, studyState } from '../server/study.ts';
import { emptyQuestionFilters, filterQuestions } from '../shared/questions.ts';
import type { BankQuestion } from '../shared/types.ts';

const question = (patch: Partial<BankQuestion> = {}): BankQuestion => ({
  id: 'q1', exam: '01/2025', revision: 1, topicId: 'networks', number: 1, block: 'especifico', version: 'Única',
  prompt: 'Análise do tráfego', context: 'Protocolo de comunicação', options: [{ key: 'C', text: 'Certo' }, { key: 'E', text: 'Errado' }],
  type: 'boolean', status: 'ready', supportPages: [], discipline: 'Informática', topicTitle: 'Redes',
  editionId: 'edition', editionTitle: '2025', ...patch,
});

test('combines multiple subjects as a union and other filters as restrictions, without mutating questions', () => {
  const rows = [question(), question({ id: 'q2', topicId: 'storage', topicTitle: 'Armazenamento' }),
    question({ id: 'q3', topicId: 'law', discipline: 'Direito' }), question({ id: 'q4', status: 'annulled' })];
  const original = structuredClone(rows);
  assert.deepEqual(filterQuestions(rows, { ...emptyQuestionFilters, topicIds: ['networks', 'storage'],
    discipline: 'Informática', exam: '01/2025', block: 'especifico', type: 'boolean', origin: 'official' }, []).map(row => row.id), ['q1', 'q2']);
  assert.equal(filterQuestions(rows, { ...emptyQuestionFilters, topicIds: ['storage'], discipline: 'Direito' }, []).length, 0);
  assert.deepEqual(rows, original);
  assert.deepEqual(filterQuestions(rows, emptyQuestionFilters, []).map(row => row.id), ['q1', 'q2', 'q3']);
});

test('search ignores accents and case and searches context and alternatives', () => {
  assert.equal(filterQuestions([question()], { ...emptyQuestionFilters, search: 'ANALISE comunicacao certo' }, []).length, 1);
  assert.equal(filterQuestions([question()], { ...emptyQuestionFilters, search: 'analise ausente' }, []).length, 0);
  assert.equal(filterQuestions([question({ exam: 'demo' })], { ...emptyQuestionFilters, origin: 'official' }, []).length, 0);
  assert.equal(filterQuestions([question({ exam: 'demo' })], { ...emptyQuestionFilters, origin: 'demo' }, []).length, 1);
});

test('history filters use the latest attempt, preserving same-timestamp server ordering', () => {
  const attempt = { id: 'new', questionId: 'q1', topicId: 'networks', prompt: 'Q', answer: 'C', correct: true,
    guess: false, reason: '', key: 'C', comment: '', created: '2026-11-11T12:00:00Z' };
  const attempts = [attempt, { ...attempt, id: 'old', correct: false, guess: true }];
  const rows = [question(), question({ id: 'q2' })];
  for (const [history, expected] of [['correct', ['q1']], ['wrong', []], ['guess', []],
    ['unanswered', ['q2']], ['answered', ['q1']]] as const) {
    assert.deepEqual(filterQuestions(rows, { ...emptyQuestionFilters, history }, attempts).map(row => row.id), expected);
  }
});

test('bank API isolates trails, retains older editions, withholds solutions and records answers', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'concursero-bank-'));
  const store = new Store(directory);
  const server = createApp(store).listen(0, '127.0.0.1');
  try {
    await once(server, 'listening');
    const address = server.address();
    assert.ok(address && typeof address === 'object');
    const base = 'http://127.0.0.1:' + address.port + '/api';
    store.run('INSERT INTO editions VALUES (?,?,?)', 'pf-next', 'pf', 'Próximo edital');
    setEdition(store, 'pf', 'pf-next');
    const response = await fetch(base + '/question-bank?trailId=pf');
    assert.equal(response.status, 200);
    const bank = await response.json();
    assert.equal(bank.questions.length, 1);
    const q = bank.questions[0];
    assert.equal(q.topicId, 'pf-demo-0');
    assert.equal(q.editionId, 'pf-referencia');
    for (const secret of ['key', 'comment', 'key_source_id', 'keySource']) assert.equal(Object.hasOwn(q, secret), false);
    const answer = await fetch(base + '/questions/' + q.id + '/answer', { method: 'POST',
      headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: 'bank-answer', revision: q.revision, answer: 'C', guess: false }) });
    assert.equal(answer.status, 200);
    assert.equal((await answer.json()).correct, true);
    assert.equal(studyState(store).attempts.length, 1);
    assert.equal((await fetch(base + '/question-bank?trailId=missing')).status, 404);
    const unified = await fetch(base + '/question-bank');
    assert.equal(unified.status, 200);
    assert.deepEqual(new Set((await unified.json()).questions.map((row: BankQuestion) => row.trailId)), new Set(['pr', 'pf']));
  } finally {
    await new Promise<void>(resolve => server.close(() => resolve()));
    store.db.close(); rmSync(directory, { recursive: true, force: true });
  }
});

test('bank distinguishes drafts and compatible key availability including preliminary keys without publishing', () => {
  const directory = mkdtempSync(join(tmpdir(), 'concursero-drafts-'));
  const store = new Store(directory);
  try {
    for (const [id, kind, status, draft] of [
      ['proof', 'prova', 'done', { questions: [{ number: 1, version: 'Única', block: 'basico' }, { number: 2, version: 'Única', block: 'basico' }] }],
      ['key', 'gabarito', 'review', { keys: [{ page: 1, number: 1, version: 'Única', block: 'basico', key: 'C' }] }],
    ] as const) store.run(`INSERT INTO imports (id,kind,name,trail_id,hash,status,created,total,pair,draft)
      VALUES (?,?,?,'pf',?,?,?,1,'pf-2025:basico',?)`, id, kind, id + '.pdf', id, status, new Date().toISOString(), JSON.stringify(draft));
    const result = questionBank(store, 'pf');
    assert.equal(result.drafts.length, 1); // A partially published caderno must remain visible.
    assert.equal(result.drafts[0].count, 2);
    assert.equal(result.drafts[0].hasKey, true);
    assert.equal(Object.hasOwn(result.drafts[0], 'draft'), false);
    assert.equal(questionBank(store, 'pr').drafts.length, 0);
    store.run("INSERT INTO pages (import_id,page,text,needs_ocr) VALUES ('key',1,'GABARITO PRELIMINAR',0)");
    assert.equal(questionBank(store, 'pf').drafts[0].hasKey, true);
    assert.equal(questionBank(store, 'pf').drafts[0].keys[0].preliminary, true);
    assert.equal(questionBank(store, 'pf').questions.length, 1); // Only the unchanged demo is published.
  } finally { store.db.close(); rmSync(directory, { recursive: true, force: true }); }
});
