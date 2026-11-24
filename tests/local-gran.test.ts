import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { recordStudySession, sessionOptions } from '../server/agenda.ts';
import { Store } from '../server/db.ts';
import { granQuestionsForTopics } from '../server/local-gran.ts';
import { questionCatalog, searchQuestions } from '../server/question-catalog.ts';
import { removeItems, restoreItem } from '../server/removal.ts';
import { answerQuestion, saveCard, saveTopic, studyState } from '../server/study.ts';
import { preparation } from '../shared/preparation.ts';

test('a coleção Gran existente ganha prática, histórico, sessão e restauração com o mesmo identificador', () => {
  const directory = mkdtempSync(join(tmpdir(), 'concursero-local-gran-'));
  let store = new Store(directory);
  const question = {
    id: 123, enunciado: '<p>Identifique o tema do texto.</p>', banca: { id: 277, nome: 'IBFC' },
    materia: { id: 1, nome: 'Língua Portuguesa' }, topico: { id: 2, nome: 'Interpretação de Texto' },
    options: [{ key: '998', label: 'A', text: 'Tema um' }, { key: '999', label: 'B', text: 'Tema dois' }],
  };
  try {
    store.db.exec(`DROP INDEX study_sessions_gran_attempt; ALTER TABLE study_sessions DROP COLUMN gran_attempt_id;
      ALTER TABLE cards DROP COLUMN gran_attempt_id; DROP TABLE gran_attempts; PRAGMA user_version=9`);
    store.run('INSERT INTO gran_saved_questions VALUES (?,?,?)', '123', JSON.stringify(question), '999');
    store.run('INSERT INTO gran_saved_questions VALUES (?,?,?)', '124', JSON.stringify({ ...question, id: 124 }), null);
    store.run('INSERT INTO gran_saved_questions VALUES (?,?,?)', '125', JSON.stringify({ ...question, id: 125, anulada: true }), '999');
    store.db.close();
    store = new Store(directory);
    assert.equal(questionCatalog(store, false).granCount, 3);
    const { questions } = searchQuestions(store, { page: 0, filters: { discipline: 'Português', search: 'Q123' } });
    assert.equal(questions.length, 1);
    assert.equal(questions[0].gran?.discipline, 'Língua Portuguesa');
    assert(!('key' in questions[0]));
    assert(!('answer_key' in questions[0]));

    const topic = saveTopic(store, { editionId: 'pr-referencia', discipline: 'Conhecimentos gerais',
      title: 'Língua Portuguesa', priority: 2, material: '', summary: '', syllabus: true }).id;
    const state = studyState(store);
    const subject = state.topics.find(row => row.id === topic)!;
    assert(preparation(state).progress(subject).ready);
    const options = sessionOptions(state, topic, granQuestionsForTopics(store, [subject]));
    assert.equal(options.questions[0].id, 'gran:123');
    assert.equal(options.questions[0].topicId, topic);

    const input = { id: 'gran-answer', revision: 1, answer: '998', guess: true } as const;
    const attempt = answerQuestion(store, 'gran:123', { ...input, topicId: topic });
    assert.equal(attempt.answerLabel, 'A');
    assert.equal(attempt.key, 'B');
    assert.equal(attempt.correct, false);
    assert.deepEqual(answerQuestion(store, 'gran:123', { ...input, answer: '999' }), attempt);
    assert.throws(() => answerQuestion(store, 'gran:124', { ...input, id: 'pending' }), /Gabarito indisponível/);
    assert.throws(() => answerQuestion(store, 'gran:125', { ...input, id: 'annulled' }), /Questão anulada/);
    assert.equal(searchQuestions(store, { page: 0, filters: { history: 'wrong', origin: 'gran' } }).total, 1);
    assert.equal(preparation(studyState(store)).progress(subject).weaknesses, 1);
    const card = saveCard(store, { topicIds: [topic], front: 'Tema', back: 'B', attemptId: attempt.id });
    recordStudySession(store, studyState(store), topic, { id: 'gran-session', kind: 'questions', minutes: 7, attemptId: attempt.id });
    const after = studyState(store);
    assert.equal(after.cards.find(row => row.id === card.id)?.attemptId, attempt.id);
    assert.equal(after.agenda?.sessions.find(row => row.id === 'gran-session')?.minutes, 7);
    assert(!after.agenda?.sessions.some(row => row.id === attempt.id));

    removeItems(store, [{ kind: 'gran-question', id: '123' }, { kind: 'gran-question', id: '124' }]);
    assert.equal(searchQuestions(store, { page: 0, filters: { origin: 'gran' } }).total, 0);
    assert.equal(studyState(store).attempts[0].id, attempt.id);
    restoreItem(store, 'gran-question', '123');
    assert.equal(searchQuestions(store, { page: 0, filters: { history: 'wrong', origin: 'gran' } }).total, 1);
    assert.deepEqual(store.all('PRAGMA foreign_key_check'), []);
  } finally {
    store.db.close();
    rmSync(directory, { recursive: true, force: true });
  }
});
