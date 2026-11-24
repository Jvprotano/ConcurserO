import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { Store } from '../server/db.ts';
import { Imports } from '../server/imports.ts';
import { createApp } from '../server/index.ts';
import { questionBank, studyState, answerQuestion, listQuestions } from '../server/study.ts';
import { acervoOverview } from '../shared/acervo-overview.ts';
import type { DraftKey, DraftQuestion } from '../shared/types.ts';
import { isPreliminary, repairQuestionOptions, suggestQuestions } from '../server/parsers.ts';
import { emptyQuestionFilters, filterQuestions, topicFilterId } from '../shared/questions.ts';

test('recognizes preliminary keys with singular and plural official headings', () => {
  for (const text of ['GABARITO PRELIMINAR', 'GABARITO OFICIAL PRELIMINAR', 'GABARITOS OFICIAIS PRELIMINARES']) assert.equal(isPreliminary(text), true);
  assert.equal(isPreliminary('GABARITO OFICIAL DEFINITIVO'), false);
});

test('extracts spaced option markers and recovers older drafts only when all alternatives can be reconstructed', () => {
  const [parsed] = suggestQuestions([{ page: 1, needsOcr: false,
    text: 'IBFC_03 - VERSÃO A\n41) Exemplo\na) Um\nb ) Dois\nc ) Três\nd) Quatro e ) Cinco' }], 'pr');
  assert.deepEqual(parsed.options, Array.from('ABCDE', (key, index) => ({ key, text: ['Um', 'Dois', 'Três', 'Quatro', 'Cinco'][index] })));
  const legacy = { ...parsed, options: [{ key: 'A', text: 'Um' }, { key: 'B', text: 'Dois c ) Três' },
    { key: 'D', text: 'Quatro e ) Cinco' }] };
  assert.deepEqual(repairQuestionOptions(legacy).options, parsed.options);
  assert.equal(repairQuestionOptions(parsed), parsed);
  const incomplete = { ...legacy, options: legacy.options.slice(0, 2) };
  assert.equal(repairQuestionOptions(incomplete), incomplete);
  const empty = { ...legacy, options: [{ key: 'A', text: 'Um' }, { key: 'B', text: 'Dois c ) ' }, { key: 'D', text: 'Quatro e ) Cinco' }] };
  assert.equal(repairQuestionOptions(empty), empty);
});

function fixture() {
  const directory = mkdtempSync(join(tmpdir(), 'concursero-direct-'));
  const store = new Store(directory);
  const imports = new Imports(store);
  const add = (id: string, kind: 'prova' | 'gabarito' | 'edital', pair: string | null = 'pf-2025:especifico', exam: string | null = '01/2025') => {
    store.run(`INSERT INTO imports (id,kind,name,trail_id,hash,status,created,total,pair,exam)
      VALUES (?,?,?,'pf',?,'review',?,1,?,?)`, id, kind, id + '.pdf', id, new Date().toISOString(), pair, exam);
  };
  const row = (patch: Partial<DraftQuestion> = {}): DraftQuestion => ({ page: 1, number: 79, version: 'Única', block: 'especifico',
    prompt: 'Protocolo de rede.', context: '', options: [{ key: 'C', text: 'Certo' }, { key: 'E', text: 'Errado' }], type: 'boolean', ...patch });
  function proof(rows = [row()], id = 'proof', pair: string | null = 'pf-2025:especifico', exam: string | null = '01/2025') {
    add(id, 'prova', pair, exam);
    imports.saveDraft(id, { questions: rows, keys: [], topics: [] });
  }
  function key(rows: Partial<DraftKey>[] = [{}], id = 'key', pair: string | null = 'pf-2025:especifico', exam: string | null = '01/2025') {
    add(id, 'gabarito', pair, exam);
    store.run('UPDATE imports SET total=? WHERE id=?', Math.max(1, ...rows.map(row => row.page ?? 1)), id);
    imports.saveDraft(id, { topics: [], questions: [], keys: rows.map(patch => ({ page: 1, number: 79, version: 'Única', block: 'especifico', key: 'C', ...patch })) });
  }
  return { directory, store, imports, add, proof, key, row, close() { store.db.close(); rmSync(directory, { recursive: true, force: true }); } };
}

test('imported questions appear without a key and immediately feed the analysis; bulk API enables practice', async () => {
  const f = fixture();
  const server = createApp(f.store).listen(0, '127.0.0.1');
  try {
    await once(server, 'listening');
    const address = server.address(); assert.ok(address && typeof address === 'object');
    const base = 'http://127.0.0.1:' + address.port + '/api';
    f.proof();
    let bank = questionBank(f.store, 'pf');
    const imported = bank.questions.find(row => row.importId === 'proof')!;
    assert.equal(imported.status, 'pending');
    assert.match(imported.pendingReason!, /Gabarito pendente/);
    assert.equal(imported.topicTitle, 'Redes e protocolos');
    const filters = { ...emptyQuestionFilters, topicIds: [topicFilterId(imported.discipline, imported.topicTitle)] };
    assert.equal(filterQuestions(bank.questions, filters, []).length, 1);
    assert.equal(acervoOverview(bank.questions, '', 'all').total, 1);
    assert.equal(acervoOverview(bank.questions, '', 'specific').rows[0].label, 'Redes e protocolos');
    assert.throws(() => answerQuestion(f.store, imported.id, { id: 'pending-answer', revision: 1, answer: 'C', guess: false }), /inexistente/);
    assert.equal(studyState(f.store).attempts.length, 0);
    f.key();
    const response = await fetch(base + '/imports/proof/save-all', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ requestId: 'all' }) });
    assert.equal(response.status, 200);
    assert.equal((await response.json()).published, 1);
    bank = questionBank(f.store, 'pf');
    const saved = bank.questions.find(row => row.source?.id === 'proof')!;
    assert.equal(saved.status, 'ready');
    assert.equal(bank.questions.filter(row => row.exam !== 'demo').length, 1);
    assert.equal(bank.drafts.length, 0);
    assert.equal(filterQuestions(bank.questions, filters, []).length, 1);
    assert.equal(acervoOverview(bank.questions, '', 'all').total, 1);
    assert.equal(Object.hasOwn(saved, 'key'), false);
    assert.equal(answerQuestion(f.store, saved.id, { id: 'answer', revision: 1, answer: 'C', guess: false }).correct, true);
    const revisions = f.store.get<{ n: number }>('SELECT count(*) AS n FROM question_revisions')!.n;
    assert.equal(f.imports.saveAll('proof', { requestId: 'again' }).published, 1);
    assert.equal(f.imports.saveAll('proof', { requestId: 'all' }).published, 1);
    assert.equal(f.store.get<{ n: number }>('SELECT count(*) AS n FROM question_revisions')!.n, revisions);
    assert.equal(studyState(f.store).attempts.length, 1);
  } finally { await new Promise<void>(resolve => server.close(() => resolve())); f.close(); }
});

test('missing and mismatched keys cannot be applied in bulk and do not create topics', () => {
  const f = fixture();
  try {
    f.proof();
    const before = studyState(f.store).topics.length;
    assert.throws(() => f.imports.saveAll('proof', { requestId: 'none' }), /gabarito do mesmo concurso/);
    f.key([{}], 'old', 'pf-2018:especifico', '01/2018');
    f.key([{}], 'basic', 'pf-2025:basico');
    for (const keyId of ['old', 'basic']) assert.throws(() => f.imports.saveAll('proof', { requestId: keyId, keyId }), /mesmo concurso e bloco/);
    assert.equal(studyState(f.store).topics.length, before);
    assert.equal(questionBank(f.store, 'pf').questions.find(row => row.importId)?.status, 'pending');
  } finally { f.close(); }
});

test('already imported preliminary key enables bulk API correction and a final key preserves earlier feedback', async () => {
  const f = fixture();
  const server = createApp(f.store).listen(0, '127.0.0.1');
  try {
    await once(server, 'listening');
    const address = server.address(); assert.ok(address && typeof address === 'object');
    f.proof(); f.key();
    f.store.run("INSERT INTO pages (import_id,page,text,needs_ocr) VALUES ('key',1,'GABARITOS OFICIAIS PRELIMINARES',0)");
    f.store.run("UPDATE imports SET message='As páginas do cargo trazem o gabarito preliminar. A correção exige o pós-recurso.' WHERE id='key'");
    const summary = questionBank(f.store, 'pf').drafts[0];
    assert.equal(summary.hasKey, true);
    assert.equal(summary.keyId, 'key');
    assert.equal(summary.keys[0].preliminary, true);
    assert.match(f.imports.detail('key').job.message, /disponível para correção/);
    const response = await fetch('http://127.0.0.1:' + address.port + '/api/imports/proof/save-all', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ requestId: 'preliminary' }),
    });
    assert.equal(response.status, 200);
    const result = await response.json();
    assert.equal(result.published, 1);
    assert.deepEqual(result.pending, []);
    const saved = questionBank(f.store, 'pf').questions.find(row => row.source?.id === 'proof')!;
    assert.equal(saved.keyPreliminary, true);
    assert.equal(listQuestions(f.store, saved.topicId).find(row => row.id === saved.id)?.keyPreliminary, true);
    const first = answerQuestion(f.store, saved.id, { id: 'prelim-answer', revision: 1, answer: 'C', guess: false });
    assert.equal(first.correct, true);
    assert.equal(first.keyPreliminary, true);
    assert.deepEqual(first.keySource, { id: 'key', page: 1 });
    f.imports.saveAll('proof', { requestId: 'repeat' });
    assert.equal(questionBank(f.store, 'pf').questions.find(row => row.id === saved.id)?.revision, 1);
    f.key([{ key: 'E' }], 'final');
    f.store.run("INSERT INTO pages (import_id,page,text,needs_ocr) VALUES ('final',1,'GABARITO DEFINITIVO',0)");
    f.imports.saveAll('proof', { requestId: 'final-save', keyId: 'final' });
    const revised = questionBank(f.store, 'pf').questions.find(row => row.id === saved.id)!;
    assert.equal(revised.revision, 2);
    assert.equal(revised.keyPreliminary, false);
    const second = answerQuestion(f.store, revised.id, { id: 'final-answer', revision: 2, answer: 'C', guess: false });
    assert.equal(second.correct, false);
    assert.equal(second.keyPreliminary, false);
    assert.deepEqual(studyState(f.store).attempts.find(row => row.id === first.id)?.keySource, { id: 'key', page: 1 });
    assert.equal(studyState(f.store).attempts.find(row => row.id === first.id)?.keyPreliminary, true);
    assert.equal(studyState(f.store).attempts.find(row => row.id === first.id)?.correct, true);
    assert.equal(questionBank(f.store, 'pf').questions.filter(row => row.source?.id === 'proof').length, 1);
  } finally { await new Promise<void>(resolve => server.close(() => resolve())); f.close(); }
});

test('mixed PDF uses the status of each matching answer page and rejects version mismatch and ambiguous answers', () => {
  const f = fixture();
  try {
    f.proof([f.row(), f.row({ number: 80 }), f.row({ number: 81 })]);
    f.key([{}, { number: 80, page: 2 }, { number: 81, key: 'X' }]);
    f.store.run("UPDATE imports SET total=2 WHERE id='key'");
    f.store.run("INSERT INTO pages (import_id,page,text,needs_ocr) VALUES ('key',1,'GABARITO PRELIMINAR',0),('key',2,'GABARITO PÓS RECURSO',0)");
    assert.equal(f.imports.saveAll('proof', { requestId: 'mixed' }).published, 3);
    const saved = questionBank(f.store, 'pf').questions.filter(row => row.source?.id === 'proof');
    assert.equal(saved.find(row => row.number === 79)?.keyPreliminary, true);
    assert.equal(saved.find(row => row.number === 80)?.keyPreliminary, false);
    assert.equal(saved.find(row => row.number === 81)?.status, 'annulled');
    f.proof([f.row()], 'other-proof', null, null);
    f.key([{ version: 'B' }], 'wrong-version', null, null);
    assert.equal(f.imports.detail('other-proof').availability?.hasKey, false);
    assert.throws(() => f.imports.saveAll('other-proof', { requestId: 'wrong', keyId: 'wrong-version' }), /versão do caderno/);
    f.key([{}, {}], 'ambiguous', null, null);
    assert.equal(f.imports.saveAll('other-proof', { requestId: 'ambiguous', keyId: 'ambiguous' }).published, 0);
    assert.equal(studyState(f.store).attempts.length, 0);
  } finally { f.close(); }
});

test('preliminary pages for another version do not label the selected final answers as preliminary', () => {
  const f = fixture();
  try {
    f.proof();
    f.key([{}, { page: 2, version: 'B' }]);
    f.store.run("UPDATE imports SET total=2 WHERE id='key'");
    f.store.run("INSERT INTO pages (import_id,page,text,needs_ocr) VALUES ('key',1,'GABARITO DEFINITIVO',0),('key',2,'GABARITO PRELIMINAR',0)");
    assert.equal(f.imports.detail('proof').availability?.keys[0].preliminary, false);
    assert.equal(f.imports.saveAll('proof', { requestId: 'final-page' }).published, 1);
    assert.equal(questionBank(f.store, 'pf').questions.find(row => row.source?.id === 'proof')?.keyPreliminary, false);
  } finally { f.close(); }
});

test('v5 migration preserves saved questions and attempts and records preliminary status in a new revision', () => {
  const f = fixture();
  try {
    f.proof(); f.key();
    f.imports.saveAll('proof', { requestId: 'before-migration' });
    const saved = questionBank(f.store, 'pf').questions.find(row => row.source?.id === 'proof')!;
    answerQuestion(f.store, saved.id, { id: 'old-answer', revision: 1, answer: 'C', guess: false });
    const before = studyState(f.store);
    const view = f.store.get<{ sql: string }>("SELECT sql FROM sqlite_master WHERE name='current_questions'")!.sql;
    f.store.db.exec("DROP TABLE summaries; DELETE FROM settings WHERE key='summaryBackup'; " +
      'DROP TABLE study_sessions; DROP TABLE study_cycles; DROP TABLE study_pdf_links; DROP TABLE study_pdfs; ' +
      'ALTER TABLE cards DROP COLUMN gran_attempt_id; DROP TABLE gran_attempts; DROP TABLE gran_saved_questions; ' +
      'DROP VIEW current_questions; ' + view.replace(',r.key_preliminary', '') + '; ALTER TABLE question_revisions DROP COLUMN key_preliminary; PRAGMA user_version=5;');
    const migrated = new Store(f.directory);
    try {
      assert.equal(migrated.get<{ user_version: number }>('PRAGMA user_version')?.user_version, 10);
      assert.deepEqual(studyState(migrated).attempts, before.attempts);
      assert.deepEqual(studyState(migrated).cards, before.cards);
      migrated.run("INSERT INTO pages (import_id,page,text,needs_ocr) VALUES ('key',1,'GABARITO PRELIMINAR',0)");
      new Imports(migrated).saveAll('proof', { requestId: 'after-migration' });
      const revised = questionBank(migrated, 'pf').questions.find(row => row.id === saved.id)!;
      assert.equal(revised.revision, 2);
      assert.equal(revised.keyPreliminary, true);
      assert.equal(studyState(migrated).attempts.find(row => row.id === 'old-answer')?.keyPreliminary, false);
    } finally { migrated.db.close(); }
  } finally { f.close(); }
});

test('already imported PR questions with joined spaced markers become answerable without reimporting or editing', () => {
  const f = fixture();
  try {
    f.proof([f.row({ number: 41, version: 'A', type: 'choice', options: [
      { key: 'A', text: 'Primeira' }, { key: 'B', text: 'Segunda c ) Terceira' },
      { key: 'D', text: 'Quarta e ) Quinta' },
    ] })]);
    f.key([{ number: 41, version: 'A', key: 'C' }]);
    f.store.run("UPDATE imports SET trail_id='pr',pair=NULL,exam=NULL WHERE id IN ('proof','key')");
    f.store.run("INSERT INTO pages (import_id,page,text,needs_ocr) VALUES ('key',1,'GABARITO PRELIMINAR',0)");
    assert.equal(f.imports.detail('proof').draft.questions[0].options.length, 5);
    const result = f.imports.saveAll('proof', { requestId: 'recover', keyId: 'key' });
    assert.equal(result.published, 1);
    assert.deepEqual(result.pending, []);
    const saved = questionBank(f.store, 'pr').questions.find(row => row.source?.id === 'proof')!;
    assert.equal(saved.options[2].text, 'Terceira');
    assert.equal(answerQuestion(f.store, saved.id, { id: 'recovered-answer', revision: 1, answer: 'C', guess: false }).correct, true);
    assert.equal(JSON.parse(f.imports.job('proof').draft!).questions[0].options.length, 3);
  } finally { f.close(); }
});

test('bulk save preserves valid items, annulled items and visible unresolved items', () => {
  const f = fixture();
  try {
    f.proof([f.row(), f.row({ number: 80, needsSupport: true }), f.row({ number: 81 })]);
    f.key([{}, { number: 80 }, { number: 81, key: 'X' }]);
    const result = f.imports.saveAll('proof', { requestId: 'partial' });
    assert.equal(result.published, 2);
    assert.equal(result.pending.length, 1);
    const bank = questionBank(f.store, 'pf');
    assert.equal(bank.questions.filter(row => row.exam !== 'demo').length, 3);
    assert.match(bank.questions.find(row => row.number === 80)?.pendingReason!, /Página de apoio pendente/);
    const annulled = bank.questions.find(row => row.number === 81)!;
    assert.equal(annulled.status, 'annulled');
    assert.throws(() => answerQuestion(f.store, annulled.id, { id: 'no', revision: 1, answer: 'C', guess: false }), /anulada/);
    assert.equal(acervoOverview(bank.questions, '', 'all').total, 3);
  } finally { f.close(); }
});

test('analysis deduplicates repeated imports and alternative versions and handles new uncatalogued exams', () => {
  const f = fixture();
  try {
    f.proof([f.row(), f.row({ version: 'A' }), f.row({ version: 'B' })]);
    f.proof([f.row()], 'copy');
    f.proof([f.row()], 'new', 'pf-2027:especifico', '01/2027');
    const bank = questionBank(f.store, 'pf');
    const result = acervoOverview(bank.questions, '', 'all');
    assert.equal(result.total, 2);
    assert.equal(result.exams.length, 2);
    assert.equal(result.rows.reduce((sum, row) => sum + row.count, 0), result.total);
    assert.equal(acervoOverview(bank.questions, '01/2027', 'basic').total, 0);
    assert.equal(acervoOverview(bank.questions, '01/2027', 'specific').rows[0].label, 'A classificar');
  } finally { f.close(); }
});

test('uncatalogued manual PDFs require choosing a key once and do not inherit the 2025 identity', () => {
  const f = fixture();
  try {
    f.proof([f.row()], 'manual', null, null);
    f.store.run("UPDATE imports SET name='Prova avulsa 2025.pdf' WHERE id='manual'");
    f.key([{}], 'manual-key', null, null);
    assert.equal(questionBank(f.store, 'pf').drafts[0].keyId, undefined);
    assert.throws(() => f.imports.saveAll('manual', { requestId: 'auto' }), /gabarito do mesmo concurso/);
    const result = f.imports.saveAll('manual', { requestId: 'explicit', keyId: 'manual-key' });
    assert.equal(result.published, 1);
    const saved = questionBank(f.store, 'pf').questions.find(row => row.source?.id === 'manual')!;
    assert.equal(saved.exam, 'import:manual');
    assert.equal(saved.topicTitle, 'A classificar');
  } finally { f.close(); }
});

test('saving all again preserves a manually assigned topic and correction comment', () => {
  const f = fixture();
  try {
    f.proof(); f.key();
    f.imports.publish('proof', { requestId: 'manual', editionId: 'pf-referencia', keyId: 'key', confirmed: true,
      selected: [{ index: 0, topicId: 'pf-demo-0', comment: 'Meu comentário revisado' }] });
    const before = f.store.get<{ n: number }>('SELECT count(*) AS n FROM question_revisions')!.n;
    f.imports.saveAll('proof', { requestId: 'bulk' });
    const saved = questionBank(f.store, 'pf').questions.find(row => row.source?.id === 'proof')!;
    assert.equal(saved.topicId, 'pf-demo-0');
    assert.equal(f.store.get<{ n: number }>('SELECT count(*) AS n FROM question_revisions')!.n, before);
  } finally { f.close(); }
});

test('edital topics can be saved together and repeated saves do not duplicate topics', () => {
  const f = fixture();
  try {
    f.add('edital', 'edital');
    f.imports.saveDraft('edital', { topics: [{ page: 1, discipline: 'Informática', title: 'Redes' },
      { page: 1, discipline: 'Informática', title: 'Banco de dados' }], questions: [], keys: [] });
    assert.equal(f.imports.saveAll('edital', { requestId: 'topics' }).published, 2);
    const count = studyState(f.store).topics.length;
    assert.equal(f.imports.saveAll('edital', { requestId: 'topics-again' }).published, 2);
    assert.equal(studyState(f.store).topics.length, count);
    assert.equal(studyState(f.store).topics.filter(topic => topic.source?.id === 'edital').length, 2);
  } finally { f.close(); }
});
