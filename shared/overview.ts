import { historicalExams, subjects } from './exam-history.ts';
export type Block = 'all' | 'basic' | 'specific';
export type Subject = keyof typeof subjects;

export interface HistoricalExam {
  id: string;
  trail: 'pr' | 'pf';
  year: number;
  label: string;
  basic: number;
  total: number;
  sources: { label: string; url: string }[];
  groups: Partial<Record<Subject, string>>;
}

export function itemNumbers(specification: string): number[] {
  return specification.split(' ').flatMap(range => {
    const [first, last = first] = range.split('-').map(Number);
    return Array.from({ length: last - first + 1 }, (_, i) => first + i);
  });
}

export function overview(trail: string, edition: string, block: Block) {
  const exams = historicalExams.filter(exam => exam.trail === trail && (!edition || exam.id === edition));
  const inBlock = (exam: HistoricalExam, number: number) => block === 'all' ||
    (block === 'basic' ? number <= exam.basic : number > exam.basic);
  const totals = exams.map(exam => block === 'all' ? exam.total : block === 'basic' ? exam.basic : exam.total - exam.basic);
  const total = totals.reduce((sum, count) => sum + count, 0);
  const rows = (Object.keys(subjects) as Subject[]).map(subject => {
    const byExam = exams.map((exam, index) => {
      const group = exam.groups[subject];
      const items = group ? itemNumbers(group).filter(number => inBlock(exam, number)) : [];
      return { exam, total: totals[index], items };
    });
    return {
      subject, label: subjects[subject], byExam,
      count: byExam.reduce((sum, item) => sum + item.items.length, 0),
      appearances: byExam.filter(item => item.items.length).length,
    };
  }).filter(row => row.count)
    .sort((a, b) => b.count - a.count || b.appearances - a.appearances || a.label.localeCompare(b.label, 'pt-BR'));
  return { exams, total, rows };
}
