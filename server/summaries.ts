import { createHash, randomUUID } from 'node:crypto';
import { renameSync, rmSync, writeFileSync } from 'node:fs';
import { isAbsolute, join, normalize } from 'node:path';
import express from 'express';
import { z } from 'zod';
import type { Summary, SummaryBackup } from '../shared/summaries.ts';
import { localDate, Problem, required, type Store } from './db.ts';

const identifier = z.string().regex(/^[a-z\d:_-]{1,100}$/i);
const draft = z.object({
  title: z.string().trim().min(1).max(180),
  html: z.string().max(250_000),
  discipline: z.string().trim().max(250),
  subject: z.string().trim().max(500),
  topicId: identifier.nullable(),
  source: z.object({
    id: identifier,
    title: z.string().min(1).max(500),
    version: z.number().int().positive(),
    page: z.number().int().min(1).max(50000).nullable(),
  }).nullable(),
});
const stored = draft.extend({
  id: identifier,
  revision: z.number().int().positive(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
  archived: z.boolean(),
});
const snapshot = z.object({ format: z.literal('concursero-resumos'), version: z.literal(1),
  exportedAt: z.iso.datetime(), summaries: z.array(stored) });
const maxBackupBytes = 50 * 1024 * 1024;
type Settings = SummaryBackup & { installation: string };

function summaries(store: Store) {
  return store.all<{ document: string }>('SELECT document FROM summaries').map(row => JSON.parse(row.document) as Summary)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt) || a.id.localeCompare(b.id));
}

function writeSummary(store: Store, summary: Summary) {
  store.run('INSERT INTO summaries VALUES (?,?) ON CONFLICT(id) DO UPDATE SET document=excluded.document',
    summary.id, JSON.stringify(summary));
}

function readSummary(store: Store, id: string): Summary {
  const row = required(store.get<{ document: string }>('SELECT document FROM summaries WHERE id=?', id), 'Resumo inexistente.');
  return JSON.parse(row.document);
}

function exportSummaries(store: Store, now = new Date()) {
  const json = JSON.stringify({ format: 'concursero-resumos', version: 1, exportedAt: now.toISOString(), summaries: summaries(store) });
  if (Buffer.byteLength(json) > maxBackupBytes) throw new Problem('A cópia dos resumos ultrapassa 50 MB.', 413);
  return json;
}

function backupSettings(store: Store) { return store.setting<Settings>('summaryBackup'); }

function publicBackup({ directory, savedAt, error }: Settings): SummaryBackup {
  return { directory, savedAt, error };
}

function writeBackup(store: Store) {
  const settings = backupSettings(store);
  if (!settings.directory) return publicBackup(settings);
  const now = new Date();
  const destination = join(settings.directory, `ConcurserO-resumos-${localDate(now)}-${settings.installation}.json`);
  const temporary = destination + '.' + randomUUID() + '.tmp';
  try {
    writeFileSync(temporary, exportSummaries(store, now), { encoding: 'utf8', flag: 'wx', flush: true });
    renameSync(temporary, destination);
    settings.savedAt = now.toISOString();
    settings.error = '';
  } catch (error) {
    try { rmSync(temporary, { force: true }); } catch { /* The drive may be offline. */ }
    settings.error = error instanceof Problem ? error.message : 'Não foi possível gravar a cópia. Confira se a pasta está disponível e tente novamente.';
  }
  store.setSetting('summaryBackup', settings);
  return publicBackup(settings);
}

function summaryContent(summary: Summary) {
  return JSON.stringify({ ...draft.parse(summary), archived: summary.archived });
}

function restoreSummaries(store: Store, raw: Buffer) {
  let value: unknown;
  try { value = JSON.parse(raw.toString('utf8').replace(/^\uFEFF/, '')); }
  catch { throw new Problem('Não foi possível ler o arquivo de backup.'); }
  const parsed = snapshot.safeParse(value);
  if (!parsed.success) throw new Problem('Escolha um arquivo de backup de resumos válido do ConcurserO.');
  const imported = parsed.data.summaries;
  if (new Set(imported.map(row => row.id)).size !== imported.length) throw new Problem('O backup tem identificadores duplicados.');
  return store.transaction(() => {
    const existing = new Map(summaries(store).map(summary => [summary.id, summary]));
    let added = 0, copies = 0;
    for (const summary of imported) {
      const content = summaryContent(summary);
      let id = summary.id;
      let current = existing.get(id);
      while (current && summaryContent(current) !== content) {
        id = 'recuperado-' + createHash('sha256').update(JSON.stringify([id, content])).digest('hex');
        current = existing.get(id);
      }
      if (current) continue;
      const restored = { ...summary, id };
      writeSummary(store, restored);
      existing.set(id, restored);
      if (id === summary.id) added++;
      else copies++;
    }
    return { added, copies, skipped: imported.length - added - copies };
  });
}

export function summaryRoutes(store: Store) {
  const router = express.Router();
  if (backupSettings(store).directory) writeBackup(store);
  router.get('/', (_req, res) => res.json({ summaries: summaries(store), backup: publicBackup(backupSettings(store)) }));
  router.get('/backup', (_req, res) => res.type('application/octet-stream')
    .attachment(`ConcurserO-resumos-${localDate()}.json`).send(exportSummaries(store)));
  router.put('/backup', (req, res) => {
    const input = z.object({ directory: z.string().trim().max(1024) }).parse(req.body);
    if (input.directory && !isAbsolute(input.directory)) throw new Problem('Informe o caminho completo da pasta.');
    const directory = input.directory ? normalize(input.directory) : '';
    const settings = backupSettings(store);
    if (directory !== settings.directory) store.setSetting('summaryBackup', { ...settings, directory, savedAt: null, error: '' });
    res.json(writeBackup(store));
  });
  router.post('/restore', express.raw({ type: 'application/octet-stream', limit: maxBackupBytes }), (req, res) => {
    if (!Buffer.isBuffer(req.body)) throw new Problem('Selecione um arquivo de backup.');
    const result = restoreSummaries(store, req.body);
    res.json({ ...result, summaries: summaries(store),
      backup: result.added || result.copies ? writeBackup(store) : publicBackup(backupSettings(store)) });
  });
  router.post('/', (req, res) => {
    const now = new Date().toISOString();
    const summary: Summary = { ...draft.parse(req.body), id: randomUUID(), revision: 1, createdAt: now, updatedAt: now, archived: false };
    writeSummary(store, summary);
    res.status(201).json({ summary, backup: writeBackup(store) });
  });
  router.put('/:id', (req, res) => {
    const id = identifier.parse(req.params.id);
    const input = draft.extend({ revision: stored.shape.revision, archived: z.boolean() }).parse(req.body);
    const summary = store.transaction(() => {
      const previous = readSummary(store, id);
      if (previous.revision !== input.revision) throw new Problem('Este resumo mudou em outra janela. Copie o texto antes de reabrir o resumo.', 409);
      const updated = { ...previous, ...input, revision: previous.revision + 1, updatedAt: new Date().toISOString() };
      writeSummary(store, updated);
      return updated;
    });
    res.json({ summary, backup: writeBackup(store) });
  });
  return router;
}
