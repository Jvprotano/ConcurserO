export type ImportKind = 'edital' | 'prova' | 'gabarito';
export type RemovableKind = 'import' | 'trail' | 'edition' | 'topic' | 'material' | 'card';
export interface RemovedItem { kind: RemovableKind; id: string; title: string; removed: string }
export type QuestionType = 'choice' | 'boolean';
export type ImportStatus = 'queued' | 'processing' | 'review' | 'done' | 'cancelled' | 'failed';

export interface Trail {
  id: string;
  title: string;
  board: string;
  examDate: string | null;
  editionId: string;
  edition: string;
  editions: { id: string; title: string }[];
  enabled?: boolean;
  priority?: number;
}
export interface Topic {
  id: string;
  trailId: string;
  editionId: string;
  discipline: string;
  title: string;
  priority: number;
  material: string;
  summary: string;
  practiced: boolean;
  read?: boolean;
  syllabus?: boolean;
  lastPractice: string | null;
  questionCount: number;
  materialCount: number;
  source?: { id: string; page: number };
}
export interface Option { key: string; text: string }
export interface Question {
  id: string;
  exam: string;
  revision: number;
  topicId: string;
  number: number;
  block: string;
  version: string;
  prompt: string;
  context: string;
  options: Option[];
  type: QuestionType;
  status: 'ready' | 'annulled';
  supportPages: number[];
  keyPreliminary?: boolean;
  source?: { id: string; page: number };
}
export interface Attempt {
  classification?: ContentPath;
  id: string;
  questionId: string;
  topicId: string;
  prompt: string;
  answer: string;
  correct: boolean;
  guess: boolean;
  reason: string;
  key: string;
  comment: string;
  created: string;
  keySource?: { id: string; page: number };
  keyPreliminary?: boolean;
}
export interface BankQuestion extends Omit<Question, 'status'> {
  trailId?: string;
  board?: string;
  analysis?: import('./theme-catalog.ts').ThemeClassification;
  status: 'ready' | 'annulled' | 'pending';
  discipline: string;
  topicTitle: string;
  editionId: string;
  editionTitle: string;
  importId?: string;
  pendingReason?: string;
  examLabel?: string;
}
export interface ImportSummary {
  id: string;
  name: string;
  count: number;
  status: ImportStatus;
  hasKey: boolean;
  keyId?: string;
  keys: { id: string; name: string; preliminary: boolean }[];
  saved: number;
  message: string;
}
export interface QuestionBank {
  questions: BankQuestion[];
  drafts: ImportSummary[];
}
export interface Card {
  id: string;
  topicIds: string[];
  front: string;
  back: string;
  due: string;
  stage: number;
  attemptId?: string;
}
export interface ImportJob {
  id: string;
  kind: ImportKind;
  name: string;
  trailId: string;
  status: ImportStatus;
  completed: number;
  total: number;
  message: string;
  exam: string | null;
  pair: string | null;
  sourceUrl: string | null;
}
export interface PageText { page: number; text: string; needsOcr: boolean }
export interface DraftTopic { page: number; discipline: string; title: string }
export interface DraftQuestion {
  page: number;
  number: number;
  version: string;
  block: string;
  prompt: string;
  context: string;
  options: Option[];
  type: QuestionType;
  needsSupport?: boolean;
  supportPages?: number[];
}
export interface DraftKey { page: number; number: number; version: string; block: string; key: string }
export interface StudyState {
  agenda?: import('./agenda.ts').AgendaState;
  practiceCoverage?: (ContentPath & { count: number })[];
  topicLinks?: { sourceId: string; targetId: string }[];
  trails: Trail[];
  activeTrail: string;
  schedule: number[];
  today: string;
  spent: number;
  topics: Topic[];
  cards: Card[];
  attempts: Attempt[];
  imports: ImportJob[];
}

export interface ContentPath { discipline: string; topic: string; subtopic: string }
