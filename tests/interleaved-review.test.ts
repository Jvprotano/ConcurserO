import assert from 'node:assert/strict';
import test from 'node:test';
import { planReview, reviewSubjects } from '../shared/interleaved-review.ts';
import type { StudySession } from '../shared/agenda.ts';
import type { Attempt, BankQuestion, StudyState, Topic } from '../shared/types.ts';

const today = '2026-11-23';
const topic = (id: string, title: string, patch: Partial<Topic> = {}): Topic => ({
  id, title, syllabus: true, trailId: 'pr', editionId: 'edital', discipline: 'Raciocínio Lógico',
  priority: 2, material: '', summary: '', practiced: false, lastPractice: null, questionCount: 0, materialCount: 0, ...patch,
});
const question = (id: string, topicId: string, patch: Partial<BankQuestion> = {}): BankQuestion => ({
  id, topicId, trailId: 'pr', exam: '2024', revision: 1, number: 1, version: 'A', block: 'basico', prompt: id,
  context: '', options: [{ key: 'C', text: 'Certo' }, { key: 'E', text: 'Errado' }], type: 'boolean', status: 'ready',
  supportPages: [], discipline: 'Raciocínio Lógico', topicTitle: topicId, editionId: 'edital', editionTitle: '', ...patch,
});
const session = (topicId: string, day: string, patch: Partial<StudySession> = {}): StudySession => ({
  id: topicId + day, topicId, day, title: topicId, minutes: 10, estimated: false, kind: 'theory', ...patch,
});
const answer = (questionId: string, topicId: string, day: string, patch: Partial<Attempt> = {}): Attempt => ({
  id: 'answer-' + questionId, questionId, topicId, created: day + 'T15:00:00Z', prompt: '', answer: 'C', correct: true,
  guess: false, key: 'C', comment: '', reason: '', ...patch,
});
const stateWith = (topics: Topic[], sessions: StudySession[], attempts: Attempt[] = []): StudyState => ({
  topics, attempts, today, activeTrail: 'pr', cards: [], imports: [], schedule: [1, 1, 1, 1, 1, 1, 1], spent: 0,
  trails: [{ id: 'pr', title: 'Concurso PR', board: 'IBFC', examDate: null, editionId: 'edital', edition: '', editions: [] },
    { id: 'paused', title: 'Pausado', board: 'IBFC', examDate: null, editionId: 'paused-edition', edition: '', editions: [], enabled: false }],
  agenda: { sessions, materials: [], cycles: [] },
});

test('suggests the latest recorded study today and mixes only previously studied subjects', () => {
  const topics = [topic('products', 'Análise combinatória'), topic('sets', 'Conjuntos'), topic('logic', 'Lógica proposicional'),
    topic('ratios', 'Razões'), topic('paused', 'Porcentagem', { editionId: 'paused-edition' })];
  const state = stateWith(topics, [
    session('sets', today, { kind: 'time', created: today + 'T13:00:00Z' }),
    session('products', today, { created: today + 'T15:00:00Z' }),
    session('logic', '2026-11-22'),
    session('ratios', today, { kind: 'cards' }),
    session('paused', today, { created: today + 'T16:00:00Z' }),
  ]);
  state.agenda!.cycles.push({ topicId: 'logic', due: '2026-11-22', stage: 0, revision: 1 });
  const bank = ['products', 'sets', 'logic', 'ratios', 'paused']
    .flatMap(id => [question(id + '1', id), question(id + '2', id), question(id + '3', id)]);
  const { subjects, suggestion } = reviewSubjects(state, bank);
  const plan = planReview(subjects, suggestion, 2, 4);
  assert.equal(suggestion, 'products');
  assert.deepEqual(plan.current.map(row => row.question.id), ['products1', 'products2']);
  assert.deepEqual(plan.review.map(row => row.topicId), ['logic', 'sets', 'logic', 'sets']);
  assert.equal(plan.reviewAvailable, 6);
  assert.equal(plan.previousCount, 2);
});

test('shares classified and linked questions, excludes pending, annulled and demo items, and preserves preliminary status', () => {
  const state = stateWith([topic('a', 'Análise combinatória'), topic('b', 'Probabilidade'),
    topic('old', 'Contagem', { syllabus: false }), topic('imported', 'A classificar', { syllabus: false })],
  [session('old', today), session('b', '2026-11-21')]);
  state.topicLinks = [{ sourceId: 'a', targetId: 'old' }];
  const bank = [
    question('linked', 'old', { analysis: {
      disciplineId: 'logical', discipline: 'Raciocínio Lógico', topicId: 'contagem', topic: 'Contagem',
      id: 'contagem-basica', label: 'Contagem básica', subject: 'logical', area: 'Geral', version: 'A', reference: { examId: '2024', number: 1 },
    } }),
    question('copy', 'old', { prompt: 'linked', version: 'B', number: 40 }),
    question('classified', 'imported', { keyPreliminary: true, analysis: {
      disciplineId: 'logical', discipline: 'Raciocínio Lógico', topicId: 'probabilidade', topic: 'Probabilidade',
      id: 'condicional', label: 'Probabilidade condicional', subject: 'logical', area: 'Geral', version: 'A',
      reference: { examId: '2024', number: 12 },
    } }),
    question('pending', 'b', { status: 'pending' }),
    question('annulled', 'b', { status: 'annulled' }),
    question('demo', 'a', { exam: 'demo' }),
  ];
  const { subjects, suggestion } = reviewSubjects(state, bank);
  const plan = planReview(subjects, suggestion, 15, 15);
  assert.equal(suggestion, 'a');
  assert.equal(plan.currentAvailable, 1);
  assert.equal(plan.reviewAvailable, 1);
  assert.equal(plan.current[0].question.id, 'linked');
  assert.equal(plan.review[0].question.id, 'classified');
  assert.equal(plan.review[0].question.keyPreliminary, true);
});

test('prioritizes past errors and guesses, then new questions and old acertos, before same-day items', () => {
  const old = '2026-11-18';
  const questions = ['right', 'new', 'wrong', 'today', 'guess'].map(id => question(id, 'a'));
  const attempts = [
    answer('today', 'a', today, { correct: false }), answer('right', 'a', old),
    answer('wrong', 'a', old, { correct: false }), answer('guess', 'a', old, { guess: true }),
  ];
  const state = stateWith([topic('a', 'Análise combinatória'), topic('b', 'Conjuntos')], [], attempts);
  const { subjects, suggestion } = reviewSubjects(state, questions);
  assert.equal(suggestion, '');
  const plan = planReview(subjects, '', 0, 15);
  assert.deepEqual(plan.review.map(row => row.question.id), ['wrong', 'guess', 'new', 'right', 'today']);
  assert.equal(plan.previousCount, 1);
  assert.equal(planReview(subjects, 'a', 2, 15).review.length, 0);
});
