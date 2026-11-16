import { useEffect, useState } from 'react';
import { ArrowRight, ListFilter } from 'lucide-react';
import { emptyQuestionFilters, filterQuestions, questionDiscipline, topicFilterId, type QuestionFilters } from '../shared/questions.ts';
import type { ImportSummary, QuestionBank } from '../shared/types.ts';
import { api, message } from './api.ts';
import { Empty, SourceLink } from './common.tsx';
import { QuestionAnswer, type SharedProps } from './study.tsx';
import type { FocusSelection } from './overview.tsx';
import { relatedTopics } from '../shared/preparation.ts';

export function Questions({ state, mutate, initialTopicId, initialFocus, changed, openAcervo }: SharedProps & {
  initialTopicId: string; changed: () => Promise<void>; openAcervo: (jobId?: string) => void;
  initialFocus?: FocusSelection;
}) {
  const initialTopic = state.topics.find(topic => topic.id === initialTopicId);
  const initial: QuestionFilters = { ...emptyQuestionFilters, topicIds: [], contentTopics: initialTopic
    ? relatedTopics(state, initialTopic).map(topic => ({ discipline: topic.discipline, title: topic.title })) : undefined,
    ...(initialFocus ?? {}) };
  const [filters, setFilters] = useState(initial);
  const [applied, setApplied] = useState(initial);
  const [attempts, setAttempts] = useState(state.attempts);
  const [bank, setBank] = useState<QuestionBank>();
  const [error, setError] = useState('');
  const [page, setPage] = useState(0);
  const [session, setSession] = useState(0);
  const [busyIds, setBusyIds] = useState<Set<string>>(() => new Set());
  const [savingImport, setSavingImport] = useState('');
  const busy = busyIds.size > 0 || Boolean(savingImport);
  function load() {
    return api<QuestionBank>('/question-bank');
  }
  useEffect(() => {
    let current = true;
    let timer: ReturnType<typeof setTimeout>;
    async function refreshBank() {
      try {
        const result = await load();
        if (!current) return;
        setBank(result);
        if (result.drafts.some(draft => draft.status === 'queued' || draft.status === 'processing')) timer = setTimeout(() => void refreshBank(), 1000);
      } catch (error) { if (current) setError(message(error)); }
    }
    void refreshBank();
    return () => { current = false; clearTimeout(timer); };
  }, [state.imports]);
  function apply(next: QuestionFilters) {
    setFilters(next); setApplied(next); setAttempts(state.attempts); setPage(0); setSession(session + 1);
  }
  function field(key: keyof Omit<QuestionFilters, 'topicIds' | 'contentTopics'>, label: string, options: { value: string; label: string }[]) {
    return <label>{label}<select value={filters[key]} onChange={event => setFilters({ ...filters, [key]: event.target.value,
      ...(key === 'discipline' ? { topicIds: [], syllabusTopicId: '', themeId: '' } :
        key === 'syllabusTopicId' ? { themeId: '' } : {}) })}>
      <option value="">Todos</option>{options.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
    </select></label>;
  }
  if (!bank) return <div role={error ? 'alert' : 'status'}>{error || 'Carregando banco de questões…'}
    {error && <button className="button secondary" onClick={() => { setError(''); void load().then(setBank).catch(error => setError(message(error))); }}>Tentar novamente</button>}
  </div>;
  const ready = bank.questions.filter(question => question.status !== 'annulled');
  const official = ready.filter(question => question.exam !== 'demo').length;
  const annulled = bank.questions.length - ready.length;
  const results = filterQuestions(bank.questions, applied, attempts);
  const pageSize = 10;
  const pages = Math.max(1, Math.ceil(results.length / pageSize));
  const currentPage = Math.min(page, pages - 1);
  const topics = [...new Map(ready.filter(question => !filters.discipline || questionDiscipline(question) === filters.discipline)
    .map(question => {
      const topicId = topicFilterId(question.discipline, question.topicTitle);
      return [topicId, { ...question, topicId }] as const;
    })).values()];
  const disciplines = [...new Set(ready.map(questionDiscipline))].sort((a, b) => a.localeCompare(b, 'pt-BR'));
  const classified = ready.filter(row => row.analysis && (!filters.discipline || questionDiscipline(row) === filters.discipline));
  const syllabusTopics = [...new Map(classified.map(row => [row.analysis!.topicId,
    { value: row.analysis!.topicId, label: row.analysis!.topic + (!filters.discipline ? ' · ' + row.analysis!.discipline : '') }])).values()]
    .sort((a, b) => a.label.localeCompare(b.label, 'pt-BR'));
  const subtopics = [...new Map(classified.filter(row => !filters.syllabusTopicId || row.analysis!.topicId === filters.syllabusTopicId)
    .map(row => [row.analysis!.id, { value: row.analysis!.id, label: row.analysis!.label + ' · ' + row.analysis!.topic }])).values()]
    .sort((a, b) => a.label.localeCompare(b.label, 'pt-BR'));
  const exams = [...new Set(ready.map(question => question.exam))].sort().reverse();
  const pending = ready.filter(question => question.status === 'pending').length;
  async function saveAll(draft: ImportSummary) {
    if (busy) return;
    setSavingImport(draft.id); setError('');
    try {
      const result = await api<{ published: number; pending: string[] }>('/imports/' + draft.id + '/save-all', 'POST',
        { requestId: crypto.randomUUID(), keyId: draft.keyId });
      await mutate(async () => undefined, result.published + ' questões salvas.' +
        (result.pending.length ? ' ' + result.pending.length + ' com pendência no caderno.' : ''));
      setBank(await load());
    } catch (error) { setError(message(error)); }
    finally { setSavingImport(''); }
  }
  return <>
    <section className="panel">
      <div className="section-heading"><h2>Banco de questões</h2>
        <button className="button secondary" onClick={() => openAcervo()}>Adicionar questões <ArrowRight size={16}/></button></div>
      <p className="muted">{official} questões de provas · {pending} pendentes · {ready.filter(question => question.exam === 'demo').length} de demonstração</p>
      {error && <p className="alert" role="alert">{error}</p>}
      {bank.drafts.map(draft => <div className="task-row topic-row" key={draft.id}><div><h3>{draft.name}</h3>
        <p>{draft.count} questões · {draft.message}{draft.keys.find(key => key.id === draft.keyId)?.preliminary ? ' · Gabarito preliminar' : ''}</p></div>
        {draft.keyId && <button className="button primary" disabled={busy} onClick={() => void saveAll(draft)}>
          {savingImport === draft.id ? 'Salvando…' : 'Salvar todas as questões'}</button>}
        <button className={draft.keyId ? 'text-button' : 'button secondary'} onClick={() => openAcervo(draft.id)}>Abrir caderno</button>
      </div>)}
    </section>
    <form className="panel" onSubmit={event => { event.preventDefault(); apply(filters); }}>
      <h2><ListFilter size={20}/> Filtrar questões</h2>
      {!!filters.contentTopics?.length && <p className="muted">Assunto do edital: {initialTopic?.title} <button type="button" className="text-button" disabled={busy}
        onClick={() => apply({ ...filters, contentTopics: undefined })}>Remover recorte</button></p>}
      {filters.themeId && <p className="muted">Subassunto: {bank.questions.find(row => row.analysis?.id === filters.themeId)?.analysis?.label ?? filters.themeId}
        {' '}<button type="button" className="text-button" disabled={busy}
          onClick={() => apply({ ...filters, themeId: '' })}>Remover subassunto</button></p>}
      <fieldset className="bank-filter-fields" disabled={busy}>
        <label>Buscar no enunciado ou assunto<input type="search" value={filters.search} placeholder="Ex.: redes, cadeia de custódia…"
          onChange={event => setFilters({ ...filters, search: event.target.value })}/></label>
        <div className="form-grid bank-filter-grid">
          {field('trailId', 'Concurso de origem', state.trails.map(trail => ({ value: trail.id, label: trail.title })))}
          {field('discipline', 'Disciplina', disciplines.map(value => ({ value, label: value })))}
          {field('syllabusTopicId', 'Assunto', syllabusTopics)}
          <details><summary>Mais filtros</summary>
          {field('themeId', 'Subassunto', subtopics)}
          {field('exam', 'Prova de origem', exams.map(value => ({ value, label: value === 'demo' ? 'Demonstração autoral' : ready.find(question => question.exam === value)?.examLabel || 'Prova ' + value })))}
          {field('block', 'Bloco', [...new Set(ready.map(question => question.block))].map(value => ({ value,
            label: value === 'basico' ? 'Conhecimentos básicos' : value === 'especifico' ? 'Conhecimentos específicos' : value })))}
          {field('type', 'Formato', [{ value: 'choice', label: 'Múltipla escolha' }, { value: 'boolean', label: 'Certo ou errado' }])}
          {field('origin', 'Origem', [{ value: 'official', label: 'Questões de provas' }, { value: 'demo', label: 'Demonstração autoral' }])}
          {field('history', 'Minhas respostas', [{ value: 'unanswered', label: 'Não respondidas' }, { value: 'answered', label: 'Respondidas' },
            { value: 'wrong', label: 'Errei na última tentativa' }, { value: 'correct', label: 'Acertei na última tentativa' }, { value: 'guess', label: 'Chute na última tentativa' }])}
          </details>
        </div>
        <details className="bank-topics" open={filters.topicIds.length ? true : undefined}>
          <summary>Classificação pessoal · {filters.topicIds.length ? filters.topicIds.length + ' vínculo(s) selecionado(s)' : 'Opcional'} </summary>

          <div className="bank-topic-list">{topics.map(topic => <label className="check" key={topic.topicId}>
            <input type="checkbox" checked={filters.topicIds.includes(topic.topicId)} onChange={event => setFilters({ ...filters,
              topicIds: event.target.checked ? [...filters.topicIds, topic.topicId] : filters.topicIds.filter(id => id !== topic.topicId) })}/>
            <span>{topic.topicTitle}<small className="meta">{topic.discipline} · {topic.editionTitle}</small></span>
          </label>)}</div>
          {!topics.length && <p className="muted">Ainda não há assuntos disponíveis.</p>}
        </details>
        <div className="actions"><button className="button primary">Filtrar questões</button>
          <button type="button" className="text-button" onClick={() => apply({ ...emptyQuestionFilters, topicIds: [] })}>Limpar filtros</button></div>
      </fieldset>
    </form>
    <section aria-label="Questões encontradas">
      <div className="section-heading"><h2>{results.length} questão(ões) encontrada(s)</h2><span className="meta">{annulled > 0 ? `${annulled} anulada(s) fora do treino` : ''}</span></div>

      {!results.length && <Empty>{ready.length ? 'Nenhuma questão corresponde aos filtros. Limpe os filtros ou confira mais cadernos no Acervo.' : 'Importe um caderno no Acervo para ver suas questões.'}</Empty>}
      {results.slice(currentPage * pageSize, (currentPage + 1) * pageSize).map((question, index) => <article className="panel" key={session + ':' + question.id + ':' + question.revision}>
        <p className="eyebrow">{questionDiscipline(question)}{question.analysis && <> → {question.analysis.topic}</>}</p>
        {question.analysis && <p className="meta">{question.analysis.label}</p>}
        {question.analysis && <details className="meta"><summary>Classificação pessoal</summary>
          {question.discipline} · {question.topicTitle}</details>}
        <h3>Questão {currentPage * pageSize + index + 1} · {question.exam === 'demo' ? 'Demonstração autoral' : `${question.board || 'Banca a definir'} · ${question.examLabel || question.exam}`} · item {question.number}</h3>
        <p className="meta">{state.trails.find(trail => trail.id === question.trailId)?.title}</p>
        <p className="meta">{question.block === 'basico' ? 'Conhecimentos básicos' : question.block === 'especifico' ? 'Conhecimentos específicos' : question.block} · {question.version}{question.editionTitle && ' · ' + question.editionTitle}</p>
        {question.status === 'pending' ? <>
          <p className="prose">{question.prompt}</p>
          <SourceLink source={question.source} label="Caderno original"/>
          {question.context && <details className="callout"><summary>Texto de apoio</summary><p className="prose">{question.context}</p></details>}
          {question.options.map(option => <p className="option" key={option.key}><strong>{option.key}</strong> {option.text}</p>)}
          <p className="meta">{question.pendingReason} · <button className="text-button" onClick={() => openAcervo(question.importId)}>Abrir caderno</button></p>
        </> : <QuestionAnswer question={{ ...question, status: question.status }} changed={changed} onBusy={value => setBusyIds(previous => {
          const next = new Set(previous); if (value) next.add(question.id); else next.delete(question.id); return next;
        })}/>}
      </article>)}
      {results.length > pageSize && <div className="toolbar wrap" aria-label="Páginas de questões">
        <button className="button secondary" disabled={!currentPage || busy} onClick={() => setPage(currentPage - 1)}>Anterior</button>
        <span className="meta" aria-live="polite">Página {currentPage + 1} de {pages}</span>
        <button className="button secondary" disabled={currentPage + 1 >= pages || busy} onClick={() => setPage(currentPage + 1)}>Próxima <ArrowRight size={16}/></button>
      </div>}
    </section>
  </>;
}
