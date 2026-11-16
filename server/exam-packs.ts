import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { setTimeout } from 'node:timers/promises';
import { examPacks } from '../shared/exam-packs.ts';
import { Problem, required } from './db.ts';
import type { Imports } from './imports.ts';

const maxBytes = 10 * 1024 * 1024;
const matchesHash = (pdf: Buffer, sha256: string) => createHash('sha256').update(pdf).digest('hex') === sha256;

async function readSource(url: string) {
  const response = await fetch(url, { redirect: 'error', signal: AbortSignal.timeout(30_000) });
  if (!response.ok || !response.body) throw new Error('Arquivo indisponível');
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) return Buffer.concat(chunks, size);
      size += value.length;
      if (size > maxBytes) throw new Error('Arquivo excede o limite');
      chunks.push(value);
    }
  } finally {
    await reader.cancel().catch(() => {});
  }
}

export async function loadExamPack(imports: Imports, packId: string, readPdf = readSource) {
  const pack = required(examPacks.find(item => item.id === packId), 'Concurso não disponível para carga.');
  const documents = pack.blocks.flatMap(block => [block.proof, block.key]);
  // Verify every input before queuing any import. Reuse the exact local PDFs when present.
  const files = await Promise.all(documents.map(async file => {
    const local = await readFile(join(imports.store.directory, 'pdf', file.sha256 + '.pdf')).catch(() => null);
    if (local && !matchesHash(local, file.sha256)) {
      throw new Problem('A cópia local está danificada: ' + file.name, 409);
    }
    let pdf: Buffer;
    try { pdf = local ?? await readPdf(file.url).catch(async () => {
      await setTimeout(350);
      return readPdf(file.url);
    }); }
    catch { throw new Problem('Não foi possível baixar ' + file.name + '. Tente novamente ou importe o PDF do acervo oficial.', 502); }
    if (!matchesHash(pdf, file.sha256)) throw new Problem('O PDF na fonte mudou: ' + file.name + '. Confira a publicação oficial.', 502);
    return { file, pdf };
  }));
  const ids: string[] = [];
  for (const { file, pdf } of files) {
    if (imports.workers.size >= 2) throw new Problem('Aguarde as importações em andamento e tente novamente.', 409);
    const { id } = imports.upload(pack.trailId, file.kind, file.name, pdf);
    let job = imports.job(id);
    if (job.status === 'failed' || job.status === 'cancelled' || job.status === 'queued') imports.start(id);
    while (imports.workers.has(id)) await setTimeout(100);
    job = imports.job(id);
    if (job.status !== 'review' && job.status !== 'done') throw new Problem(file.name + ': ' + job.message, 422);
    ids.push(id);
  }
  return { ids };
}
