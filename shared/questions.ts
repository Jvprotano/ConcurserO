import type { Attempt, BankQuestion } from './types.ts';
import { normalizeDisciplineName } from './contest-taxonomy.ts';
import { matchesTopicContent } from './preparation.ts';

export interface QuestionFilters {
  trailId?: string;
  contentTopics?: { discipline: string; title: string }[];
  search: string;
  discipline: string;
  topicIds: string[];
  exam: string;
  block: string;
  type: string;
  origin: string;
  history: string;
  themeId: string;
  syllabusTopicId: string;
}
export const emptyQuestionFilters: QuestionFilters = {
  search: '', discipline: '', topicIds: [], exam: '', block: '', type: '', origin: '', history: '', themeId: '', syllabusTopicId: '',
};
const normalize = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('pt-BR');
export const topicFilterId = (discipline: string, title: string) => 'catalog:' + discipline + ':' + title;
export const questionDiscipline = (question: BankQuestion) => question.analysis?.discipline ?? normalizeDisciplineName(question.discipline);

export function filterQuestions(questions: BankQuestion[], filters: QuestionFilters, attempts: Attempt[]) {
  const latest = new Map<string, Attempt>();
  // StudyState is ordered from newest to oldest, including same-timestamp attempts.
  for (const attempt of attempts) if (!latest.has(attempt.questionId)) latest.set(attempt.questionId, attempt);
  const terms = normalize(filters.search).trim().split(/\s+/).filter(Boolean);
  return questions.filter(question => {
    const attempt = latest.get(question.id);
    const text = normalize([question.prompt, question.context, question.discipline, question.topicTitle,
      question.analysis?.discipline ?? '', question.analysis?.topic ?? '', question.analysis?.label ?? '',
      ...question.options.map(option => option.text)].join(' '));
    return question.status !== 'annulled' && terms.every(term => text.includes(term)) &&
      (!filters.trailId || question.trailId === filters.trailId) &&
      (!filters.discipline || questionDiscipline(question) === normalizeDisciplineName(filters.discipline)) &&
      (!filters.themeId || question.analysis?.id === filters.themeId) &&
      (!filters.syllabusTopicId || question.analysis?.topicId === filters.syllabusTopicId) &&
      (!filters.topicIds.length || filters.topicIds.includes(question.topicId) ||
        filters.topicIds.includes(topicFilterId(question.discipline, question.topicTitle))) &&
      (!filters.contentTopics?.length || filters.contentTopics.some(topic =>
        topicFilterId(question.discipline, question.topicTitle) === topicFilterId(topic.discipline, topic.title) ||
        matchesTopicContent(question.analysis && { discipline: question.analysis.discipline, topic: question.analysis.topic, subtopic: question.analysis.label }, topic))) &&
      (!filters.exam || question.exam === filters.exam) &&
      (!filters.block || question.block === filters.block) &&
      (!filters.type || question.type === filters.type) &&
      (!filters.origin || (filters.origin === 'demo' ? question.exam === 'demo' : question.exam !== 'demo')) &&
      (!filters.history || (filters.history === 'unanswered' ? !attempt :
        filters.history === 'answered' ? Boolean(attempt) :
        filters.history === 'wrong' ? attempt?.correct === false :
        filters.history === 'correct' ? attempt?.correct === true : Boolean(attempt?.guess)));
  });
}
