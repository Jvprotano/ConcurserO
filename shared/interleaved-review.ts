import { matchesTopicContent, relatedTopics } from './preparation.ts';
import type { BankQuestion, ContentPath, StudyState, Topic } from './types.ts';
import { questionContent } from './questions.ts';

type ReadyQuestion = BankQuestion & { status: 'ready' };
interface Candidate {
  question: ReadyQuestion;
  identity: string;
}
interface ReviewSubject {
  topic: Topic;
  studiedOn: string;
  due: boolean;
  questions: Candidate[];
}

const calendarDate = new Intl.DateTimeFormat('sv-SE', { year: 'numeric', month: '2-digit', day: '2-digit' });

function questionIdentity(question: ReadyQuestion) {
  if (question.gran) return question.id;
  if (question.supportPages.length > 0) {
    const reference = question.analysis?.reference;
    return reference ? JSON.stringify([reference.examId, reference.number]) : question.id;
  }
  const clean = (value: string) => value.normalize('NFC').replace(/\s+/gu, ' ').trim();
  // Versions of the same exam can change item numbers and reorder the alternatives.
  return JSON.stringify([question.trailId, question.exam, question.type, clean(question.context),
    clean(question.prompt), question.options.map(option => clean(option.text)).sort()]);
}

export function reviewSubjects(state: StudyState, bank: BankQuestion[]) {
  const editions = new Set(state.trails.filter(trail => trail.enabled !== false).map(trail => trail.editionId));
  const attemptIds = new Set(state.attempts.map(attempt => attempt.id));
  const sessions = (state.agenda?.sessions ?? []).filter(row => row.day <= state.today && row.kind !== 'cards' &&
    (row.kind !== 'time' || row.minutes > 0) && !attemptIds.has(row.id));
  const attemptDay = new Map((state.agenda?.sessions ?? []).map(row => [row.id, row.day]));
  const attempts = state.attempts.map(attempt => ({ ...attempt, day: attemptDay.get(attempt.id) ?? calendarDate.format(new Date(attempt.created)) }));

  const candidates = bank.filter((question): question is ReadyQuestion => question.status === 'ready' && question.exam !== 'demo')
    .map(question => {
      return { question, classification: questionContent(question), identity: questionIdentity(question) };
    });
  const identityById = new Map(candidates.map(row => [row.question.id, row.identity]));
  const latest = new Map<string, typeof attempts[number]>();
  for (const attempt of attempts) {
    const identity = identityById.get(attempt.questionId);
    if (identity && !latest.has(identity)) latest.set(identity, attempt);
  }
  const rank = (attempt: typeof attempts[number] | undefined) =>
    attempt?.day === state.today ? 3 : !attempt ? 1 : attempt.correct && !attempt.guess ? 2 : 0;
  candidates.sort((a, b) => {
    const left = latest.get(a.identity), right = latest.get(b.identity);
    return rank(left) - rank(right) || (left?.created ?? '').localeCompare(right?.created ?? '');
  });

  const subjects: ReviewSubject[] = [];
  const seen = new Set<string>();
  let suggestion = '';
  let lastActivity: string | undefined;
  for (const topic of state.topics) {
    if (!topic.syllabus || !editions.has(topic.editionId) || seen.has(topic.id)) continue;
    const related = relatedTopics(state, topic);
    const ids = new Set(related.map(row => row.id));
    ids.forEach(id => seen.add(id));
    const matches = (topicId: string, path?: ContentPath) => ids.has(topicId) ||
      related.some(row => matchesTopicContent(path, row));
    const subjectSessions = sessions.filter(row => ids.has(row.topicId));
    const days = subjectSessions.map(row => row.day);
    for (const attempt of attempts) {
      if (attempt.day <= state.today && matches(attempt.topicId, attempt.classification)) days.push(attempt.day);
    }
    for (const session of subjectSessions) {
      if (session.day !== state.today || session.kind === 'review') continue;
      const order = session.created ?? session.day;
      if (!lastActivity || order > lastActivity) {
        suggestion = topic.id;
        lastActivity = order;
      }
    }
    const unique = new Map<string, Candidate>();
    for (const item of candidates) {
      if (!unique.has(item.identity) && matches(item.question.topicId, item.classification)) unique.set(item.identity, item);
    }
    subjects.push({
      topic, studiedOn: days.sort().at(-1) ?? '',
      due: Boolean(state.agenda?.cycles.some(row => ids.has(row.topicId) && row.due <= state.today)),
      questions: [...unique.values()],
    });
  }
  subjects.sort((a, b) => a.topic.discipline.localeCompare(b.topic.discipline, 'pt-BR') ||
    a.topic.title.localeCompare(b.topic.title, 'pt-BR'));
  return { subjects, suggestion };
}

export function planReview(subjects: ReviewSubject[], topicId: string, currentLimit: number, reviewLimit: number) {
  const current = subjects.find(row => row.topic.id === topicId);
  const currentQuestions = current?.questions ?? [];
  const used = new Set(currentQuestions.map(row => row.identity));
  const previous = subjects.filter(row => row !== current && row.studiedOn);
  const groups = previous.sort((a, b) => Number(b.due) - Number(a.due) || a.studiedOn.localeCompare(b.studiedOn) ||
    b.topic.priority - a.topic.priority).map(row => ({ ...row, next: 0 }));
  const reviewAvailable = new Set(groups.flatMap(row => row.questions.map(item => item.identity)).filter(id => !used.has(id))).size;
  const review: { topicId: string; question: ReadyQuestion }[] = [];
  while (review.length < Math.min(reviewLimit, reviewAvailable)) {
    for (const group of groups) {
      if (review.length >= reviewLimit) break;
      while (group.next < group.questions.length && used.has(group.questions[group.next].identity)) group.next++;
      const item = group.questions[group.next];
      if (!item) continue;
      group.next++;
      used.add(item.identity);
      review.push({ topicId: group.topic.id, question: item.question });
    }
  }
  return {
    current: currentQuestions.slice(0, currentLimit).map(row => ({ topicId, question: row.question })),
    review, currentAvailable: currentQuestions.length, reviewAvailable, previousCount: previous.length,
  };
}
