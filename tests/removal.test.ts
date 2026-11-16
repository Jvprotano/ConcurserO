import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createHash } from 'node:crypto';
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { Store, localDate } from '../server/db.ts';
import { Imports } from '../server/imports.ts';
import { createApp } from '../server/index.ts';
import { removeItem, removedItems, restoreItem } from '../server/removal.ts';
import { answerQuestion, listQuestions, questionBank, reviewCard, saveCard, studyState } from '../server/study.ts';
import { importedFocus } from '../shared/focus-overview.ts';
import type { DraftQuestion } from '../shared/types.ts';

function fixture() {
  const directory = mkdtempSync(join(tmpdir(), 'concursero-removal-'));
  const store = new Store(directory), imports = new Imports(store);
  const row: DraftQuestion = { number: 79, page: 1, version: 'Única', block: 'especifico', type: 'boolean',
    prompt: 'O protocolo pertence à camada de rede.', context: '', options: [{ key: 'C', text: 'Certo' }, { key: 'E', text: 'Errado' }] };
  for (const [id, kind] of [['proof', 'prova'], ['key', 'gabarito']] as const) {
    store.run(`INSERT INTO imports (id,kind,name,trail_id,hash,status,created,total,pair,exam)
      VALUES (?,?,?,'pf',?,'review',?,1,'pf-2025:especifico','01/2025')`, id, kind, id + '.pdf', id, new Date().toISOString());
  }
  imports.saveDraft('proof', { questions: [row], keys: [], topics: [] });
  imports.saveDraft('key', { questions: [], keys: [{ ...row, key: 'C' }], topics: [] });
  return { directory, store, imports, row, save() {
    imports.saveAll('proof', { requestId: 'save' });
    return questionBank(store, 'pf').questions.find(row => row.source?.id === 'proof')!;
  }, close() { store.db.close(); rmSync(directory, { recursive: true, force: true }); } };
}

test('removing a saved proof excludes its questions and incidence but preserves original events, PDF and IDs across restart', () => {
  const f = fixture();
  try {
    const question = f.save();
    answerQuestion(f.store, question.id, { id: 'attempt', revision: question.revision, answer: 'E', guess: true });
    const cardId = saveCard(f.store, { topicIds: [question.topicId], front: 'Revisar', back: 'Rede', attemptId: 'attempt' }).id;
    reviewCard(f.store, cardId, 'review', true);
    f.store.run('INSERT INTO reading VALUES (?,?)', question.topicId, localDate());
    const pdf = join(f.directory, 'pdf', 'proof.pdf'); writeFileSync(pdf, '%PDF-original');
    const before = studyState(f.store);
    const snapshot = ['questions', 'question_revisions', 'attempts', 'reviews', 'cards', 'card_topics', 'reading', 'pages', 'imports']
      .map(table => ({ table, rows: f.store.all('SELECT * FROM ' + table + ' ORDER BY rowid') }));
    removeItem(f.store, 'import', 'proof'); removeItem(f.store, 'import', 'proof');
    assert.ok(!studyState(f.store).imports.some(job => job.id === 'proof'));
    assert.ok(!questionBank(f.store).questions.some(row => row.source?.id === 'proof'));
    assert.equal(importedFocus(questionBank(f.store).questions, '01/2025', 'all').total, 0);
    assert.equal(listQuestions(f.store, question.topicId).length, 0);
    assert.throws(() => answerQuestion(f.store, question.id, { id: 'new', revision: 1, answer: 'C', guess: false }), /inexistente/);
    assert.throws(() => f.imports.saveAll('proof', { requestId: 'after-removal' }), /inexistente/);
    assert.equal(existsSync(pdf), true);
    assert.deepEqual(studyState(f.store).attempts, before.attempts);
    assert.deepEqual(studyState(f.store).cards, before.cards);
    assert.equal(studyState(f.store).spent, before.spent);
    for (const { table, rows } of snapshot) assert.deepEqual(f.store.all('SELECT * FROM ' + table + ' ORDER BY rowid'), rows);
    const reopened = new Store(f.directory);
    try {
      assert.equal(removedItems(reopened).length, 1);
      restoreItem(reopened, 'import', 'proof');
      assert.deepEqual(questionBank(reopened, 'pf').questions.find(row => row.id === question.id), question);
      assert.deepEqual(studyState(reopened).attempts, before.attempts);
    } finally { reopened.db.close(); }
  } finally { f.close(); }
});

test('removed keys leave saved questions visible with pending correction and do not rewrite past answers', () => {
  const f = fixture();
  try {
    const question = f.save();
    answerQuestion(f.store, question.id, { id: 'past', revision: 1, answer: 'C', guess: false });
    const before = studyState(f.store).attempts;
    const demo = questionBank(f.store, 'pf').questions.find(row => row.exam === 'demo')!;
    removeItem(f.store, 'import', 'key');
    const pending = questionBank(f.store, 'pf').questions.find(row => row.id === question.id)!;
    assert.equal(pending.status, 'pending'); assert.match(pending.pendingReason!, /Gabarito removido/);
    assert.equal(listQuestions(f.store, question.topicId).length, 0);
    assert.equal(importedFocus(questionBank(f.store, 'pf').questions, '01/2025', 'all').total, 1);
    assert.throws(() => answerQuestion(f.store, question.id, { id: 'blocked', revision: 1, answer: 'C', guess: false }), /Gabarito removido/);
    assert.throws(() => f.imports.saveAll('proof', { requestId: 'no-key' }), /gabarito removido/);
    f.store.run(`INSERT INTO imports (id,kind,name,trail_id,hash,status,created,total,pair,exam,draft)
      SELECT 'other-key',kind,name,trail_id,'other-key',status,created,total,pair,exam,draft FROM imports WHERE id='key'`);
    assert.equal(questionBank(f.store, 'pf').drafts.find(row => row.id === 'proof')!.keyId, undefined);
    assert.throws(() => f.imports.saveAll('proof', { requestId: 'no-auto-replacement' }), /explicitamente/);
    assert.equal(questionBank(f.store, 'pf').questions.find(row => row.id === demo.id)!.status, 'ready');
    assert.deepEqual(studyState(f.store).attempts, before);
    restoreItem(f.store, 'import', 'key');
    assert.deepEqual(questionBank(f.store, 'pf').questions.find(row => row.id === question.id), question);
    assert.deepEqual(studyState(f.store).attempts, before);
  } finally { f.close(); }
});

test('unsaved A/B/C imports disappear together, reupload restores the same document and never alters versions', () => {
  const f = fixture();
  try {
    f.imports.saveDraft('proof', { questions: ['A', 'B', 'C'].map(version => ({ ...f.row, version })), keys: [], topics: [] });
    const buffer = Buffer.from('%PDF-test-retained');
    f.store.run('UPDATE imports SET hash=? WHERE id=?', createHash('sha256').update(buffer).digest('hex'), 'proof');
    const before = questionBank(f.store, 'pf').questions.filter(row => row.importId === 'proof');
    assert.equal(before.length, 3);
    removeItem(f.store, 'import', 'proof');
    assert.equal(questionBank(f.store, 'pf').questions.filter(row => row.importId === 'proof').length, 0);
    assert.deepEqual(f.imports.upload('pf', 'prova', 'again.pdf', buffer), { id: 'proof', existing: true });
    assert.deepEqual(questionBank(f.store, 'pf').questions.filter(row => row.importId === 'proof'), before);
  } finally { f.close(); }
});

test('parent removals respect independent removals, shared cards and empty preparations', () => {
  const f = fixture();
  try {
    const card = studyState(f.store).cards[0];
    removeItem(f.store, 'topic', 'pf-demo-1');
    removeItem(f.store, 'trail', 'pf');
    assert.throws(() => removeItem(f.store, 'edition', 'pf-referencia'), /Ative outra/);
    assert.ok(!questionBank(f.store).questions.some(row => row.trailId === 'pf'));
    assert.equal(studyState(f.store).cards[0].id, card.id);
    assert.throws(() => restoreItem(f.store, 'topic', 'pf-demo-1'), /primeiro/);
    assert.throws(() => restoreItem(f.store, 'import', 'proof'), /primeiro/);
    restoreItem(f.store, 'trail', 'pf');
    assert.ok(!studyState(f.store).topics.some(row => row.id === 'pf-demo-1'));
    restoreItem(f.store, 'topic', 'pf-demo-1');
    assert.throws(() => removeItem(f.store, 'edition', 'pf-referencia'), /Ative outra/);
    f.store.run("INSERT INTO editions VALUES ('old','pf','Anterior')");
    f.store.run("INSERT INTO topics (id,edition_id,discipline,title,priority,position) VALUES ('old-topic','old','Redes','DNS',2,0)");
    removeItem(f.store, 'edition', 'old');
    assert.ok(!studyState(f.store).topics.some(row => row.id === 'old-topic'));
    restoreItem(f.store, 'edition', 'old');
    assert.ok(studyState(f.store).topics.some(row => row.id === 'old-topic'));
    removeItem(f.store, 'trail', 'pr'); removeItem(f.store, 'trail', 'pf');
    assert.equal(studyState(f.store).trails.length, 0);
    assert.equal(studyState(f.store).cards.length, 0);
    assert.equal(questionBank(f.store).questions.length, 0);
    restoreItem(f.store, 'trail', 'pr');
    assert.equal(studyState(f.store).cards[0].id, card.id);
  } finally { f.close(); }
});

test('removed edital topics do not reappear through drafts; materials and cards can be removed and restored independently', () => {
  const f = fixture();
  try {
    const question = f.save();
    removeItem(f.store, 'topic', question.topicId);
    assert.ok(!questionBank(f.store).questions.some(row => row.source?.id === 'proof'));
    restoreItem(f.store, 'topic', question.topicId);
    f.store.run("INSERT INTO imports (id,kind,name,trail_id,hash,status,created,total) VALUES ('edital','edital','Edital','pf','edital','review','2026',1)");
    f.imports.saveDraft('edital', { topics: [{ page: 1, discipline: 'Teste', title: 'Assunto do edital' }], questions: [], keys: [] });
    f.imports.saveAll('edital', { requestId: 'edital' });
    const topic = studyState(f.store).topics.find(row => row.source?.id === 'edital')!;
    removeItem(f.store, 'import', 'edital');
    assert.ok(!studyState(f.store).topics.some(row => row.id === topic.id));
    restoreItem(f.store, 'import', 'edital');
    assert.ok(studyState(f.store).topics.some(row => row.id === topic.id));
    f.store.run("INSERT INTO materials VALUES ('material','Compartilhado','Texto','Resumo')");
    for (const topicId of ['pf-demo-0', 'pr-demo-0']) f.store.run('INSERT INTO material_topics VALUES (?,?)', 'material', topicId);
    assert.equal(studyState(f.store).topics.find(row => row.id === 'pf-demo-0')!.materialCount, 1);
    removeItem(f.store, 'material', 'material');
    assert.equal(studyState(f.store).topics.find(row => row.id === 'pf-demo-0')!.materialCount, 0);
    restoreItem(f.store, 'material', 'material');
    assert.equal(studyState(f.store).topics.find(row => row.id === 'pr-demo-0')!.materialCount, 1);
    const card = studyState(f.store).cards[0];
    removeItem(f.store, 'card', card.id);
    assert.equal(studyState(f.store).cards.length, 0);
    assert.throws(() => reviewCard(f.store, card.id, 'blocked', true), /inexistente/);
    restoreItem(f.store, 'card', card.id);
    assert.deepEqual(studyState(f.store).cards[0], card);
  } finally { f.close(); }
});

test('HTTP removal, restoration and uploads during extraction use the same lifecycle', async () => {
  const f = fixture(), server = createApp(f.store).listen(0, '127.0.0.1');
  try {
    await once(server, 'listening');
    const address = server.address(); assert.ok(address && typeof address === 'object');
    const base = 'http://127.0.0.1:' + address.port + '/api';
    assert.equal((await fetch(base + '/items/import/proof', { method: 'DELETE' })).status, 200);
    assert.equal((await fetch(base + '/imports/proof')).status, 404);
    assert.equal((await fetch(base + '/removed-items').then(res => res.json())).length, 1);
    assert.equal((await fetch(base + '/items/import/proof/restore', { method: 'POST' })).status, 200);
    assert.equal((await fetch(base + '/imports/proof')).status, 200);
    assert.equal((await fetch(base + '/items/bogus/proof', { method: 'DELETE' })).status, 400);
    assert.equal((await fetch(base + '/items/import/missing', { method: 'DELETE' })).status, 404);
    const uploaded = await fetch(base + '/imports/pf/prova?name=processing.pdf', { method: 'POST',
      headers: { 'Content-Type': 'application/pdf' }, body: '%PDF-1.4\n%%EOF' }).then(res => res.json());
    assert.ok(uploaded.id);
    assert.equal((await fetch(base + '/items/import/' + uploaded.id, { method: 'DELETE' })).status, 200);
    assert.equal(f.store.get<{ status: string }>('SELECT status FROM imports WHERE id=?', uploaded.id)!.status, 'cancelled');
    assert.ok(!studyState(f.store).imports.some(row => row.id === uploaded.id));
    assert.equal((await fetch(base + '/imports/' + uploaded.id + '/pdf')).status, 200);
    for (const trailId of ['pr', 'pf']) await fetch(base + '/items/trail/' + trailId, { method: 'DELETE' });
    assert.equal((await fetch(base + '/trails', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'Novo concurso', board: 'Banca', examDate: null }) })).status, 201);
    assert.equal(studyState(f.store).trails.length, 1);
  } finally { await new Promise<void>(resolve => server.close(() => resolve())); f.close(); }
});
