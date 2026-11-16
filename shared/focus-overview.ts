import { historicalExams } from './exam-history.ts';
import type { Block } from './overview.ts';
import type { BankQuestion } from './types.ts';
import { referenceTheme, type ThemeClassification } from './theme-catalog.ts';
import { referencePages } from './reference-pages.ts';
import { normalizeDisciplineName } from './contest-taxonomy.ts';

export type FocusLevel = 'discipline' | 'topic' | 'subtopic';
export interface FocusSelection { themeId: string; discipline?: string; syllabusTopicId?: string; exam: string; block: string; trailId?: string }

export interface AnalysisItem {
  exam: string;
  examLabel: string;
  number: number;
  block: string;
  area: string;
  theme?: ThemeClassification;
  source?: { id: string; page: number };
  referenceSource?: { url: string; page: number };
}

// Pick a single caderno for the entire block; never fill its gaps with another version.
export function uniqueAnalysisQuestions(questions: BankQuestion[]) {
  const versionRank = (value: string) => value === 'A' || value === 'Única' ? 0 : value === 'B' ? 1 : 2;
  const ordered = questions.filter(row => row.exam !== 'demo').slice().sort((a, b) =>
    versionRank(a.version) - versionRank(b.version) || a.version.localeCompare(b.version, 'pt-BR') ||
    Number(a.status === 'pending') - Number(b.status === 'pending') || b.revision - a.revision || a.id.localeCompare(b.id));
  const versions = new Map<string, string>();
  const unique = new Map<string, BankQuestion>();
  for (const question of ordered) {
    const group = JSON.stringify([question.trailId, question.exam, question.block]);
    if (!versions.has(group)) versions.set(group, question.version);
    if (versions.get(group) !== question.version) continue;
    const key = JSON.stringify([question.trailId, question.exam, question.block, question.number]);
    if (!unique.has(key)) unique.set(key, question);
  }
  return [...unique.values()];
}

export function focusOverview(items: AnalysisItem[], edition: string, block: Block, area = '', topicId = '', level: FocusLevel = 'subtopic') {
  const editions = [...new Map(items.map(row => [row.exam, { id: row.exam, label: row.examLabel }])).values()];
  const base = items.filter(row => (!edition || row.exam === edition) && (block === 'all' ||
    row.block === (block === 'basic' ? 'basico' : 'especifico')));
  const exams = editions.filter(exam => base.some(row => row.exam === exam.id));
  const areas = [...new Set(base.map(row => normalizeDisciplineName(row.area)))].sort((a, b) => a.localeCompare(b, 'pt-BR'));
  const inDiscipline = base.filter(row => !area || normalizeDisciplineName(row.area) === normalizeDisciplineName(area));
  const topics = [...new Map(inDiscipline.filter(row => row.theme).map(row => [row.theme!.topicId,
    { id: row.theme!.topicId, label: row.theme!.topic, discipline: row.theme!.discipline }])).values()]
    .sort((a, b) => a.label.localeCompare(b.label, 'pt-BR') || a.discipline.localeCompare(b.discipline, 'pt-BR'));
  const selected = inDiscipline.filter(row => !topicId || row.theme?.topicId === topicId);
  const classified = selected.filter(row => row.theme);
  const pending = selected.filter(row => !row.theme);
  const groupId = (theme: ThemeClassification) => level === 'discipline' ? theme.disciplineId : level === 'topic' ? theme.topicId : theme.id;
  const themes = [...new Map(classified.map(row => [groupId(row.theme!), row.theme!])).values()];
  const distribution = (matching: AnalysisItem[]) => exams.map(exam => {
    const sample = selected.filter(row => row.exam === exam.id);
    const rows = matching.filter(row => row.exam === exam.id).sort((a, b) => a.number - b.number);
    return { exam, total: sample.length, items: rows, share: sample.length ? rows.length / sample.length : 0 };
  });
  const rows = themes.map(theme => {
    const matching = classified.filter(row => groupId(row.theme!) === groupId(theme));
    const byExam = distribution(matching);
    return { id: groupId(theme), label: level === 'discipline' ? theme.discipline : level === 'topic' ? theme.topic : theme.label,
      area: theme.discipline, topicId: theme.topicId, topic: theme.topic, disciplineId: theme.disciplineId, count: matching.length, byExam,
      appearances: byExam.filter(row => row.items.length).length,
      share: byExam.reduce((sum, row) => sum + row.share, 0) / exams.length };
  }).sort((a, b) => b.share - a.share || b.appearances - a.appearances || b.count - a.count ||
    a.label.localeCompare(b.label, 'pt-BR') || a.area.localeCompare(b.area, 'pt-BR'));
  const areaRows = [...new Set(selected.map(row => row.area))].map(label => {
    const matching = selected.filter(row => row.area === label);
    return { label, count: matching.length, byExam: distribution(matching) };
  }).sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, 'pt-BR'));
  return { editions, exams, areas, topics, rows, areaRows, level, total: selected.length,
    classified: classified.length, pending, pendingByExam: distribution(pending) };
}

export function importedFocus(questions: BankQuestion[], edition: string, block: Block, area = '', topicId = '', level: FocusLevel = 'subtopic') {
  return focusOverview(uniqueAnalysisQuestions(questions).map(row => ({ exam: row.exam,
    examLabel: row.examLabel || row.exam, number: row.number, block: row.block,
    area: row.analysis?.area ?? row.discipline, theme: row.analysis, source: row.source,
  })), edition, block, area, topicId, level);
}

export function historicalFocus(trailId: string, edition: string, block: Block, area = '', topicId = '', level: FocusLevel = 'subtopic') {
  return focusOverview(historicalExams.filter(exam => exam.trail === trailId).flatMap(exam =>
    Array.from({ length: exam.total }, (_, index) => {
      const number = index + 1;
      const theme = referenceTheme(exam.id, number);
      const source = exam.sources[exam.trail === 'pf' && number > exam.basic ? 1 : 0];
      return { exam: exam.id, examLabel: `${exam.year} · ${exam.label}`, number,
        block: number <= exam.basic ? 'basico' : 'especifico', area: theme?.area ?? 'A classificar', theme,
        referenceSource: { url: source.url, page: referencePages[exam.id][index] } };
    })), edition, block, area, topicId, level);
}

export type FocusOverview = ReturnType<typeof focusOverview>;

export function focusSelection(row: FocusOverview['rows'][number], level: FocusLevel, exam: string, block: Block): FocusSelection {
  return { themeId: level === 'subtopic' ? row.id : '', discipline: row.area,
    syllabusTopicId: level === 'discipline' ? '' : row.topicId,
    exam, block: block === 'all' ? '' : block === 'basic' ? 'basico' : 'especifico' };
}
