import { preparation, relatedTopics } from './preparation.ts';
import type { StudyState, Topic } from './types.ts';

export type SessionKind = 'theory' | 'questions' | 'review' | 'essay';
export type RecallRating = 'forgot' | 'hard' | 'remembered';
export const activityLabels = { theory: 'Teoria', questions: 'Questões', review: 'Revisão', essay: 'Discursiva', cards: 'Flashcards', time: 'Tempo de estudo' };
export const ratingLabels = { forgot: 'Não lembrei', hard: 'Com dificuldade', remembered: 'Lembrei' };
export const sessionMinutes: Record<SessionKind, number> = { theory: 10, questions: 5, review: 5, essay: 20 };

export interface MaterialLink {
  topicId: string;
  firstPage?: number;
  lastPage?: number;
  section?: string;
  prompt?: string;
  answer?: string;
}
export interface StudyPdf {
  id: string;
  title: string;
  filename: string;
  origin: string;
  category: 'apostila' | 'nota' | 'referencia';
  version: number;
  available: boolean;
  links: MaterialLink[];
}
export interface StudySession {
  id: string;
  topicId: string;
  title: string;
  day: string;
  kind: SessionKind | 'cards' | 'time';
  minutes: number;
  estimated: boolean;
  rating?: RecallRating;
  nextDue?: string;
  oldDue?: string;
  materialId?: string;
  materialTitle?: string;
  essay?: string;
  created?: string;
}
export interface ReviewCycle { topicId: string; due: string; stage: number; revision: number }
export interface StudyTimer {
  id: string;
  topicId: string;
  title: string;
  elapsedMs: number;
  runningSince: number | null;
}
export interface AgendaState {
  materials: StudyPdf[];
  sessions: StudySession[];
  cycles: ReviewCycle[];
  timer?: StudyTimer;
}
export interface Activity {
  id: string;
  kind: SessionKind | 'cards';
  title: string;
  minutes: number;
  topic?: Topic;
  materials?: StudyPdf[];
  cycle?: ReviewCycle;
  due?: string;
  cardIds?: string[];
}
export interface AgendaDay {
  day: string;
  budget: number;
  spent: number;
  study: Activity[];
  completed: StudySession[];
}

const intervals = [1, 3, 7, 14, 30];
export function timerElapsed(timer: StudyTimer, now: number) {
  return timer.elapsedMs + (timer.runningSince === null ? 0 : Math.max(0, now - timer.runningSince));
}

export function addDays(day: string, days: number) {
  const date = new Date(day + 'T12:00:00Z');
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function reviewNext(day: string, stage: number, rating?: RecallRating) {
  const step = rating === 'remembered' ? Math.min(stage + 1, intervals.length - 1) : rating === 'hard' ? stage : 0;
  return { stage: step, due: addDays(day, rating === 'hard' ? Math.min(3, intervals[step]) : intervals[step]) };
}

export function agendaTopic(state: StudyState, topic: Topic, includeStudyTime = true) {
  const ids = new Set(relatedTopics(state, topic).map(row => row.id));
  const data = state.agenda;
  const cycle = data?.cycles.filter(row => ids.has(row.topicId)).sort((a, b) => a.due.localeCompare(b.due))[0];
  const materials = data?.materials.filter(row => row.links.some(link => ids.has(link.topicId))) ?? [];
  const last = data?.sessions.find(row => ids.has(row.topicId) && (includeStudyTime || row.kind !== 'time'));
  return { cycle, materials, last, ids };
}

export function agenda(state: StudyState, start: string, days: number) {
  const candidates = preparation(state).plan;
  const active = new Map(state.trails.filter(row => row.enabled !== false).map(row => [row.id, row.editionId]));
  const activeIds = new Set(state.topics.filter(row => active.has(row.trailId)).map(row => row.id));
  const reviews: Activity[] = [];
  const next: Activity[] = [];
  const seenCycles = new Set<string>();
  for (const row of candidates) {
    const { cycle, materials, last } = agendaTopic(state, row.topic, false);
    const title = row.topic.title;
    const readable = materials.some(pdf => pdf.category === 'apostila' && pdf.available) || row.related.some(topic =>
      topic.material || topic.summary || topic.materialCount > materials.filter(pdf => pdf.links.some(link => link.topicId === topic.id)).length);
    if (cycle && !seenCycles.has(cycle.topicId)) {
      seenCycles.add(cycle.topicId);
      reviews.push({ id: 'review:' + cycle.topicId, kind: 'review', title, minutes: sessionMinutes.review, topic: row.topic, materials, cycle, due: cycle.due });
    }
    const essay = /^prova discursiva$|^redação discursiva$/i.test(title);
    const kind = essay && !cycle && readable ? 'essay' : !cycle && readable ? 'theory' : row.ready && (!last || (!row.practiced && last.kind !== 'questions')) ? 'questions' : undefined;
    if (kind) next.push({ id: 'study:' + row.topic.id, kind, title, minutes: sessionMinutes[kind], topic: row.topic, materials, cycle });
  }
  for (const card of state.cards) {
    if (!card.topicIds.some(id => activeIds.has(id))) continue;
    const item: Activity = { id: 'card:' + card.id, kind: 'cards', title: 'Flashcards', minutes: 1, due: card.due, cardIds: [card.id] };
    reviews.push(item);
  }
  reviews.sort((a, b) => a.due!.localeCompare(b.due!) || Number(a.kind === 'cards') - Number(b.kind === 'cards'));
  next.sort((a, b) => Number(b.kind === 'theory' || b.kind === 'essay') - Number(a.kind === 'theory' || a.kind === 'essay'));
  const calendar: AgendaDay[] = [];
  const used = new Set<string>();
  let offset = 0;
  for (let day = start > state.today ? state.today : start; day < addDays(start, days); day = addDays(day, 1)) {
    const budget = state.schedule[new Date(day + 'T12:00:00Z').getUTCDay()];
    const completed = state.agenda?.sessions.filter(row => row.day === day) ?? [];
    const spent = day === state.today ? state.spent : completed.reduce((sum, row) => sum + row.minutes, 0);
    let remaining = Math.max(0, budget - spent);
    const study: Activity[] = [];
    if (day >= state.today) {
      const eligible = reviews.filter(item => !used.has(item.id) && item.due! <= day);
      for (const item of eligible) {
        if (item.minutes > remaining) break;
        remaining -= item.minutes;
        used.add(item.id);
        const group = study.at(-1);
        if (item.kind === 'cards' && group?.kind === 'cards' && group.due === item.due) {
          group.minutes++;
          group.cardIds!.push(...item.cardIds!);
        } else study.push(item.kind === 'cards' ? { ...item, cardIds: [...item.cardIds!] } : item);
      }
      if (eligible.every(item => used.has(item.id))) {
        while (offset < next.length && next[offset].minutes <= remaining) {
          const item = next[offset++];
          study.push(item);
          remaining -= item.minutes;
        }
      }
    }
    if (day >= start) calendar.push({ day, budget, spent, study, completed });
  }
  const due = reviews.filter(item => item.due! <= state.today);
  return {
    calendar, due,
    scheduledToday: calendar.find(row => row.day === state.today)?.study.filter(item => item.due).reduce((sum, item) => sum + (item.cardIds?.length ?? 1), 0) ?? 0,
  };
}
