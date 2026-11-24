export const summaryChangesChannel = 'concursero-summary-changes';

export interface SummaryDraft {
  title: string;
  html: string;
  discipline: string;
  subject: string;
  topicId: string | null;
  source: { id: string; title: string; version: number; page: number | null } | null;
}

export interface Summary extends SummaryDraft {
  id: string;
  revision: number;
  createdAt: string;
  updatedAt: string;
  archived: boolean;
}

export interface SummaryBackup {
  directory: string;
  savedAt: string | null;
  error: string;
}
