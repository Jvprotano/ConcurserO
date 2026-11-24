import { createHash, randomUUID } from 'node:crypto';
import { existsSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { basename, resolve, win32 } from 'node:path';
import { z } from 'zod';
import { reviewNext, sessionMinutes } from '../shared/agenda.ts';
import type { AgendaState, MaterialLink, StudyPdf, StudySession } from '../shared/agenda.ts';
import { matchesTopicContent, relatedTopics } from '../shared/preparation.ts';
import type { BankQuestion, StudyState } from '../shared/types.ts';
import { localDate, Problem, required, Store } from './db.ts';
import { consumeStudyTimer, getStudyTimer } from './study-time.ts';
import { questionContent } from '../shared/questions.ts';

export const pdfInput = z.object({
  filename: z.string().trim().min(1).max(255),
  origin: z.string().trim().max(1000).default('Importação local'),
  category: z.enum(['apostila', 'nota', 'referencia']).default('apostila'),
});
export const materialLinkInput = z.object({
  topicId: z.string().min(1).max(100),
  firstPage: z.number().int().min(1).max(50000).optional(),
  lastPage: z.number().int().min(1).max(50000).optional(),
  section: z.string().trim().max(200).optional(),
  prompt: z.string().trim().max(1000).optional(),
  answer: z.string().trim().max(3000).optional(),
}).refine(link => !link.lastPage || Boolean(link.firstPage && link.firstPage <= link.lastPage), 'Confira o intervalo de páginas.');
export const sessionInput = z.object({
  id: z.uuid(),
  kind: z.enum(['theory', 'questions', 'review', 'essay']),
  minutes: z.number().int().min(1).max(600).optional(),
  timerId: z.uuid().optional(),
  materialId: z.string().min(1).max(100).optional(),
  cycleRevision: z.number().int().min(1).optional(),
  cycleTopicId: z.string().min(1).max(100).optional(),
  rating: z.enum(['forgot', 'hard', 'remembered']).optional(),
  attemptId: z.string().min(1).max(100).optional(),
  cardReviewId: z.string().min(1).max(100).optional(),
  recall: z.string().trim().min(1).max(4000).optional(),
});

type PdfRow = Omit<StudyPdf, 'available' | 'links'> & { hash: string };
const pdfsSql = `SELECT m.id,m.title,f.hash,f.filename,f.origin,f.category,f.version
  FROM study_pdfs f JOIN active_materials m ON m.id=f.material_id`;
const pdfPath = (store: Store, hash: string) => resolve(store.directory, 'pdf', hash + '.pdf');

export function listStudyPdfs(store: Store): StudyPdf[] {
  const links = store.all<MaterialLink & { materialId: string }>(`SELECT l.material_id AS materialId,l.topic_id AS topicId,
    l.first_page AS firstPage,l.last_page AS lastPage,l.section,l.prompt,l.answer
    FROM study_pdf_links l JOIN active_topics p ON p.id=l.topic_id WHERE p.syllabus=1`);
  return store.all<PdfRow>(pdfsSql + ' ORDER BY f.origin,m.title,f.version DESC').map(({ hash, ...pdf }) =>
    ({ ...pdf, available: existsSync(pdfPath(store, hash)), links: links.filter(link => link.materialId === pdf.id) }));
}

export function studyPdfPath(store: Store, id: string) {
  const pdf = required(store.get<PdfRow>(pdfsSql + ' WHERE m.id=?', id), 'Material inexistente.');
  const path = pdfPath(store, pdf.hash);
  if (!existsSync(path)) throw new Problem('Arquivo indisponível. Importe o mesmo PDF para recuperar a cópia.', 404);
  return path;
}

export function importStudyPdf(store: Store, bytes: Buffer, metadata: z.infer<typeof pdfInput>) {
  if (!Buffer.isBuffer(bytes) || bytes.subarray(0, 5).toString() !== '%PDF-') throw new Problem('Selecione um arquivo PDF válido.');
  const filename = basename(win32.basename(metadata.filename));
  const hash = createHash('sha256').update(bytes).digest('hex');
  const path = pdfPath(store, hash);
  if (!existsSync(path)) {
    const temporary = path + '.' + randomUUID() + '.tmp';
    try {
      writeFileSync(temporary, bytes);
      renameSync(temporary, path);
    } finally { rmSync(temporary, { force: true }); }
  }
  return store.transaction(() => {
    const existing = store.get<{ id: string }>('SELECT material_id AS id FROM study_pdfs WHERE hash=?', hash);
    if (existing) {
      const restored = store.run("DELETE FROM removed_items WHERE kind='material' AND id=?", existing.id).changes > 0;
      return restored ? { ...existing, duplicate: false, restored: true } : { ...existing, duplicate: true };
    }
    const version = (store.get<{ latest: number }>('SELECT max(version) AS latest FROM study_pdfs WHERE filename=? AND origin=?',
      filename, metadata.origin)?.latest ?? 0) + 1;
    const id = randomUUID();
    store.run('INSERT INTO materials VALUES (?,?,?,?)', id, filename.replace(/\.pdf$/i, ''), '', '');
    store.run('INSERT INTO study_pdfs VALUES (?,?,?,?,?,?)', id, hash, filename, metadata.origin, metadata.category, version);
    return { id, duplicate: false };
  });
}

export function linkStudyPdf(store: Store, materialId: string, link: MaterialLink) {
  store.transaction(() => {
    required(store.get(pdfsSql + ' WHERE m.id=?', materialId), 'Material inexistente.');
    required(store.get('SELECT 1 FROM active_topics WHERE id=? AND syllabus=1', link.topicId), 'Tópico do edital inexistente.');
    store.run('INSERT OR IGNORE INTO material_topics VALUES (?,?)', materialId, link.topicId);
    store.run(`INSERT INTO study_pdf_links VALUES (?,?,?,?,?,?,?) ON CONFLICT(material_id,topic_id) DO UPDATE SET
      first_page=excluded.first_page,last_page=excluded.last_page,section=excluded.section,prompt=excluded.prompt,answer=excluded.answer`,
      materialId, link.topicId, link.firstPage ?? null, link.lastPage ?? null, link.section || null, link.prompt || null, link.answer || null);
  });
}

export function agendaState(store: Store): AgendaState {
  const sessions = store.all<StudySession>(`SELECT id,topic_id AS topicId,title,study_day AS day,kind,minutes,estimated,
    rating,next_due AS nextDue,old_due AS oldDue,material_id AS materialId,material_title AS materialTitle,created,
    CASE WHEN kind='essay' THEN recall END AS essay
    FROM study_sessions s WHERE NOT EXISTS (SELECT 1 FROM removed_items d WHERE d.kind='study-time' AND d.id=s.id)
    UNION ALL
    SELECT 'reading:'||r.topic_id||':'||r.study_day,r.topic_id,p.title,r.study_day,'theory',10,1,NULL,NULL,NULL,NULL,NULL,r.study_day,NULL
    FROM reading r JOIN topics p ON p.id=r.topic_id
    UNION ALL
    SELECT a.id,p.id,p.title,a.study_day,'questions',2,1,NULL,NULL,NULL,NULL,NULL,a.created,NULL FROM attempts a
      JOIN question_revisions r ON r.question_id=a.question_id AND r.revision=a.revision JOIN topics p ON p.id=r.topic_id
      WHERE NOT EXISTS (SELECT 1 FROM study_sessions s WHERE s.attempt_id=a.id)
    UNION ALL
    SELECT a.id,coalesce(p.id,''),coalesce(p.title,json_extract(q.document,'$.topico.nome'),
      json_extract(q.document,'$.materia.nome'),'Questões do Gran'),a.study_day,'questions',2,1,NULL,NULL,NULL,NULL,NULL,a.created,NULL
      FROM gran_attempts a JOIN gran_saved_questions q ON q.id=a.question_id LEFT JOIN topics p ON p.id=a.topic_id
      WHERE NOT EXISTS (SELECT 1 FROM study_sessions s WHERE s.gran_attempt_id=a.id)
    UNION ALL
    SELECT r.id,coalesce((SELECT topic_id FROM card_topics ct WHERE ct.card_id=c.id ORDER BY ct.topic_id LIMIT 1),''),
      c.front,r.study_day,'cards',1,1,NULL,r.new_due,r.old_due,NULL,NULL,r.created,NULL FROM reviews r JOIN cards c ON c.id=r.card_id
      WHERE NOT EXISTS (SELECT 1 FROM study_sessions s WHERE s.card_review_id=r.id)
    ORDER BY day DESC,created DESC`).map(row => ({ ...row, estimated: Boolean(row.estimated) }));
  return { sessions, materials: listStudyPdfs(store), timer: getStudyTimer(store),
    cycles: store.all('SELECT topic_id AS topicId,due,stage,revision FROM study_cycles') };
}

function compatibleQuestion(question: BankQuestion, related: StudyState['topics']) {
  const path = questionContent(question);
  return related.some(row => row.id === question.topicId || matchesTopicContent(path, row));
}

export function sessionOptions(state: StudyState, topicId: string, bank: BankQuestion[]) {
  const topic = required(state.topics.find(row => row.id === topicId && row.syllabus), 'Tópico do edital inexistente.');
  const related = relatedTopics(state, topic);
  const attempted = new Set(state.attempts.map(row => row.questionId));
  return {
    questions: bank.filter(row => row.status === 'ready' && compatibleQuestion(row, related))
      .sort((a, b) => Number(attempted.has(a.id)) - Number(attempted.has(b.id))).slice(0, 12)
      .map(question => question.gran ? { ...question, topicId: related.find(row => matchesTopicContent(question.content, row))?.id ?? '' } : question),
    cards: state.cards.filter(card => card.due <= state.today && card.topicIds.some(id => related.some(row => row.id === id))),
  };
}

export function recordStudySession(store: Store, state: StudyState, topicId: string, body: z.infer<typeof sessionInput>, now = new Date()) {
  return store.transaction(() => {
    const previous = store.get<{ topicId: string; nextDue?: string; kind: string }>(
      'SELECT topic_id AS topicId,next_due AS nextDue,kind FROM study_sessions WHERE id=?', body.id);
    if (previous) {
      if (previous.topicId !== topicId || previous.kind !== body.kind) throw new Problem('Identificador de sessão já utilizado.', 409);
      return previous;
    }
    const topic = required(state.topics.find(row => row.id === topicId && row.syllabus), 'Tópico do edital inexistente.');
    const related = relatedTopics(state, topic);
    const ids = new Set(related.map(row => row.id));
    const cycle = store.all<AgendaState['cycles'][number]>('SELECT topic_id AS topicId,due,stage,revision FROM study_cycles ORDER BY due,topic_id').find(row => ids.has(row.topicId));
    const day = localDate(now);
    if (body.kind === 'review' && (!cycle || cycle.topicId !== body.cycleTopicId || cycle.revision !== body.cycleRevision || cycle.due > day)) {
      throw new Problem('Esta revisão foi atualizada. Abra a atividade novamente.', 409);
    }
    if (body.kind !== 'review' && body.rating) throw new Problem('A avaliação pertence à revisão.');
    if (body.kind !== 'review' && store.all<{ topicId: string }>(
      'SELECT topic_id AS topicId FROM study_sessions WHERE study_day=? AND kind=?', day, body.kind).some(row => ids.has(row.topicId))) {
      throw new Problem('Esta atividade já foi registrada hoje.', 409);
    }
    const material = body.materialId ? required(state.agenda?.materials.find(row => row.id === body.materialId && row.available &&
      row.links.some(link => ids.has(link.topicId))), 'Material vinculado indisponível.') : undefined;
    const attempt = body.attemptId ? required(state.attempts.find(row => row.id === body.attemptId &&
      related.some(option => option.id === row.topicId || matchesTopicContent(row.classification, option))), 'Tentativa do assunto inexistente.') : undefined;
    if (attempt && (!store.get(`SELECT 1 FROM ${attempt.granId ? 'gran_attempts' : 'attempts'} WHERE id=? AND study_day=?`, attempt.id, day) ||
      store.get(`SELECT 1 FROM study_sessions WHERE ${attempt.granId ? 'gran_attempt_id' : 'attempt_id'}=?`, attempt.id))) {
      throw new Problem('Tentativa já registrada ou de outro dia.', 409);
    }
    if (body.cardReviewId) {
      const reviewed = required(store.get<{ cardId: string }>('SELECT card_id AS cardId FROM reviews WHERE id=? AND study_day=?', body.cardReviewId, day), 'Revisão de cartão inexistente.');
      if (!state.cards.some(card => card.id === reviewed.cardId && card.topicIds.some(id => ids.has(id))) ||
        store.get('SELECT 1 FROM study_sessions WHERE card_review_id=?', body.cardReviewId)) throw new Problem('Cartão já registrado ou de outro assunto.', 409);
    }
    if (body.kind === 'questions' && !attempt) throw new Problem('Responda uma questão para registrar a sessão.');
    if (body.kind === 'essay' && !body.recall) throw new Problem('Registre a resposta discursiva antes de concluir.');
    if (body.kind === 'review' && (!body.rating || (!attempt && !body.recall))) throw new Problem('Tente responder e avalie sua lembrança.');
    const next = !cycle || body.kind === 'review' ? reviewNext(day, cycle?.stage ?? 0, body.rating) : undefined;
    const minutes = body.timerId ? consumeStudyTimer(store, body.timerId, now, topicId).minutes : body.minutes;
    store.run(`INSERT INTO study_sessions (id,topic_id,title,study_day,created,kind,minutes,estimated,rating,old_due,next_due,rule,
      material_id,material_title,recall,attempt_id,card_review_id,gran_attempt_id) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      body.id, topicId, topic.title, day, now.toISOString(), body.kind, minutes ?? sessionMinutes[body.kind], Number(minutes === undefined),
      body.rating ?? null, body.kind === 'review' ? cycle?.due ?? null : null, next?.due ?? null, next ? 1 : null,
      material?.id ?? null, material?.title ?? null, body.recall ?? null, attempt?.granId ? null : attempt?.id ?? null,
      body.cardReviewId ?? null, attempt?.granId ? attempt.id : null);
    if (next) store.run(`INSERT INTO study_cycles VALUES (?,?,?,1) ON CONFLICT(topic_id) DO UPDATE SET
      due=excluded.due,stage=excluded.stage,revision=study_cycles.revision+1`, cycle?.topicId ?? topicId, next.due, next.stage);
    return { topicId, nextDue: next?.due, kind: body.kind };
  });
}
