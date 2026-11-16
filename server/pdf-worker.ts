import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { parentPort, workerData } from 'node:worker_threads';
import { createCanvas } from '@napi-rs/canvas';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import type { TextItem } from 'pdfjs-dist/types/src/display/api.js';
import type { ExtractedPage } from './parsers.ts';

const require = createRequire(import.meta.url);
const pdfRoot = dirname(require.resolve('pdfjs-dist/package.json'));
const input = workerData as { file: string; kind: string; trail: string; ocrPage?: number; maxPages: number };
const port = parentPort!;

function rows(items: TextItem[]) {
  const groups: { y: number; items: TextItem[] }[] = [];
  const ordered = [...items].sort((a, b) => b.transform[5] - a.transform[5]);
  for (const item of ordered) {
    const last = groups.at(-1);
    if (last && Math.abs(last.y - item.transform[5]) < 3) last.items.push(item);
    else groups.push({ y: item.transform[5], items: [item] });
  }
  return groups.map(row => row.items.sort((a, b) => a.transform[4] - b.transform[4])
    .map(item => item.str).join(' ').replace(/\s+/g, ' ').trim()).filter(Boolean).join('\n');
}

function readColumns(items: TextItem[], width: number) {
  const center = width / 2;
  const left = items.filter(item => item.transform[4] < center - 3 && item.transform[4] + item.width <= center + 4);
  const right = items.filter(item => item.transform[4] >= center - 3);
  const across = items.filter(item => item.transform[4] < center - 3 && item.transform[4] + item.width > center + 4);
  // Only split a page when it contains substantial text in both columns and few spanning lines.
  if (left.length > 25 && right.length > 25 && across.length < items.length / 8) {
    return [rows(across), rows(left), rows(right)].filter(Boolean).join('\n');
  }
  return rows(items);
}

let editalTable: 'general' | 'area3' | undefined;

function ibfcTopics(items: TextItem[], page: number) {
  const normalize = (value: string) => value.normalize('NFD').replace(/\p{Diacritic}/gu, '').toUpperCase().trim();
  const candidates = [...items].sort((a, b) => b.transform[5] - a.transform[5]);
  const chunks: { discipline: string; y: number; title: string }[] = [];
  for (const item of candidates) {
    const text = item.str.trim();
    const marker = normalize(text);
    if (marker === 'CONHECIMENTOS GERAIS' && candidates.some(row => /^ANEXO IV.*CONTEUDO PROGRAMATICO/.test(normalize(row.str)))) {
      editalTable = 'general';
      continue;
    }
    const area = marker.match(/^CONHECIMENTOS ESPECIFICOS\s*[–:-]\s*AREA\s*(\d+)$/);
    if (area || marker.startsWith('ANEXO V')) {
      editalTable = area?.[1] === '3' ? 'area3' : undefined;
      continue;
    }
    if (!editalTable || !/\p{L}/u.test(text) || /^(TEMA|TOTAL)$/.test(marker)) continue;
    const x = item.transform[4];
    const y = item.transform[5];
    const boundary = editalTable === 'general' ? 122 : 147;
    if (x < 35 || x + item.width > boundary || y < 31) continue;
    const discipline = editalTable === 'general' ? 'Conhecimentos gerais' : 'Conhecimentos específicos';
    const last = chunks.at(-1);
    if (last && last.discipline === discipline && last.y - y <= 14) {
      last.y = y; last.title += ' ' + text;
    } else chunks.push({ discipline, y, title: text });
  }
  return chunks.map(({ discipline, title }) => ({ page, discipline, title: title.replace(/-\s+/g, '-').slice(0, 200) }))
    .filter(row => row.title.length >= 5);
}

async function extract() {
  const source = await readFile(input.file);
  const loader = getDocument({
    data: Uint8Array.from(source), disableFontFace: true,
    standardFontDataUrl: join(pdfRoot, 'standard_fonts') + '/',
    cMapUrl: join(pdfRoot, 'cmaps') + '/', cMapPacked: true,
  });
  try {
    const pdf = await loader.promise;
    if (pdf.numPages > input.maxPages) throw new Error('O PDF excede o limite de páginas.');
    port.postMessage({ total: pdf.numPages });
    if (input.ocrPage && input.ocrPage > pdf.numPages) throw new Error('A página não existe neste arquivo.');
    for (let page = input.ocrPage ?? 1; page <= (input.ocrPage ?? pdf.numPages); page++) {
      const documentPage = await pdf.getPage(page);
      let extracted: ExtractedPage;
      if (input.ocrPage) {
        const viewport = documentPage.getViewport({ scale: 2 });
        if (viewport.width * viewport.height > 18_000_000) throw new Error('A página é grande demais para OCR.');
        const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
        await documentPage.render({
          canvasContext: canvas.getContext('2d') as unknown as CanvasRenderingContext2D,
          canvas: canvas as unknown as HTMLCanvasElement, viewport,
        }).promise;
        const { createWorker } = await import('tesseract.js');
        const langPath = join(dirname(require.resolve('@tesseract.js-data/por/package.json')), '4.0.0_best_int');
        const worker = await createWorker('por', 1, { langPath, cacheMethod: 'none', gzip: true });
        try {
          const { data } = await worker.recognize(canvas.toBuffer('image/png'));
          extracted = { page, text: data.text.trim(), needsOcr: data.text.trim().length < 12 };
        } finally {
          await worker.terminate();
        }
      } else {
        const content = await documentPage.getTextContent();
        const items = content.items.filter((item): item is TextItem => 'str' in item && item.str.trim().length > 0);
        const table = rows(items);
        const text = input.kind === 'prova' ? readColumns(items, documentPage.getViewport({ scale: 1 }).width) : table;
        const topics = input.kind === 'edital' && input.trail === 'pr' ? ibfcTopics(items, page) : undefined;
        extracted = { page, text, table, topics, needsOcr: text.trim().length < 30 };
      }
      documentPage.cleanup();
      port.postMessage({ page: extracted });
    }
    port.postMessage({ done: true });
  } finally {
    await loader.destroy();
  }
}

extract().catch((error: Error) => {
  const message = error.name === 'PasswordException'
    ? 'O PDF está protegido por senha. Use uma cópia desbloqueada.'
    : error.name === 'InvalidPDFException' ? 'O arquivo não é um PDF válido ou está corrompido.' : error.message;
  port.postMessage({ error: message });
});
