import { z } from 'zod';
import type { Store } from './db.ts';
import { localGranQuestions } from './local-gran.ts';
import { questionBank } from './study.ts';
import { emptyQuestionFilters, filterQuestions, questionContent, questionDiscipline, questionSubjectId, topicFilterId } from '../shared/questions.ts';
import type { FilterOption, QuestionCatalog, QuestionListPage } from '../shared/question-catalog.ts';
import type { Attempt } from '../shared/types.ts';

const field = z.string().max(1000).optional();
export const searchQuestionsInput = z.object({
  proofs: z.boolean().optional(), page: z.number().int().min(0).max(1_000_000).default(0),
  filters: z.object({
    search: field, discipline: field, board: field, exam: field, block: field, type: field, origin: field, history: field,
    status: field, themeId: field, syllabusTopicId: field, questionId: field, trailId: field,
    topicIds: z.array(z.string().max(1000)).max(1000).optional(),
    contentTopics: z.array(z.object({ discipline: z.string().max(500), title: z.string().max(500) })).max(1000).optional(),
  }),
});

function catalog(store: Store, proofs: boolean) {
  const bank = questionBank(store);
  const questions = proofs ? bank.questions.filter(row => row.exam !== 'demo') : [...localGranQuestions(store), ...bank.questions];
  return { questions, drafts: bank.drafts };
}

export function questionCatalog(store: Store, proofs: boolean): QuestionCatalog {
  const { questions, drafts } = catalog(store, proofs);
  const disciplines = new Map<string, FilterOption>();
  const boards = new Map<string, FilterOption>();
  const subjects = new Map<string, QuestionCatalog['subjects'][number]>();
  const subtopics = new Map<string, QuestionCatalog['subtopics'][number]>();
  const personalTopics = new Map<string, QuestionCatalog['personalTopics'][number]>();
  const exams = new Map<string, FilterOption>();
  const blocks = new Map<string, FilterOption>();
  let granCount = 0, pending = 0, annulled = 0;
  for (const question of questions) {
    if (question.gran) granCount++;
    if (question.status === 'pending') pending++;
    if (question.status === 'annulled') annulled++;
    const discipline = questionDiscipline(question);
    disciplines.set(discipline, { value: discipline, label: discipline });
    if (question.board) boards.set(question.board, { value: question.board, label: question.board });
    if (question.exam) exams.set(question.exam, { value: question.exam,
      label: question.exam === 'demo' ? 'Demonstração autoral' : question.examLabel || question.exam });
    if (question.block) blocks.set(question.block, { value: question.block,
      label: question.block === 'basico' ? 'Conhecimentos básicos' : question.block === 'especifico' ? 'Conhecimentos específicos' : question.block });
    const path = questionContent(question);
    const subject = questionSubjectId(question);
    if (subject && path) subjects.set(subject, { value: subject, label: path.topic, discipline });
    if (question.analysis) subtopics.set(question.analysis.id,
      { value: question.analysis.id, label: question.analysis.label, discipline, topicId: question.analysis.topicId });
    if (!question.gran && question.topicTitle) {
      const value = topicFilterId(question.discipline, question.topicTitle);
      personalTopics.set(value, { value, label: question.topicTitle, discipline, edition: question.editionTitle });
    }
  }
  const sorted = <T extends FilterOption>(items: Map<string, T>) => [...items.values()].sort((a, b) => a.label.localeCompare(b.label, 'pt-BR'));
  return { granCount, pending, annulled, drafts, disciplines: sorted(disciplines), boards: sorted(boards), subjects: sorted(subjects),
    subtopics: sorted(subtopics), personalTopics: sorted(personalTopics), exams: sorted(exams), blocks: sorted(blocks) };
}

export function searchQuestions(store: Store, input: z.infer<typeof searchQuestionsInput>): QuestionListPage {
  const { questions } = catalog(store, Boolean(input.proofs));
  const history = input.filters.history ? store.all<Pick<Attempt, 'questionId' | 'correct' | 'guess'>>(`
    SELECT question_id AS questionId,correct,guess FROM (
      SELECT question_id,correct,guess,created,rowid AS position FROM attempts
      UNION ALL SELECT 'gran:'||question_id,correct,guess,created,rowid FROM gran_attempts
    ) ORDER BY created DESC,position DESC`).map(row => ({ ...row, correct: Boolean(row.correct), guess: Boolean(row.guess) })) : [];
  const results = filterQuestions(questions, { ...emptyQuestionFilters, ...input.filters }, history);
  const size = 10;
  const pages = Math.max(1, Math.ceil(results.length / size));
  const page = Math.min(input.page, pages - 1);
  return { questions: results.slice(page * size, (page + 1) * size), total: results.length, page, pages };
}
