import { useEffect, useState } from 'react';
import { ExternalLink } from 'lucide-react';
import type { Block } from '../shared/overview.ts';
import { historicalExams } from '../shared/exam-history.ts';
import { historicalFocus, importedFocus, focusSelection, type FocusOverview, type FocusSelection, type FocusLevel } from '../shared/focus-overview.ts';
import { analysisVersion } from '../shared/theme-catalog.ts';
import { Empty, SourceLink } from './common.tsx';
import { api, message } from './api.ts';
import type { QuestionBank } from '../shared/types.ts';

const percent = new Intl.NumberFormat('pt-BR', { style: 'percent', maximumFractionDigits: 1 });
const sections = [
  { id: 'specific', name: 'Específicos' },
  { id: 'basic', name: 'Gerais e básicos' },
  { id: 'all', name: 'Prova inteira' },
] as const;

export type { FocusSelection } from '../shared/focus-overview.ts';
const levels = { discipline: 'Disciplinas', topic: 'Assuntos', subtopic: 'Subassuntos' } as const;

function Evidence({ rows }: { rows: FocusOverview['pendingByExam'] }) {
  return <ul className="overview-items">{rows.map(({ exam, items, total, share }) => <li key={exam.id}>
    <strong>{exam.label}</strong> · {items.length} de {total} · {percent.format(share)}
    {items.length > 0 && <div className="overview-evidence">{items.map(item => <span key={item.number}>
      {item.source ? <SourceLink source={item.source} label={'Item ' + item.number}/> : item.referenceSource ?
        <a className="source" href={item.referenceSource.url + '#page=' + item.referenceSource.page} target="_blank" rel="noreferrer">
          Item {item.number} · p. {item.referenceSource.page}</a> : <>Item {item.number}</>}
    </span>)}</div>}
  </li>)}</ul>;
}

function FocusResults({ result, historical, openQuestions, edition, block }: {
  result: FocusOverview; historical: boolean; openQuestions: (selection: FocusSelection) => void;
  edition: string; block: Block;
}) {
  const [showAll, setShowAll] = useState(false);
  const largest = result.rows[0]?.share || 1;
  return <>
    <section className="metrics overview-metrics" aria-label="Amostra da análise">
      <article><span>Provas no recorte</span><strong>{result.exams.length}</strong><p>{result.total} questões únicas</p></article>
      <article><span>{levels[result.level]} identificados</span><strong>{result.rows.length}</strong><p>Uma classificação principal por questão</p></article>
      <article><span>Questões detalhadas</span><strong>{percent.format(result.classified / result.total)}</strong>
        <p>{result.classified} de {result.total} com classificação revisada</p></article>
    </section>
    <section className="panel">
      <h2>Onde focar primeiro</h2>
      <p className="muted">{levels[result.level]} em ordem de incidência média por prova. Abra para conferir os itens e estudar; considere também o edital.</p>
      {result.exams.length === 1 && <p className="meta">Amostra de uma prova: ainda não é possível avaliar a recorrência entre edições.</p>}
      {!result.rows.length && <Empty>Este recorte ainda precisa de classificação; confira as questões e a distribuição por disciplina abaixo.</Empty>}
      <div className="overview-list">{(showAll ? result.rows : result.rows.slice(0, 10)).map((row, index) => <details key={row.id} className="overview-row">
        <summary>
          <span className="overview-label"><strong>{index + 1}. {row.label}</strong>
            <span className="meta">{result.level !== 'discipline' && <>{row.area}{result.level === 'subtopic' && ' → ' + row.topic} · </>}
              {row.appearances} de {result.exams.length} {result.exams.length === 1 ? 'prova' : 'provas'}</span>
          </span>
          <meter className="overview-bar" aria-hidden="true" min={0} max={largest} value={row.share}/>
          <span className="overview-count"><strong>{row.count} {row.count === 1 ? 'item' : 'itens'}</strong>
            <small>{percent.format(row.share)} médio por prova</small></span>
        </summary>
        {!historical && <div className="actions"><button className="button secondary"
          onClick={() => openQuestions(focusSelection(row, result.level, edition, block))}>Ver questões</button></div>}
        <Evidence rows={row.byExam}/>
      </details>)}</div>
      {result.rows.length > 10 && <button className="text-button" onClick={() => setShowAll(!showAll)}>
        {showAll ? 'Mostrar apenas os 10 primeiros' : `Ver todos (${result.rows.length})`}</button>}
    </section>
    {result.pending.length > 0 && <details className="panel overview-extra">
      <summary>{result.pending.length} questões com classificação pendente</summary>
      <p className="muted">Permanecem na amostra. A categoria ampla ou o número do item não bastam para atribuir um tema específico.</p>
      <Evidence rows={result.pendingByExam}/>
    </details>}
    <details className="panel overview-extra"><summary>Questões por disciplina</summary>
      {result.areaRows.map(row => <details key={row.label} className="overview-row"><summary>
        <span className="overview-label"><strong>{row.label}</strong></span>
        <span className="overview-count">{row.count} itens · {percent.format(row.count / result.total)}</span>
      </summary><Evidence rows={row.byExam}/></details>)}
    </details>
    <details className="panel overview-extra"><summary>Como a prioridade é calculada e fontes</summary>
      <p className="muted">A participação média divide os itens do tema pelo total do recorte em cada prova e calcula a média dessas proporções, incluindo zero quando o tema não aparece. Cada prova tem o mesmo peso. Empates consideram recorrência e quantidade de itens.</p>
      <p className="muted">Esta ordem usa incidência histórica na amostra, sem combinar automaticamente pesos do edital ou seu desempenho. Baixa frequência não significa que um conteúdo do edital pode ser descartado. Anuladas e questões sem gabarito entram na incidência, sem gerar correção ou nota.</p>
      <p className="muted">Disciplina → assunto → subassunto, com vocabulário de plataformas de concursos e revisão própria do conteúdo. Classificações editoriais podem variar entre plataformas. Bloco e área do cargo não são disciplinas.</p>
      <p className="muted">Uma versão por prova e bloco (A ou Única, quando disponível). Temas revisados a partir dos enunciados e alternativas, versão {analysisVersion}. No acervo, só são aplicados quando o conteúdo coincide com a questão revisada; suas classificações pessoais são preservadas.</p>
      {historical && historicalExams.filter(exam => result.exams.some(row => row.id === exam.id)).map(exam => <article key={exam.id} className="overview-source">
        <h3>{exam.year} · {exam.label}</h3><div className="actions">{exam.sources.map(source => <a className="source"
          key={source.url} href={source.url} target="_blank" rel="noreferrer">{source.label} <ExternalLink size={13} aria-hidden="true"/></a>)}</div>
      </article>)}
      {!historical && <p className="muted">As páginas dos PDFs importados estão nos detalhes de cada tema. Questões sem classificação revisada aparecem nas pendências.</p>}
    </details>
  </>;
}

function Analysis({ trailId, historical, bank, openQuestions }: {
  trailId: string; historical: boolean; bank?: QuestionBank; openQuestions: (selection: FocusSelection) => void;
}) {
  const [edition, setEdition] = useState('');
  const [block, setBlock] = useState<Block>('specific');
  const [area, setArea] = useState('');
  const [topicId, setTopicId] = useState('');
  const [level, setLevel] = useState<FocusLevel>('subtopic');
  const result = historical ? historicalFocus(trailId, edition, block, area, topicId, level) :
    importedFocus(bank?.questions ?? [], edition, block, area, topicId, level);
  return <>
    <div className="toolbar wrap overview-controls">
      <div className="segmented" aria-label="Bloco da prova">{sections.map(section => <button key={section.id}
        aria-pressed={block === section.id} onClick={() => { setBlock(section.id); setArea(''); setTopicId(''); }}>{section.name}</button>)}</div>
      <label>Prova<select value={edition} onChange={event => { setEdition(event.target.value); setArea(''); setTopicId(''); }}><option value="">Todas</option>
        {result.editions.map(exam => <option key={exam.id} value={exam.id}>{exam.label}</option>)}</select></label>
      <label>Disciplina<select value={area} onChange={event => { setArea(event.target.value); setTopicId(''); }}><option value="">Todas as disciplinas</option>
        {result.areas.map(value => <option key={value} value={value}>{value}</option>)}</select></label>
      <label>Assunto<select value={topicId} onChange={event => setTopicId(event.target.value)}><option value="">Todos os assuntos</option>
        {result.topics.map(topic => <option key={topic.id} value={topic.id}>{topic.label}{!area && ' · ' + topic.discipline}</option>)}</select></label>
      <label>Comparar<select value={level} onChange={event => setLevel(event.target.value as FocusLevel)}>
        {Object.entries(levels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
    </div>
    {result.total ? <FocusResults key={JSON.stringify([edition, block, area, topicId, level])} result={result}
      historical={historical} openQuestions={openQuestions} edition={edition} block={block}/> :
      <Empty>{result.editions.length ? 'Nenhuma questão neste recorte.' : historical ? 'Este concurso ainda não tem provas classificadas.' : 'Importe um caderno no Acervo para analisar os temas.'}</Empty>}
  </>;
}

export function Overview({ trailId, openQuestions }: { trailId: string; openQuestions: (selection: FocusSelection) => void }) {
  const [bank, setBank] = useState<QuestionBank>();
  const [error, setError] = useState('');
  const [historical, setHistorical] = useState(false);
  useEffect(() => {
    let current = true;
    let timer: ReturnType<typeof setTimeout>;
    async function load() {
      try {
        const result = await api<QuestionBank>('/question-bank?trailId=' + encodeURIComponent(trailId));
        if (!current) return;
        setBank(result); setError('');
        if (result.drafts.some(draft => draft.status === 'queued' || draft.status === 'processing')) timer = setTimeout(() => void load(), 1000);
      } catch (error) { if (current) setError(message(error)); }
    }
    void load();
    return () => { current = false; clearTimeout(timer); };
  }, [trailId]);
  return <>
    <div className="section-heading"><h2>{historical ? 'Histórico de referência' : 'Seu acervo'}</h2>
      <button className="text-button" onClick={() => setHistorical(!historical)}>{historical ? 'Ver acervo importado' : 'Ver histórico de referência'}</button></div>
    {error && !historical && <p className="alert" role="alert">{error}</p>}
    {!historical && !bank ? !error && <p role="status">Carregando análise…</p> :
      <Analysis key={String(historical)} trailId={trailId} historical={historical} bank={bank} openQuestions={openQuestions}/>}
  </>;
}
