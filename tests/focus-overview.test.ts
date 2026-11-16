import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { historicalExams } from '../shared/exam-history.ts';
import { itemNumbers } from '../shared/overview.ts';
import { examThemes, referenceTheme } from '../shared/theme-catalog.ts';
import { focusOverview, historicalFocus, importedFocus, uniqueAnalysisQuestions } from '../shared/focus-overview.ts';
import type { AnalysisItem } from '../shared/focus-overview.ts';
import { emptyQuestionFilters, filterQuestions } from '../shared/questions.ts';
import type { BankQuestion, DraftQuestion } from '../shared/types.ts';
import { Store } from '../server/db.ts';
import { Imports } from '../server/imports.ts';
import { answerQuestion, questionBank, studyState } from '../server/study.ts';

const reviewed = JSON.parse(readFileSync(new URL('./fixtures/theme-questions.json', import.meta.url), 'utf8')) as DraftQuestion[];

test('all 410 historical items have exactly one specific theme and a source PDF page', () => {
  let total = 0;
  for (const exam of historicalExams) {
    assert.deepEqual(examThemes[exam.id].flatMap(([, range]) => itemNumbers(range)).sort((a, b) => a - b),
      Array.from({ length: exam.total }, (_, i) => i + 1));
    const result = historicalFocus(exam.trail, exam.id, 'all');
    assert.equal(result.classified, exam.total);
    assert.equal(result.rows.reduce((sum, row) => sum + row.count, 0), exam.total);
    for (const row of result.rows) {
      assert.notEqual(row.label, row.area);
      for (const entry of row.byExam) for (const item of entry.items) {
        assert.ok(item.referenceSource!.page > 0);
        assert.match(item.referenceSource!.url, /^https:\/\//);
      }
    }
    total += result.total;
  }
  assert.equal(total, 410);
  const portuguese = historicalFocus('pf', '', 'basic', 'Língua Portuguesa');
  assert.ok(portuguese.rows.length >= 7);
  assert.equal(portuguese.rows[0].label, 'Interpretação e inferência textual');
  assert.equal(portuguese.rows[0].count, 6);
  assert.equal(portuguese.rows[0].appearances, 2);
  assert.equal(referenceTheme('pr-2024', 41)!.id, referenceTheme('pf-2025', 107)!.id);
});

const themeA = referenceTheme('pr-2024', 1)!;
const themeB = referenceTheme('pr-2024', 4)!;
function item(exam: string, number: number, theme?: AnalysisItem['theme'], area = themeA.area): AnalysisItem {
  return { exam, examLabel: exam, number, block: 'basico', area, theme };
}

test('focus gives each exam equal weight, includes absences and unclassified items in denominators', () => {
  const items = [
    ...Array.from({ length: 10 }, (_, i) => item('small', i + 1, i < 5 ? themeA : undefined)),
    ...Array.from({ length: 100 }, (_, i) => item('large', i + 1, i < 10 ? themeB : undefined)),
  ];
  const original = structuredClone(items);
  const result = focusOverview(items, '', 'basic');
  assert.equal(result.rows[0].id, themeA.id); // 5 items beat 10: (5/10 + 0/100) / 2.
  assert.equal(result.rows[0].share, .25);
  assert.equal(result.rows[1].share, .05);
  assert.equal(result.pending.length, 95);
  assert.equal(result.classified, 15);
  assert.equal(result.total, 110);
  assert.equal(result.rows[0].byExam[1].items.length, 0);
  assert.deepEqual(items, original);
  assert.equal(focusOverview(items, 'small', 'basic').rows[0].share, .5);
  assert.equal(focusOverview(items, '', 'specific').total, 0);
  assert.equal(focusOverview(items, '', 'basic', 'Área inexistente').total, 0);
});

test('area filters recompute the sample and recurrence breaks equal mean shares', () => {
  const result = focusOverview([
    item('one', 1, themeA), item('one', 2, themeA), item('one', 3), item('one', 4),
    item('two', 1, themeB), item('two', 2, themeB), item('two', 3, themeB), item('two', 4, themeB),
    item('two', 5, themeA), item('two', 6, themeA), item('two', 7), item('two', 8),
    item('one', 5, referenceTheme('pr-2024', 14), 'Lógica'),
  ], '', 'all', themeA.area);
  assert.equal(result.total, 12);
  assert.equal(result.rows[0].share, .375);
  assert.equal(result.rows[1].share, .25);
  const tied = focusOverview([item('one', 1, themeA), item('one', 2, themeB), item('one', 3, themeB), item('one', 4),
    item('two', 1, themeA), item('two', 2), item('two', 3), item('two', 4)], '', 'all');
  assert.equal(tied.rows[0].share, tied.rows[1].share);
  assert.equal(tied.rows[0].id, themeA.id);
  assert.equal(tied.rows[0].appearances, 2);
});

function bankQuestion(patch: Partial<BankQuestion> = {}): BankQuestion {
  return { ...reviewed[0], id: 'q', exam: '002/2024', revision: 1, topicId: 'manual',
    status: 'pending', discipline: 'Língua Portuguesa', topicTitle: 'Língua Portuguesa',
    editionId: '', editionTitle: '', supportPages: [], ...patch };
}

test('analysis chooses one whole version, excludes demo and prefers saved revisions without duplicating imports', () => {
  const questions = [bankQuestion({ id: 'a', number: 1, version: 'A', analysis: themeA }),
    bankQuestion({ id: 'b', number: 2, version: 'B' }),
    bankQuestion({ id: 'saved', number: 1, version: 'A', status: 'ready' }),
    bankQuestion({ id: 'demo', exam: 'demo' })];
  const original = structuredClone(questions);
  assert.deepEqual(uniqueAnalysisQuestions(questions).map(row => row.id), ['saved']);
  assert.equal(importedFocus(questions, '', 'all').total, 1);
  assert.equal(importedFocus(questions, '', 'all').pending.length, 1);
  assert.deepEqual(questions, original);
  assert.equal(importedFocus([], '', 'all').rows.length, 0);
});

test('reviewed content is detailed before and after bulk save without changing attempts or personal topics', () => {
  const directory = mkdtempSync(join(tmpdir(), 'concursero-themes-'));
  const store = new Store(directory);
  const imports = new Imports(store);
  try {
    const add = (id: string, kind: string) => store.run(`INSERT INTO imports
      (id,kind,name,trail_id,hash,status,created,total,pair,exam)
      VALUES (?,?,?,'pr',?,'review',?,30,'pr-2024:basico','002/2024')`, id, kind, id, id, new Date().toISOString());
    add('proof', 'prova');
    imports.saveDraft('proof', { topics: [], keys: [], questions: reviewed });
    const before = questionBank(store, 'pr').questions.filter(row => row.exam !== 'demo');
    assert.equal(before.length, 2);
    assert.equal(before[0].status, 'pending');
    assert.deepEqual(new Set(before.map(row => row.analysis?.label)), new Set(['Ortografia e emprego dos porquês', 'Colocação pronominal']));
    assert.equal(importedFocus(before, '', 'all').classified, 2);
    assert.equal(studyState(store).attempts.length, 0);
    const source = store.get<{ draft: string }>('SELECT draft FROM imports WHERE id=?', 'proof')!.draft;
    assert.equal(JSON.stringify(JSON.parse(source).questions), JSON.stringify(reviewed));
    add('key', 'gabarito');
    imports.saveDraft('key', { topics: [], questions: [], keys: reviewed.map(row => ({
      page: row.page, number: row.number, version: row.version, block: row.block, key: 'E',
    })) });
    imports.publish('proof', { requestId: 'manual', keyId: 'key', editionId: 'pr-referencia', confirmed: true,
      selected: [{ index: 0, topicId: 'pr-demo-0', comment: 'Vínculo pessoal preservado' }] });
    imports.saveAll('proof', { requestId: 'all' });
    const saved = questionBank(store, 'pr').questions.filter(row => row.exam !== 'demo');
    const first = saved.find(row => row.number === 1)!;
    assert.equal(first.topicId, 'pr-demo-0');
    assert.equal(first.analysis!.id, themeA.id);
    assert.equal(saved.find(row => row.number === 4)!.discipline, 'Português');
    assert.equal(saved.find(row => row.number === 4)!.topicTitle, 'Colocação pronominal');
    assert.equal(importedFocus(saved, '', 'all').classified, 2);
    assert.equal(Object.hasOwn(first, 'key'), false);
    answerQuestion(store, first.id, { id: 'attempt', revision: first.revision, answer: 'E', guess: false });
    const attempts = studyState(store).attempts;
    imports.saveAll('proof', { requestId: 'again' });
    assert.deepEqual(studyState(store).attempts, attempts);
    const selected = filterQuestions(saved, { ...emptyQuestionFilters, themeId: first.analysis!.id,
      exam: first.exam, block: 'basico' }, attempts);
    assert.deepEqual(selected.map(row => row.id), [first.id]);
    assert.equal(filterQuestions(saved, { ...emptyQuestionFilters, themeId: first.analysis!.id, block: 'especifico' }, attempts).length, 0);
    assert.equal(filterQuestions(saved, emptyQuestionFilters, attempts).length, 2);
    imports.saveDraft('proof', { topics: [], keys: [], questions: reviewed.map(row => ({ ...row,
      prompt: row.number === 1 ? 'Novo conteúdo sem classificação revisada.' : row.prompt })) });
    imports.saveAll('proof', { requestId: 'edited' });
    const edited = questionBank(store, 'pr').questions.find(row => row.id === first.id)!;
    assert.equal(edited.analysis, undefined);
    assert.equal(edited.topicId, first.topicId);
    assert.deepEqual(studyState(store).attempts, attempts);
  } finally { store.db.close(); rmSync(directory, { recursive: true, force: true }); }
});

test('a known item number and a matching file name do not classify unseen content', () => {
  const directory = mkdtempSync(join(tmpdir(), 'concursero-themes-unseen-'));
  const store = new Store(directory);
  const imports = new Imports(store);
  try {
    store.run(`INSERT INTO imports (id,kind,name,trail_id,hash,status,created,total)
      VALUES ('unknown','prova','PR 2024 Área 3.pdf','pr','unknown','review',?,30)`, new Date().toISOString());
    imports.saveDraft('unknown', { topics: [], keys: [], questions: reviewed });
    assert.equal(questionBank(store, 'pr').questions.find(row => row.importId === 'unknown')!.analysis, undefined);
    store.run("UPDATE imports SET pair='pr-2024:basico',exam='002/2024' WHERE id='unknown'");
    imports.saveDraft('unknown', { topics: [], keys: [], questions: [{ ...reviewed[0], context: 'Contexto substituído.' }] });
    assert.equal(questionBank(store, 'pr').questions.find(row => row.importId === 'unknown')!.analysis, undefined);
  } finally { store.db.close(); rmSync(directory, { recursive: true, force: true }); }
});
