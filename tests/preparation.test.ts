import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { Store, localDate } from '../server/db.ts';
import { answerQuestion, listQuestions, questionBank, reviewCard, saveCard, saveTopic, setEdition, studyState } from '../server/study.ts';
import { createApp } from '../server/index.ts';
import { Imports } from '../server/imports.ts';
import type { DraftQuestion } from '../shared/types.ts';
import { preparation, relatedTopics } from '../shared/preparation.ts';
import { uniqueAnalysisQuestions } from '../shared/focus-overview.ts';
import { emptyQuestionFilters, filterQuestions } from '../shared/questions.ts';

function fixture() {
  const directory = mkdtempSync(join(tmpdir(), 'concursero-unified-'));
  const store = new Store(directory);
  const topic = (id: string, editionId: string, discipline = 'Português', title = 'Interpretação de Textos', syllabus = true) =>
    saveTopic(store, { editionId, discipline, title, priority: 2, material: 'Material de estudo', summary: '', syllabus }, id);
  return { store, directory, topic, close() { store.db.close(); rmSync(directory, { recursive: true, force: true }); } };
}

test('one reading, answer and shared review project to two editais without duplicating time or events', () => {
  const f = fixture();
  try {
    assert.ok(preparation(studyState(f.store)).contests.every(contest => contest.rows.length === 0));
    f.topic('pr-demo-0', 'pr-referencia');
    f.topic('pf-demo-0', 'pf-referencia', 'Língua Portuguesa', 'interpretação de textos');
    f.store.run('INSERT INTO reading VALUES (?,?)', 'pr-demo-0', localDate());
    const question = listQuestions(f.store, 'pr-demo-0')[0];
    answerQuestion(f.store, question.id, { id: 'attempt', revision: 1, answer: 'A', guess: true });
    const state = studyState(f.store);
    for (const contest of preparation(state).contests) {
      assert.equal(contest.rows.length, 1);
      assert.equal(contest.touched, 1);
      assert.equal(contest.read, 1);
      assert.equal(contest.practiced, 1);
      assert.equal(contest.attempts.length, 1);
      assert.equal(contest.weaknesses, 1);
      assert.equal(contest.due.length, 1);
    }
    assert.equal(preparation(state).plan.length, 1);
    assert.equal(state.spent, 12);
    assert.equal(state.attempts.length, 1);
    assert.equal(f.store.get<{ n: number }>('SELECT count(*) AS n FROM reading')!.n, 1);
    reviewCard(f.store, state.cards[0].id, 'review', true);
    assert.ok(preparation(studyState(f.store)).contests.every(contest => contest.due.length === 0));
    assert.equal(studyState(f.store).spent, 13);
    // A later non-guessed correct answer clears that question's weakness, without erasing history.
    answerQuestion(f.store, question.id, { id: 'retry', revision: 1, answer: 'A', guess: false });
    const after = studyState(f.store);
    assert.equal(after.attempts.length, 2);
    assert.ok(preparation(after).contests.every(contest => contest.attempts.length === 1 && contest.weaknesses === 0));
  } finally { f.close(); }
});

test('similar names, other disciplines and unknown categories do not credit an edital; manual equivalence is reversible and nontransitive', () => {
  const f = fixture();
  try {
    f.topic('a', 'pr-referencia', 'Direito Processual Penal', 'Cadeia de custódia');
    f.topic('b', 'pf-referencia', 'Criminalística', 'Cadeia de custódia digital');
    f.topic('c', 'pf-referencia', 'Criminalística', 'Aquisição de vestígios');
    f.topic('unknown-a', 'pr-referencia', 'Conhecimentos básicos', 'A classificar');
    f.topic('unknown-b', 'pf-referencia', 'Conhecimentos básicos', 'A classificar');
    f.store.run('INSERT INTO reading VALUES (?,?)', 'a', localDate());
    let state = studyState(f.store);
    assert.equal(preparation(state).contests[1].read, 0);
    assert.equal(relatedTopics(state, state.topics.find(row => row.id === 'unknown-a')!).length, 1);
    f.store.run('INSERT INTO topic_links VALUES (?,?)', 'a', 'b');
    f.store.run('INSERT INTO topic_links VALUES (?,?)', 'b', 'c');
    state = studyState(f.store);
    assert.equal(preparation(state).progress(state.topics.find(row => row.id === 'b')!).read, true);
    assert.equal(preparation(state).progress(state.topics.find(row => row.id === 'c')!).read, false);
    f.store.run('DELETE FROM topic_links WHERE source_id=? AND target_id=?', 'a', 'b');
    assert.equal(preparation(studyState(f.store)).contests[1].read, 0);
    assert.equal(f.store.get<{ n: number }>('SELECT count(*) AS n FROM reading')!.n, 1);
  } finally { f.close(); }
});

test('new edition reuses compatible historical work and excludes support categories and removed topics from its denominator', () => {
  const f = fixture();
  try {
    f.topic('pr-demo-0', 'pr-referencia');
    f.topic('removed', 'pr-referencia', 'Português', 'Ortografia');
    f.store.run('INSERT INTO reading VALUES (?,?)', 'pr-demo-0', localDate());
    const question = listQuestions(f.store, 'pr-demo-0')[0];
    answerQuestion(f.store, question.id, { id: 'a', revision: 1, answer: 'A', guess: false });
    f.store.run('INSERT INTO editions VALUES (?,?,?)', 'new', 'pr', 'Novo edital');
    f.topic('new-topic', 'new', 'Língua Portuguesa');
    f.topic('support', 'new', 'Português', 'Pontuação', false);
    setEdition(f.store, 'pr', 'new');
    const report = preparation(studyState(f.store)).contests[0];
    assert.equal(report.rows.length, 1);
    assert.equal(report.touched, 1);
    assert.equal(report.practiced, 1);
    assert.equal(report.read, 1);
    assert.equal(report.attempts.length, 1);
    assert.equal(studyState(f.store).attempts[0].topicId, 'pr-demo-0');
  } finally { f.close(); }
});

test('global question bank retains separate contest identities even for the same exam label, item and version', () => {
  const f = fixture();
  try {
    f.store.run("UPDATE questions SET exam='01/2025',block='basico',version='A',number=1");
    const bank = questionBank(f.store);
    assert.equal(bank.questions.length, 2);
    assert.equal(uniqueAnalysisQuestions(bank.questions).length, 2);
    assert.deepEqual(new Set(bank.questions.map(row => row.board)), new Set(['IBFC', 'Cebraspe']));
    assert.equal(filterQuestions(bank.questions, { ...emptyQuestionFilters, trailId: 'pf' }, []).length, 1);
    assert.equal(questionBank(f.store, 'pf').questions.length, 1);
    assert.equal(Object.hasOwn(bank.questions[0], 'key'), false);
  } finally { f.close(); }
});

test('API registers N objectives, pauses without hiding history, persists links and accepts global availability', async () => {
  const f = fixture();
  const server = createApp(f.store).listen(0, '127.0.0.1');
  try {
    await once(server, 'listening');
    const address = server.address(); assert.ok(address && typeof address === 'object');
    const request = async (path: string, method: string, body: unknown) => fetch('http://127.0.0.1:' + address.port + '/api' + path,
      { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const created = await request('/trails', 'POST', { title: 'Terceiro concurso · cargo', board: 'Banca', examDate: '2027-03-20', priority: 3 });
    assert.equal(created.status, 201);
    const { id } = await created.json();
    assert.equal(studyState(f.store).trails.length, 3);
    const duplicate = await request('/trails', 'POST', { title: 'Terceiro concurso · cargo', board: 'Banca', examDate: null });
    assert.equal(duplicate.status, 409);
    assert.equal((await request('/trails/' + id, 'PATCH', { examDate: 'invalid' })).status, 400);
    assert.equal((await request('/trails/pf', 'PATCH', { enabled: false })).status, 200);
    assert.equal(preparation(studyState(f.store)).contests.length, 2);
    assert.equal(questionBank(f.store).questions.length, 2);
    const schedule = [0, 20, 20, 20, 20, 20, 0];
    assert.equal((await request('/settings', 'PUT', { schedule })).status, 200);
    assert.deepEqual(studyState(f.store).schedule, schedule);
    const link = { sourceId: 'pr-demo-0', targetId: 'pf-demo-0' };
    assert.equal((await request('/topic-links', 'POST', { ...link, targetId: 'missing' })).status, 404);
    assert.equal((await request('/topic-links', 'POST', link)).status, 200);
    assert.equal(studyState(f.store).topicLinks!.length, 1);
    assert.equal((await request('/topic-links', 'POST', { sourceId: link.targetId, targetId: link.sourceId })).status, 200);
    assert.equal(studyState(f.store).topicLinks!.length, 1);
    assert.equal((await request('/topic-links', 'DELETE', link)).status, 200);
    assert.equal(studyState(f.store).topicLinks!.length, 0);
    const reopened = new Store(f.directory);
    try { assert.equal(studyState(reopened).trails.find(row => row.id === 'pf')!.enabled, false); }
    finally { reopened.db.close(); }
  } finally { await new Promise<void>(resolve => server.close(() => resolve())); f.close(); }
});

test('migration from v3 preserves events, revisions, cards and material and distinguishes demonstrations', () => {
  const f = fixture();
  try {
    f.store.run('INSERT INTO reading VALUES (?,?)', 'pr-demo-0', localDate());
    answerQuestion(f.store, listQuestions(f.store, 'pr-demo-0')[0].id, { id: 'old', revision: 1, answer: 'A', guess: false });
    const before = studyState(f.store);
    // Rebuild the pre-v4 schema, including the unfiltered historical question view.
    f.store.db.exec(`DROP VIEW current_questions;
      ${['cards', 'topics', 'imports', 'editions', 'trails', 'materials'].map(name => 'DROP VIEW active_' + name + ';').join('\n')}
      DROP TABLE study_sessions; DROP TABLE study_cycles; DROP TABLE study_pdf_links; DROP TABLE study_pdfs;
      ALTER TABLE cards DROP COLUMN gran_attempt_id; DROP TABLE gran_attempts; DROP TABLE gran_saved_questions;
      DROP TABLE summaries; DELETE FROM settings WHERE key='summaryBackup';
      DROP TABLE removed_items;
      CREATE VIEW current_questions AS SELECT q.*,r.* FROM questions q JOIN question_revisions r ON r.question_id=q.id
        WHERE r.revision=(SELECT max(revision) FROM question_revisions WHERE question_id=q.id);
      DROP TABLE topic_links; ALTER TABLE trails DROP COLUMN enabled; ALTER TABLE trails DROP COLUMN priority;
      ALTER TABLE topics DROP COLUMN syllabus; PRAGMA user_version=3;`);
    const migrated = new Store(f.directory);
    try {
      const after = studyState(migrated);
      assert.deepEqual(after.attempts, before.attempts);
      assert.deepEqual(after.cards, before.cards);
      assert.equal(after.spent, before.spent);
      assert.equal(after.topics.length, before.topics.length);
      assert.equal(after.topics[0].material, before.topics[0].material);
      assert.ok(after.topics.every(topic => topic.syllabus === false));
      assert.equal(after.topics.find(topic => topic.id === 'pr-demo-0')!.read, true);
      assert.ok(after.trails.every(trail => trail.enabled));
    } finally { migrated.db.close(); }
  } finally { f.close(); }
});

test('reviewed question content finds edital topics despite a generic legacy link, and uses the revision actually answered', () => {
  const f = fixture();
  try {
    const reviewed = JSON.parse(readFileSync(new URL('./fixtures/theme-questions.json', import.meta.url), 'utf8')) as DraftQuestion[];
    const imports = new Imports(f.store);
    for (const [id, kind] of [['proof', 'prova'], ['key', 'gabarito']]) f.store.run(`INSERT INTO imports
      (id,kind,name,trail_id,hash,status,created,total,pair,exam) VALUES (?,?,?,'pr',?,'review',?,30,'pr-2024:basico','002/2024')`,
      id, kind, id, id, new Date().toISOString());
    imports.saveDraft('proof', { topics: [], keys: [], questions: [reviewed[0]] });
    imports.saveDraft('key', { topics: [], questions: [], keys: [{ page: 1, number: reviewed[0].number, version: 'A', block: 'basico', key: 'E' }] });
    imports.publish('proof', { requestId: 'legacy', editionId: 'pr-referencia', keyId: 'key', confirmed: true,
      selected: [{ index: 0, topicId: 'pr-demo-0' }] });
    f.topic('pr-ortografia', 'pr-referencia', 'Português', 'Ortografia');
    f.topic('pf-ortografia', 'pf-referencia', 'Língua Portuguesa', 'Ortografia e emprego dos porquês');
    let state = studyState(f.store);
    assert.ok(preparation(state).contests.every(contest => contest.rows[0].ready && !contest.practiced));
    const bank = questionBank(f.store);
    const filtered = filterQuestions(bank.questions, { ...emptyQuestionFilters,
      contentTopics: [{ discipline: 'Língua Portuguesa', title: 'Ortografia' }] }, []);
    assert.equal(filtered.length, 1);
    const question = filtered[0];
    answerQuestion(f.store, question.id, { id: 'reviewed', revision: question.revision, answer: 'A', guess: false });
    saveCard(f.store, { topicIds: ['pr-demo-0'], front: 'Revisar ortografia', back: 'Explicação', attemptId: 'reviewed' });
    state = studyState(f.store);
    for (const contest of preparation(state).contests) {
      assert.equal(contest.practiced, 1);
      assert.equal(contest.read, 0);
      assert.equal(contest.weaknesses, 1);
      assert.equal(contest.due.length, 1);
    }
    assert.equal(state.attempts[0].topicId, 'pr-demo-0');
    const original = state.attempts;
    imports.saveDraft('proof', { topics: [], keys: [], questions: [{ ...reviewed[0], prompt: 'Conteúdo substituído sem classificação revisada.' }] });
    imports.saveAll('proof', { requestId: 'new-revision' });
    state = studyState(f.store);
    assert.deepEqual(state.attempts, original);
    assert.ok(preparation(state).contests.every(contest => contest.practiced === 1));
    assert.ok(preparation(state).contests.every(contest => !contest.rows[0].ready));
  } finally { f.close(); }
});
