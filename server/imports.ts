import { createHash, randomUUID } from 'node:crypto';
import { existsSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { Worker } from 'node:worker_threads';
import { z } from 'zod';
import { Problem, Store, required } from './db.ts';
import { blockFor, isPreliminary, suggestKeys, suggestQuestions, suggestTopics } from './parsers.ts';
import type { ExtractedPage } from './parsers.ts';
import { id, jobsSql, note, short } from './study.ts';
import type { DraftKey, DraftQuestion, DraftTopic, ImportJob, ImportKind } from '../shared/types.ts';
import { examPacks } from '../shared/exam-packs.ts';
import { classify, compatibleKeys, preliminaryKeyPages, readDraft, examFor, questionIssue, summarizeImport } from './catalog.ts';
import { paranaSyllabusTitle } from './parana-agenda.ts';
import { analyzeDraftQuestion } from './question-analysis.ts';
import { restoreItem } from './removal.ts';

const page = z.number().int().min(1).max(400);
const number = z.number().int().min(1).max(120);
const version = z.enum(['A', 'B', 'C', 'Única']);
const block = z.enum(['basico', 'especifico']);
const option = z.object({ key: z.enum(['A','B','C','D','E']), text: note });
const topicDraft = z.object({ page, discipline: z.string().trim().max(200), title: z.string().trim().max(200) });
const questionDraft = z.object({
  page, number, version, block, prompt: note, context: note,
  options: z.array(option).max(5), type: z.enum(['choice','boolean']),
  needsSupport: z.boolean().optional(), supportPages: z.array(page).max(8).optional(),
});
const keyDraft = z.object({ page, number, version, block, key: z.enum(['A','B','C','D','E','X']) });
export const draftInput = z.object({
  topics: z.array(topicDraft).max(2000),
  questions: z.array(questionDraft).max(400),
  keys: z.array(keyDraft).max(400),
});
type Draft = { topics: DraftTopic[]; questions: DraftQuestion[]; keys: DraftKey[] };
type FullJob = ImportJob & { hash: string; draft: string | null };
type StoredPage = { page: number; text: string; needs_ocr: number; topics: string | null };
export const saveAllInput = z.object({ requestId: id, editionId: id.optional(), keyId: id.optional() });

export const publicationInput = z.object({
  requestId: id, editionId: id, keyId: id.optional(), confirmed: z.literal(true),
  selected: z.array(z.object({ index: z.number().int().min(0), topicId: id.optional(), comment: note.optional() }))
    .min(1).max(2000),
});
type Publication = z.infer<typeof publicationInput>;
const emptyDraft = (): Draft => ({ topics: [], questions: [], keys: [] });

export class Imports {
  store: Store;
  workers = new Map<string, Worker>();
  constructor(store: Store) { this.store = store; }

  job(id: string, includeRemoved = false): FullJob {
    const sql = includeRemoved ? jobsSql.replace('active_imports', 'imports') : jobsSql;
    return required(this.store.get<FullJob>(sql.replace(' FROM', ',hash,draft FROM') + ' WHERE id=?', id), 'Importação inexistente.');
  }

  path(job: FullJob) { return join(this.store.directory, 'pdf', job.hash + '.pdf'); }

  upload(trailId: string, kind: ImportKind, rawName: string, buffer: Buffer) {
    required(this.store.get('SELECT id FROM active_trails WHERE id=?', trailId), 'Trilha inexistente.');
    if (!Buffer.isBuffer(buffer) || !buffer.subarray(0, 1024).includes(Buffer.from('%PDF-'))) {
      throw new Problem('Selecione um arquivo PDF válido.');
    }
    const hash = createHash('sha256').update(buffer).digest('hex');
    const source = examPacks.filter(pack => pack.trailId === trailId)
      .flatMap(pack => pack.blocks.flatMap(block => [block.proof, block.key].map(file => ({
        exam: pack.exam, pair: pack.id + ':' + block.id, file,
      })))).find(({ file }) => file.kind === kind && file.sha256 === hash);
    const old = this.store.get<{ id: string }>('SELECT id FROM imports WHERE kind=? AND trail_id=? AND hash=?', kind, trailId, hash);
    if (old) {
      restoreItem(this.store, 'import', old.id);
      if (source) this.attachSource(old.id, source.exam, source.pair, source.file.url);
      return { id: old.id, existing: true };
    }
    const name = basename(rawName).slice(0, 200) || 'documento.pdf';
    const jobId = randomUUID();
    const file = join(this.store.directory, 'pdf', hash + '.pdf');
    if (!existsSync(file)) {
      const temp = file + '.' + jobId + '.tmp';
      try {
        writeFileSync(temp, buffer, { flag: 'wx' });
        renameSync(temp, file);
      } finally {
        rmSync(temp, { force: true });
      }
    }
    this.store.run('INSERT INTO imports (id,kind,name,trail_id,hash,status,created,exam,pair,source_url) VALUES (?,?,?,?,?,?,?,?,?,?)',
      jobId, kind, name, trailId, hash, 'queued', new Date().toISOString(), source?.exam ?? null,
      source?.pair ?? null, source?.file.url ?? null);
    this.start(jobId);
    return { id: jobId, existing: false };
  }

  start(jobId: string, ocrPage?: number) {
    const job = this.job(jobId);
    if (this.workers.has(jobId)) throw new Problem('O arquivo já está em processamento.', 409);
    if (ocrPage) required(this.store.get('SELECT 1 FROM pages WHERE import_id=? AND page=?', jobId, ocrPage), 'Página inexistente.');
    if (this.workers.size >= 2) throw new Problem('Aguarde uma importação terminar e tente novamente.', 409);
    const worker = new Worker(new URL('./pdf-worker.ts', import.meta.url), {
      workerData: { file: this.path(job), kind: job.kind, trail: job.trailId, ocrPage, maxPages: 400 },
      resourceLimits: { maxOldGenerationSizeMb: 384 },
    });
    this.workers.set(jobId, worker);
    this.store.run('UPDATE imports SET status=?,completed=?,message=? WHERE id=?',
      'processing', ocrPage ? job.completed : 0, ocrPage ? 'Reconhecendo texto em português.' : 'Extraindo o texto do documento.', jobId);
    const seen: ExtractedPage[] = [];
    let finished = false;
    const finish = (status: string, message: string) => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      this.workers.delete(jobId);
      this.store.run('UPDATE imports SET status=?,message=? WHERE id=?', status, message, jobId);
      void worker.terminate();
    };
    const timer = setTimeout(() => finish('failed', 'O processamento atingiu o limite de tempo. Tente novamente ou use a edição manual.'), ocrPage ? 120_000 : 240_000);
    worker.on('message', (event: { total?: number; page?: ExtractedPage; done?: boolean; error?: string }) => {
      if (finished || this.workers.get(jobId) !== worker) return;
      try {
        if (event.total) this.store.run('UPDATE imports SET total=? WHERE id=?', event.total, jobId);
        if (event.page) {
          const extracted = event.page;
          seen.push(extracted);
          this.store.run(`INSERT INTO pages VALUES (?,?,?,?,?) ON CONFLICT(import_id,page)
            DO UPDATE SET text=excluded.text,needs_ocr=excluded.needs_ocr,topics=coalesce(excluded.topics,pages.topics)`,
          jobId, extracted.page, extracted.text, Number(extracted.needsOcr), extracted.topics ? JSON.stringify(extracted.topics) : null);
          if (!ocrPage) this.store.run('UPDATE imports SET completed=? WHERE id=?', extracted.page, jobId);
        }
        if (event.error) finish('failed', event.error);
        if (event.done) {
          const current = this.job(jobId);
          const draft = current.draft ? JSON.parse(current.draft) as Draft : this.suggestions(current, seen);
          if (!current.draft) this.saveDraft(jobId, draft);
          const preliminaryPages = new Set(this.pages(jobId).filter(page => isPreliminary(page.text)).map(page => page.page));
          const preliminary = job.kind === 'gabarito' && draft.keys.length > 0 && draft.keys.every(key => preliminaryPages.has(key.page));
          finish(job.status === 'done' ? 'done' : 'review', preliminary
            ? 'Gabarito preliminar importado. Abra o caderno para salvar e corrigir as questões.'
            : job.kind === 'prova' ? 'Questões disponíveis. Salve todas quando o gabarito estiver disponível.' : job.kind === 'edital' ? 'Tópicos extraídos. Salve para montar seu plano.' : 'Gabarito importado. Abra o caderno para salvar as questões.');
        }
      } catch (error) {
        finish('failed', error instanceof Error ? error.message : 'Falha ao ler o PDF.');
      }
    });
    worker.on('error', error => finish('failed', error.message));
    worker.on('exit', () => {
      if (this.workers.get(jobId) === worker) finish('failed', 'A extração foi interrompida.');
      clearTimeout(timer);
    });
  }

  attachSource(jobId: string, exam: string, pair: string, url: string) {
    const job = this.job(jobId);
    if (job.pair && (job.exam !== exam || job.pair !== pair || job.sourceUrl !== url)) {
      throw new Problem('O PDF já está vinculado a outra prova.', 409);
    }
    this.store.run('UPDATE imports SET exam=?,pair=?,source_url=? WHERE id=?', exam, pair, url, jobId);
  }

  cancel(jobId: string) {
    this.job(jobId);
    const worker = this.workers.get(jobId);
    if (!worker) return;
    this.workers.delete(jobId);
    this.store.run("UPDATE imports SET status='cancelled',message='Processamento cancelado. O rascunho foi preservado.' WHERE id=?", jobId);
    void worker.terminate();
  }

  pages(jobId: string): ExtractedPage[] {
    return this.store.all<StoredPage>('SELECT page,text,needs_ocr,topics FROM pages WHERE import_id=? ORDER BY page', jobId)
      .map(row => ({ page: row.page, text: row.text, needsOcr: Boolean(row.needs_ocr), topics: row.topics ? JSON.parse(row.topics) : undefined }));
  }

  detail(jobId: string) {
    const { hash, draft, ...job } = this.job(jobId);
    const parsed = readDraft({ ...job, draft });
    const preliminaryPages = preliminaryKeyPages(this.store, job);
    const preliminary = job.kind === 'gabarito' && parsed.keys.some(key => preliminaryPages.has(key.page));
    if (preliminary && (job.status === 'review' || job.status === 'done')) {
      job.message = 'Gabarito preliminar disponível para correção. Abra o caderno para salvar as questões.';
    }
    return { job, draft: parsed, pages: this.pages(jobId), preliminary,
      availability: job.kind === 'prova' ? summarizeImport(this.store, { ...job, draft, hash }) : undefined };
  }

  suggestions(job: FullJob, pages = this.pages(job.id)): Draft {
    const draft = emptyDraft();
    if (job.kind === 'edital') draft.topics = suggestTopics(pages, job.trailId);
    if (job.kind === 'prova') draft.questions = suggestQuestions(pages, job.trailId, job.pair);
    if (job.kind === 'gabarito') draft.keys = suggestKeys(pages, job.trailId);
    if (job.pair) {
      const expectedBlock = job.pair.split(':').at(-1);
      draft.questions = draft.questions.filter(row => row.block === expectedBlock);
      draft.keys = draft.keys.filter(row => row.block === expectedBlock);
    }
    return draft;
  }

  saveDraft(jobId: string, draft: Draft) {
    const job = this.job(jobId);
    const rows = [...draft.topics, ...draft.questions, ...draft.keys];
    if (rows.some(row => row.page > job.total && job.total > 0)) throw new Problem('Confira os números das páginas.');
    this.store.run('UPDATE imports SET draft=? WHERE id=?', JSON.stringify(draft), jobId);
  }

  publish(jobId: string, body: Publication) {
    return this.store.transaction(() => this.publishInside(jobId, body));
  }

  private publishInside(jobId: string, body: Publication) {
    const prior = this.store.get<{ result: string }>('SELECT result FROM publications WHERE id=?', body.requestId);
    if (prior) {
      const saved = JSON.parse(prior.result);
      if (saved.jobId !== jobId) throw new Problem('Identificador de publicação já utilizado.', 409);
      return saved;
    }
    const job = this.job(jobId);
    if (job.kind === 'gabarito') throw new Problem('Abra o caderno para publicar com este gabarito.');
    if (job.status === 'processing' || job.status === 'queued') throw new Problem('Aguarde o processamento.');
    if (!job.total) throw new Problem('O documento original precisa ser legível para publicar.');
    required(this.store.get('SELECT 1 FROM active_editions WHERE id=? AND trail_id=?', body.editionId, job.trailId), 'Edição incompatível.');
    const draft = readDraft(job);
    const keyJob = job.kind === 'prova' && body.keyId ? this.job(body.keyId) : undefined;
    if (job.kind === 'prova' && (!keyJob || keyJob.kind !== 'gabarito' || keyJob.trailId !== job.trailId ||
      !keyJob.draft || ['processing', 'queued'].includes(keyJob.status))) {
      throw new Problem('Selecione um gabarito da mesma trilha.');
    }
    if (keyJob && (job.pair !== keyJob.pair || job.exam !== keyJob.exam)) {
      throw new Problem('Use o gabarito do mesmo concurso e bloco do caderno.');
    }
    const keys = keyJob ? readDraft(keyJob).keys : [];
    const preliminary = keyJob ? preliminaryKeyPages(this.store, keyJob) : new Set<number>();
    const rows = job.kind === 'edital' ? draft.topics : draft.questions;
    const selected = [...new Map(body.selected.map(row => [row.index, row])).values()];
    if (selected.some(row => !rows[row.index])) throw new Problem('O rascunho mudou. Reabra e confira a seleção.');
    let published = 0;
    const pending: string[] = [];
    const questionIdentifiers = new Map<string, number>();
    for (const row of draft.questions) {
      const identifier = [row.version, row.block, row.number].join(':');
      questionIdentifiers.set(identifier, (questionIdentifiers.get(identifier) ?? 0) + 1);
    }
    for (const selectedRow of selected) {
      if (job.kind === 'edital') {
        const row = draft.topics[selectedRow.index];
        if (!row.title.trim() || !row.discipline.trim()) { pending.push('Linha ' + (selectedRow.index + 1) + ' incompleta.'); continue; }
        this.store.run(`INSERT INTO topics (id,edition_id,discipline,title,priority,position,source_id,source_page)
          VALUES (?,?,?,?,2,coalesce((SELECT max(position)+1 FROM topics WHERE edition_id=?),0),?,?)
          ON CONFLICT(edition_id,discipline,title) DO UPDATE SET source_id=excluded.source_id,source_page=excluded.source_page,syllabus=1`,
        randomUUID(), body.editionId, row.discipline, row.title, body.editionId, jobId, row.page);
        published++;
        continue;
      }
      const row = draft.questions[selectedRow.index];
      const isPr = job.trailId === 'pr';
      const optionKeys = row.options.map(option => option.key).sort().join('');
      const matches = keys.filter(key => key.number === row.number && key.version === row.version && key.block === row.block);
      const validTopic = selectedRow.topicId && this.store.get('SELECT 1 FROM active_topics WHERE id=? AND edition_id=?', selectedRow.topicId, body.editionId);
      const identifier = [row.version, row.block, row.number].join(':');
      const support = row.supportPages ?? [];
      const valid = validTopic && row.prompt.trim() && (!row.needsSupport || support.length) &&
        support.every(page => page <= job.total) && matches.length === 1 && questionIdentifiers.get(identifier) === 1 &&
        (!job.pair || job.pair.endsWith(':' + row.block)) &&
        row.block === blockFor(job.trailId, row.number) &&
        (isPr ? row.number <= 80 && row.type === 'choice' && /^[ABC]$/.test(row.version) && optionKeys === 'ABCDE'
          : row.type === 'boolean' && row.version === 'Única' && optionKeys === 'CE') &&
        row.options.every(option => option.text.trim()) &&
        (matches[0].key === 'X' || optionKeys.includes(matches[0].key));
      if (!valid) {
        pending.push('Questão ' + row.number + ' · ' + row.version + ' · confira tópico, enunciado, versão, alternativas e gabarito.');
        continue;
      }
      this.publishQuestion(job, keyJob!, row, matches[0], selectedRow.topicId!, selectedRow.comment ?? '', preliminary.has(matches[0].page));
      published++;
    }
    if (published) this.store.run("UPDATE imports SET status='done',message=? WHERE id=?", 'Publicação registrada. O rascunho permanece disponível.', jobId);
    const result = { jobId, published, pending };
    this.store.run('INSERT INTO publications VALUES (?,?)', body.requestId, JSON.stringify(result));
    return result;
  }

  saveAll(jobId: string, body: z.infer<typeof saveAllInput>) {
    return this.store.transaction(() => {
      const prior = this.store.get<{ result: string }>('SELECT result FROM publications WHERE id=?', body.requestId);
      if (prior) {
        const result = JSON.parse(prior.result);
        if (result.jobId !== jobId) throw new Problem('Identificador de publicação já utilizado.', 409);
        return result;
      }
      const job = this.job(jobId);
      const editionId = body.editionId ?? required(this.store.get<{ active_edition: string }>(
        'SELECT active_edition FROM trails WHERE id=?', job.trailId), 'Trilha inexistente.').active_edition;
      required(this.store.get('SELECT id FROM active_editions WHERE id=? AND trail_id=?', editionId, job.trailId), 'Edição incompatível.');
      if (job.kind === 'gabarito') throw new Problem('Abra o caderno correspondente para salvar as questões.');
      const draft = readDraft(job);
      const selected: Publication['selected'] = [];
      let keyId = body.keyId;
      if (job.kind === 'prova') {
        const keys = compatibleKeys(this.store, job);
        const removedKey = this.store.get("SELECT 1 FROM current_questions WHERE source_id=? AND status='pending'", job.id);
        if (!keyId && removedKey) throw new Problem('Restaure o gabarito removido ou selecione explicitamente outro gabarito compatível.');
        if (!keyId && keys.length === 1 && (job.pair || job.exam)) keyId = keys[0].id;
        if (!keys.some(key => key.id === keyId)) throw new Problem('Selecione um gabarito do mesmo concurso e bloco e da versão do caderno.');
        const answers = readDraft(keys.find(key => key.id === keyId)!).keys;
        for (const [index, row] of draft.questions.entries()) {
          if (questionIssue(row, answers)) { selected.push({ index }); continue; }
          const previous = this.store.get<{ topic_id: string; comment: string; edition_id: string }>(
            `SELECT q.topic_id,q.comment,p.edition_id FROM current_questions q JOIN topics p ON p.id=q.topic_id
             WHERE q.trail_id=? AND q.exam=? AND q.block=? AND q.version=? AND q.number=?`,
            job.trailId, examFor(job).exam, row.block, row.version, row.number);
          if (previous?.edition_id === editionId) {
            selected.push({ index, topicId: previous.topic_id, comment: previous.comment }); continue;
          }
          const syllabusTitle = paranaSyllabusTitle(job, row);
          if (syllabusTitle) {
            const syllabus = this.store.get<{ id: string }>(
              'SELECT id FROM active_topics WHERE edition_id=? AND title=? AND syllabus=1', editionId, syllabusTitle);
            if (syllabus) { selected.push({ index, topicId: syllabus.id }); continue; }
          }
          const analysis = analyzeDraftQuestion(row, job);
          const topic = analysis ? { discipline: analysis.discipline, title: analysis.label } : classify(job, row);
          let existing = this.store.get<{ id: string }>(
            'SELECT id FROM active_topics WHERE edition_id=? AND discipline=? AND title=?', editionId, topic.discipline, topic.title);
          if (!existing) {
            if (this.store.get('SELECT 1 FROM topics WHERE edition_id=? AND discipline=? AND title=?', editionId, topic.discipline, topic.title)) {
              throw new Problem('O assunto correspondente foi removido. Restaure-o em Acervo → Itens removidos antes de salvar as questões.', 409);
            }
            existing = { id: randomUUID() };
            this.store.run(`INSERT INTO topics (id,edition_id,discipline,title,priority,position,syllabus)
              VALUES (?,?,?,?,2,coalesce((SELECT max(position)+1 FROM topics WHERE edition_id=?),0),0)`,
              existing.id, editionId, topic.discipline, topic.title, editionId);
          }
          selected.push({ index, topicId: existing.id });
        }
      } else {
        selected.push(...draft.topics.map((_, index) => ({ index })));
      }
      if (!selected.length) throw new Problem(job.kind === 'edital' ? 'Nenhum tópico extraído. Confira o PDF em Detalhes.' : 'Nenhuma questão extraída. Confira o PDF em Detalhes.');
      return this.publishInside(jobId, { requestId: body.requestId, editionId, keyId, confirmed: true, selected });
    });
  }

  publishQuestion(job: FullJob, keyJob: FullJob, row: DraftQuestion, key: DraftKey, topicId: string, comment: string, preliminary: boolean) {
    const exam = examFor(job).exam;
    const existing = this.store.get<{ id: string; revision: number; topic_id: string; prompt: string; context: string; options: string;
      key: string; comment: string; support: string; source_id: string; source_page: number; key_source_id: string; key_page: number; key_preliminary: number }>(
      `SELECT q.*,r.* FROM questions q JOIN question_revisions r ON r.question_id=q.id
        WHERE q.trail_id=? AND q.exam=? AND q.block=? AND q.version=? AND q.number=?
        AND r.revision=(SELECT max(revision) FROM question_revisions WHERE question_id=q.id)`,
      job.trailId, exam, row.block, row.version, row.number);
    const id = existing?.id ?? randomUUID();
    const options = JSON.stringify(row.options);
    const support = JSON.stringify([...new Set(row.supportPages ?? [])]);
    if (existing && existing.topic_id === topicId && existing.prompt === row.prompt && existing.context === row.context &&
      existing.options === options && existing.support === support && existing.key === key.key && existing.comment === comment &&
      existing.source_id === job.id && existing.source_page === row.page &&
      existing.key_source_id === keyJob.id && existing.key_page === key.page && Boolean(existing.key_preliminary) === preliminary) return;
    if (!existing) this.store.run('INSERT INTO questions VALUES (?,?,?,?,?,?)', id, job.trailId, exam, row.block, row.version, row.number);
    this.store.run(`INSERT INTO question_revisions
      (question_id,revision,topic_id,prompt,context,options,type,status,key,comment,source_id,source_page,key_source_id,key_page,support,key_preliminary)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      id, (existing?.revision ?? 0) + 1, topicId, row.prompt, row.context, options, row.type,
      key.key === 'X' ? 'annulled' : 'ready', key.key, comment, job.id, row.page, keyJob.id, key.page, support, Number(preliminary));
  }
}
