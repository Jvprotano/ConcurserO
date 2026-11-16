import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fingerprintVersion, referenceTheme } from '../shared/theme-catalog.ts';
import { historicalExams } from '../shared/exam-history.ts';
import type { BankQuestion, DraftQuestion } from '../shared/types.ts';
import { examFor } from './catalog.ts';
import type { CatalogJob } from './catalog.ts';

export function questionSignature(row: Pick<DraftQuestion, 'prompt' | 'context' | 'options' | 'type'>) {
  const normalized = (value: string) => value.normalize('NFC').replace(/\s+/gu, ' ').trim();
  return createHash('sha256').update(JSON.stringify([row.type, normalized(row.prompt), normalized(row.context),
    row.options.map(option => [option.key, normalized(option.text)]).sort((a, b) => a[0].localeCompare(b[0]))])).digest('hex');
}

type Entry = { examId: string; number: number; signature: string };
const catalog = JSON.parse(readFileSync(new URL('./theme-signatures.json', import.meta.url), 'utf8')) as {
  version: string; entries: Entry[];
};
if (catalog.version !== fingerprintVersion) throw new Error('Versão incompatível das assinaturas de conteúdo.');
const signatures = new Map(catalog.entries.map(entry => [entry.examId + ':' + entry.signature, entry]));

export function analyzeDraftQuestion(question: DraftQuestion, source?: CatalogJob) {
  if (!source || source.kind !== 'prova') return undefined;
  const exam = examFor(source).historical;
  if (!exam) return undefined;
  const entry = signatures.get(exam.id + ':' + questionSignature(question));
  if (!entry) return undefined;
  const reference = historicalExams.find(row => row.id === entry.examId)!;
  if (question.block !== (entry.number <= reference.basic ? 'basico' : 'especifico')) return undefined;
  return referenceTheme(entry.examId, entry.number);
}

export function analyzeQuestion(question: BankQuestion, source?: CatalogJob) {
  if (question.exam === 'demo') return undefined;
  return analyzeDraftQuestion({ ...question, page: question.source?.page ?? 1 }, source);
}
