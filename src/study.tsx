import { useEffect, useId, useState } from 'react';
import { ArrowRight, CircleHelp, Plus } from 'lucide-react';
import { SessionScreen, StudyAgenda } from './agenda.tsx';
import type { Activity } from '../shared/agenda.ts';
import { ContestCards } from './contests.tsx';
import { RemoveButton, useBatchRemoval } from './removal.tsx';
import { api, formatDate, message } from './api.ts';
import { Empty, SourceLink, TopicLinks } from './common.tsx';
import { QuestionContent } from './online-questions.tsx';
import { matchesTopicContent } from '../shared/preparation.ts';
import type { Attempt, Card, Question, StudyState, Topic, Trail } from '../shared/types.ts';

type Mutation = (action: () => Promise<unknown>, feedback?: string | (() => string)) => Promise<boolean>;
export type SharedProps = { state: StudyState; trail: Trail; topics: Topic[]; mutate: Mutation };

export function Today({ state, mutate, study, edital, review, open, activity, selectActivity }: SharedProps & {
  study: (topic: Topic, mode: 'study' | 'practice') => void;
  review: (cardIds: string[]) => void;
  open: (view: 'edital' | 'acervo' | 'config' | 'concursos') => void;
  edital: (trail: Trail) => void;
  activity?: Activity;
  selectActivity: (activity?: Activity) => void;
}) {
  const displayedDate = new Intl.DateTimeFormat('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })
    .format(new Date(state.today + 'T12:00:00'));
  const followed = state.trails.filter(trail => trail.enabled !== false);
  const hasSyllabus = state.topics.some(topic => topic.syllabus && followed.some(trail => trail.editionId === topic.editionId));
  return <>
    <header className="page-heading"><p className="eyebrow">{displayedDate}</p><h1>Seu estudo de hoje</h1>
      <p>{followed.length === 1 ? followed[0].title + ' · ' + followed[0].edition : 'Priorize as revisões e avance no edital.'}</p></header>
    {activity ? <SessionScreen key={activity.id} item={activity} state={state} mutate={mutate} close={() => selectActivity()} acervo={() => open('acervo')}/> : <>
      <StudyAgenda state={state} mutate={mutate} settings={() => open('config')} start={item => item.cardIds ? review(item.cardIds) : selectActivity(item)}/>
      {!hasSyllabus && followed.length > 0 && <div className="callout">
        <p>O edital define os assuntos do plano. Importe o PDF e salve os tópicos no Acervo.</p>
        <button className="text-button" onClick={() => edital(followed[0])}>Abrir edital</button>
      </div>}
      <details className="panel"><summary>Seus concursos · {followed.length}</summary>
        {!followed.length && <Empty>Cadastre ou retome um concurso.</Empty>}
        <ContestCards state={state} mutate={mutate} edital={edital} study={study}/>
        <button className="text-button" onClick={() => open('concursos')}>Gerenciar objetivos</button>
      </details>
    </>}
  </>;
}


export function TopicStudy({ topic, practice, mutate }: { topic: Topic; practice: () => void; mutate: Mutation }) {
  const [materials, setMaterials] = useState<{ title: string; body: string; summary: string; id: string }[]>([]);
  const [error, setError] = useState('');
  const batch = useBatchRemoval(materials.map(({ id, title }) => ({ kind: 'material', id, title })), mutate,
    removed => setMaterials(rows => rows.filter(row => !removed.some(item => item.id === row.id))));
  useEffect(() => {
    let current = true;
    api<typeof materials>('/topics/' + topic.id + '/materials').then(rows => { if (current) setMaterials(rows); })
      .catch(error => { if (current) setError(message(error)); });
    return () => { current = false; };
  }, [topic.id]);
  return <section className="panel">
    <p className="eyebrow">{topic.discipline}</p><h2>{topic.title}</h2>
    <SourceLink source={topic.source}/>
    {topic.material && <p className="prose">{topic.material}</p>}
    {topic.summary && <div className="callout"><strong>Para recordar</strong><p className="prose">{topic.summary}</p></div>}
    {batch.toolbar}
    {materials.map(material => <article key={material.id} className="section"><div className="section-heading">
      {batch.checkbox({ ...material, kind: 'material' })}<h3>{material.title}</h3>
      {!batch.selecting && <RemoveButton kind="material" id={material.id} title={material.title} mutate={mutate}
        onRemoved={() => setMaterials(rows => rows.filter(row => row.id !== material.id))}/>}</div><p className="prose">{material.body}</p>
      {material.summary && <p className="callout prose">{material.summary}</p>}</article>)}
    {!topic.material && !topic.summary && !materials.length && <Empty>Este tópico ainda não tem material de leitura.</Empty>}
    {error && <p role="alert">{error}</p>}
    <div className="actions">
      <button className="button secondary" disabled={!topic.material && !topic.summary && !materials.length}
        onClick={() => void mutate(() => api('/topics/' + topic.id + '/read', 'POST'), 'Leitura registrada.')}>Concluir leitura</button>
      <button className="button primary" onClick={practice}>Resolver questões <ArrowRight size={16}/></button>
    </div>
  </section>;
}

export function QuestionAnswer({ question, changed, onBusy, onAnswered, initialAttempt, requestId }: {
  question: Omit<Question, 'status'> & { status: Question['status'] | 'pending' };
  changed: () => Promise<void>; onBusy?: (busy: boolean) => void; onAnswered?: (attempt: Attempt) => void;
  initialAttempt?: Attempt; requestId?: string;
}) {
  const [answer, setAnswer] = useState(initialAttempt?.answer ?? '');
  const [guess, setGuess] = useState(initialAttempt?.guess ?? false);
  const [attempt, setAttempt] = useState(initialAttempt);
  const [attemptId] = useState(() => requestId ?? crypto.randomUUID());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const promptId = useId();
  const rich = Boolean(question.gran);
  const content = (value: string) => rich ? <QuestionContent html={value} offline/> : value;
  async function submit() {
    if (!answer || busy || attempt || question.status !== 'ready') return;
    setBusy(true); onBusy?.(true); setError('');
    try {
      const saved = await api<Attempt>('/questions/' + question.id + '/answer', 'POST',
        { id: attemptId, revision: question.revision, answer, guess, topicId: rich && question.topicId || undefined });
      setAttempt(saved);
      onAnswered?.(saved);
      await changed();
    } catch (error) { setError(message(error)); }
    finally { setBusy(false); onBusy?.(false); }
  }
  return <>
    {question.context && <details className="callout"><summary>Comando ou texto de apoio</summary><div className="prose">{content(question.context)}</div></details>}
    {question.keyPreliminary && <p className="muted">Correção com gabarito preliminar.</p>}
    <SourceLink source={question.source} label="Caderno original"/>
    {question.source && question.supportPages.length > 0 && <div className="actions">
      {question.supportPages.map(page => <SourceLink key={page} source={{ id: question.source!.id, page }} label="Página de apoio"/>)}
    </div>}
    <form onSubmit={event => { event.preventDefault(); void submit(); }}>
      {rich && <div className="prose" id={promptId}>{content(question.prompt)}</div>}
      <fieldset className="options" aria-labelledby={rich ? promptId : undefined} disabled={Boolean(attempt) || busy || question.status !== 'ready'}>
        {!rich && <legend className="prose">{question.prompt}</legend>}
        {question.options.map(option => <label key={option.key} className={answer === option.key ? 'option selected' : 'option'}>
          {question.status === 'ready' && <input type="radio" name={'answer-' + question.id} value={option.key} checked={answer === option.key} onChange={() => setAnswer(option.key)}/>}
          <strong>{option.label ?? option.key}</strong>{rich ? content(option.text) : <span>{option.text}</span>}
        </label>)}
        {question.status === 'ready' && <label className="check"><input type="checkbox" checked={guess} onChange={event => setGuess(event.target.checked)}/> Foi um chute</label>}
      </fieldset>
      {!attempt && question.status === 'ready' && <button className="button primary" disabled={!answer || busy}>{busy ? 'Salvando…' : 'Responder'}</button>}
    </form>
    {attempt && <div className={'callout ' + (attempt.correct ? 'positive' : 'attention')} role="status">
      <strong>{attempt.correct ? 'Resposta correta' : 'Resposta incorreta'} · Gabarito {attempt.key}{attempt.keyPreliminary ? ' · Preliminar' : ''}</strong>
      {attempt.comment && <p>{attempt.comment}</p>}
      <SourceLink source={attempt.keySource} label="Gabarito aplicado"/>
    </div>}
    {error && <p className="alert" role="alert">{error}</p>}
  </>;
}

export function Practice({ topic, changed }: { topic: Topic; changed: () => Promise<void> }) {
  const [questions, setQuestions] = useState<Question[]>([]);
  const [index, setIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [showAnnulled, setShowAnnulled] = useState(false);
  useEffect(() => {
    let current = true;
    api<Question[]>('/topics/' + topic.id + '/questions').then(rows => { if (current) setQuestions(rows); })
      .catch(error => { if (current) setError(message(error)); })
      .finally(() => { if (current) setLoading(false); });
    return () => { current = false; };
  }, [topic.id]);
  const available = questions.filter(question => question.status === 'ready');
  const annulled = questions.filter(question => question.status === 'annulled');
  const question = available[index];
  return <section className="panel">
    <p className="eyebrow">{topic.title}</p><h2>Prática por questões</h2>
    {loading && <p role="status">Carregando questões…</p>}
    {!loading && !question && !error && <Empty>Nenhuma questão corrigível está publicada neste tópico.</Empty>}
    {question && <>
      <p className="meta">Questão {index + 1} de {available.length} · {question.exam === 'demo' ? 'Demonstração' : 'Edital ' + question.exam + ' · ' + question.version} · item {question.number}</p>
      <QuestionAnswer key={question.id + ':' + question.revision} question={question} changed={changed} onBusy={setBusy}/>
      <div className="actions">
        <button className="button secondary" disabled={index === 0 || busy} onClick={() => setIndex(index - 1)}>Anterior</button>
        <button className="button secondary" disabled={index + 1 >= available.length || busy} onClick={() => setIndex(index + 1)}>Próxima <ArrowRight size={16}/></button>
      </div>
    </>}
    {annulled.length > 0 && <div className="section">
      <button className="text-button" onClick={() => setShowAnnulled(!showAnnulled)}>{showAnnulled ? 'Ocultar' : 'Ver'} {annulled.length} anulada(s)</button>
      {showAnnulled && annulled.map(item => <p key={item.id}>Item {item.number} · {item.version} · {item.prompt}</p>)}
    </div>}
    {error && <p className="alert" role="alert">{error}</p>}
  </section>;
}

export function ErrorBook({ state, topics, mutate, study, newCard, openQuestion }: SharedProps & {
  study: (topic: Topic, mode: 'practice') => void;
  newCard: (attempt: Attempt) => void;
  openQuestion: (id: string) => void;
}) {
  const [filter, setFilter] = useState('errors');
  const byTopic = new Map(state.topics.map(topic => [topic.id, topic]));
  const attempts = state.attempts.filter(row => row.granId || byTopic.has(row.topicId));
  const records = filter === 'all' ? attempts : attempts.filter(row => !row.correct || row.guess);
  const correct = attempts.filter(row => row.correct).length;
  const guesses = attempts.filter(row => row.guess).length;
  return <section>
    {attempts.length > 0 && <p className="meta">{attempts.length} {attempts.length === 1 ? 'tentativa' : 'tentativas'} ·{' '}
      {Math.round(correct * 100 / attempts.length)}% de acerto · {guesses} {guesses === 1 ? 'chute' : 'chutes'}</p>}
    <div className="toolbar"><label>Mostrar <select value={filter} onChange={e => setFilter(e.target.value)}>
      <option value="errors">Erros e acertos por chute</option><option value="all">Todas as tentativas</option>
    </select></label></div>
    {records.length === 0 && <Empty>Suas tentativas de todos os concursos aparecerão aqui.</Empty>}
    {records.map(row => <article className="panel record" key={row.id}>
      <p className="meta">{[byTopic.get(row.topicId)?.title ?? row.classification?.topic, row.granId && 'Gran Q' + row.granId,
        formatDate(row.created)].filter(Boolean).join(' · ')}</p>
      <h3>{row.prompt}</h3>
      <p>{row.correct ? row.guess ? 'Acerto por chute' : 'Acerto' : 'Erro'} · Você marcou {row.answerLabel ?? row.answer} · Gabarito {row.key}{row.keyPreliminary ? ' · Preliminar' : ''}</p>
      {row.comment && <p>{row.comment}</p>}<SourceLink source={row.keySource} label="Gabarito aplicado"/>
      <form onSubmit={event => {
        event.preventDefault();
        const data = new FormData(event.currentTarget);
        void mutate(() => api('/attempts/' + row.id, 'PATCH', { reason: data.get('reason') }), 'Motivo salvo.');
      }}>
        <label>Motivo ou observação <textarea name="reason" defaultValue={row.reason} rows={2}/></label>
        <div className="actions">
          <button className="button secondary">Salvar observação</button>
          <button className="button secondary" type="button" onClick={() => newCard(row)}>Criar flashcard</button>
          {row.granId ? <button className="text-button" type="button" onClick={() => openQuestion(row.questionId)}>Abrir questão</button> :
          topics.find(topic => topic.id === row.topicId) && <button className="text-button" type="button"
            onClick={() => study(topics.find(topic => topic.id === row.topicId)!, 'practice')}>Voltar às questões</button>}
        </div>
      </form>
    </article>)}
  </section>;
}

export function Flashcards({ state, topics, mutate, from, onClose, plannedCards }: SharedProps & {
  from?: Attempt; onClose: () => void; plannedCards?: string[];
}) {
  const [editing, setEditing] = useState<Card>();
  const [creating, setCreating] = useState(Boolean(from));
  const [links, setLinks] = useState<string[]>(() => {
    if (from && topics.some(topic => topic.id === from.topicId)) return [from.topicId];
    const topic = state.topics.find(topic => topic.syllabus && state.trails.some(trail => trail.editionId === topic.editionId) &&
      matchesTopicContent(from?.classification, topic));
    return topic ? [topic.id] : [];
  });
  const [revealed, setRevealed] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState('');
  const list = state.cards.filter(card => card.topicIds.some(id => topics.some(topic => topic.id === id)));
  const batch = useBatchRemoval(list.map(card => ({ kind: 'card', id: card.id, title: card.front })), mutate,
    removed => { if (removed.some(item => item.id === editing?.id)) setEditing(undefined); });
  const queue = list.filter(card => card.due <= state.today && (!plannedCards || plannedCards.includes(card.id)));
  const due = queue[0];
  async function assess(card: Card, remembered: boolean) {
    if (busy) return;
    setBusy(true);
    await mutate(async () => {
      const { due } = await api<{ due: string }>('/cards/' + card.id + '/review', 'POST', { id: crypto.randomUUID(), remembered });
      setResult('Próxima revisão em ' + formatDate(due) + '.');
      setRevealed(undefined);
    });
    setBusy(false);
  }
  return <>
    <div className="toolbar"><button className="button primary" onClick={() => { setEditing(undefined); setLinks(topics[0] ? [topics[0].id] : []); setCreating(true); }}><Plus size={16}/> Novo flashcard</button></div>
    {(creating || editing) && <form key={editing?.id ?? 'new'} className="panel" onSubmit={async event => {
      event.preventDefault();
      const data = new FormData(event.currentTarget);
      const ok = await mutate(() => api('/cards' + (editing ? '/' + editing.id : ''), editing ? 'PUT' : 'POST', {
        front: data.get('front'), back: data.get('back'), topicIds: links, attemptId: from?.id,
      }), 'Flashcard salvo.');
      if (ok) { setEditing(undefined); setCreating(false); onClose(); }
    }}>
      <h2>{editing ? 'Editar flashcard' : 'Novo flashcard'}</h2>
      <label>Pergunta <input name="front" required maxLength={200} defaultValue={editing?.front ?? from?.prompt.slice(0, 200) ?? ''}/></label>
      <label>Resposta <textarea name="back" required rows={3} defaultValue={editing?.back ?? (from?.comment || (from?.granId ? 'Gabarito: ' + from.key : ''))}/></label>
      <TopicLinks topics={state.topics.filter(topic => state.trails.some(trail => trail.editionId === topic.editionId) || links.includes(topic.id))}
        value={links} onChange={setLinks}/>
      <div className="actions"><button className="button primary" disabled={!links.length}>Salvar</button>
        <button type="button" className="button secondary" onClick={() => { setEditing(undefined); setCreating(false); onClose(); }}>Fechar</button></div>
    </form>}
    <section className="panel">
      <div className="section-heading"><h2>Revisão</h2><span className="pill">{queue.length} pendente(s)</span></div>
      {result && <p className="feedback" role="status">{result}</p>}
      {due ? <div className="flashcard">
        <span className="icon-tile"><CircleHelp size={21}/></span><h3>{due.front}</h3>
        {revealed === due.id ? <><p className="prose">{due.back}</p>
          <div className="actions"><button className="button secondary" disabled={busy} onClick={() => void assess(due, false)}>Não lembrei</button>
            <button className="button primary" disabled={busy} onClick={() => void assess(due, true)}>Lembrei</button></div></>
          : <button className="button secondary" onClick={() => setRevealed(due.id)}>Revelar resposta</button>}
      </div> : <Empty>Você está em dia com as revisões.</Empty>}
    </section>
    <section className="section"><div className="section-heading wrap"><h2>Seus cartões</h2>{batch.toolbar}</div>
      {list.map(card => <div className="task-row" key={card.id}>{batch.checkbox({ kind: 'card', id: card.id, title: card.front })}<div><h3>{card.front}</h3><p>Revisão · {formatDate(card.due)}</p></div>
        <button className="button secondary" onClick={() => { setCreating(false); setEditing(card); setLinks(card.topicIds); }}>Editar</button>
        <RemoveButton kind="card" id={card.id} title={card.front} mutate={mutate} onRemoved={() => setEditing(undefined)}/></div>)}
    </section>
  </>;
}
