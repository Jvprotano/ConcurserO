import { useEffect, useState } from 'react';
import { ArrowRight, ListFilter } from 'lucide-react';
import { emptyQuestionFilters, questionContent, questionDiscipline, type QuestionFilters } from '../shared/questions.ts';
import type { FilterOption, QuestionCatalog, QuestionListPage } from '../shared/question-catalog.ts';
import type { Attempt, BankQuestion, ImportSummary } from '../shared/types.ts';
import { api, message } from './api.ts';
import { Empty } from './common.tsx';
import { QuestionAnswer, type SharedProps } from './study.tsx';
import type { FocusSelection } from './overview.tsx';
import { relatedTopics } from '../shared/preparation.ts';
import { RemoveButton, useBatchRemoval } from './removal.tsx';

const count = (value: number) => value.toLocaleString('pt-BR');

export function Questions({ state, mutate, initialTopicId, initialFocus, questionId, proofs = false, changed, openAcervo }: SharedProps & {
  initialTopicId?: string; initialFocus?: FocusSelection; questionId?: string; proofs?: boolean;
  changed: () => Promise<void>; openAcervo: (jobId?: string) => void;
}) {
  const topic = state.topics.find(row => row.id === initialTopicId);
  const initial: QuestionFilters = { ...emptyQuestionFilters, contentTopics: topic
    ? relatedTopics(state, topic).map(({ discipline, title }) => ({ discipline, title })) : undefined,
    ...initialFocus, ...(questionId && { questionId, status: 'all' }) };
  const [filters, setFilters] = useState(initial);
  const [request, setRequest] = useState({ filters: initial, page: 0 });
  const [catalog, setCatalog] = useState<QuestionCatalog>();
  const [results, setResults] = useState<QuestionListPage>();
  const [error, setError] = useState('');
  const [loadVersion, setLoadVersion] = useState(0);
  const [loading, setLoading] = useState(true);
  const [answering, setAnswering] = useState(new Set<string>());
  const [savingImport, setSavingImport] = useState('');
  const [draftsOpen, setDraftsOpen] = useState(proofs);
  const imports = JSON.stringify([state.localQuestionCount, state.imports.map(row => [row.id, row.status, row.completed, row.message])]);
  const reload = () => { setLoading(true); setLoadVersion(value => value + 1); };
  const removalTarget = (id: string) => ({ kind: 'gran-question' as const, id, title: 'Questão Gran Q' + id });
  const removal = useBatchRemoval(results?.questions.flatMap(row => row.gran ? [removalTarget(row.gran.id)] : []) ?? [], mutate, reload);
  const busy = loading || answering.size > 0 || Boolean(savingImport) || removal.selecting;

  useEffect(() => {
    let active = true;
    let timer: ReturnType<typeof setTimeout>;
    async function loadCatalog() {
      try {
        const value = await api<QuestionCatalog>('/questions/catalog' + (proofs ? '?proofs=1' : ''));
        if (!active) return;
        setCatalog(value);
        if (value.drafts.some(row => row.status === 'queued' || row.status === 'processing')) {
          timer = setTimeout(loadCatalog, 1000);
        }
      } catch (error) { if (active) setError(message(error)); }
    }
    void loadCatalog();
    return () => { active = false; clearTimeout(timer); };
  }, [proofs, imports, loadVersion]);

  useEffect(() => {
    let active = true;
    setLoading(true); setError('');
    api<QuestionListPage>('/questions/search', 'POST', { ...request, proofs })
      .then(value => { if (active) setResults(value); })
      .catch(error => { if (active) setError(message(error)); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [proofs, request, imports, loadVersion]);

  const latest = new Map<string, Attempt>();
  for (const attempt of state.attempts) if (!latest.has(attempt.questionId)) latest.set(attempt.questionId, attempt);
  function apply(next: QuestionFilters) {
    setLoading(true); setFilters(next); setRequest({ filters: next, page: 0 });
  }
  function goToPage(page: number) {
    setLoading(true); setRequest({ ...request, page });
    document.getElementById('question-results')?.scrollIntoView({ block: 'start' });
  }
  function field(key: keyof Omit<QuestionFilters, 'topicIds' | 'contentTopics'>, label: string, options: FilterOption[], defaultLabel = 'Todos',
    disabled = false) {
    return <label>{label}<select disabled={disabled} value={filters[key] ?? ''} onChange={event => setFilters({ ...filters, [key]: event.target.value,
      ...(key === 'discipline' ? { topicIds: [], syllabusTopicId: '', themeId: '' } :
        key === 'syllabusTopicId' ? { themeId: '' } : {}) })}>
      <option value="">{defaultLabel}</option>{options.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
    </select></label>;
  }
  async function saveAll(draft: ImportSummary) {
    if (busy) return;
    setSavingImport(draft.id); setError('');
    try {
      const result = await api<{ published: number; pending: string[] }>('/imports/' + draft.id + '/save-all', 'POST',
        { requestId: crypto.randomUUID(), keyId: draft.keyId });
      await mutate(async () => undefined, result.published + ' questões salvas.' +
        (result.pending.length ? ' ' + result.pending.length + ' com pendência no caderno.' : ''));
      reload();
    } catch (error) { setError(message(error)); }
    finally { setSavingImport(''); }
  }
  function renderQuestion(question: BankQuestion) {
    const path = questionContent(question);
    const target = question.gran && removalTarget(question.gran.id);
    const attempt = latest.get(question.id);
    const title = question.exam === 'demo' ? 'Demonstração autoral' : question.examLabel || question.exam;
    return <article className="panel" key={question.id + ':' + question.revision}>
      <div className="section-heading wrap">
        <h3>{question.gran ? 'Questão Q' + question.gran.id : 'Questão ' + question.number}</h3>
        {target && (removal.selecting ? removal.checkbox(target) : <RemoveButton {...target} mutate={mutate} onRemoved={reload} disabled={busy}/>)}
      </div>
      <p className="eyebrow">{[questionDiscipline(question), path?.topic || question.topicTitle].filter(Boolean).join(' → ')}</p>
      {path?.subtopic && <p className="meta">{path.subtopic}</p>}
      <p className="meta">{[question.board, title, question.version, question.gran && 'Gran Questões'].filter(Boolean).join(' · ')}</p>
      {question.gran?.discipline && question.gran.discipline !== questionDiscipline(question) && <details className="meta">
        <summary>Classificação de origem</summary>{[question.gran.discipline, question.gran.topic].filter(Boolean).join(' → ')}
      </details>}
      {attempt && <p className="meta">Última tentativa · {attempt.correct ? (attempt.guess ? 'Acerto por chute' : 'Acerto') : 'Erro'}</p>}
      <QuestionAnswer question={question} changed={changed} onBusy={value => setAnswering(previous => {
        const next = new Set(previous);
        if (value) next.add(question.id);
        else next.delete(question.id);
        return next;
      })}/>
      {question.status !== 'ready' && <p className="callout attention">{question.status === 'annulled'
        ? 'Questão anulada pela banca.' : question.pendingReason || 'Gabarito indisponível.'}
        {question.status === 'pending' && question.importId && <> <button className="text-button" onClick={() => openAcervo(question.importId)}>Abrir caderno</button></>}
      </p>}
    </article>;
  }

  return <>
    {error && <p className="alert" role="alert">{error} <button type="button" className="text-button" onClick={reload}>Tentar novamente</button></p>}
    {catalog && <form className="panel" onSubmit={event => { event.preventDefault(); apply(filters); }}>
      <div className="section-heading wrap"><h2><ListFilter size={20}/> Filtrar questões</h2>
        {!proofs && catalog.granCount > 0 && <span className="meta">{count(catalog.granCount)} questões do Gran no banco local</span>}
      </div>
      <fieldset className="bank-filter-fields" disabled={busy}>
        {filters.contentTopics?.length ? <p className="muted">Assunto do edital · {topic?.title} <button type="button" className="text-button"
          onClick={() => apply({ ...filters, contentTopics: undefined })}>Remover recorte</button></p> : null}
        {filters.questionId && <p className="muted">Histórico da questão <button type="button" className="text-button"
          onClick={() => apply({ ...emptyQuestionFilters })}>Ver todas</button></p>}
        <label>Buscar questões<input type="search" value={filters.search} placeholder="Enunciado, assunto ou código"
          onChange={event => setFilters({ ...filters, search: event.target.value, questionId: undefined })}/></label>
        <div className="form-grid bank-filter-grid">
          {field('discipline', 'Disciplina', catalog.disciplines)}
          {field('syllabusTopicId', 'Assunto', catalog.subjects.filter(row => filters.discipline
            ? row.discipline === filters.discipline : row.value === filters.syllabusTopicId),
          filters.discipline ? 'Todos' : 'Selecione a disciplina', !filters.discipline && !filters.syllabusTopicId)}
          {field('board', 'Banca', catalog.boards)}
          {field('history', 'Minhas respostas', [{ value: 'unanswered', label: 'Não respondidas' }, { value: 'answered', label: 'Respondidas' },
            { value: 'wrong', label: 'Errei na última tentativa' }, { value: 'correct', label: 'Acertei na última tentativa' },
            { value: 'guess', label: 'Chute na última tentativa' }])}
        </div>
        <details open={filters.themeId || filters.exam || filters.block || filters.trailId || filters.topicIds.length ? true : undefined}>
          <summary>Mais filtros</summary>
          <div className="form-grid bank-filter-grid">
            {!proofs && field('origin', 'Origem', [{ value: 'gran', label: 'Gran Questões' }, { value: 'pdf', label: 'Cadernos PDF' },
              { value: 'demo', label: 'Demonstração autoral' }])}
            {field('status', 'Situação', [{ value: 'all', label: 'Todas' }, { value: 'ready', label: 'Com gabarito' },
              { value: 'pending', label: 'Pendentes' }, { value: 'annulled', label: 'Anuladas' }], 'Exceto anuladas')}
            {field('exam', 'Prova de origem', catalog.exams)}
            {field('trailId', 'Concurso do Acervo', state.trails.map(row => ({ value: row.id, label: row.title })))}
            {catalog.subtopics.length > 0 && field('themeId', 'Subassunto', catalog.subtopics.filter(row =>
              (!filters.discipline || row.discipline === filters.discipline) && (!filters.syllabusTopicId || row.topicId === filters.syllabusTopicId)))}
            {catalog.blocks.length > 0 && field('block', 'Bloco', catalog.blocks)}
            {field('type', 'Formato', [{ value: 'choice', label: 'Múltipla escolha' }, { value: 'boolean', label: 'Certo ou errado' }])}
          </div>
          {!!catalog.personalTopics.length && <details className="bank-topics"><summary>Classificação pessoal</summary>
            <div className="bank-topic-list">{catalog.personalTopics.filter(row => !filters.discipline || row.discipline === filters.discipline)
              .map(row => <label className="check" key={row.value}>
                <input type="checkbox" checked={filters.topicIds.includes(row.value)} onChange={event => setFilters({ ...filters,
                  topicIds: event.target.checked ? [...filters.topicIds, row.value] : filters.topicIds.filter(id => id !== row.value) })}/>
                <span>{row.label} <small className="meta">{row.edition}</small></span>
              </label>)}</div>
          </details>}
        </details>
        <div className="actions"><button className="button primary">Filtrar questões</button>
          <button type="button" className="text-button" onClick={() => apply({ ...emptyQuestionFilters })}>Limpar filtros</button></div>
      </fieldset>
    </form>}
    {catalog && (proofs || catalog.drafts.length > 0) && <details className="panel" open={draftsOpen} onToggle={event => setDraftsOpen(event.currentTarget.open)}>
      <summary>Cadernos do Acervo</summary>
      <button className="text-button" onClick={() => openAcervo()}>Importar caderno</button>
      {catalog.drafts.map(draft => <div className="task-row topic-row" key={draft.id}><div><h3>{draft.name}</h3>
        <p>{draft.count} questões · {draft.message}{draft.keys.find(key => key.id === draft.keyId)?.preliminary ? ' · Gabarito preliminar' : ''}</p></div>
        {draft.keyId && <button className="button primary" disabled={busy} onClick={() => void saveAll(draft)}>
          {savingImport === draft.id ? 'Salvando…' : 'Salvar todas as questões'}</button>}
        <button className={draft.keyId ? 'text-button' : 'button secondary'} onClick={() => openAcervo(draft.id)}>Abrir caderno</button>
      </div>)}
    </details>}
    {loading && <p role="status">Carregando questões…</p>}
    {results && !loading && <section id="question-results" aria-label="Questões encontradas">
      <div className="section-heading wrap"><h2>{count(results.total)} {results.total === 1 ? 'questão encontrada' : 'questões encontradas'}</h2>
        {removal.toolbar}
      </div>
      {catalog && (catalog.pending > 0 || catalog.annulled > 0) && <p className="meta">
        {[catalog.pending > 0 && count(catalog.pending) + ' pendentes no acervo', catalog.annulled > 0 && count(catalog.annulled) + ' anuladas no acervo'].filter(Boolean).join(' · ')}
      </p>}
      {!results.total && <Empty>{filters.questionId ? 'Esta questão não está disponível no acervo.' : 'Nenhuma questão corresponde aos filtros.'}</Empty>}
      {results.pages > 1 && <div className="toolbar wrap" aria-label="Páginas de questões">
        <button className="button secondary" disabled={busy || results.page === 0} onClick={() => goToPage(results.page - 1)}>Anterior</button>
        <span className="meta" aria-live="polite">Página {count(results.page + 1)} de {count(results.pages)}</span>
        <button className="button secondary" disabled={busy || results.page + 1 >= results.pages} onClick={() => goToPage(results.page + 1)}>Próxima <ArrowRight size={16}/></button>
      </div>}
      <div key={loadVersion + ':' + JSON.stringify(request)}>{results.questions.map(renderQuestion)}</div>
    </section>}
  </>;
}
