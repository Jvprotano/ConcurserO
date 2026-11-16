import { useState } from 'react';
import { Plus } from 'lucide-react';
import { preparation } from '../shared/preparation.ts';
import type { Topic, Trail } from '../shared/types.ts';
import { api, formatDate } from './api.ts';
import { Empty } from './common.tsx';
import { RemoveButton } from './removal.tsx';
import type { SharedProps } from './study.tsx';

type Props = Pick<SharedProps, 'state' | 'mutate'> & {
  edital: (trail: Trail) => void;
  study: (topic: Topic, mode: 'study' | 'practice') => void;
};

function ObjectiveFields({ trail }: { trail?: Trail }) {
  return <>
    <label>Concurso, cargo e área<input name="title" required maxLength={200} defaultValue={trail?.title}
      placeholder="Ex.: Polícia Federal · Perito · Área 3"/></label>
    <div className="form-grid">
      <label>Banca<input name="board" maxLength={200} defaultValue={trail?.board}/></label>
      <label>Data da prova<input name="examDate" type="date" defaultValue={trail?.examDate ?? ''}/></label>
      <label>Prioridade pessoal<select name="priority" defaultValue={trail?.priority ?? 2}>
        <option value={3}>Alta</option><option value={2}>Normal</option><option value={1}>Baixa</option>
      </select></label>
    </div>
  </>;
}
const objectiveBody = (data: FormData) => ({ title: data.get('title'), board: data.get('board'),
  examDate: data.get('examDate') || null, priority: Number(data.get('priority')) });

export function ContestCards({ state, mutate, edital, study, manage = false }: Props & { manage?: boolean }) {
  const { contests } = preparation(state);
  return <div className="contest-grid">{contests.map(contest => {
    const { trail, rows, attempts, due } = contest;
    return <article className="panel contest-card" key={trail.id}>
      <p className="eyebrow">{trail.board || 'Banca a definir'}{trail.examDate && ' · ' + formatDate(trail.examDate)}</p>
      <h3>{trail.title}</h3><p className="meta">{trail.edition}</p>
      {rows.length ? <>
        <p className="contest-coverage"><strong>{contest.touched} / {rows.length}</strong> assuntos trabalhados</p>
        <progress aria-label={'Assuntos trabalhados · ' + trail.title} max={rows.length} value={contest.touched}/>
        <p className="meta">{contest.read} com leitura · {contest.practiced} com prática</p>
        <p className="meta">{attempts.length ? `${attempts.filter(row => row.correct).length}/${attempts.length} acertos nas últimas respostas por questão` : 'Ainda sem questões respondidas relacionadas ao edital'}</p>
        <p className="meta">{contest.missing} assuntos sem prática · {contest.weaknesses} erros/chutes · {due.length + contest.dueCycles} revisões pendentes</p>
        {contest.shared > 0 && <p className="meta">{contest.shared} assuntos aproveitam estudo de outro concurso</p>}
        <details className="contest-gaps"><summary>O que precisa de atenção</summary>
          {!contest.gaps.length && <p className="muted">Sem pendências registradas. Continue praticando para ampliar a amostra.</p>}
          {contest.gaps.slice(0, 5).map(row => <div className="contest-gap" key={row.topic.id}>
            <span><strong>{row.topic.title}</strong><small>{row.topic.discipline} · {!row.practiced ? 'Sem prática' : row.weaknesses ? 'Reforçar erros/chutes' : 'Revisão pendente'}</small></span>
            <button className="text-button" onClick={() => row.ready ? study(row.topic, 'practice') : edital(trail)}>{row.ready ? 'Praticar' : 'Ver edital'}</button>
          </div>)}
          {contest.gaps.length > 5 && <p className="meta">Mais {contest.gaps.length - 5} assuntos no edital.</p>}
        </details>
      </> : <p className="callout">Edital pendente. Importe o edital para definir os assuntos do plano; depois, salve os tópicos no Acervo.</p>}
      <div className="actions"><button className="button secondary" onClick={() => edital(trail)}>{rows.length ? 'Ver edital' : 'Preparar edital'}</button></div>
      {manage && <details><summary>Ajustar objetivo</summary><form onSubmit={event => {
        event.preventDefault(); void mutate(() => api('/trails/' + trail.id, 'PATCH', objectiveBody(new FormData(event.currentTarget))), 'Objetivo atualizado.');
      }}><ObjectiveFields trail={trail}/><div className="actions"><button className="button primary">Salvar</button>
        <button className="text-button" type="button" onClick={() => void mutate(() => api('/trails/' + trail.id, 'PATCH', { enabled: false }), 'Concurso pausado. Seu histórico foi preservado.')}>Pausar concurso</button>
      </div></form></details>}
      {manage && <RemoveButton kind="trail" id={trail.id} title={trail.title} mutate={mutate}/>}
    </article>;
  })}</div>;
}

export function Contests(props: Props) {
  const [creating, setCreating] = useState(false);
  const [busy, setBusy] = useState(false);
  const paused = props.state.trails.filter(trail => trail.enabled === false);
  return <>
    <div className="toolbar"><button className="button primary" onClick={() => setCreating(!creating)}><Plus size={16}/> Cadastrar concurso</button></div>
    {creating && <form className="panel" onSubmit={async event => {
      event.preventDefault(); if (busy) return; setBusy(true);
      const ok = await props.mutate(() => api('/trails', 'POST', objectiveBody(new FormData(event.currentTarget))), 'Concurso cadastrado. Importe o edital para definir os assuntos do plano.');
      if (ok) setCreating(false); setBusy(false);
    }}><h2>Novo objetivo</h2><ObjectiveFields/><div className="actions"><button className="button primary" disabled={busy}>Cadastrar</button>
      <button className="text-button" type="button" onClick={() => setCreating(false)}>Cancelar</button></div></form>}
    {!props.state.trails.some(trail => trail.enabled !== false) && <Empty>Cadastre ou retome um concurso para orientar o plano de estudo.</Empty>}
    <ContestCards {...props} manage/>
    <details className="panel"><summary>Como ler o progresso</summary>
      <p className="muted">A cobertura considera os assuntos cadastrados do edital ativo, com o mesmo peso. Ter trabalhado um assunto indica contato, sem garantir domínio ou que o edital foi cadastrado por completo. Leitura e prática ficam separadas; a amostra usa a última resposta por questão, com erros e chutes explícitos.</p>
      <p className="muted">O estudo é reaproveitado por disciplina e assunto idênticos ou equivalências confirmadas no edital. Um registro pode atender vários concursos; o tempo e o histórico são contabilizados uma vez. Questões de outra banca são treino relacionado, sem estimar a nota na prova de destino.</p>
    </details>
    {paused.length > 0 && <details className="panel"><summary>Concursos pausados · {paused.length}</summary>{paused.map(trail =>
      <div className="task-row" key={trail.id}><div><h3>{trail.title}</h3><p>Conteúdo e histórico preservados</p></div>
        <button className="button secondary" onClick={() => void props.mutate(() => api('/trails/' + trail.id, 'PATCH', { enabled: true }), 'Concurso retomado.')}>Retomar</button>
        <button className="text-button" onClick={() => props.edital(trail)}>Ver edital</button>
        <RemoveButton kind="trail" id={trail.id} title={trail.title} mutate={props.mutate}/>
      </div>)}</details>}
  </>;
}
