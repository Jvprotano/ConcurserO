import { useEffect, useRef, useState } from 'react';
import { BookOpen, ChartNoAxesColumnIncreasing, ClipboardList, FileArchive, FileText, Home, Layers3, NotebookPen, Settings2, ShieldCheck } from 'lucide-react';
import { createRoot } from 'react-dom/client';
import { api, message } from './api.ts';
import { Acervo } from './acervo.tsx';
import { Empty } from './common.tsx';
import { RemovedItems } from './removal.tsx';
import { Contests } from './contests.tsx';
import { relatedTopics } from '../shared/preparation.ts';
import { Edital, Settings } from './edital.tsx';
import { Questions } from './questions.tsx';
import { Overview, type FocusSelection } from './overview.tsx';
import { ErrorBook, Flashcards, Today, TopicStudy } from './study.tsx';
import { Summaries } from './summaries.tsx';
import { topicActivity } from './agenda.tsx';
import type { Activity } from '../shared/agenda.ts';
import type { Attempt, ImportKind, StudyState, Topic, Trail } from '../shared/types.ts';
import '@fontsource-variable/inter';
import '@fontsource-variable/bricolage-grotesque';
import './styles.css';

const navigation = [
  { id: 'hoje', title: 'Hoje', icon: Home, description: '' },
  { id: 'concursos', title: 'Concursos', icon: ShieldCheck, description: 'Uma preparação, com progresso e prioridades por edital.' },
  { id: 'overview', title: 'Incidência nas provas', icon: ChartNoAxesColumnIncreasing, description: 'Confira a amostra e os temas recorrentes de cada concurso.' },
  { id: 'edital', title: 'Editais', icon: BookOpen, description: 'Acompanhe os assuntos de cada objetivo e prepare as próximas edições.' },
  { id: 'questoes', title: 'Questões', icon: ClipboardList, description: 'Filtre por disciplina e assuntos, misture questões e responda na própria lista.' },
  { id: 'erros', title: 'Caderno de erros', icon: NotebookPen, description: 'Reveja os erros, os chutes e o histórico de tentativas.' },
  { id: 'cards', title: 'Flashcards', icon: Layers3, description: 'Recupere de memória e revise no intervalo planejado.' },
  { id: 'resumos', title: 'Resumos', icon: FileText, description: 'Escreva e organize suas anotações de estudo.' },
  { id: 'acervo', title: 'Acervo', icon: FileArchive, description: 'Importe editais, provas e gabaritos.' },
  { id: 'config', title: 'Configurações', icon: Settings2, description: 'Ajuste o tempo disponível para sua preparação.' },
] as const;
type View = typeof navigation[number]['id'];

function App() {
  const [state, setState] = useState<StudyState>();
  const [summaryContext, setSummaryContext] = useState(() => new URLSearchParams(window.location.search));
  const [view, setView] = useState<View>(() => summaryContext.has('resumos') ? 'resumos' : 'hoje');
  const summaryDirty = useRef(false);
  const [topicId, setTopicId] = useState('');
  const [activity, setActivity] = useState<Activity>();
  const [plannedCards, setPlannedCards] = useState<string[]>();
  const [focusSelection, setFocusSelection] = useState<FocusSelection>();
  const [mode, setMode] = useState<'study' | 'practice'>('practice');
  const [from, setFrom] = useState<Attempt>();
  const [messageText, setMessageText] = useState('');
  const [error, setError] = useState('');
  const [documentTrailId, setDocumentTrailId] = useState('');
  const [analysisTrailId, setAnalysisTrailId] = useState('');
  const [acervoJobId, setAcervoJobId] = useState<string>();
  const [acervoKind, setAcervoKind] = useState<ImportKind>('prova');
  const [acervoEdition, setAcervoEdition] = useState<string>();
  async function refresh() {
    setState(await api<StudyState>('/state'));
  }
  useEffect(() => { void refresh().catch(error => setError(message(error))); }, []);
  useEffect(() => {
    if (state && summaryContext.has('novo')) window.history.replaceState(null, '', '?resumos');
  }, [state, summaryContext]);
  useEffect(() => {
    const handle = () => { void refresh().catch(error => setError(message(error))); };
    window.addEventListener('focus', handle);
    const timer = setInterval(handle, 120_000);
    return () => { window.removeEventListener('focus', handle); clearInterval(timer); };
  }, []);
  async function mutate(action: () => Promise<unknown>, feedback: string | (() => string) = '') {
    setError(''); setMessageText('');
    try {
      await action();
      await refresh();
      setMessageText(typeof feedback === 'function' ? feedback() : feedback);
      return true;
    } catch (error) { setError(message(error)); return false; }
  }
  function navigate(next: View) {
    if (view === 'resumos') {
      if (next === 'resumos' || (summaryDirty.current && !window.confirm('Descartar as alterações ainda não salvas?'))) return;
      summaryDirty.current = false;
      setSummaryContext(new URLSearchParams());
      window.history.replaceState(null, '', window.location.pathname);
    }
    if (next === 'resumos') window.history.replaceState(null, '', '?resumos');
    setView(next); setFrom(undefined); setError(''); setMessageText(''); setActivity(undefined); setPlannedCards(undefined);
    if (next === 'questoes') { setTopicId(''); setFocusSelection(undefined); setMode('practice'); }
    if (next === 'acervo') { setAcervoJobId(undefined); setAcervoKind('prova'); setAcervoEdition(undefined); }
    window.scrollTo(0, 0);
  }
  function study(topic: Topic, next: 'study' | 'practice') {
    if (state && next === 'study' && topic.syllabus) {
      navigate('hoje'); setActivity(topicActivity(state, topic));
      return;
    }
    const content = state && next === 'study' ? relatedTopics(state, topic).find(row => row.material || row.summary || row.materialCount) : undefined;
    navigate('questoes'); setTopicId(content?.id ?? topic.id); setMode(next);
  }
  function openEdital(trail: Trail) { setDocumentTrailId(trail.id); navigate('edital'); }
  if (!state) return <main className="boot">
    <ShieldCheck size={30}/><h1>ConcurserO</h1>
    <p role={error ? 'alert' : 'status'}>{error || 'Carregando sua área de estudo…'}</p>
    {error && <button className="button primary" onClick={() => void mutate(refresh)}>Tentar novamente</button>}
  </main>;
  const trail = (state.trails.find(item => item.id === (view === 'overview' ? analysisTrailId : documentTrailId)) ?? state.trails[0])!;
  const topics = state.topics;
  const activeTopic = topics.find(topic => topic.id === topicId);
  const item = navigation.find(item => item.id === view)!;
  const shared = { state, trail, topics, mutate };
  const followed = state.trails.filter(trail => trail.enabled !== false).length;
  return <div className="shell">
    <a className="skip" href="#main">Pular para o conteúdo</a>
    <aside className="sidebar">
      <a className="brand" href="#hoje" onClick={event => { event.preventDefault(); navigate('hoje'); }}>
        <span className="brand-mark"><ShieldCheck size={23}/></span>
        <span>ConcurserO<small>Sua preparação para concursos</small></span>
      </a>
      <nav aria-label="Navegação principal">
        {navigation.map(({ id, title, icon: Icon }) => <button key={id} onClick={() => navigate(id)}
          aria-current={id === view ? 'page' : undefined} className={id === view ? 'nav-link active' : 'nav-link'}>
          <Icon size={18} aria-hidden="true"/><span>{title}</span>
        </button>)}
      </nav>
      <div className="sidebar-footer"><span/> Dados neste computador</div>
    </aside>
    <div className="workspace">
      <div className="topbar"><span>Preparação unificada</span><span>{followed} {followed === 1 ? 'concurso acompanhado' : 'concursos acompanhados'}</span></div>
      <main id="main" className="main" tabIndex={-1}>
        {view !== 'hoje' && <header className="page-heading"><h1>{item.title}</h1><p>{item.description}</p></header>}
        {error && <p className="alert" role="alert">{error}</p>}
        {messageText && <p className="feedback" role="status">{messageText}</p>}
        {trail && (['edital', 'acervo', 'overview'] as View[]).includes(view) && <div className="toolbar">
          <label>{view === 'overview' ? 'Concurso da análise' : 'Concurso do documento'}<select value={trail.id} onChange={event => {
            if (view === 'overview') setAnalysisTrailId(event.target.value);
            else { setDocumentTrailId(event.target.value); setAcervoJobId(undefined); setAcervoEdition(undefined); }
          }}>{state.trails.map(row => <option key={row.id} value={row.id}>{row.title}{row.enabled === false ? ' · pausado' : ''}</option>)}</select></label>
        </div>}
        {view === 'hoje' && <Today {...shared} study={study} edital={openEdital} activity={activity} selectActivity={setActivity}
          review={ids => { navigate('cards'); setPlannedCards(ids); }} open={navigate}/>}
        {view === 'concursos' && <Contests {...shared} study={study} edital={openEdital}/>}
        {trail && view === 'overview' && <Overview key={trail.id} trailId={trail.id} openQuestions={selection => {
          navigate('questoes'); setFocusSelection({ ...selection, trailId: trail.id });
        }}/>}
        {trail && view === 'edital' && <Edital key={trail.id} {...shared} topics={topics.filter(topic => topic.editionId === trail.editionId)} study={study} importPdf={editionId => {
          navigate('acervo'); setAcervoKind('edital'); setAcervoEdition(editionId);
        }}/>}
        {view === 'questoes' && <>
          {activeTopic && mode === 'study' ? <>
            <button className="text-button" onClick={() => navigate('questoes')}>Ver banco de questões</button>
            <TopicStudy key={activeTopic.id} topic={activeTopic} practice={() => setMode('practice')} mutate={mutate}/>
          </> : <Questions key={topicId + ':' + JSON.stringify(focusSelection)} {...shared}
            initialTopicId={topicId} initialFocus={focusSelection} changed={refresh}
            openAcervo={jobId => {
              const job = state.imports.find(job => job.id === jobId);
              if (job) setDocumentTrailId(job.trailId);
              navigate('acervo'); setAcervoJobId(jobId);
            }}/>}
        </>}
        {view === 'erros' && <ErrorBook {...shared} study={study} newCard={attempt => {
          navigate('cards'); setFrom(attempt);
        }}/>}
        {view === 'cards' && <Flashcards {...shared} from={from} plannedCards={plannedCards} onClose={() => setFrom(undefined)}/>}
        {view === 'resumos' && <Summaries state={state} context={summaryContext} changed={dirty => { summaryDirty.current = dirty; }}/>}
        {trail && view === 'acervo' && <Acervo key={trail.id} {...shared} initialJobId={acervoJobId} initialKind={acervoKind} initialEditionId={acervoEdition}
          openDocument={job => { setDocumentTrailId(job.trailId); setAcervoJobId(job.id); setAcervoEdition(undefined); }}/>}
        {view === 'config' && <Settings {...shared}/>}
        {!trail && (['acervo', 'edital', 'overview'] as View[]).includes(view) && <>
          <Empty>Cadastre um concurso ou restaure um item para continuar.</Empty>
          <button className="button primary" onClick={() => navigate('concursos')}>Cadastrar concurso</button>
          <RemovedItems mutate={mutate} refreshKey={state}/>
        </>}
      </main>
    </div>
  </div>;
}

createRoot(document.getElementById('root')!).render(<App/>);
