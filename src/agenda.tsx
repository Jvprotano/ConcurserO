import { useEffect, useState } from 'react';
import { ArrowRight, CalendarDays, ChevronLeft, ChevronRight, Clock3, FileText } from 'lucide-react';
import { activityLabels, addDays, agenda, agendaTopic, ratingLabels, sessionMinutes } from '../shared/agenda.ts';
import type { Activity, AgendaDay, RecallRating, StudyPdf } from '../shared/agenda.ts';
import { summaryChangesChannel, type Summary } from '../shared/summaries.ts';
import type { Card, Question, StudyState, Topic } from '../shared/types.ts';
import { api, formatDate, message } from './api.ts';
import { Empty, SourceLink } from './common.tsx';
import { QuestionAnswer, type SharedProps } from './study.tsx';
import { RemoveButton, useBatchRemoval } from './removal.tsx';
import { StudyTimeControls } from './study-time.tsx';

const weekday = (day: string) => new Date(day + 'T12:00:00Z').getUTCDay();
const weekStart = (day: string) => addDays(day, -((weekday(day) + 6) % 7));
const shortDate = new Intl.DateTimeFormat('pt-BR', { weekday: 'short', day: 'numeric', month: 'numeric', timeZone: 'UTC' });
const dayLabel = (day: string) => shortDate.format(new Date(day + 'T12:00:00Z'));
export const studyPdfUrl = (id: string, page?: number) => '/api/study-pdfs/' + id + '/pdf' + (page ? '#page=' + page : '');

function ActivityRow({ item, today, current, start }: { item: Activity; today: string; current: boolean; start: () => void }) {
  const material = item.kind === 'theory' || item.kind === 'essay' ? item.materials?.find(pdf => pdf.category === 'apostila' && pdf.available) : undefined;
  const link = material?.links.find(link => link.topicId === item.topic?.id) ?? material?.links[0];
  return <article className="task-row">
    <div><h3>{item.title}</h3>
      <p>{activityLabels[item.kind]} · {item.minutes} min{item.due ? ' · ' + (item.due < today ? 'Atrasada desde ' : 'Prevista para ') + formatDate(item.due) : !current ? ' · Sugestão' : ''}</p>
      {material && <p>{material.title}{link?.firstPage ? ' · p. ' + link.firstPage + (link.lastPage ? '–' + link.lastPage : '') : ''}</p>}</div>
    {current && <button type="button" className="button secondary" onClick={start}>{item.due ? 'Revisar' : 'Começar'} <ArrowRight size={16}/></button>}
  </article>;
}

function DayActivities({ row, state, start, mutate }: {
  row: AgendaDay; state: StudyState; start: (item: Activity) => void; mutate: SharedProps['mutate'];
}) {
  const current = row.day === state.today;
  const targets = new Map(row.completed.filter(item => item.kind === 'time').map(item => [item.id, {
    kind: 'study-time' as const, id: item.id, title: item.title + ' · ' + item.minutes + ' min',
  }]));
  const batch = useBatchRemoval([...targets.values()], mutate);
  return <>
    {row.study.map(item => <ActivityRow key={item.id} item={item} today={state.today} current={current} start={() => start(item)}/>)}
    {row.completed.length > 0 && <details className="agenda-history" open={!current}>
      <summary>Histórico · {row.completed.length} · {row.spent} min</summary>
      {batch.toolbar}
      {row.completed.map(item => { const target = targets.get(item.id); return <article className="task-row" key={item.id}>
        {target && batch.checkbox(target)}<div>
        <h3>{item.title}</h3><p>{activityLabels[item.kind]} · {item.minutes} min {item.estimated ? 'estimados' : 'registrados'}
          {item.rating && ' · ' + ratingLabels[item.rating]}</p>
        {item.materialTitle && <p>{item.materialTitle}</p>}
        {item.nextDue && <p>Próxima revisão em {formatDate(item.nextDue)}</p>}
        {item.essay && <details><summary>Ver resposta discursiva</summary><p className="prose">{item.essay}</p></details>}
      </div>{target && !batch.selecting && <RemoveButton {...target} mutate={mutate}/>}</article>; })}
    </details>}
    {!row.study.length && !row.completed.length && <Empty>{row.day < state.today ? 'Nenhuma sessão registrada.' :
      row.budget === 0 ? 'Sem tempo de estudo previsto.' : 'Nenhuma atividade prevista para este dia.'}</Empty>}
  </>;
}

export function StudyAgenda({ state, mutate, start, settings }: {
  state: StudyState; mutate: SharedProps['mutate']; start: (item: Activity) => void; settings: () => void;
}) {
  const [weekly, setWeekly] = useState(false);
  const [selectedDay, setSelectedDay] = useState<string>();
  const base = weekStart(state.today);
  const { calendar, due, scheduledToday } = agenda(state, base, 21);
  const today = calendar.find(row => row.day === state.today)!;
  const tomorrow = calendar.find(row => row.day === addDays(state.today, 1))!;
  const day = selectedDay ?? state.today;
  const monday = weekStart(day);
  const days = weekly ? agenda(state, monday, 7).calendar : [];
  const selected = days.find(row => row.day === day);
  const pending = due.length - scheduledToday;
  const todayIds = new Set(today.study.flatMap(item => item.cardIds?.map(id => 'card:' + id) ?? [item.id]));
  const overflow = due.filter(item => !todayIds.has(item.id));
  const firstLater = pending > 0 ? calendar.find(row => row.day > state.today && row.study.some(item => item.due && item.due <= state.today)) : undefined;
  const select = (date: string) => { setSelectedDay(date); setWeekly(true); };
  return <>
    <section className="metrics" aria-label="Resumo de hoje">
      <article><span><Clock3 size={17}/> Tempo disponível hoje</span><strong>{Math.max(0, today.budget - today.spent)}<small> min</small></strong><p>{today.spent} de {today.budget} min registrados</p></article>
      <article><span>Revisões até hoje</span><strong>{due.length}</strong><p>{scheduledToday} cabem no tempo disponível</p></article>
      <article><span>{dayLabel(tomorrow.day)} · Amanhã</span><strong>{tomorrow.study.reduce((sum, item) => sum + item.minutes, 0)}<small> min</small></strong>
        <button className="text-button" onClick={() => select(tomorrow.day)}>Ver amanhã</button></article>
    </section>
    <section className="section">
      <div className="section-heading wrap"><h2>{weekly ? 'Agenda da semana' : 'Atividades de hoje'}</h2><div className="actions">
        <button type="button" className="button secondary" onClick={() => weekly ? setWeekly(false) : select(state.today)}>
          <CalendarDays size={16}/>{weekly ? 'Voltar para hoje' : 'Ver semana'}</button>
        <button type="button" className="text-button" onClick={settings}>Editar disponibilidade</button>
      </div></div>
      <StudyTimeControls state={state} mutate={mutate}/>
      {pending > 0 && <p className="callout">{pending} {pending === 1 ? 'revisão continua pendente' : 'revisões continuam pendentes'}.
        {firstLater ? ' A próxima cabe em ' + dayLabel(firstLater.day) + '.' : ' Ajuste sua disponibilidade para encaixá-las.'}</p>}
      {overflow.length > 0 && <details className="agenda-history"><summary>Revisões que ficaram fora do tempo de hoje</summary>
        {overflow.filter(item => item.kind !== 'cards').map(item => <ActivityRow key={item.id} item={item} today={state.today} current start={() => start(item)}/>)}
        {overflow.some(item => item.kind === 'cards') && <button className="text-button" onClick={() => start({
          id: 'extra-cards', kind: 'cards', title: 'Flashcards', minutes: 0, cardIds: overflow.flatMap(item => item.cardIds ?? []),
        })}>Revisar flashcards pendentes</button>}
      </details>}
      {weekly && selected ? <>
        <div className="section-heading agenda-nav">
          <button type="button" className="button secondary" aria-label="Semana anterior" onClick={() => select(addDays(day, -7))}><ChevronLeft size={18}/></button>
          <strong>{formatDate(monday)} a {formatDate(addDays(monday, 6))}</strong>
          <button type="button" className="button secondary" aria-label="Próxima semana" onClick={() => select(addDays(day, 7))}><ChevronRight size={18}/></button>
        </div>
        <div className="agenda-week" aria-label="Dias da semana">
          {days.map(row => <button type="button" className="button secondary" aria-pressed={row.day === day} key={row.day} onClick={() => select(row.day)}>
            <strong>{row.day === state.today ? 'Hoje' : dayLabel(row.day)}</strong>
            <small>{row.day < state.today ? row.spent + ' min feitos' : row.study.reduce((minutes, item) => minutes + item.minutes, 0) + ' / ' + row.budget + ' min'}</small>
          </button>)}
        </div>
        <DayActivities key={selected.day} row={selected} state={state} start={start} mutate={mutate}/>
      </> : <DayActivities row={today} state={state} start={start} mutate={mutate}/>}
    </section>
  </>;
}

export function topicActivity(state: StudyState, topic: Topic): Activity {
  const data = agendaTopic(state, topic);
  const essay = /^prova discursiva$|^redação discursiva$/i.test(topic.title);
  const kind = data.cycle && data.cycle.due <= state.today ? 'review' : essay ? 'essay' : 'theory';
  return { id: 'topic:' + topic.id, topic, kind, cycle: data.cycle, materials: data.materials, title: topic.title, minutes: sessionMinutes[kind] };
}

function StudySummaries({ topicId, createUrl }: { topicId: string; createUrl?: string }) {
  const [summaries, setSummaries] = useState<Pick<Summary, 'id' | 'title'>[]>([]);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let request = 0;
    async function refresh() {
      const current = ++request;
      try {
        const result = await api<typeof summaries>('/summaries/topic/' + encodeURIComponent(topicId));
        if (request === current) { setSummaries(result); setFailed(false); }
      } catch {
        if (request === current) setFailed(true);
      }
    }
    void refresh();
    const channel = new BroadcastChannel(summaryChangesChannel);
    channel.addEventListener('message', refresh);
    window.addEventListener('focus', refresh);
    return () => {
      request++;
      channel.close();
      window.removeEventListener('focus', refresh);
    };
  }, [topicId]);

  if (!summaries.length && !createUrl && !failed) return null;
  return <div className="section">
    {summaries.length > 0 && <>
      <h3>Resumos deste assunto</h3>
      <ul>{summaries.map(summary => <li key={summary.id}>
        <a href={'/?' + new URLSearchParams({ resumos: '', resumo: summary.id })} target="_blank" rel="noreferrer">{summary.title}</a>
      </li>)}</ul>
    </>}
    {failed && <p className="muted" role="status">Não foi possível atualizar os resumos deste assunto.</p>}
    {createUrl && <a className="text-button" href={createUrl} target="_blank" rel="noreferrer">Criar resumo deste assunto</a>}
  </div>;
}

export function SessionScreen({ item, state, mutate, close, acervo }: {
  item: Activity; state: StudyState; mutate: SharedProps['mutate']; close: () => void; acervo: () => void;
}) {
  const topic = item.topic!;
  const [kind, setKind] = useState(item.kind === 'cards' ? 'review' : item.kind);
  const [requestId] = useState(() => crypto.randomUUID());
  const [options, setOptions] = useState<{ questions: Question[]; cards: Card[] }>();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [method, setMethod] = useState<'memory' | 'question'>('memory');
  const [questionIndex, setQuestionIndex] = useState(0);
  const [attemptId, setAttemptId] = useState<string>();
  const [cardId, setCardId] = useState<string>();
  const [cardReviewId, setCardReviewId] = useState<string>();
  const [cardRevealed, setCardRevealed] = useState(false);
  const [rating, setRating] = useState<RecallRating>();
  const [recall, setRecall] = useState('');
  const [revealed, setRevealed] = useState(false);
  const [minutes, setMinutes] = useState('');
  const timer = state.agenda?.timer?.topicId === topic.id ? state.agenda.timer : undefined;
  const { materials, ids } = agendaTopic(state, topic);
  const readings = materials.filter(pdf => pdf.category === 'apostila' && pdf.available);
  const [selectedPdf, setSelectedPdf] = useState('');
  const pdf = readings.find(row => row.id === selectedPdf) ?? readings[0];
  const link = pdf?.links.find(link => link.topicId === topic.id) ?? pdf?.links.find(link => ids.has(link.topicId));
  const inline = state.topics.find(row => ids.has(row.id) && (row.material || row.summary));
  const hasTextMaterial = state.topics.some(row => ids.has(row.id) && row.materialCount);
  const [textMaterials, setTextMaterials] = useState<{id: string; title: string; body: string; summary: string}[]>([]);
  useEffect(() => {
    let alive = true;
    api<NonNullable<typeof options>>('/study-sessions/' + topic.id + '/options').then(result => {
      if (!alive) return;
      setOptions(result);
      setCardId(result.cards[0]?.id);
      if (item.kind === 'review' && !pdf && !inline && result.questions.length) setMethod('question');
    }).catch(error => { if (alive) setError(message(error)); });
    return () => { alive = false; };
  }, [topic.id]);
  useEffect(() => {
    if (!hasTextMaterial) return;
    let alive = true;
    Promise.all([...ids].map(id => api<typeof textMaterials>('/topics/' + id + '/materials'))).then(results => {
      if (alive) setTextMaterials([...new Map(results.flat().map(row => [row.id, row])).values()]);
    }).catch(error => { if (alive) setError(message(error)); });
    return () => { alive = false; };
  }, [topic.id, hasTextMaterial]);
  const questionMode = kind === 'questions' || (kind === 'review' && method === 'question');
  const question = options?.questions[questionIndex];
  const card = options?.cards.find(row => row.id === cardId);
  const canFinish = kind === 'review' ? !!rating && (questionMode ? !!attemptId : revealed && !!recall.trim()) :
    kind === 'questions' ? !!attemptId : kind === 'essay' ? revealed && !!recall.trim() : !!(pdf || inline || textMaterials.length);
  async function save() {
    if (!canFinish || busy) return;
    setBusy(true);
    let nextDue: string | undefined;
    const ok = await mutate(async () => {
      const result = await api<{ nextDue?: string }>('/study-sessions/' + topic.id, 'POST', {
        id: requestId, kind, timerId: timer?.id, minutes: timer || minutes === '' ? undefined : Number(minutes),
        materialId: !questionMode || kind === 'review' ? pdf?.id : undefined,
        cycleTopicId: item.cycle?.topicId, cycleRevision: item.cycle?.revision, rating: kind === 'review' ? rating : undefined,
        attemptId: questionMode ? attemptId : undefined, cardReviewId,
        recall: !questionMode && recall.trim() ? recall.trim() : undefined,
      });
      nextDue = result.nextDue;
    }, () => nextDue ? 'Sessão registrada. Próxima revisão em ' + formatDate(nextDue) + '.' : 'Sessão registrada.');
    setBusy(false);
    if (ok) close();
  }
  const showReference = kind === 'theory' || revealed || (questionMode && !!attemptId);
  return <section className="panel study-session">
    <div className="section-heading"><div><p className="eyebrow">{activityLabels[kind]}</p><h2>{topic.title}</h2></div>
      <button type="button" className="button secondary" onClick={close}>Voltar</button></div>
    <StudyTimeControls state={state} mutate={mutate} topic={topic}/>
    {kind !== 'review' && <div className="actions">
      {kind === 'theory' && options && options.questions.length > 0 && <button className="text-button" onClick={() => setKind('questions')}>Praticar com questões</button>}
      {kind === 'theory' && options && options.questions.length === 0 && state.imports.some(job =>
        job.trailId === topic.trailId && job.kind === 'prova' && job.status === 'review') &&
        <button className="text-button" onClick={acervo}>Abrir acervo para salvar questões</button>}
      {kind === 'questions' && !attemptId && <button className="text-button" disabled={busy} onClick={() => setKind('theory')}>Estudar a teoria</button>}
    </div>}
    {kind === 'review' && !attemptId && (options?.questions.length ?? 0) > 0 && <div className="actions">
      <button className="text-button" disabled={busy} aria-pressed={method === 'memory'} onClick={() => setMethod('memory')}>De memória</button>
      <button className="text-button" disabled={busy} aria-pressed={method === 'question'} onClick={() => setMethod('question')}>Questão de prova</button>
    </div>}
    {questionMode && (question ? <div className="section" key={question.id}>
      {question.gran && <p className="meta">Gran Questões · Q{question.gran.id}</p>}
      <QuestionAnswer question={question} changed={async () => {}} onBusy={setBusy} onAnswered={attempt => setAttemptId(attempt.id)}/>
      {!attemptId && (options?.questions.length ?? 0) > questionIndex + 1 && <button className="text-button" disabled={busy} onClick={() => setQuestionIndex(questionIndex + 1)}>Outra questão</button>}
    </div> : options && <Empty>Nenhuma questão corrigível para este assunto.</Empty>)}
    {!questionMode && (kind === 'review' || kind === 'essay') && <div className="section">
      <label>{kind === 'essay' ? 'Escreva uma resposta sobre o tema escolhido antes de consultar o material.' :
        link?.prompt || 'De memória, explique a ideia central do assunto e dê um exemplo de aplicação.'}
        <textarea rows={4} maxLength={4000} value={recall} onChange={event => setRecall(event.target.value)} readOnly={revealed}/>
      </label>
      {!revealed && <div className="actions">
        <button className="button secondary" disabled={!recall.trim()} onClick={() => setRevealed(true)}>Conferir referência</button>
        {kind === 'review' && !recall.trim() && <button className="text-button" onClick={() => {
          setRecall('Não consegui responder.'); setRating('forgot'); setRevealed(true);
        }}>Não consegui responder</button>}
      </div>}
      {revealed && link?.answer && <p className="callout">{link.answer}</p>}
    </div>}
    {showReference && <>
      <SourceLink source={topic.source} label="Ver no edital"/>
      {readings.length > 1 && <label>Apostila <select value={pdf?.id ?? ''} onChange={event => setSelectedPdf(event.target.value)}>
        {readings.map(row => <option key={row.id} value={row.id}>{row.title}</option>)}
      </select></label>}
      {pdf && <article className="task-row"><span className="icon-tile"><FileText size={18}/></span><div><h3>{pdf.title}</h3>
        <p>{link?.section}{link?.firstPage ? ' · p. ' + link.firstPage + (link.lastPage ? '–' + link.lastPage : '') : ''}</p></div>
        <a className="button secondary" href={studyPdfUrl(pdf.id, link?.firstPage)} target="_blank" rel="noreferrer">Abrir apostila</a></article>}
      <StudySummaries key={topic.id} topicId={topic.id} createUrl={kind === 'theory' ? '/?' + new URLSearchParams({
        resumos: '', novo: '', topico: topic.id, ...(pdf ? { apostila: pdf.id } : {}),
        ...(link?.firstPage ? { pagina: String(link.firstPage) } : {}),
      }) : undefined}/>
      {materials.some(row => row.category !== 'apostila' && row.available) && <details className="section"><summary>Notas e fontes</summary>
        <ul>{materials.filter(row => row.category !== 'apostila' && row.available).map(row =>
          <li key={row.id}><a href={studyPdfUrl(row.id)} target="_blank" rel="noreferrer">{row.title}</a></li>)}</ul>
      </details>}
      {inline && <p className="prose">{inline.material || inline.summary}</p>}
      {textMaterials.map(row => <details className="section" key={row.id}><summary>{row.title}</summary><p className="prose">{row.body}</p><p>{row.summary}</p></details>)}
      {!pdf && !inline && !textMaterials.length && kind === 'theory' && <><Empty>Este tópico está sem material de leitura disponível.</Empty>
        <button className="button secondary" onClick={acervo}>Abrir acervo</button></>}
    </>}
    {kind === 'review' && card && <details className="section"><summary>Flashcard deste assunto</summary>
      <p>{card.front}</p>
      {cardRevealed ? <><p className="callout">{card.back}</p>{!cardReviewId && <div className="actions">
        {[false, true].map(value => <button key={String(value)} className="button secondary" disabled={busy} onClick={async () => {
          setBusy(true);
          const id = crypto.randomUUID();
          const ok = await mutate(() => api('/cards/' + card.id + '/review', 'POST', { id, remembered: value }), 'Flashcard registrado.');
          if (ok) setCardReviewId(id);
          setBusy(false);
        }}>{value ? 'Lembrei do cartão' : 'Não lembrei do cartão'}</button>)}
      </div>}</> : <button className="button secondary" onClick={() => setCardRevealed(true)}>Revelar cartão</button>}
    </details>}
    {kind === 'review' && (questionMode ? !!attemptId : revealed) && <fieldset className="section">
      <legend>Como foi a revisão?</legend>
      <div className="actions">{(Object.keys(ratingLabels) as RecallRating[]).map(value =>
        <button type="button" className={rating === value ? 'button primary' : 'button secondary'} key={value}
          aria-pressed={rating === value} onClick={() => setRating(value)}>{ratingLabels[value]}</button>)}</div>
    </fieldset>}
    {error && <p className="alert" role="alert">{error}</p>}
    <form className="section" onSubmit={event => { event.preventDefault(); void save(); }}>
      {!timer && <details><summary>Tempo da sessão · {minutes || sessionMinutes[kind]} min {minutes ? 'registrados' : 'estimados'}</summary>
        <label>Minutos estudados <input type="number" min={1} max={600} value={minutes} onChange={event => setMinutes(event.target.value)}/></label></details>}
      <button className="button primary" disabled={busy || !canFinish}>Concluir {kind === 'review' ? 'revisão' : 'sessão'}{timer && ' e salvar tempo'}</button>
    </form>
  </section>;
}
