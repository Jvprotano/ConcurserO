import express from 'express';
import { loadExamPack } from './exam-packs.ts';
import { resolve } from 'node:path';
import { z, ZodError } from 'zod';
import { Problem, Store, localDate, required } from './db.ts';
import {
  answerQuestion, attemptInput, cardInput, date, id, listQuestions, note, reviewCard,
  saveCard, saveTopic, setEdition, settingsInput, short, studyState, topicInput, questionBank,
} from './study.ts';
import { Imports, draftInput, publicationInput, saveAllInput } from './imports.ts';
import { randomUUID } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { removeItem, removedItems, restoreItem } from './removal.ts';
import { summaryRoutes } from './summaries.ts';
import { importStudyPdf, linkStudyPdf, materialLinkInput, pdfInput, recordStudySession, sessionInput,
  sessionOptions, studyPdfPath } from './agenda.ts';

export function createApp(store = new Store()) {
  const app = express();
  const imports = new Imports(store);
  app.disable('x-powered-by');
  app.use((req, res, next) => {
    const host = req.get('Host') ?? '';
    if (!/^127\.0\.0\.1(?::\d{1,5})?$/.test(host)) {
      res.status(403).json({ error: 'Abra o app pelo endereço 127.0.0.1.' });
      return;
    }
    const origin = req.get('Origin');
    if (origin && origin !== 'http://' + host) {
      res.status(403).json({ error: 'Origem não autorizada.' });
      return;
    }
    res.set('X-Content-Type-Options', 'nosniff');
    res.set('Referrer-Policy', 'no-referrer');
    res.set('Content-Security-Policy', "default-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
    if (req.path.startsWith('/api/')) res.set('Cache-Control', 'no-store');
    next();
  });
  app.use(express.json({ limit: '12mb' }));
  app.use('/api/summaries', summaryRoutes(store));

  const removableKind = z.enum(['import', 'trail', 'edition', 'topic', 'material', 'card']);
  app.get('/api/removed-items', (_req, res) => res.json(removedItems(store)));
  app.delete('/api/items/:kind/:item', (req, res) => {
    const kind = removableKind.parse(req.params.kind);
    const itemId = id.parse(req.params.item);
    if (kind === 'import' && imports.workers.has(itemId)) imports.cancel(itemId);
    if (kind === 'trail') {
      for (const jobId of imports.workers.keys()) {
        if (imports.job(jobId).trailId === itemId) imports.cancel(jobId);
      }
    }
    res.json(removeItem(store, kind, itemId));
  });
  app.post('/api/items/:kind/:item/restore', (req, res) =>
    res.json(restoreItem(store, removableKind.parse(req.params.kind), id.parse(req.params.item))));

  app.get('/api/state', (_req, res) => res.json(studyState(store)));
  app.post('/api/study-pdfs', express.raw({ type: 'application/pdf', limit: '50mb' }), (req, res) => {
    const result = importStudyPdf(store, req.body, pdfInput.parse(req.query));
    res.status(result.duplicate ? 200 : 201).json(result);
  });
  app.get('/api/study-pdfs/:material/pdf', (req, res) => res.type('pdf').sendFile(studyPdfPath(store, id.parse(req.params.material))));
  app.put('/api/study-pdfs/:material/links', (req, res) => {
    linkStudyPdf(store, id.parse(req.params.material), materialLinkInput.parse(req.body));
    res.json({ saved: true });
  });
  app.delete('/api/study-pdfs/:material/links/:topic', (req, res) => {
    store.run('DELETE FROM material_topics WHERE material_id=(SELECT material_id FROM study_pdfs WHERE material_id=?) AND topic_id=?',
      id.parse(req.params.material), id.parse(req.params.topic));
    res.json({ saved: true });
  });
  app.get('/api/study-sessions/:topic/options', (req, res) =>
    res.json(sessionOptions(studyState(store), id.parse(req.params.topic), questionBank(store).questions)));
  app.post('/api/study-sessions/:topic', (req, res) =>
    res.json(recordStudySession(store, studyState(store), id.parse(req.params.topic), sessionInput.parse(req.body))));
  app.put('/api/settings', (req, res) => {
    const body = settingsInput.parse(req.body);
    if (body.activeTrail) required(store.get('SELECT 1 FROM active_trails WHERE id=?', body.activeTrail), 'Concurso inexistente.');
    store.transaction(() => {
      if (body.activeTrail) store.setSetting('activeTrail', body.activeTrail);
      store.setSetting('schedule', body.schedule);
    });
    res.json(studyState(store));
  });
  app.post('/api/trails', (req, res) => {
    const body = z.object({ title: short, board: z.string().trim().max(200), examDate: date.nullable(),
      priority: z.number().int().min(1).max(3).default(2) }).parse(req.body);
    if (store.get('SELECT 1 FROM active_trails WHERE title=? COLLATE NOCASE AND board=? COLLATE NOCASE', body.title, body.board)) {
      throw new Problem('Este concurso já está cadastrado.', 409);
    }
    const trailId = randomUUID(), editionId = randomUUID();
    store.transaction(() => {
      store.run('INSERT INTO trails (id,title,board,exam_date,active_edition,priority) VALUES (?,?,?,?,?,?)',
        trailId, body.title, body.board, body.examDate, editionId, body.priority);
      store.run('INSERT INTO editions VALUES (?,?,?)', editionId, trailId, 'Edital de estudo');
    });
    res.status(201).json({ id: trailId });
  });
  app.patch('/api/trails/:trail', (req, res) => {
    const body = z.object({ examDate: date.nullable().optional(), enabled: z.boolean().optional(),
      title: short.optional(), board: z.string().trim().max(200).optional(),
      priority: z.number().int().min(1).max(3).optional() }).parse(req.body);
    required(store.get('SELECT 1 FROM active_trails WHERE id=?', req.params.trail), 'Trilha inexistente.');
    store.transaction(() => {
      for (const [key, column] of Object.entries({ examDate: 'exam_date', enabled: 'enabled', priority: 'priority', title: 'title', board: 'board' })) {
        const value = body[key as keyof typeof body];
        if (value !== undefined) store.run(`UPDATE trails SET ${column}=? WHERE id=?`, typeof value === 'boolean' ? Number(value) : value, req.params.trail);
      }
    });
    res.json(studyState(store));
  });
  const linkInput = z.object({ sourceId: id, targetId: id });
  app.post('/api/topic-links', (req, res) => {
    const body = linkInput.parse(req.body);
    if (body.sourceId === body.targetId) throw new Problem('Escolha dois assuntos diferentes.');
    for (const topicId of [body.sourceId, body.targetId]) required(store.get('SELECT 1 FROM active_topics WHERE id=?', topicId), 'Assunto inexistente.');
    store.run('INSERT OR IGNORE INTO topic_links VALUES (?,?)', ...[body.sourceId, body.targetId].sort());
    res.json(studyState(store));
  });
  app.delete('/api/topic-links', (req, res) => {
    const body = linkInput.parse(req.body);
    store.run('DELETE FROM topic_links WHERE source_id=? AND target_id=?', ...[body.sourceId, body.targetId].sort());
    res.json(studyState(store));
  });
  app.post('/api/trails/:trail/editions', (req, res) => {
    const { title } = z.object({ title: short }).parse(req.body);
    required(store.get('SELECT 1 FROM active_trails WHERE id=?', req.params.trail), 'Trilha inexistente.');
    const editionId = randomUUID();
    store.run('INSERT INTO editions VALUES (?,?,?)', editionId, req.params.trail, title);
    res.status(201).json({ id: editionId });
  });
  app.put('/api/trails/:trail/edition', (req, res) => {
    const { editionId } = z.object({ editionId: id }).parse(req.body);
    setEdition(store, req.params.trail, editionId);
    res.json(studyState(store));
  });
  app.post('/api/topics', (req, res) => res.status(201).json(saveTopic(store, topicInput.parse(req.body))));
  app.put('/api/topics/:topic', (req, res) => {
    required(store.get('SELECT 1 FROM active_topics WHERE id=?', req.params.topic), 'Tópico inexistente.');
    res.json(saveTopic(store, topicInput.parse(req.body), req.params.topic));
  });
  app.post('/api/materials', (req, res) => {
    const body = z.object({ title: short, body: note.min(1), summary: note, topicIds: z.array(id).min(1).max(50) }).parse(req.body);
    const materialId = randomUUID();
    store.transaction(() => {
      store.run('INSERT INTO materials VALUES (?,?,?,?)', materialId, body.title, body.body, body.summary);
      for (const topicId of new Set(body.topicIds)) {
        required(store.get('SELECT 1 FROM active_topics WHERE id=?', topicId), 'Tópico inexistente.');
        store.run('INSERT INTO material_topics VALUES (?,?)', materialId, topicId);
      }
    });
    res.status(201).json({ id: materialId });
  });
  app.get('/api/topics/:topic/materials', (req, res) => {
    required(store.get('SELECT 1 FROM active_topics WHERE id=?', req.params.topic), 'Tópico inexistente.');
    res.json(store.all(`SELECT m.id,m.title,m.body,m.summary FROM active_materials m JOIN material_topics t ON t.material_id=m.id
      WHERE t.topic_id=? AND m.id NOT IN (SELECT material_id FROM study_pdfs) ORDER BY m._order`, req.params.topic));
  });
  app.post('/api/topics/:topic/read', (req, res) => {
    required(store.get('SELECT 1 FROM active_topics WHERE id=?', req.params.topic), 'Tópico inexistente.');
    store.run('INSERT OR IGNORE INTO reading VALUES (?,?)', req.params.topic, localDate());
    res.json(studyState(store));
  });
  app.get('/api/topics/:topic/questions', (req, res) => res.json(listQuestions(store, req.params.topic)));
  app.get('/api/question-bank', (req, res) => res.json(questionBank(store, id.optional().parse(req.query.trailId))));
  app.post('/api/questions/:question/answer', (req, res) =>
    res.json(answerQuestion(store, req.params.question, attemptInput.parse(req.body))));
  app.patch('/api/attempts/:attempt', (req, res) => {
    const body = z.object({ reason: note, guess: z.boolean().optional() }).parse(req.body);
    required(store.get('SELECT 1 FROM attempts WHERE id=?', req.params.attempt), 'Tentativa inexistente.');
    store.run('UPDATE attempts SET reason=?,guess=coalesce(?,guess) WHERE id=?',
      body.reason, body.guess === undefined ? null : Number(body.guess), req.params.attempt);
    res.json(studyState(store));
  });
  app.post('/api/cards', (req, res) => res.status(201).json(saveCard(store, cardInput.parse(req.body))));
  app.put('/api/cards/:card', (req, res) => {
    required(store.get('SELECT 1 FROM active_cards WHERE id=? AND archived=0', req.params.card), 'Cartão inexistente.');
    res.json(saveCard(store, cardInput.parse(req.body), req.params.card));
  });
  app.delete('/api/cards/:card', (req, res) => {
    removeItem(store, 'card', req.params.card);
    res.json(studyState(store));
  });
  app.post('/api/cards/:card/review', (req, res) => {
    const body = z.object({ id, remembered: z.boolean() }).parse(req.body);
    res.json(reviewCard(store, req.params.card, body.id, body.remembered));
  });

  app.post('/api/exam-packs/:pack', async (req, res) => {
    res.json(await loadExamPack(imports, req.params.pack));
  });
  app.get('/api/imports/:job', (req, res) => res.json(imports.detail(req.params.job)));
  app.get('/api/imports/:job/pdf', (req, res) => {
    const job = imports.job(req.params.job, true);
    res.type('pdf').sendFile(imports.path(job));
  });
  app.put('/api/imports/:job/draft', (req, res) => {
    imports.saveDraft(req.params.job, draftInput.parse(req.body));
    res.json(imports.detail(req.params.job));
  });
  app.post('/api/imports/:job/retry', (req, res) => {
    imports.start(req.params.job);
    res.status(202).json(imports.detail(req.params.job));
  });
  app.post('/api/imports/:job/ocr', (req, res) => {
    const { page } = z.object({ page: z.number().int().min(1).max(400) }).parse(req.body);
    imports.start(req.params.job, page);
    res.status(202).json(imports.detail(req.params.job));
  });
  app.post('/api/imports/:job/suggestions', (req, res) =>
    res.json(imports.suggestions(imports.job(req.params.job))));
  app.post('/api/imports/:job/cancel', (req, res) => {
    imports.cancel(req.params.job);
    res.json(imports.detail(req.params.job));
  });
  app.post('/api/imports/:job/save-all', (req, res) =>
    res.json(imports.saveAll(req.params.job, saveAllInput.parse(req.body))));
  app.post('/api/imports/:job/publish', (req, res) =>
    res.json(imports.publish(req.params.job, publicationInput.parse(req.body))));
  app.post('/api/imports/:trail/:kind', express.raw({ type: 'application/pdf', limit: '50mb' }), (req, res) => {
    const kind = z.enum(['edital','prova','gabarito']).parse(req.params.kind);
    const name = z.string().max(400).parse(req.query.name ?? 'documento.pdf');
    if (imports.workers.size < 2) {
      res.status(202).json(imports.upload(req.params.trail, kind, name, req.body));
      return;
    }
    throw new Problem('Aguarde uma importação terminar.', 409);
  });

  app.use('/api', (_req, res) => res.status(404).json({ error: 'Operação inexistente.' }));
  app.use(express.static(resolve('dist')));
  app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    if (error instanceof Problem) { res.status(error.status).json({ error: error.message }); return; }
    if (error instanceof ZodError) {
      const fields = error.issues.slice(0, 4).map(issue => issue.path.join('.') || 'formulário').join(', ');
      res.status(400).json({ error: 'Confira os campos: ' + fields + '.' });
      return;
    }
    if (typeof error === 'object' && error !== null && 'status' in error && typeof error.status === 'number' && error.status < 500) {
      res.status(error.status).json({ error: error.status === 413 ? 'O arquivo ultrapassa o limite de 50 MB.' : 'Não foi possível ler a solicitação.' });
      return;
    }
    console.error(error);
    res.status(500).json({ error: 'Ocorreu uma falha local. Tente novamente.' });
  });
  return app;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const port = Number(process.env.CONCURSERO_PORT ?? 4183);
  createApp().listen(port, '127.0.0.1', () => console.log('ConcurserO disponível em http://127.0.0.1:' + port));
}
