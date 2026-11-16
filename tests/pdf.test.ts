import assert from 'node:assert/strict';
import { createCanvas } from '@napi-rs/canvas';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import test from 'node:test';
import { setTimeout } from 'node:timers/promises';
import { Store } from '../server/db.ts';
import { Imports } from '../server/imports.ts';
import { suggestKeys, suggestQuestions } from '../server/parsers.ts';

function makePdf(content: string, image?: Buffer) {
  const resources = image ? '/XObject << /Im0 5 0 R >>' : '/Font << /F1 5 0 R >>';
  const objects = [
    Buffer.from('<< /Type /Catalog /Pages 2 0 R >>'),
    Buffer.from('<< /Type /Pages /Kids [3 0 R] /Count 1 >>'),
    Buffer.from('<< /Type /Page /Parent 2 0 R /MediaBox [0 0 400 180] /Resources << ' + resources + ' >> /Contents 4 0 R >>'),
    Buffer.from('<< /Length ' + Buffer.byteLength(content) + ' >>\nstream\n' + content + '\nendstream'),
    image ? Buffer.concat([
      Buffer.from('<< /Type /XObject /Subtype /Image /Width 800 /Height 360 /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ' + image.length + ' >>\nstream\n'),
      image, Buffer.from('\nendstream'),
    ]) : Buffer.from('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'),
  ];
  const chunks = [Buffer.from('%PDF-1.4\n')];
  const offsets: number[] = [];
  for (const [i, object] of objects.entries()) {
    offsets.push(chunks.reduce((sum, chunk) => sum + chunk.length, 0));
    chunks.push(Buffer.from((i + 1) + ' 0 obj\n'), object, Buffer.from('\nendobj\n'));
  }
  const xref = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  chunks.push(Buffer.from('xref\n0 6\n0000000000 65535 f \n' +
    offsets.map(offset => String(offset).padStart(10, '0') + ' 00000 n \n').join('') +
    'trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n' + xref + '\n%%EOF\n'));
  return Buffer.concat(chunks);
}

async function waitForDraft(imports: Imports, id: string) {
  const deadline = Date.now() + 180_000;
  while (Date.now() < deadline) {
    const detail = imports.detail(id);
    if (detail.job.status === 'failed') throw new Error(detail.job.message);
    if (detail.job.status === 'review') return detail;
    await setTimeout(100);
  }
  throw new Error('O PDF excedeu o tempo do teste.');
}

test('extracts a local PDF, deduplicates it and recognizes a scanned page', { timeout: 360_000 }, async () => {
  const directory = mkdtempSync(join(tmpdir(), 'concursero-pdf-'));
  const store = new Store(directory);
  const imports = new Imports(store);
  try {
    const pdf = makePdf('BT /F1 20 Tf 30 125 Td (51 Uma afirmacao de estudo.) Tj ET');
    const result = imports.upload('pf', 'prova', 'texto.pdf', pdf);
    const duplicate = imports.upload('pf', 'prova', 'copia.pdf', pdf);
    assert.equal(duplicate.id, result.id);
    assert.equal(duplicate.existing, true);
    const first = await waitForDraft(imports, result.id);
    assert.match(first.pages[0].text, /51 Uma afirma/);
    assert.equal(first.draft.questions[0].number, 51);
    const canvas = createCanvas(800, 360);
    const context = canvas.getContext('2d');
    context.fillStyle = 'white';
    context.fillRect(0, 0, 800, 360);
    context.fillStyle = 'black';
    context.font = '36px Arial';
    context.fillText('Cadeia de custódia digital', 35, 100);
    context.fillText('Registro e preservação', 35, 180);
    const scan = makePdf('q 400 0 0 180 0 0 cm /Im0 Do Q', canvas.toBuffer('image/jpeg'));
    const scanned = imports.upload('pr', 'edital', 'digitalizado.pdf', scan);
    const second = await waitForDraft(imports, scanned.id);
    assert.equal(second.pages[0].needsOcr, true);
    imports.start(scanned.id, 1);
    const recognized = await waitForDraft(imports, scanned.id);
    assert.match(recognized.pages[0].text, /Cadeia de cust[oó]dia digital/i);
  } finally {
    await Promise.all([...imports.workers.values()].map(worker => worker.terminate()));
    store.db.close();
    rmSync(directory, { recursive: true, force: true });
  }
});

test('extracts PF 2018 questions rather than numbered lines in the supporting material', () => {
  const page = (text: string) => ({ page: 1, text, needsOcr: false });
  const basics = suggestQuestions([page([
    'Texto CB1A1AAA', '1 Primeira linha do texto.', '4 Quarta linha do texto.',
    'No que se refere aos sentidos do texto CB1A1AAA, julgue os itens a seguir.',
    '1 Conclui-se do texto que ...', '2 O exemplo utilizado indica que ...',
  ].join('\n'))], 'pf', 'pf-2018:basico');
  assert.deepEqual(basics.map(item => [item.number, item.prompt, item.supportPages]), [
    [1, 'Conclui-se do texto que ...', [1]], [2, 'O exemplo utilizado indica que ...', [1]],
  ]);
  const specific = suggestQuestions([page([
    '79 Questão sobre laços.', '1 inteiro valor;', '2 início',
    'Tendo como referência o algoritmo precedente, julgue os próximos', 'itens.',
    '80 A instrução na linha 7 do algoritmo contribui para o cálculo.',
  ].join('\n'))], 'pf', 'pf-2018:especifico');
  assert.deepEqual(specific.map(item => item.number), [79, 80]);
  assert.equal(specific[0].prompt, 'Questão sobre laços.');
  assert.deepEqual(specific[1].supportPages, [1]);
});

test('keeps IBFC versions and Cebraspe numbering, blocks and anulations distinct', () => {
  const keys = suggestKeys([{ page: 1, needsOcr: false, text: '51 52 53 0 0\nC X E 0 0' }], 'pf');
  assert.deepEqual(keys.map(row => [row.number, row.key]), [[51, 'C'], [52, 'X'], [53, 'E']]);
  assert.equal(keys[0].block, 'especifico');
  const postAppeal = suggestKeys([
    { page: 1, needsOcr: false, text: 'GABARITO PÓS RECURSO\nPERITO OFICIAL CRIMINAL - ÁREA 3 - VERSÃO B\n41 42\nA *' },
    { page: 2, needsOcr: false, text: 'GABARITO PÓS RECURSO\nPERITO OFICIAL CRIMINAL - ÁREA 4 - VERSÃO B\n41 42\nD E' },
  ], 'pr');
  assert.deepEqual(postAppeal.map(row => [row.page, row.version, row.key]), [[1, 'B', 'A'], [1, 'B', 'X']]);
  const ibfc = suggestQuestions([
    { page: 1, needsOcr: false, text: 'IBFC_03 - VERSÃO A\n41) Exemplo da A\na) Um\nb) Dois\nc) Três\nd) Quatro\ne) Cinco' },
    { page: 2, needsOcr: false, text: 'IBFC_03 - VERSÃO B\n41) Exemplo da B\na) Um\nb) Dois\nc) Três\nd) Quatro\ne) Cinco' },
  ], 'pr');
  assert.deepEqual(ibfc.map(row => [row.number, row.version, row.options.length]), [[41, 'A', 5], [41, 'B', 5]]);
});
