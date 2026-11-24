import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { agenda, reviewNext, timerElapsed } from '../shared/agenda.ts';
import { localDate, Store } from '../server/db.ts';
import { importStudyPdf, linkStudyPdf, recordStudySession, studyPdfPath } from '../server/agenda.ts';
import { answerQuestion, listQuestions, studyState } from '../server/study.ts';
import { removeItems, removedItems, restoreItem } from '../server/removal.ts';
import { getStudyTimer, recordStudyTime, startStudyTimer, studyTimeInput, updateStudyTimer } from '../server/study-time.ts';
import type { Topic } from '../shared/types.ts';

const session = {
  first: '81272f9a-d29e-4411-a1aa-bb485bc2eb38',
  review: '81272f9a-d29e-4411-a1aa-bb485bc2eb39',
  other: '81272f9a-d29e-4411-a1aa-bb485bc2eb40',
};
const monday = '2026-11-16', tuesday = '2026-11-17', thursday = '2026-11-19';
const noon = (day: string) => new Date(day + 'T12:00:00');
const bytes = Buffer.from('%PDF-1.7\n%fixture');

function isolated(action: (store: Store) => void) {
  const folder = mkdtempSync(join(tmpdir(), 'concursero-agenda-'));
  const store = new Store(folder);
  try { action(store); }
  finally { store.db.close(); rmSync(folder, { recursive: true, force: true }); }
}

test('preserva calendário e histórico quando uma revisão atrasa, repete a requisição e reabre o banco', () => isolated(store => {
  store.run("UPDATE topics SET syllabus=1 WHERE id='pr-demo-0'");
  const pdf = importStudyPdf(store, bytes, { filename: 'Apostila.pdf', category: 'apostila', origin: 'Caderno 04' });
  linkStudyPdf(store, pdf.id, { topicId: 'pr-demo-0', firstPage: 2, lastPage: 4 });
  const initial = recordStudySession(store, studyState(store), 'pr-demo-0', { id: session.first, kind: 'theory', materialId: pdf.id }, noon(monday));
  assert.equal(initial.nextDue, tuesday);
  assert.equal(recordStudySession(store, studyState(store), 'pr-demo-0', { id: session.first, kind: 'theory' }, noon(monday)).nextDue, tuesday);
  assert.throws(() => recordStudySession(store, studyState(store), 'pr-demo-0', { id: session.other, kind: 'theory' }, noon(monday)), /já foi registrada/);
  const review = { id: session.review, kind: 'review', cycleTopicId: 'pr-demo-0', cycleRevision: 1, rating: 'remembered', recall: 'Integridade e rastreabilidade.' } as const;
  assert.throws(() => recordStudySession(store, studyState(store), 'pr-demo-0', review, noon(monday)), /atualizada/);
  assert.equal(recordStudySession(store, studyState(store), 'pr-demo-0', review, noon(thursday)).nextDue, '2026-11-22');
  assert.throws(() => recordStudySession(store, studyState(store), 'pr-demo-0', { ...review, id: session.other }, noon(thursday)), /atualizada/);
  store.run('DELETE FROM material_topics WHERE material_id=?', pdf.id);
  const reopened = new Store(store.directory);
  try {
    const { cycles, sessions } = studyState(reopened).agenda!;
    assert.deepEqual(cycles.map(row => ({ ...row })), [{ topicId: 'pr-demo-0', due: '2026-11-22', stage: 1, revision: 2 }]);
    assert.equal(sessions.find(row => row.id === session.review)?.oldDue, tuesday);
    assert.equal(sessions.find(row => row.id === session.first)?.materialTitle, 'Apostila');
    assert.equal(sessions.length, 2);
  } finally { reopened.db.close(); }
}));

test('preserva versões e recupera PDF ausente com os mesmos bytes', () => isolated(store => {
  const meta = { filename: 'Apostila.pdf', category: 'apostila', origin: 'Caderno 04' } as const;
  const a = importStudyPdf(store, bytes, meta);
  assert.deepEqual(importStudyPdf(store, bytes, meta), { id: a.id, duplicate: true });
  const b = importStudyPdf(store, Buffer.from('%PDF-1.7\n%nova'), meta);
  assert.notEqual(a.id, b.id);
  const path = studyPdfPath(store, a.id);
  rmSync(path);
  assert.throws(() => studyPdfPath(store, a.id), /indisponível/);
  assert.equal(importStudyPdf(store, bytes, meta).id, a.id);
  assert.deepEqual(readFileSync(studyPdfPath(store, a.id)), bytes);
  assert.deepEqual(studyState(store).agenda!.materials.map(row => row.version), [2, 1]);
}));

test('o tempo de uma questão incorporada à prática entra uma vez e a equivalência compartilha o ciclo', () => isolated(store => {
  store.run("UPDATE topics SET syllabus=1 WHERE id IN ('pr-demo-0','pf-demo-0')");
  const question = listQuestions(store, 'pr-demo-0')[0];
  const attempt = answerQuestion(store, question.id, { id: session.other, revision: question.revision, answer: 'A', guess: false });
  const state = studyState(store);
  recordStudySession(store, state, 'pr-demo-0', { id: session.first, kind: 'questions', attemptId: attempt.id, minutes: 7 });
  const updated = studyState(store);
  assert.equal(updated.spent, 7);
  const items = updated.agenda!.sessions;
  assert.equal(items.length, 1);
  assert.equal(items[0].estimated, false);
  assert.equal(updated.agenda!.cycles.length, 1);
  assert.throws(() => recordStudySession(store, updated, 'pf-demo-0', { id: session.review, kind: 'questions', attemptId: attempt.id }), /já foi registrada/);
}));

test('a semana carrega atrasos para a próxima disponibilidade, protege capacidade e exclui os cartões só da PF', () => isolated(store => {
  const state = studyState(store);
  state.today = monday;
  state.spent = 0;
  state.schedule = [0, 0, 15, 30, 30, 30, 0];
  state.trails.find(row => row.id === 'pf')!.enabled = false;
  const existing = state.topics.find(row => row.id === 'pr-demo-0')!;
  const first: Topic = { ...existing, syllabus: true, title: 'Primeiro assunto', questionCount: 0 };
  const other: Topic = { ...first, id: 'other', title: 'Outro assunto' };
  state.topics = [first, other, ...state.topics.filter(row => row.trailId === 'pf')];
  state.cards = [{ id: 'pf', front: 'Da PF', back: '', due: monday, stage: 0, topicIds: ['pf-demo-0'] }];
  state.agenda = { materials: [], sessions: [], cycles: [{ topicId: first.id, due: '2026-11-15', stage: 0, revision: 1 }] };
  const plan = agenda(state, monday, 3);
  assert.equal(plan.due.length, 1);
  assert.equal(plan.calendar[0].study.length, 0);
  assert.deepEqual(plan.calendar[1].study.map(item => [item.kind, item.minutes, item.due]), [['review', 5, '2026-11-15'], ['theory', 10, undefined]]);
  assert.equal(plan.calendar[2].study.length, 0);
  state.schedule[2] = 4;
  assert.equal(agenda(state, monday, 3).calendar[1].study.length, 0);
  assert.equal(agenda(state, monday, 3).calendar[2].study[0].kind, 'review');
  assert.deepEqual(reviewNext(thursday, 3, 'hard'), { stage: 3, due: '2026-11-22' });
  assert.deepEqual(reviewNext(thursday, 3, 'forgot'), { stage: 0, due: '2026-11-20' });
}));

test('cronometra o assunto mesmo após reabrir o banco e exclui o intervalo pausado', () => isolated(store => {
  const target = { id: randomUUID(), topicId: 'pr-demo-0' };
  const started = noon(monday);
  const after = (minutes: number) => new Date(started.getTime() + minutes * 60_000);
  startStudyTimer(store, target, started);
  startStudyTimer(store, target, after(1));
  assert.throws(() => startStudyTimer(store, { id: randomUUID(), topicId: 'pf-demo-0' }, after(1)), /já há/i);
  updateStudyTimer(store, target.id, 'pause', after(2));

  const reopened = new Store(store.directory);
  try {
    const paused = getStudyTimer(reopened)!;
    assert.equal(paused.topicId, target.topicId);
    assert.equal(paused.runningSince, null);
    assert.equal(timerElapsed(paused, after(7).getTime()), 120_000);
    updateStudyTimer(reopened, target.id, 'resume', after(7));
    updateStudyTimer(reopened, target.id, 'save', after(10));
    updateStudyTimer(reopened, target.id, 'save', after(11));
    const agenda = studyState(reopened).agenda!;
    assert.equal(agenda.timer, undefined);
    assert.equal(agenda.sessions.length, 1);
    assert.deepEqual([agenda.sessions[0].kind, agenda.sessions[0].minutes, agenda.sessions[0].day, agenda.sessions[0].estimated],
      ['time', 5, monday, false]);
    assert.equal(agenda.cycles.length, 0);

    const discarded = { ...target, id: randomUUID() };
    startStudyTimer(reopened, discarded, after(11));
    updateStudyTimer(reopened, discarded.id, 'discard', after(12));
    assert.equal(getStudyTimer(reopened), undefined);
    assert.equal(studyState(reopened).agenda!.sessions.length, 1);
  } finally { reopened.db.close(); }
}));

test('tempo avulso preserva o plano, admite lançamentos no mesmo dia e permite remover e restaurar', () => isolated(store => {
  const topicId = 'pr-demo-0';
  store.run('UPDATE topics SET syllabus=1 WHERE id=?', topicId);
  const today = localDate();
  const before = studyState(store);
  const first = { id: randomUUID(), topicId, day: today, minutes: 9 };
  const second = { ...first, id: randomUUID(), minutes: 6 };
  const earlier = { ...first, id: randomUUID(), day: '2026-01-01' };
  assert.equal(studyTimeInput.safeParse({ ...first, minutes: 0 }).success, false);
  assert.equal(studyTimeInput.safeParse({ ...first, minutes: 1.5 }).success, false);
  assert.throws(() => recordStudyTime(store, { ...first, day: '9999-01-01' }), /data anterior/);
  for (const row of [first, first, second, earlier]) recordStudyTime(store, row);
  const updated = studyState(store);
  assert.equal(updated.spent - before.spent, 15);
  assert.equal(updated.agenda!.sessions.filter(row => row.kind === 'time').length, 3);
  assert.equal(agenda(updated, earlier.day, 1).calendar[0].spent, 9);
  assert.deepEqual(updated.agenda!.cycles, before.agenda!.cycles);
  assert.deepEqual(updated.topics.find(row => row.id === topicId), before.topics.find(row => row.id === topicId));

  const remove = (id: string) => ({ kind: 'study-time' as const, id });
  removeItems(store, [remove(first.id)]);
  assert.equal(studyState(store).spent - before.spent, 6);
  removeItems(store, [remove(second.id), remove(earlier.id)]);
  assert.equal(studyState(store).spent, before.spent);
  assert.equal(removedItems(store).length, 3);
  restoreItem(store, 'study-time', first.id);
  assert.equal(studyState(store).spent - before.spent, 9);
}));

test('a conclusão da agenda usa o cronômetro uma vez e preserva a associação com a tentativa', () => isolated(store => {
  const topicId = 'pr-demo-0';
  store.run('UPDATE topics SET syllabus=1 WHERE id=?', topicId);
  const question = listQuestions(store, topicId)[0];
  const start = noon(localDate());
  const timerId = randomUUID();
  startStudyTimer(store, { id: timerId, topicId }, start);
  const attempt = answerQuestion(store, question.id, { id: randomUUID(), revision: question.revision, answer: 'A', guess: false });
  const data = { id: randomUUID(), kind: 'questions', timerId, attemptId: attempt.id } as const;
  const end = new Date(start.getTime() + 7 * 60_000);
  const state = studyState(store);
  assert.throws(() => recordStudySession(store, state, topicId, { ...data, attemptId: undefined }, end), /responda/i);
  assert.equal(getStudyTimer(store)?.id, timerId);
  const result = recordStudySession(store, state, topicId, data, end);
  assert.equal(recordStudySession(store, state, topicId, data, end).nextDue, result.nextDue);
  const updated = studyState(store);
  assert.equal(updated.agenda!.timer, undefined);
  assert.equal(updated.agenda!.sessions.length, 1);
  assert.equal(updated.agenda!.sessions[0].minutes, 7);
  assert.equal(updated.agenda!.sessions[0].estimated, false);
  assert.equal(updated.agenda!.cycles.length, 1);
  assert.throws(() => removeItems(store, [{ kind: 'study-time', id: data.id }]), /inexistente/i);
}));
