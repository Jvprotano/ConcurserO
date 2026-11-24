import { contestDisciplines, normalizeDisciplineName } from './contest-taxonomy.ts';
import type { ContentPath, StudyState, Topic } from './types.ts';

const normalize = (value: string) => value.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLocaleLowerCase('pt-BR')
  .replace(/\s+/g, ' ').trim();

const normalizeTopic = (title: string) => {
  const value = normalize(title);
  return value === 'interpretacao de texto' ? 'interpretacao de textos' : value;
};
const disciplines = new Set(Object.values(contestDisciplines).map(normalize));
const legacyBlocks = new Set(['conhecimentos basicos', 'conhecimentos gerais', 'conhecimentos especificos']);

export function matchesTopicContent(path: ContentPath | undefined, topic: Pick<Topic, 'discipline' | 'title'>) {
  if (!path || !topic.title.trim()) return false;
  const discipline = normalize(normalizeDisciplineName(path.discipline));
  const target = normalize(normalizeDisciplineName(topic.discipline));
  // Older editais stored the exam block in the discipline field. A named discipline is a whole-section match.
  if (legacyBlocks.has(target)) {
    return disciplines.has(discipline) && discipline === normalize(normalizeDisciplineName(topic.title));
  }
  return discipline === target && [path.topic, path.subtopic].some(title => title && normalizeTopic(title) === normalizeTopic(topic.title));
}

export function topicIdentity(topic: Topic) {
  const title = normalize(topic.title), discipline = normalize(normalizeDisciplineName(topic.discipline));
  // Generic import categories do not establish content equivalence.
  if (!title || ['a classificar', 'conhecimentos basicos', 'conhecimentos especificos'].includes(title) || title === discipline) return 'id:' + topic.id;
  return JSON.stringify([discipline, title]);
}

export function relatedTopics(state: StudyState, topic: Topic): Topic[] {
  const own = topicIdentity(topic);
  const identities = new Set([own]);
  for (const link of state.topicLinks ?? []) {
    const source = state.topics.find(row => row.id === link.sourceId);
    const target = state.topics.find(row => row.id === link.targetId);
    if (!source || !target) continue;
    if (topicIdentity(source) === own) identities.add(topicIdentity(target));
    if (topicIdentity(target) === own) identities.add(topicIdentity(source));
  }
  // Deliberately one hop: A=B and B=C do not prove A=C across different scopes.
  return state.topics.filter(row => identities.has(topicIdentity(row)));
}

export function preparation(state: StudyState) {
  const followed = state.trails.filter(trail => trail.enabled !== false);
  const latest = new Map<string, StudyState['attempts'][number]>();
  for (const attempt of state.attempts) if (!latest.has(attempt.questionId)) latest.set(attempt.questionId, attempt);
  const progress = (topic: Topic) => {
    const related = relatedTopics(state, topic);
    const ids = new Set(related.map(row => row.id));
    const attempts = [...latest.values()].filter(attempt => ids.has(attempt.topicId) || related.some(row => matchesTopicContent(attempt.classification, row)));
    const due = state.cards.filter(card => card.due <= state.today && (card.topicIds.some(id => ids.has(id)) ||
      Boolean(card.attemptId && related.some(row => matchesTopicContent(state.attempts.find(attempt => attempt.id === card.attemptId)?.classification, row)))));
    const dueCycles = (state.agenda?.cycles ?? []).filter(cycle => cycle.due <= state.today && ids.has(cycle.topicId));
    const read = related.some(row => row.read);
    const ready = related.some(row => row.questionCount > 0 || state.practiceCoverage?.some(path => path.count > 0 && matchesTopicContent(path, row)));
    return { topic, related, ids, attempts, due, dueCycles, read, ready, practiced: attempts.length > 0, touched: read || attempts.length > 0,
      weaknesses: attempts.filter(row => !row.correct || row.guess).length };
  };
  const contests = followed.map(trail => {
    const topics = state.topics.filter(topic => topic.editionId === trail.editionId && topic.syllabus !== false);
    const rows = topics.map(progress);
    const attempts = [...new Map(rows.flatMap(row => row.attempts).map(row => [row.questionId, row])).values()];
    const due = [...new Map(rows.flatMap(row => row.due).map(card => [card.id, card])).values()];
    const dueCycles = new Set(rows.flatMap(row => row.dueCycles.map(cycle => cycle.topicId))).size;
    return { trail, rows, attempts, due, dueCycles,
      touched: rows.filter(row => row.touched).length, read: rows.filter(row => row.read).length,
      practiced: rows.filter(row => row.practiced).length, missing: rows.filter(row => !row.practiced).length,
      weaknesses: attempts.filter(row => !row.correct || row.guess).length,
      shared: rows.filter(row => row.touched && row.related.some(topic => topic.trailId !== trail.id &&
        (topic.read || state.attempts.some(attempt => attempt.topicId === topic.id)))).length,
      // Missing practice, then evidence of difficulty; never silently drop an edital item.
      gaps: rows.filter(row => !row.practiced || row.weaknesses || row.due.length || row.dueCycles.length)
        .sort((a, b) => Number(a.practiced) - Number(b.practiced) || b.weaknesses - a.weaknesses || b.topic.priority - a.topic.priority),
    };
  });
  const rows = contests.flatMap(contest => contest.rows.map(row => ({ ...row, priority: contest.trail.priority ?? 2,
    benefit: contests.filter(other => other.rows.some(candidate => row.ids.has(candidate.topic.id))).length })))
    .sort((a, b) => Number(a.touched) - Number(b.touched) || Number(a.practiced) - Number(b.practiced) ||
      b.weaknesses - a.weaknesses || b.priority - a.priority || b.benefit - a.benefit || b.topic.priority - a.topic.priority ||
      (a.topic.lastPractice ?? '').localeCompare(b.topic.lastPractice ?? ''));
  const seen = new Set<string>();
  const plan = rows.filter(row => {
    if (seen.has(row.topic.id)) return false;
    for (const id of row.ids) seen.add(id);
    return true;
  });
  return { contests, plan, progress };
}
