import type { GranQuestion } from './gran-questions.ts';
import { localDate, Problem, required, type Store } from './db.ts';
import { questionText } from '../shared/questions.ts';
import { normalizeDisciplineName } from '../shared/contest-taxonomy.ts';
import { matchesTopicContent } from '../shared/preparation.ts';
import type { Attempt, BankQuestion, Topic } from '../shared/types.ts';

const prefix = 'gran:';
const savedSql = 'SELECT id,document,answer_key FROM gran_saved_questions';
type Saved = { id: string; document: string; answer_key: string | null };
type GranAttemptRow = Saved & {
  attemptId: string; topicId: string | null; answer: string; key: string; correct: number;
  guess: number; reason: string; created: string;
};
const attemptsSql = `SELECT q.id,q.document,q.answer_key,a.id AS attemptId,a.topic_id AS topicId,
  a.answer,a.answer_key AS key,a.correct,a.guess,a.reason,a.created FROM gran_attempts a
  JOIN gran_saved_questions q ON q.id=a.question_id`;

export const isGranQuestion = (id: string) => id.startsWith(prefix);

function toQuestion(row: Saved): BankQuestion {
  const item = JSON.parse(row.document) as GranQuestion;
  const discipline = item.materia?.nome ?? 'A classificar';
  const topic = item.topico?.nome ?? '';
  const options = item.options;
  const ready = options.length >= 2 && options.filter(option => option.key === row.answer_key).length === 1;
  const status = item.anulada ? 'annulled' : ready ? 'ready' : 'pending';
  return {
    id: prefix + row.id, revision: 1, topicId: '', exam: item.nomeProva ? prefix + item.nomeProva : prefix,
    examLabel: item.nomeProva || item.instituicao?.nome || 'Gran Questões', board: item.banca?.nome,
    number: Number(row.id), block: '', version: '', type: 'choice', supportPages: [], status,
    discipline, topicTitle: topic, editionId: '', editionTitle: '',
    content: item.materia ? { discipline: normalizeDisciplineName(discipline), topic, subtopic: '' } : undefined,
    prompt: item.enunciado, context: item.textoBase?.texto ?? '', options,
    pendingReason: status === 'pending' ? 'Gabarito indisponível.' : undefined,
    gran: { id: row.id, discipline: item.materia?.nome, topic: item.topico?.nome, institution: item.instituicao?.nome, year: item.ano },
  };
}

type Catalog = { count: number; dataVersion: number; questions: BankQuestion[] };
const catalogs = new WeakMap<Store, Catalog>();

export function localGranQuestions(store: Store) {
  // This collection is append-only. Other connections can add copies while the app is open.
  const { count } = store.get<{ count: number }>('SELECT count(*) AS count FROM gran_saved_questions')!;
  const { data_version: dataVersion } = store.get<{ data_version: number }>('PRAGMA data_version')!;
  let catalog = catalogs.get(store);
  if (!catalog || catalog.count !== count || catalog.dataVersion !== dataVersion) {
    catalog = { count, dataVersion, questions: store.all<Saved>(savedSql + ' ORDER BY rowid').map(toQuestion) };
    catalogs.set(store, catalog);
  }
  const removed = new Set(store.all<{ id: string }>("SELECT id FROM removed_items WHERE kind='gran-question'").map(row => row.id));
  return removed.size ? catalog.questions.filter(question => !removed.has(question.gran!.id)) : catalog.questions;
}

export function granQuestionsForTopics(store: Store, topics: Topic[]) {
  if (!topics.length) return [];
  const compatible = new Map<string, boolean>();
  return localGranQuestions(store).filter(question => {
    const path = question.content;
    if (!path || question.status !== 'ready') return false;
    const id = JSON.stringify(path);
    if (!compatible.has(id)) compatible.set(id, topics.some(topic => matchesTopicContent(path, topic)));
    return compatible.get(id);
  });
}

export function findLocalGranQuestion(store: Store, questionId: string) {
  const row = store.get<Saved>(savedSql + ` WHERE id=? AND NOT EXISTS
    (SELECT 1 FROM removed_items WHERE kind='gran-question' AND id=gran_saved_questions.id)`, questionId.slice(prefix.length));
  return row && { row, question: toQuestion(row) };
}

function toAttempt(row: GranAttemptRow): Attempt {
  const question = toQuestion(row);
  const label = (id: string) => question.options.find(option => option.key === id)?.label ?? id;
  return {
    id: row.attemptId, questionId: question.id, granId: row.id, topicId: row.topicId ?? '',
    classification: question.content, prompt: questionText(question.prompt), answer: row.answer, answerLabel: label(row.answer),
    correct: Boolean(row.correct), guess: Boolean(row.guess), reason: row.reason, key: label(row.key), comment: '',
    created: row.created,
  };
}

export const granAttempts = (store: Store) => store.all<GranAttemptRow>(attemptsSql + ' ORDER BY a.created DESC,a.rowid DESC').map(toAttempt);
export function granAttempt(store: Store, id: string) {
  const row = store.get<GranAttemptRow>(attemptsSql + ' WHERE a.id=?', id);
  return row && toAttempt(row);
}

export function recordGranAttempt(store: Store, questionId: string, body: {
  id: string; revision: number; answer: string; guess: boolean; topicId?: string;
}) {
  const { row, question } = required(findLocalGranQuestion(store, questionId), 'Questão inexistente.');
  if (body.revision !== question.revision) throw new Problem('A questão foi atualizada. Reabra antes de responder.', 409);
  if (question.status !== 'ready') throw new Problem(question.pendingReason ?? 'Questão anulada.', 409);
  if (!question.options.some(option => option.key === body.answer)) throw new Problem('Selecione uma resposta válida.');
  const topic = body.topicId ? required(store.get<Pick<Topic, 'id' | 'discipline' | 'title'>>(
    'SELECT id,discipline,title FROM active_topics WHERE id=?', body.topicId), 'Tópico inexistente.') : undefined;
  if (topic && !matchesTopicContent(question.content, topic)) throw new Problem('Questão de outro assunto.', 409);
  const now = new Date();
  store.run(`INSERT INTO gran_attempts (id,question_id,topic_id,answer,answer_key,correct,guess,created,study_day)
    VALUES (?,?,?,?,?,?,?,?,?)`, body.id, row.id, topic?.id ?? null, body.answer, row.answer_key,
    Number(body.answer === row.answer_key), Number(body.guess), now.toISOString(), localDate(now));
  return required(granAttempt(store, body.id), 'Tentativa inexistente.');
}
