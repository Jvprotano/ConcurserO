import { z } from 'zod';
import { timerElapsed, type StudyTimer } from '../shared/agenda.ts';
import { localDate, Problem, required, type Store } from './db.ts';

const target = z.object({ id: z.uuid(), topicId: z.string().min(1).max(100) });
export const studyTimeInput = target.extend({ day: z.iso.date(), minutes: z.number().int().min(1).max(1440) });
export const timerStartInput = target;
export const timerAction = z.enum(['pause', 'resume', 'save', 'discard']);

export function getStudyTimer(store: Store): StudyTimer | undefined {
  const row = store.get<{ value: string }>("SELECT value FROM settings WHERE key='studyTimer'");
  return row && JSON.parse(row.value) as StudyTimer;
}

function studyTopicTitle(store: Store, topicId: string) {
  return required(store.get<{ title: string }>('SELECT title FROM active_topics WHERE id=?', topicId), 'Assunto inexistente.').title;
}

function recordedTime(store: Store, id: string) {
  return store.get<{ topicId: string; kind: string; day: string; minutes: number }>(
    'SELECT topic_id AS topicId,kind,study_day AS day,minutes FROM study_sessions WHERE id=?', id);
}

function insertTime(store: Store, item: { id: string; topicId: string; title: string; day: string; minutes: number }, now: Date) {
  store.run(`INSERT INTO study_sessions (id,topic_id,title,study_day,created,kind,minutes,estimated)
    VALUES (?,?,?,?,?,'time',?,0)`, item.id, item.topicId, item.title, item.day, now.toISOString(), item.minutes);
}

export function recordStudyTime(store: Store, body: z.infer<typeof studyTimeInput>, now = new Date()) {
  return store.transaction(() => {
    const previous = recordedTime(store, body.id);
    if (previous) {
      if (previous.kind !== 'time' || previous.topicId !== body.topicId || previous.day !== body.day || previous.minutes !== body.minutes) {
        throw new Problem('Identificador de sessão já utilizado.', 409);
      }
      return;
    }
    if (getStudyTimer(store)?.id === body.id) throw new Problem('Identificador de sessão já utilizado.', 409);
    if (body.day > localDate(now)) throw new Problem('Escolha hoje ou uma data anterior.');
    insertTime(store, { ...body, title: studyTopicTitle(store, body.topicId) }, now);
  });
}

export function startStudyTimer(store: Store, body: z.infer<typeof timerStartInput>, now = new Date()) {
  return store.transaction(() => {
    const active = getStudyTimer(store);
    if (active?.id === body.id && active.topicId === body.topicId) return;
    if (active) throw new Problem('Já há um cronômetro de estudo ativo.', 409);
    if (recordedTime(store, body.id)) throw new Problem('Identificador de sessão já utilizado.', 409);
    const timer: StudyTimer = { ...body, title: studyTopicTitle(store, body.topicId), elapsedMs: 0, runningSince: now.getTime() };
    store.setSetting('studyTimer', timer);
  });
}

function activeTimer(store: Store, id: string) {
  const timer = getStudyTimer(store);
  if (!timer || timer.id !== id) throw new Problem('O cronômetro foi atualizado. Confira o tempo de estudo.', 409);
  return timer;
}

export function consumeStudyTimer(store: Store, id: string, now: Date, topicId?: string) {
  const timer = activeTimer(store, id);
  if (topicId && timer.topicId !== topicId) throw new Problem('O cronômetro pertence a outro assunto.', 409);
  const minutes = Math.max(1, Math.round(timerElapsed(timer, now.getTime()) / 60_000));
  store.run("DELETE FROM settings WHERE key='studyTimer'");
  return { ...timer, minutes };
}

export function updateStudyTimer(store: Store, id: string, action: z.infer<typeof timerAction>, now = new Date()) {
  return store.transaction(() => {
    if (action === 'save') {
      if (recordedTime(store, id)?.kind === 'time') return;
      const timer = consumeStudyTimer(store, id, now);
      insertTime(store, { ...timer, day: localDate(now) }, now);
      return;
    }
    const timer = activeTimer(store, id);
    if (action === 'discard') {
      store.run("DELETE FROM settings WHERE key='studyTimer'");
    } else if (action === 'pause' && timer.runningSince !== null) {
      store.setSetting('studyTimer', { ...timer, elapsedMs: timerElapsed(timer, now.getTime()), runningSince: null });
    } else if (action === 'resume' && timer.runningSince === null) {
      store.setSetting('studyTimer', { ...timer, runningSince: now.getTime() });
    }
  });
}
