import assert from 'node:assert/strict';
import test from 'node:test';
import { historicalExams } from '../shared/exam-history.ts';
import { referenceTheme, analysisVersion, fingerprintVersion } from '../shared/theme-catalog.ts';
import { contestDisciplines, normalizeDisciplineName } from '../shared/contest-taxonomy.ts';
import { historicalFocus, focusSelection, importedFocus } from '../shared/focus-overview.ts';
import { emptyQuestionFilters, filterQuestions, questionDiscipline } from '../shared/questions.ts';
import type { BankQuestion } from '../shared/types.ts';

test('all historical questions have a canonical contest hierarchy, separate from exam block and original categories', () => {
  for (const exam of historicalExams) for (let number = 1; number <= exam.total; number++) {
    const path = referenceTheme(exam.id, number)!;
    assert.ok(path, exam.id + ':' + number);
    assert.equal(path.discipline, contestDisciplines[path.disciplineId]);
    assert.ok(path.topicId.startsWith(path.disciplineId + '/'));
    assert.ok(path.id.startsWith(path.topicId + '/'));
    assert.ok(path.topic && path.label);
    assert.equal(path.version, analysisVersion);
  }
  assert.notEqual(analysisVersion, fingerprintVersion);
  assert.equal(referenceTheme('pf-2018', 118)!.discipline, 'Segurança da Informação');
  assert.equal(referenceTheme('pf-2018', 118)!.topic, 'Criptografia');
  assert.equal(referenceTheme('pf-2025', 107)!.discipline, 'Criminalística');
  assert.equal(referenceTheme('pf-2025', 107)!.topic, 'Computação Forense');
  assert.equal(referenceTheme('pr-2024', 5)!.discipline, 'Direito Processual Penal');
  assert.equal(referenceTheme('pr-2024', 8)!.discipline, 'Direito Penal');
  assert.equal(normalizeDisciplineName('LÍNGUA PORTUGUESA'), 'Português');
  assert.equal(normalizeDisciplineName('Direito Empresarial (Comercial)'), 'Direito Empresarial');
});

test('primary discipline distributions agree with the two supplied public market references', () => {
  // Independent local mapping checked against the public exam summaries, 2026-11-11.
  const counts = (trail: string, exam: string) => Object.fromEntries(historicalFocus(trail, exam, 'all', '', '', 'discipline')
    .rows.map(row => [row.label, row.count]));
  assert.deepEqual(counts('pr', 'pr-2024'), {
    'Criminalística': 39, 'Legislação Estadual': 8, 'Noções de Informática': 5, 'Raciocínio Lógico': 5,
    'Direito Penal': 4, 'Direito Processual Penal': 3, 'Legislação Federal': 3, 'Português': 3,
    'Direito Digital': 1, 'Direito Empresarial': 1, 'Direito Previdenciário': 1, 'Legislação de Trânsito': 1,
    'Medicina Legal': 1, 'Redação Oficial': 1, 'Redes de Computadores': 1, 'Segurança da Informação': 1,
    'Segurança Pública': 1, 'Sistemas Operacionais': 1,
  });
  assert.deepEqual(counts('pf', 'pf-2025'), {
    'Criminalística': 18, 'Segurança da Informação': 14, 'Banco de Dados': 13, 'Sistemas Operacionais': 10,
    'Redes de Computadores': 9, 'Português': 8, 'Programação': 7, 'Direitos Humanos': 6,
    'Direito Administrativo': 5, 'Raciocínio Lógico': 5, 'Direito Constitucional': 4, 'Direito Processual Penal': 4,
    'Noções de Informática': 4, 'Redação Oficial': 4, 'Engenharia de Software': 3,
    'Algoritmos e Estrutura de Dados': 2, 'Direito Penal': 2, 'Arquitetura de Computadores': 1, 'Direito Digital': 1,
  });
});

test('hierarchy levels conserve unique totals and compose with edition, block and subject filters', () => {
  for (const level of ['discipline', 'topic', 'subtopic'] as const) {
    const result = historicalFocus('pf', '', 'all', '', '', level);
    assert.equal(result.total, 240);
    assert.equal(result.classified, 240);
    assert.equal(result.rows.reduce((sum, row) => sum + row.count, 0), 240);
    assert.ok(Math.abs(result.rows.reduce((sum, row) => sum + row.share, 0) - 1) < 1e-12);
  }
  const discipline = historicalFocus('pf', 'pf-2025', 'specific', 'Segurança da Informação', '', 'topic');
  assert.ok(discipline.rows.some(row => row.label === 'Criptografia'));
  const topicId = referenceTheme('pf-2025', 94)!.topicId;
  const children = historicalFocus('pf', 'pf-2025', 'specific', 'Segurança da Informação', topicId);
  assert.ok(children.rows.length > 1);
  assert.equal(children.rows.reduce((sum, row) => sum + row.count, 0), children.total);
  assert.equal(children.total, discipline.rows.find(row => row.id === topicId)!.count);
});

test('overview selections reproduce the same question sets in the question bank at every hierarchy level', () => {
  const exam = historicalExams.find(row => row.id === 'pf-2025')!;
  const questions: BankQuestion[] = Array.from({ length: exam.total }, (_, i) => ({
    id: 'q' + (i + 1), number: i + 1, exam: exam.id, examLabel: exam.label, revision: 1,
    block: i < exam.basic ? 'basico' : 'especifico', version: 'Única', type: 'boolean',
    prompt: 'Conteúdo revisado', context: '', options: [], status: 'pending', supportPages: [],
    // User-owned links intentionally differ from the canonical hierarchy.
    discipline: 'Minha disciplina', topicTitle: 'Meu tópico', topicId: 'personal', editionId: 'e', editionTitle: 'e',
    analysis: referenceTheme(exam.id, i + 1),
  }));
  const original = structuredClone(questions);
  for (const level of ['discipline', 'topic', 'subtopic'] as const) {
    const result = importedFocus(questions, exam.id, 'specific', '', '', level);
    for (const row of result.rows) {
      const selection = focusSelection(row, level, exam.id, 'specific');
      const matched = filterQuestions(questions, { ...emptyQuestionFilters, ...selection }, []);
      assert.deepEqual(matched.map(row => row.number).sort((a, b) => a - b),
        row.byExam.flatMap(row => row.items.map(item => item.number)).sort((a, b) => a - b));
      assert.ok(matched.every(question => questionDiscipline(question) === row.area));
    }
  }
  assert.deepEqual(questions, original);
  assert.equal(filterQuestions(questions, { ...emptyQuestionFilters, topicIds: ['personal'] }, []).length, 120);
});
