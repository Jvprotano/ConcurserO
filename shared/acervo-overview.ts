import type { BankQuestion } from './types.ts';
import type { Block } from './overview.ts';
import { uniqueAnalysisQuestions } from './focus-overview.ts';

export function acervoOverview(questions: BankQuestion[], edition: string, block: Block) {
  const all = uniqueAnalysisQuestions(questions);
  const editions = [...new Map(all.map(row => [row.exam, { id: row.exam, label: row.examLabel || row.exam }])).values()];
  const selected = all.filter(row => (!edition || row.exam === edition) && (block === 'all' ||
    row.block === (block === 'basic' ? 'basico' : 'especifico')));
  const exams = editions.filter(exam => selected.some(row => row.exam === exam.id));
  const labels = [...new Set(selected.map(row => row.topicTitle))];
  const rows = labels.map(label => {
    const byExam = exams.map(exam => {
      const items = selected.filter(row => row.exam === exam.id);
      return { exam, total: items.length, items: items.filter(row => row.topicTitle === label).map(row => row.number).sort((a, b) => a - b) };
    });
    return { label, count: byExam.reduce((sum, row) => sum + row.items.length, 0), byExam,
      appearances: byExam.filter(row => row.items.length).length };
  }).sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, 'pt-BR'));
  return { editions, exams, rows, total: selected.length,
    pending: selected.filter(row => row.status === 'pending').length };
}
