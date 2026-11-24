import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowRight } from 'lucide-react';
import { planReview, reviewSubjects } from '../shared/interleaved-review.ts';
import type { Attempt, BankQuestion, StudyState } from '../shared/types.ts';
import { matchesTopicContent } from '../shared/preparation.ts';
import { api, message } from './api.ts';
import { Empty } from './common.tsx';
import { QuestionAnswer } from './study.tsx';

const storageKey = 'concursero:revisao-intercalada:v1';
const defaultCount = '10';
const maxCount = 30;
type RoundItem = { questionId: string; revision: number; attemptId: string; topicId: string; mixed: boolean };
type Round = { items: RoundItem[]; position: number; currentCount: string; reviewCount: string };

function storedRound(): Round | undefined {
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey) ?? 'null') as Round | null;
    if (saved && Array.isArray(saved.items) && saved.items.length && Number.isInteger(saved.position) &&
      saved.position >= 0 && saved.position <= saved.items.length) return saved;
  } catch { /* Start with an empty setup if the browser cannot read its saved state. */ }
}

function validCount(value: string) {
  const count = Number(value);
  return value.trim() !== '' && Number.isInteger(count) && count >= 0 && count <= maxCount;
}

function availability(count: number) {
  return count + (count === 1 ? ' questão disponível' : ' questões disponíveis');
}

export function InterleavedReview({ state, changed, openPractice, openProofs }: {
  state: StudyState; changed: () => Promise<void>; openPractice: () => void; openProofs: () => void;
}) {
  const [round, setRound] = useState(storedRound);
  const [bank, setBank] = useState<BankQuestion[]>();
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  const [storageError, setStorageError] = useState(false);
  const [topicOverride, setTopicOverride] = useState<string>();
  const [currentCount, setCurrentCount] = useState(round?.currentCount ?? defaultCount);
  const [reviewCount, setReviewCount] = useState(round?.reviewCount ?? defaultCount);
  const [lastAnswer, setLastAnswer] = useState<Attempt>();
  const [busy, setBusy] = useState(false);
  const [loadedGran, setLoadedGran] = useState<{ id: string; question?: BankQuestion }>();
  const heading = useRef<HTMLHeadingElement>(null);
  const currentId = round?.items[round.position]?.questionId;
  useEffect(() => {
    let active = true;
    api<BankQuestion[]>('/questions/review').then(result => { if (active) setBank(result); })
      .catch(error => { if (active) setError(message(error)); });
    return () => { active = false; };
  }, [retry, state.localQuestionCount]);
  useEffect(() => {
    if (!currentId?.startsWith('gran:')) return;
    let active = true;
    api<BankQuestion>('/questions/' + encodeURIComponent(currentId))
      .then(question => { if (active) setLoadedGran({ id: currentId, question }); })
      .catch(() => { if (active) setLoadedGran({ id: currentId }); });
    return () => { active = false; };
  }, [currentId, state.localQuestionCount]);
  useEffect(() => {
    if (round) heading.current?.focus();
  }, [round?.position, Boolean(bank)]);

  const planning = !round;
  const { subjects, suggestion } = useMemo(() => planning && bank ? reviewSubjects(state, bank) : { subjects: [], suggestion: '' },
    [bank, planning, state]);
  const selectedTopic = topicOverride ?? suggestion;
  const countsValid = validCount(currentCount) && validCount(reviewCount);
  const currentLimit = countsValid ? Number(currentCount) : 0;
  const reviewLimit = countsValid ? Number(reviewCount) : 0;
  const topicId = currentLimit > 0 && subjects.some(row => row.topic.id === selectedTopic) ? selectedTopic : '';
  const plan = planReview(subjects, topicId, currentLimit, reviewLimit);
  const size = plan.current.length + plan.review.length;

  function saveRound(next?: Round) {
    setRound(next);
    try {
      if (next) localStorage.setItem(storageKey, JSON.stringify(next));
      else localStorage.removeItem(storageKey);
      setStorageError(false);
    } catch {
      setStorageError(true);
    }
  }

  function start() {
    const items: RoundItem[] = [
      ...plan.current.map(row => ({ ...row, mixed: false })),
      ...plan.review.map(row => ({ ...row, mixed: true })),
    ].map(({ question, topicId, mixed }) =>
      ({ questionId: question.id, revision: question.revision, attemptId: crypto.randomUUID(), topicId, mixed }));
    saveRound({ items, position: 0, currentCount, reviewCount });
  }

  if (error) return <section className="panel">
    <p className="alert" role="alert">{error}</p>
    <button className="button secondary" onClick={() => { setError(''); setRetry(retry + 1); }}>Tentar novamente</button>
  </section>;
  if (!bank) return <section className="panel"><p role="status">Carregando questões…</p></section>;

  const storageStatus = storageError && <p className="alert" role="status">O navegador bloqueou a retomada desta rodada. As respostas seguem no histórico.</p>;
  if (round) {
    const entry = round.items[round.position];
    const attempts = new Map(state.attempts.map(attempt => [attempt.id, attempt]));
    if (lastAnswer) attempts.set(lastAnswer.id, lastAnswer);
    const answered = round.items.flatMap(item => {
      const attempt = attempts.get(item.attemptId);
      return attempt ? [attempt] : [];
    });
    const advance = () => saveRound({ ...round, position: round.position + 1 });
    if (!entry) {
      const correct = answered.filter(attempt => attempt.correct).length;
      const wrong = answered.length - correct;
      return <section className="panel" aria-labelledby="review-round-heading">
        <h2 ref={heading} tabIndex={-1} id="review-round-heading">Resultado da rodada</h2>
        <p>{answered.length} de {round.items.length} respondidas · {correct} {correct === 1 ? 'acerto' : 'acertos'} · {wrong} {wrong === 1 ? 'erro' : 'erros'}</p>
        {storageStatus}
        <div className="actions"><button className="button primary" onClick={() => saveRound()}>Nova rodada</button></div>
      </section>;
    }
    const fromGran = entry.questionId.startsWith('gran:');
    const fetching = fromGran && loadedGran?.id !== entry.questionId;
    const candidate = fromGran ? loadedGran?.question : bank.find(row => row.id === entry.questionId);
    const question = candidate?.id === entry.questionId && candidate.revision === entry.revision ? candidate : undefined;
    const topic = state.topics.find(row => row.id === entry.topicId);
    const attempt = attempts.get(entry.attemptId);
    const title = entry.mixed ? 'Revisão mista' : topic?.title ?? 'Assunto de hoje';
    const unavailable = question?.status !== 'ready';
    return <section className="panel" aria-labelledby="review-round-heading">
      <p className="eyebrow">Questão {round.position + 1} de {round.items.length}</p>
      <h2 ref={heading} tabIndex={-1} id="review-round-heading">{title}</h2>
      {storageStatus}
      {fetching ? <p role="status">Carregando questão…</p> :
      question?.status !== 'ready' ? <Empty>Esta questão foi atualizada ou está indisponível. Avance para continuar a rodada.</Empty> : <>
        <p className="meta">{[question.board, question.examLabel || question.exam,
          question.gran ? 'Gran Q' + question.gran.id : 'item ' + question.number].filter(Boolean).join(' · ')}</p>
        <QuestionAnswer key={entry.attemptId} question={{ ...question, topicId: question.gran && topic &&
          matchesTopicContent(question.content, topic) ? topic.id : question.topicId }} initialAttempt={attempt}
          requestId={entry.attemptId} changed={changed} onBusy={setBusy} onAnswered={setLastAnswer}/>
      </>}
      {entry.mixed && attempt && topic && <p className="meta">{topic.discipline} · {topic.title}</p>}
      <div className="actions">
        <button className={attempt || unavailable ? 'button primary' : 'text-button'} disabled={busy || fetching} onClick={advance}>
          {round.position + 1 >= round.items.length ? (attempt || unavailable ? 'Ver resultado' : 'Pular e ver resultado') :
            (attempt || unavailable ? 'Próxima questão' : 'Pular questão')} <ArrowRight size={16}/>
        </button>
        {round.position + 1 < round.items.length && <button className="text-button" disabled={busy}
          onClick={() => saveRound({ ...round, position: round.items.length })}>Encerrar rodada</button>}
      </div>
    </section>;
  }

  const missingQuestions = (Boolean(topicId) && plan.current.length < currentLimit) ||
    (plan.previousCount > 0 && plan.review.length < reviewLimit);
  return <section className="panel" aria-labelledby="review-setup-heading">
    <h2 id="review-setup-heading">Monte sua rodada</h2>
    {storageStatus}
    {!subjects.length ? <Empty>Adicione os assuntos do edital de um concurso acompanhado para montar a rodada.</Empty> : <>
      <form onSubmit={event => {
        event.preventDefault();
        if (countsValid && size > 0 && (currentLimit === 0 || topicId)) start();
      }}>
        <label>Assunto de hoje
          <select value={selectedTopic} onChange={event => setTopicOverride(event.target.value)} disabled={currentLimit === 0 && countsValid}>
            <option value="">Escolha um assunto</option>
            {subjects.map(({ topic }) => <option key={topic.id} value={topic.id}>{topic.discipline} · {topic.title}</option>)}
          </select>
        </label>
        <div className="form-grid">
          <div>
            <label>Questões do assunto de hoje <input type="number" min="0" max={maxCount} required value={currentCount}
              onChange={event => setCurrentCount(event.target.value)}/></label>
            {topicId && <p className="meta">{availability(plan.currentAvailable)}</p>}
          </div>
          <div>
            <label>Questões de revisão <input type="number" min="0" max={maxCount} required value={reviewCount}
              onChange={event => setReviewCount(event.target.value)}/></label>
            <p className="meta">{availability(plan.reviewAvailable)}</p>
          </div>
        </div>
        {reviewLimit > 0 && plan.previousCount === 0 && <p className="muted">Outros assuntos entram na revisão quando você registra estudo ou responde questões deles.</p>}
        {size > 0 && <p className="meta">Nesta rodada {plan.current.length} do assunto de hoje e {plan.review.length} de revisão.</p>}
        <div className="actions">
          <button className="button primary" disabled={!countsValid || size === 0 || (currentLimit > 0 && !topicId)}>Começar rodada</button>
        </div>
      </form>
      {missingQuestions && <div className="callout">
        <p>O Acervo tem menos questões corrigíveis que o solicitado.</p>
        <div className="actions">
          <button className="text-button" onClick={openPractice}>Banco local</button>
          <button className="text-button" onClick={openProofs}>Praticar provas</button>
        </div>
      </div>}
    </>}
  </section>;
}
