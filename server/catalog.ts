import { historicalExams, subjects } from '../shared/exam-history.ts';
import { itemNumbers } from '../shared/overview.ts';
import type { BankQuestion, DraftKey, DraftQuestion, DraftTopic, ImportJob, ImportSummary } from '../shared/types.ts';
import type { Store } from './db.ts';
import { isPreliminary, repairQuestionOptions } from './parsers.ts';

export type CatalogJob = ImportJob & { draft: string | null; hash?: string };
export type Draft = { topics: DraftTopic[]; questions: DraftQuestion[]; keys: DraftKey[] };
export const readDraft = (job: CatalogJob): Draft => {
  const draft = job.draft ? JSON.parse(job.draft) as Partial<Draft> : {};
  return { topics: draft.topics ?? [], questions: (draft.questions ?? []).map(repairQuestionOptions), keys: draft.keys ?? [] };
};

export function importJobs(store: Store, trailId: string) {
  return store.all<CatalogJob>(`SELECT id,kind,name,trail_id AS trailId,status,completed,total,message,exam,pair,
    source_url AS sourceUrl,draft,hash FROM active_imports WHERE trail_id=? ORDER BY created DESC,_order DESC`, trailId);
}

const knownProofs: Record<string, string> = {
  // Pilot archive: Paraná 2024, Área 3, complete A/B/C PDF.
  '5097c875bd32d85d417596aaa88f74b7ade4d25480a5ca545869d81fceac574b': 'pr-2024',
};

export function examFor(job: Pick<CatalogJob, 'id' | 'trailId' | 'exam' | 'pair' | 'name' | 'hash'>) {
  const year = job.exam?.match(/\b(20\d{2})\b/)?.[1];
  const known = job.pair?.split(':')[0] ?? knownProofs[job.hash ?? ''];
  const historical = historicalExams.find(exam => exam.trail === job.trailId &&
    (exam.id === known || (!known && year && exam.year === Number(year))));
  return {
    id: historical?.id ?? (job.exam ? job.trailId + ':' + job.exam : 'import:' + job.id),
    exam: job.exam ?? (historical ? (job.trailId === 'pr' ? '002/' : '01/') + historical.year : 'import:' + job.id),
    label: job.exam ?? (historical ? String(historical.year) : job.name),
    historical,
  };
}

export function classify(job: CatalogJob, row: Pick<DraftQuestion, 'number' | 'block' | 'version'>) {
  const historical = examFor(job).historical;
  // The editorial classification for Paraná describes version A only.
  const groups = row.version === 'A' || row.version === 'Única' ? historical?.groups : undefined;
  const subject = Object.entries(groups ?? {}).find(([, range]) => itemNumbers(range).includes(row.number))?.[0] as keyof typeof subjects | undefined;
  return {
    subject: subject ?? 'unclassified',
    discipline: subject ? subjects[subject] : row.block === 'basico' ? 'Conhecimentos básicos' : 'Conhecimentos específicos',
    title: subject ? subjects[subject] : 'A classificar',
  };
}

export function preliminaryKeyPages(store: Store, job: Pick<CatalogJob, 'id'>): Set<number> {
  return new Set(store.all<{ page: number; text: string }>(
    'SELECT page,text FROM pages WHERE import_id=?', job.id).filter(page => isPreliminary(page.text)).map(page => page.page));
}

export function compatibleKeys(store: Store, proof: CatalogJob, jobs = importJobs(store, proof.trailId)) {
  const questions = readDraft(proof).questions;
  return jobs.filter(job => job.kind === 'gabarito' && job.trailId === proof.trailId && job.pair === proof.pair &&
    job.exam === proof.exam && (job.status === 'review' || job.status === 'done') && readDraft(job).keys.some(key =>
      questions.some(row => row.number === key.number && row.block === key.block && row.version === key.version)));
}

export function questionIssue(row: DraftQuestion, keys: DraftKey[]): string | undefined {
  if (!row.prompt?.trim()) return 'Enunciado pendente';
  const expected = row.type === 'boolean' ? 'CE' : 'ABCDE';
  if (row.options.map(option => option.key).sort().join('') !== expected || row.options.some(option => !option.text.trim())) return 'Alternativas incompletas';
  if (row.needsSupport && !row.supportPages?.length) return 'Página de apoio pendente';
  const matches = keys.filter(key => key.number === row.number && key.block === row.block && key.version === row.version);
  if (!matches.length) return 'Gabarito do item pendente';
  if (matches.length > 1) return 'Gabarito do item ambíguo';
  if (matches[0].key !== 'X' && !expected.includes(matches[0].key)) return 'Gabarito incompatível com as alternativas';
  return undefined;
}

export function summarizeImport(store: Store, job: CatalogJob, jobs = importJobs(store, job.trailId)): ImportSummary {
  const draft = readDraft(job);
  const keys = compatibleKeys(store, job, jobs);
  const saved = store.get<{ total: number }>("SELECT count(*) AS total FROM current_questions WHERE source_id=? AND status!='pending'", job.id)?.total ?? 0;
  const removedKey = store.get("SELECT 1 FROM current_questions WHERE source_id=? AND status='pending'", job.id);
  return {
    id: job.id, name: job.name, count: draft.questions.length, status: job.status,
    hasKey: keys.length > 0, keyId: !removedKey && keys.length === 1 && Boolean(job.pair || job.exam) ? keys[0].id : undefined,
    keys: keys.map(key => {
      const preliminary = preliminaryKeyPages(store, key);
      return { id: key.id, name: key.name, preliminary: readDraft(key).keys.some(answer => preliminary.has(answer.page) &&
        draft.questions.some(row => row.number === answer.number && row.block === answer.block && row.version === answer.version)) };
    }), saved,
    message: !keys.length ? 'Gabarito pendente' : keys.length > 1 || (!job.pair && !job.exam) ? 'Selecione o gabarito' :
      saved >= draft.questions.length && saved > 0 ? 'Questões salvas' : 'Pronta para salvar',
  };
}

export const itemIdentity = (exam: string, row: { block: string; version: string; number: number }) =>
  JSON.stringify([exam, row.block, row.version, row.number]);

export function importedQuestions(store: Store, trailId: string, saved: BankQuestion[]) {
  const jobs = importJobs(store, trailId);
  const proofs = jobs.filter(job => job.kind === 'prova');
  const seen = new Set(saved.map(row => itemIdentity(row.exam, row)));
  // A saved question hidden by removal of its topic/edition must not return as an unsaved draft.
  for (const row of store.all<{ exam: string; block: string; version: string; number: number }>(
    `SELECT q.exam,q.block,q.version,q.number FROM questions q JOIN question_revisions r ON r.question_id=q.id
      WHERE q.trail_id=? AND r.revision=(SELECT max(revision) FROM question_revisions WHERE question_id=q.id)
      AND r.topic_id NOT IN (SELECT id FROM active_topics)`, trailId)) seen.add(itemIdentity(row.exam, row));
  const questions: BankQuestion[] = [];
  const drafts: ImportSummary[] = [];
  for (const proof of proofs) {
    const draft = readDraft(proof);
    const summary = summarizeImport(store, proof, jobs);
    const key = jobs.find(job => job.id === summary.keyId);
    const keys = key ? readDraft(key).keys : [];
    if (summary.saved < draft.questions.length || proof.status !== 'done') drafts.push(summary);
    const exam = examFor(proof);
    for (const [index, row] of draft.questions.entries()) {
      if (!row.prompt?.trim()) continue;
      const identity = itemIdentity(exam.exam, row);
      if (seen.has(identity)) continue;
      seen.add(identity);
      const topic = classify(proof, row);
      questions.push({
        id: `import:${proof.id}:${index}`, exam: exam.exam, revision: 0,
        topicId: 'catalog:' + topic.discipline + ':' + topic.title, number: row.number, block: row.block,
        version: row.version, prompt: row.prompt, context: row.context, options: row.options, type: row.type,
        status: 'pending', supportPages: row.supportPages ?? [], source: { id: proof.id, page: row.page },
        discipline: topic.discipline, topicTitle: topic.title, editionId: '', editionTitle: '', importId: proof.id,
        examLabel: exam.label,
        pendingReason: !summary.hasKey ? 'Gabarito pendente' : !summary.keyId ? 'Selecione o gabarito do caderno' :
          questionIssue(row, keys) ?? 'Salve as questões para responder',
      });
    }
  }
  return { questions, drafts };
}
