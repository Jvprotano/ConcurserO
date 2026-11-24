import type { Attempt, BankQuestion, ContentPath } from './types.ts';
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
  board?: string;
  status?: string;
  questionId?: string;
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
export const questionSubjectId = (question: BankQuestion) => question.content?.topic
  ? topicFilterId(question.content.discipline, question.content.topic)
  : question.analysis?.topicId;
export function questionContent(question: BankQuestion): ContentPath | undefined {
  const { analysis } = question;
  return question.content ?? (analysis && { discipline: analysis.discipline, topic: analysis.topic, subtopic: analysis.label });
}

export function questionText(html: string) {
  return html.replace(/<[^>]*>/g, ' ').replace(/&(?:nbsp|amp|lt|gt|quot|apos|#39);/gi, value =>
    ({ '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&apos;': "'", '&#39;': "'" })[value.toLowerCase()] ?? ' ')
    .replace(/\s+/g, ' ').trim();
}

type AttemptStatus = Pick<Attempt, 'questionId' | 'correct' | 'guess'>;
export function filterQuestions(questions: BankQuestion[], filters: QuestionFilters, attempts: AttemptStatus[]) {
  const latest = new Map<string, AttemptStatus>();
  // StudyState is ordered from newest to oldest, including same-timestamp attempts.
  for (const attempt of attempts) if (!latest.has(attempt.questionId)) latest.set(attempt.questionId, attempt);
  const query = normalize(filters.search).trim();
  const code = /^q\s*(\d+)$/.exec(query)?.[1];
  const terms = query.split(/\s+/).filter(Boolean);
  return questions.filter(question => {
    const attempt = latest.get(question.id);
    if ((filters.status ? filters.status !== 'all' && question.status !== filters.status : question.status === 'annulled') ||
        (filters.board && question.board !== filters.board) || (filters.questionId && question.id !== filters.questionId) ||
        (code && question.gran?.id !== code)) return false;
    const path = questionContent(question);
    const matches = (!filters.trailId || question.trailId === filters.trailId) &&
      (!filters.discipline || questionDiscipline(question) === normalizeDisciplineName(filters.discipline)) &&
      (!filters.themeId || question.analysis?.id === filters.themeId) &&
      (!filters.syllabusTopicId || questionSubjectId(question) === filters.syllabusTopicId) &&
      (!filters.topicIds.length || filters.topicIds.includes(question.topicId) ||
        filters.topicIds.includes(topicFilterId(question.discipline, question.topicTitle))) &&
      (!filters.contentTopics?.length || filters.contentTopics.some(topic =>
        topicFilterId(question.discipline, question.topicTitle) === topicFilterId(topic.discipline, topic.title) ||
        matchesTopicContent(path, topic))) &&
      (!filters.exam || question.exam === filters.exam) &&
      (!filters.block || question.block === filters.block) &&
      (!filters.type || question.type === filters.type) &&
      (!filters.origin || (filters.origin === 'demo' ? question.exam === 'demo' : filters.origin === 'gran' ? Boolean(question.gran) :
        filters.origin === 'pdf' ? !question.gran && question.exam !== 'demo' : question.exam !== 'demo')) &&
      (!filters.history || (filters.history === 'unanswered' ? !attempt :
        filters.history === 'answered' ? Boolean(attempt) :
        filters.history === 'wrong' ? attempt?.correct === false :
        filters.history === 'correct' ? attempt?.correct === true : Boolean(attempt?.guess)));
    if (!matches || !terms.length || code) return matches;
    const text = normalize([
      question.gran ? questionText(question.prompt) : question.prompt,
      question.gran ? questionText(question.context) : question.context, question.discipline, question.topicTitle,
      path?.discipline, path?.topic, path?.subtopic, question.board, question.examLabel, question.gran?.institution,
      question.gran?.id, question.gran && 'Q' + question.gran.id,
      ...question.options.map(option => question.gran ? questionText(option.text) : option.text),
    ].join(' '));
    return terms.every(term => text.includes(term));
  });
}
