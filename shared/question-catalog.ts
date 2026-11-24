import type { BankQuestion, ImportSummary } from './types.ts';

export type FilterOption = { value: string; label: string };
export interface QuestionCatalog {
  granCount: number;
  pending: number;
  annulled: number;
  drafts: ImportSummary[];
  disciplines: FilterOption[];
  boards: FilterOption[];
  subjects: (FilterOption & { discipline: string })[];
  subtopics: (FilterOption & { discipline: string; topicId: string })[];
  personalTopics: (FilterOption & { discipline: string; edition: string })[];
  exams: FilterOption[];
  blocks: FilterOption[];
}

export interface QuestionListPage {
  questions: BankQuestion[];
  total: number;
  page: number;
  pages: number;
}
