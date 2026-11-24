import { randomUUID } from 'node:crypto';
import { agendaState } from './agenda.ts';
import { importedQuestions, importJobs } from './catalog.ts';
import { analyzeQuestion } from './question-analysis.ts';
import { granAttempt, granAttempts, granQuestionsForTopics, isGranQuestion, localGranQuestions, recordGranAttempt } from './local-gran.ts';
import { questionContent } from '../shared/questions.ts';
import { z } from 'zod';
import { Problem, Store, localDate, nextDate, required } from './db.ts';
import type { Attempt, BankQuestion, Card, ContentPath, ImportJob, Question, QuestionBank, StudyState, Topic, Trail } from '../shared/types.ts';

export const id = z.string().min(1).max(100);
export const short = z.string().trim().min(1).max(200);
export const note = z.string().trim().max(24000);
export const date = z.iso.date();
export const settingsInput = z.object({
  activeTrail: id.optional(),
  schedule: z.array(z.number().int().min(0).max(720)).length(7),
});
export const topicInput = z.object({
  editionId: id, discipline: short, title: short,
  priority: z.number().int().min(1).max(3), material: note, summary: note,
  syllabus: z.boolean().optional(),
});
export const cardInput = z.object({
  topicIds: z.array(id).min(1).max(50), front: short,
  back: note.min(1), attemptId: id.optional(),
});
export const attemptInput = z.object({ id, revision: z.number().int().positive(), answer: short, guess: z.boolean(), topicId: id.optional() });

const source = (id: string | null, page: number | null) => id && page ? { id, page } : undefined;

type QuestionRow = Omit<Question, 'options' | 'source' | 'topicId' | 'supportPages'> & {
  options: string; support: string; topic_id: string; source_id: string | null; source_page: number | null;
  key: string; comment: string; key_source_id: string | null; key_page: number | null; key_preliminary: number;
};
type AttemptRow = Omit<Attempt, 'correct' | 'guess' | 'keySource'> & {
  revision: number;
  correct: number; guess: number; key_source_id: string | null; key_page: number | null; key_preliminary: number;
};
export const jobsSql = `SELECT id,kind,name,trail_id AS trailId,status,completed,total,message,exam,pair,source_url AS sourceUrl FROM active_imports`;
const attemptSql = `SELECT a.id,a.revision,a.question_id AS questionId,r.topic_id AS topicId,r.prompt,a.answer,a.correct,a.guess,a.reason,
  r.key,r.comment,a.created,r.key_source_id,r.key_page,r.key_preliminary FROM attempts a JOIN question_revisions r
  ON r.question_id=a.question_id AND r.revision=a.revision`;

const toAttempt = (row: AttemptRow): Attempt => ({
  id: row.id, questionId: row.questionId, topicId: row.topicId, prompt: row.prompt,
  answer: row.answer, correct: Boolean(row.correct), guess: Boolean(row.guess), reason: row.reason,
  key: row.key, comment: row.comment, created: row.created, keySource: source(row.key_source_id, row.key_page),
  keyPreliminary: Boolean(row.key_preliminary),
});

export function listQuestions(store: Store, topicId: string): Question[] {
  const local = store.all<QuestionRow>("SELECT * FROM current_questions WHERE topic_id=? AND status!='pending' ORDER BY exam,block,version,number", topicId)
    .map(row => ({
      id: row.id, revision: row.revision, topicId: row.topic_id, number: row.number,
      block: row.block, version: row.version, prompt: row.prompt, context: row.context,
      options: JSON.parse(row.options), type: row.type, status: row.status, supportPages: JSON.parse(row.support),
      exam: row.exam, source: source(row.source_id, row.source_page), keyPreliminary: Boolean(row.key_preliminary),
    }));
  const topic = store.get<Topic>('SELECT id,discipline,title FROM active_topics WHERE id=?', topicId);
  const gran = topic ? granQuestionsForTopics(store, [topic]) : [];
  return [...local, ...gran.map(question => ({ ...question, status: 'ready' as const, topicId }))];
}

export function questionBank(store: Store, trailId?: string): QuestionBank {
  if (!trailId) {
    const banks = store.all<{ id: string; board: string }>('SELECT id,board FROM active_trails ORDER BY _order')
      .map(trail => {
        const bank = questionBank(store, trail.id);
        return { questions: bank.questions.map(question => ({ ...question, trailId: trail.id, board: trail.board })), drafts: bank.drafts };
      });
    return { questions: banks.flatMap(bank => bank.questions), drafts: banks.flatMap(bank => bank.drafts) };
  }
  required(store.get('SELECT id FROM active_trails WHERE id=?', trailId), 'Trilha inexistente.');
  const rows = store.all<QuestionRow & Pick<BankQuestion, 'discipline' | 'topicTitle' | 'editionId' | 'editionTitle' | 'examLabel'>>(
    `SELECT q.*,p.discipline,p.title AS topicTitle,e.id AS editionId,e.title AS editionTitle,
      CASE WHEN q.exam LIKE 'import:%' THEN i.name ELSE q.exam END AS examLabel
     FROM current_questions q JOIN topics p ON p.id=q.topic_id JOIN editions e ON e.id=p.edition_id
     LEFT JOIN imports i ON i.id=q.source_id
     WHERE q.trail_id=? ORDER BY q.exam DESC,q.block,q.version,q.number,q.id`, trailId);
  const saved: BankQuestion[] = rows.map(row => ({
      id: row.id, revision: row.revision, topicId: row.topic_id, number: row.number,
      block: row.block, version: row.version, prompt: row.prompt, context: row.context,
      options: JSON.parse(row.options), type: row.type, status: row.status, supportPages: JSON.parse(row.support),
      ...(String(row.status) === 'pending' ? { pendingReason: 'Gabarito removido. Restaure o documento para responder.', importId: row.source_id ?? undefined } : {}),
      exam: row.exam, source: source(row.source_id, row.source_page), keyPreliminary: Boolean(row.key_preliminary), discipline: row.discipline,
      topicTitle: row.topicTitle, editionId: row.editionId, editionTitle: row.editionTitle, examLabel: row.examLabel,
    }));
  const imported = importedQuestions(store, trailId, saved);
  const sources = new Map(importJobs(store, trailId).map(job => [job.id, job]));
  return { questions: [...saved, ...imported.questions].map(question => ({ ...question,
    analysis: analyzeQuestion(question, sources.get(question.source?.id ?? '')),
  })).sort((a, b) =>
    Number(a.exam === 'demo') - Number(b.exam === 'demo') || b.exam.localeCompare(a.exam) ||
    a.block.localeCompare(b.block) || a.version.localeCompare(b.version) || a.number - b.number), drafts: imported.drafts };
}

export function studyState(store: Store): StudyState {
  const activeTrail = store.setting<string>('activeTrail');
  const today = localDate();
  const trails = store.all<Omit<Trail, 'editions'>>(`SELECT t.id,t.title,t.board,t.exam_date AS examDate,
    e.id AS editionId,e.title AS edition,t.enabled,t.priority FROM active_trails t JOIN active_editions e ON e.id=t.active_edition ORDER BY t._order`)
    .map(trail => ({ ...trail, enabled: Boolean(trail.enabled), editions: store.all<{ id: string; title: string }>(
      'SELECT id,title FROM active_editions WHERE trail_id=? ORDER BY _order DESC', trail.id) }));
  const topics = store.all<Omit<Topic, 'source' | 'practiced'> & {
    source_id: string | null; source_page: number | null; practiced: number;
  }>(`SELECT p.id,e.trail_id AS trailId,p.edition_id AS editionId,p.discipline,p.title,p.priority,p.material,p.summary,
    p.source_id,p.source_page,p.syllabus,
    (SELECT max(created) FROM (
      SELECT a.created FROM attempts a JOIN question_revisions r ON r.question_id=a.question_id
        AND r.revision=a.revision WHERE r.topic_id=p.id
      UNION ALL SELECT a.created FROM gran_attempts a WHERE a.topic_id=p.id
    )) AS lastPractice,
    (EXISTS(SELECT 1 FROM reading WHERE topic_id=p.id) OR EXISTS
      (SELECT 1 FROM study_sessions WHERE topic_id=p.id AND kind IN ('theory', 'essay'))) AS practiced,
    (SELECT count(*) FROM current_questions q WHERE q.topic_id=p.id AND q.status='ready') AS questionCount,
    (SELECT count(*) FROM material_topics mt JOIN active_materials m ON m.id=mt.material_id WHERE mt.topic_id=p.id) AS materialCount
    FROM active_topics p JOIN active_editions e ON e.id=p.edition_id ORDER BY p.position,p._order`)
    .map(row => ({ ...row, read: Boolean(row.practiced), syllabus: Boolean(row.syllabus),
      practiced: Boolean(row.practiced || row.lastPractice), source: source(row.source_id, row.source_page) }));
  const cards = store.all<Omit<Card, 'topicIds'> & { attempt_id?: string }>(
    'SELECT id,front,back,due,stage,coalesce(attempt_id,gran_attempt_id) AS attempt_id FROM active_cards ORDER BY due,_order')
    .map(row => ({
      id: row.id, front: row.front, back: row.back, due: row.due, stage: row.stage, attemptId: row.attempt_id ?? undefined,
      topicIds: store.all<{ topic_id: string }>('SELECT topic_id FROM card_topics WHERE card_id=?', row.id).map(link => link.topic_id),
    }));
  const agenda = agendaState(store);
  const spent = agenda.sessions.filter(row => row.day === today).reduce((total, row) => total + row.minutes, 0);
  const imports = store.all<ImportJob>(jobsSql + ' ORDER BY created DESC');
  const attemptRows = store.all<AttemptRow>(attemptSql + ' ORDER BY a.created DESC,a.rowid DESC');
  // Reviewed classification is projected from the content, never written over personal topic links.
  const bank = topics.some(topic => topic.syllabus) || attemptRows.length ? questionBank(store).questions : [];
  const classified = new Map(bank.map(question => [question.id + ':' + question.revision, questionContent(question)]));
  const coverage = new Map<string, ContentPath & { count: number }>();
  const granQuestions = localGranQuestions(store);
  for (const question of [...bank, ...granQuestions]) {
    const path = questionContent(question);
    if (!path || question.status !== 'ready') continue;
    const key = JSON.stringify(path);
    coverage.set(key, { ...path, count: (coverage.get(key)?.count ?? 0) + 1 });
  }
  const attempts = attemptRows.map(row => {
    const key = row.questionId + ':' + row.revision;
    if (!classified.has(key)) {
      // The current question can have a different enunciation/key; classify the revision actually answered.
      const revision = store.get<QuestionRow & Pick<BankQuestion, 'discipline' | 'topicTitle' | 'editionId'>>(`SELECT r.*,q.id,q.exam,q.number,q.block,q.version,
        p.discipline,p.title AS topicTitle,p.edition_id AS editionId FROM question_revisions r JOIN questions q ON q.id=r.question_id
        JOIN topics p ON p.id=r.topic_id WHERE q.id=? AND r.revision=?`, row.questionId, row.revision);
      if (revision) {
        const question: BankQuestion = { ...revision, topicId: revision.topic_id, options: JSON.parse(revision.options),
          supportPages: JSON.parse(revision.support), source: source(revision.source_id, revision.source_page), editionTitle: '' };
        const job = store.get<ImportJob & { hash: string; draft: string | null }>(
          jobsSql.replace(' FROM', ',hash,draft FROM').replace('active_imports', 'imports') + ' WHERE id=?', question.source?.id ?? '');
        classified.set(key, questionContent({ ...question, analysis: analyzeQuestion(question, job && { ...job, draft: null }) }));
      }
    }
    const classification = classified.get(key);
    return { ...toAttempt(row), ...(classification ? { classification } : {}) };
  });
  return {
    activeTrail, trails, topics, cards, today, spent, schedule: store.setting('schedule'), agenda,
    topicLinks: store.all('SELECT source_id AS sourceId,target_id AS targetId FROM topic_links'),
    practiceCoverage: [...coverage.values()], localQuestionCount: granQuestions.length,
    attempts: [...attempts, ...granAttempts(store)].sort((a, b) => b.created.localeCompare(a.created)), imports,
  };
}

export function saveTopic(store: Store, body: z.infer<typeof topicInput>, topicId = randomUUID() as string) {
  const old = store.get<{ edition_id: string }>('SELECT edition_id FROM active_topics WHERE id=?', topicId);
  if (old && old.edition_id !== body.editionId) throw new Problem('O tópico já pertence a outra edição.');
  required(store.get('SELECT id FROM active_editions WHERE id=?', body.editionId), 'Edição desconhecida.');
  try {
    store.run(`INSERT INTO topics (id,edition_id,discipline,title,priority,material,summary,position,syllabus)
      VALUES (?,?,?,?,?,?,?,coalesce((SELECT max(position)+1 FROM topics WHERE edition_id=?),0),?)
      ON CONFLICT(id) DO UPDATE SET discipline=excluded.discipline,title=excluded.title,priority=excluded.priority,
        material=excluded.material,summary=excluded.summary,syllabus=coalesce(?,topics.syllabus)`,
    topicId, body.editionId, body.discipline, body.title, body.priority, body.material, body.summary, body.editionId,
    Number(body.syllabus ?? true), body.syllabus === undefined ? null : Number(body.syllabus));
  } catch (error) {
    if (String(error).includes('UNIQUE')) throw new Problem('Esse tópico já existe na disciplina.');
    throw error;
  }
  return { id: topicId };
}

export function setEdition(store: Store, trailId: string, editionId: string) {
  required(store.get('SELECT id FROM active_editions WHERE id=? AND trail_id=?', editionId, trailId), 'Edição desconhecida.');
  return store.transaction(() => {
    const current = required(store.get<{ active_edition: string }>('SELECT active_edition FROM trails WHERE id=?', trailId), 'Trilha inexistente.');
    if (editionId === current.active_edition) return;
    // Identical topic names within the same discipline carry forward editable material and card links.
    const pairs = store.all<{ old: string; next: string }>(`SELECT p.id AS old,n.id AS next FROM active_topics p JOIN active_topics n
      ON n.discipline=p.discipline AND n.title=p.title WHERE p.edition_id=? AND n.edition_id=?`, current.active_edition, editionId);
    for (const pair of pairs) {
      store.run(`UPDATE topics SET material=CASE WHEN material='' THEN (SELECT material FROM active_topics WHERE id=?) ELSE material END,
        summary=CASE WHEN summary='' THEN (SELECT summary FROM active_topics WHERE id=?) ELSE summary END WHERE id=?`, pair.old, pair.old, pair.next);
      store.run('INSERT OR IGNORE INTO card_topics SELECT card_id,? FROM card_topics WHERE topic_id=?', pair.next, pair.old);
      store.run('INSERT OR IGNORE INTO material_topics SELECT material_id,? FROM material_topics WHERE topic_id=?', pair.next, pair.old);
    }
    store.run('UPDATE trails SET active_edition=? WHERE id=?', editionId, trailId);
  });
}

export function answerQuestion(store: Store, questionId: string, body: z.infer<typeof attemptInput>) {
  return store.transaction(() => {
    const previous = store.get<AttemptRow>(attemptSql + ' WHERE a.id=?', body.id);
    if (previous) {
      if (previous.questionId !== questionId) throw new Problem('Identificador de tentativa já utilizado.', 409);
      return toAttempt(previous);
    }
    const saved = granAttempt(store, body.id);
    if (saved) {
      if (saved.questionId !== questionId) throw new Problem('Identificador de tentativa já utilizado.', 409);
      return saved;
    }
    if (isGranQuestion(questionId)) return recordGranAttempt(store, questionId, body);
    const current = required(store.get<QuestionRow>('SELECT * FROM current_questions WHERE id=?', questionId), 'Questão inexistente.');
    if (current.revision !== body.revision) throw new Problem('A questão foi atualizada. Reabra antes de responder.', 409);
    if (String(current.status) === 'pending') throw new Problem('Gabarito removido. Restaure o documento para responder.', 409);
    if (current.status !== 'ready') throw new Problem('Questão anulada.');
    const keys = (JSON.parse(current.options) as Question['options']).map(option => option.key);
    if (!keys.includes(body.answer)) throw new Problem('Selecione uma resposta válida.');
    store.run('INSERT INTO attempts (id,question_id,revision,answer,correct,guess,created,study_day) VALUES (?,?,?,?,?,?,?,?)',
      body.id, questionId, current.revision, body.answer, Number(body.answer === current.key), Number(body.guess),
      new Date().toISOString(), localDate());
    return toAttempt(required(store.get<AttemptRow>(attemptSql + ' WHERE a.id=?', body.id), 'Tentativa inexistente.'));
  });
}

export function saveCard(store: Store, body: z.infer<typeof cardInput>, cardId = randomUUID() as string) {
  return store.transaction(() => {
    for (const topic of body.topicIds) required(store.get('SELECT id FROM active_topics WHERE id=?', topic), 'Tópico inexistente.');
    const gran = body.attemptId && store.get('SELECT id FROM gran_attempts WHERE id=?', body.attemptId);
    if (body.attemptId && !gran) required(store.get('SELECT id FROM attempts WHERE id=?', body.attemptId), 'Tentativa inexistente.');
    store.run(`INSERT INTO cards (id,front,back,due,stage,attempt_id,gran_attempt_id) VALUES (?,?,?,?,?,?,?)
      ON CONFLICT(id) DO UPDATE SET front=excluded.front,back=excluded.back`, cardId, body.front, body.back, localDate(), -1,
      gran ? null : body.attemptId ?? null, gran ? body.attemptId! : null);
    store.run('DELETE FROM card_topics WHERE card_id=?', cardId);
    for (const topic of new Set(body.topicIds)) store.run('INSERT INTO card_topics VALUES (?,?)', cardId, topic);
    return { id: cardId };
  });
}

export function reviewCard(store: Store, cardId: string, reviewId: string, remembered: boolean, day = new Date()) {
  return store.transaction(() => {
    const previous = store.get<{ card_id: string; new_due: string; stage: number }>('SELECT card_id,new_due,stage FROM reviews WHERE id=?', reviewId);
    if (previous) {
      if (previous.card_id !== cardId) throw new Problem('Identificador de revisão já utilizado.', 409);
      return { due: previous.new_due, stage: previous.stage };
    }
    const card = required(store.get<{ due: string; stage: number }>('SELECT due,stage FROM active_cards WHERE id=?', cardId), 'Cartão inexistente.');
    if (card.due > localDate(day)) throw new Problem('Este cartão já foi revisado.', 409);
    const intervals = [1, 3, 7, 14, 30];
    const stage = remembered ? Math.min(card.stage + 1, intervals.length - 1) : 0;
    const due = nextDate(intervals[stage], day);
    store.run('INSERT INTO reviews VALUES (?,?,?,?,?,?,?,?,?)', reviewId, cardId, Number(remembered), card.due, due, stage, 1, day.toISOString(), localDate(day));
    store.run('UPDATE cards SET due=?,stage=? WHERE id=?', due, stage, cardId);
    return { due, stage };
  });
}
