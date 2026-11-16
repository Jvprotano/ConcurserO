import { useState } from 'react';
import { ArrowRight, BookOpen, Plus, Upload } from 'lucide-react';
import { api, formatDate } from './api.ts';
import { agendaTopic } from '../shared/agenda.ts';
import { Empty, SourceLink, TopicLinks } from './common.tsx';
import type { SharedProps } from './study.tsx';
import type { Topic } from '../shared/types.ts';
import { preparation, relatedTopics } from '../shared/preparation.ts';
import { RemoveButton } from './removal.tsx';

export function Edital({ state, trail, topics, mutate, study, importPdf }: SharedProps & {
  study: (topic: Topic, mode: 'study' | 'practice') => void;
  importPdf: (editionId: string) => void;
}) {
  const [editing, setEditing] = useState<Topic | 'new'>();
  const [edition, setEdition] = useState(trail.editionId);
  const [showNewEdition, setShowNewEdition] = useState(false);
  const [share, setShare] = useState<Topic>();
  const [links, setLinks] = useState<string[]>([]);
  const selected = state.topics.filter(topic => topic.editionId === edition && topic.syllabus !== false);
  const library = state.topics.filter(topic => topic.editionId === edition && topic.syllabus === false);
  const progress = preparation(state).progress;
  const comparing = edition !== trail.editionId;
  const key = (topic: Topic) => topic.discipline + '|' + topic.title;
  const differences = {
    kept: selected.filter(topic => topics.some(old => key(old) === key(topic))),
    added: selected.filter(topic => !topics.some(old => key(old) === key(topic))),
    removed: topics.filter(topic => !selected.some(next => key(next) === key(topic))),
  };
  const disciplines = [...new Set(selected.map(topic => topic.discipline))];
  return <>
    <p className="muted">O edital define os assuntos do seu plano. Importe o PDF e salve os tópicos no Acervo.</p>
    <details><summary>Sobre o edital de referência</summary><p className="muted">É o edital anterior usado como base da preparação.
      Tópicos marcados como demonstração são exemplos, não o conteúdo completo.</p></details>
    <div className="toolbar wrap">
      <label>Edição do edital <select value={edition} onChange={event => { setEdition(event.target.value); setEditing(undefined); }}>
        {trail.editions.map(item => <option key={item.id} value={item.id}>{item.title}{item.id === trail.editionId ? ' · ativa' : ''}</option>)}
      </select></label>
      <button className="button secondary" onClick={() => setShowNewEdition(!showNewEdition)}>Nova edição</button>
      <button className="button secondary" onClick={() => importPdf(edition)}><Upload size={16}/> Importar edital</button>
      <button className="button primary" onClick={() => setEditing('new')}><Plus size={16}/> Novo tópico</button>
      {comparing && <RemoveButton kind="edition" id={edition} title={trail.editions.find(row => row.id === edition)?.title ?? edition}
        mutate={mutate} onRemoved={() => setEdition(trail.editionId)}/>}
    </div>
    {showNewEdition && <form className="panel" onSubmit={async event => {
      event.preventDefault();
      const data = new FormData(event.currentTarget);
      const ok = await mutate(async () => {
        const created = await api<{ id: string }>('/trails/' + trail.id + '/editions', 'POST', { title: data.get('title') });
        setEdition(created.id);
      }, 'Edição criada. Você já pode importar o edital.');
      if (ok) setShowNewEdition(false);
    }}>
      <label>Nome da edição <input name="title" required maxLength={200} placeholder="Ex. Edital 01/2027"/></label>
      <button className="button primary">Criar edição</button>
    </form>}
    {comparing && <section className="panel">
      <h2>Comparação com a edição ativa</h2>
      <div className="comparison">{[
        ['Mantidos', differences.kept], ['Novos', differences.added], ['Removidos', differences.removed],
      ].map(([label, rows]) => <div key={label as string}><strong>{label as string} · {(rows as Topic[]).length}</strong>
        <ul>{(rows as Topic[]).map(topic => <li key={topic.id}>{topic.title}</li>)}</ul></div>)}</div>
      <button className="button primary" disabled={!selected.length} onClick={() => void mutate(() =>
        api('/trails/' + trail.id + '/edition', 'PUT', { editionId: edition }), 'Edição ativada.')}>Ativar esta edição</button>
    </section>}
    {editing && <form className="panel" key={editing === 'new' ? edition : editing.id} onSubmit={async event => {
      event.preventDefault();
      const data = new FormData(event.currentTarget);
      const ok = await mutate(() => api(editing === 'new' ? '/topics' : '/topics/' + editing.id, editing === 'new' ? 'POST' : 'PUT', {
        editionId: edition, discipline: data.get('discipline'), title: data.get('title'),
        priority: Number(data.get('priority')), material: data.get('material'), summary: data.get('summary'),
        syllabus: data.get('syllabus') === 'on',
      }), 'Tópico salvo.');
      if (ok) setEditing(undefined);
    }}>
      <h2>{editing === 'new' ? 'Novo tópico' : 'Editar tópico'}</h2>
      <div className="form-grid">
        <label>Disciplina <input name="discipline" required maxLength={200} defaultValue={editing === 'new' ? '' : editing.discipline}/></label>
        <label>Tópico <input name="title" required maxLength={200} defaultValue={editing === 'new' ? '' : editing.title}/></label>
      </div>
      <label>Prioridade <select name="priority" defaultValue={editing === 'new' ? 2 : editing.priority}><option value="1">Baixa</option><option value="2">Normal</option><option value="3">Alta</option></select></label>
      <label>Material de estudo <textarea name="material" rows={4} defaultValue={editing === 'new' ? '' : editing.material}/></label>
      <label>Resumo <textarea name="summary" rows={3} defaultValue={editing === 'new' ? '' : editing.summary}/></label>
      <label className="check"><input type="checkbox" name="syllabus" defaultChecked={editing === 'new' || editing.syllabus !== false}/> Faz parte do conteúdo do edital</label>
      <div className="actions"><button className="button primary">Salvar tópico</button>
        <button className="button secondary" type="button" onClick={() => setEditing(undefined)}>Cancelar</button></div>
    </form>}
    {share && <form className="panel" onSubmit={async event => {
      event.preventDefault();
      const data = new FormData(event.currentTarget);
      const ok = await mutate(() => api('/materials', 'POST', {
        title: data.get('title'), body: data.get('body'), summary: data.get('summary'), topicIds: links,
      }), 'Material compartilhado.');
      if (ok) setShare(undefined);
    }}>
      <h2>Compartilhar material</h2>
      <label>Título <input name="title" required defaultValue={share.title}/></label>
      <label>Conteúdo <textarea name="body" rows={4} required defaultValue={share.material}/></label>
      <label>Resumo <textarea name="summary" rows={2} defaultValue={share.summary}/></label>
      <TopicLinks topics={state.topics.filter(topic => state.trails.some(trail => trail.editionId === topic.editionId))}
        value={links} onChange={setLinks}/>
      <div className="actions"><button className="button primary" disabled={!links.length}>Salvar material</button>
        <button className="button secondary" type="button" onClick={() => setShare(undefined)}>Cancelar</button></div>
    </form>}
    {!selected.length && <Empty>Esta edição ainda não tem tópicos. Importe um edital ou adicione os primeiros assuntos.</Empty>}
    {disciplines.map(discipline => <section key={discipline} className="section">
      <div className="section-heading"><h2>{discipline}</h2></div>
      {selected.filter(topic => topic.discipline === discipline).map(topic => {
        const { cycle, last, materials } = agendaTopic(state, topic);
        return <article className="task-row topic-row" key={topic.id}>
        <span className="icon-tile"><BookOpen size={19}/></span><div><h3>{topic.title}</h3>
          <p>{progress(topic).read ? 'Com leitura' : 'Sem leitura'} · {progress(topic).practiced ? 'Com prática' : 'Sem prática'}</p><SourceLink source={topic.source}/>
          {last && <p>Último estudo em {formatDate(last.day)}</p>}
          {cycle && <p>{cycle.due < state.today ? 'Revisão atrasada desde ' : 'Revisão em '}{formatDate(cycle.due)}</p>}
          {!topic.material && !topic.summary && !topic.materialCount && !materials.length && <p>Sem material vinculado</p>}
          <TopicEquivalence topic={topic} state={state} mutate={mutate}/></div>
        <div className="actions"><button className="text-button" onClick={() => setEditing(topic)}>Editar</button>
          <RemoveButton kind="topic" id={topic.id} title={topic.title} mutate={mutate}/>
          {!comparing && <><button className="text-button" onClick={() => { setShare(topic); setLinks([topic.id]); }}>Compartilhar material</button>
          <button className="button secondary" onClick={() => study(topic, 'study')}>Estudar <ArrowRight size={16}/></button></>}</div>
      </article>;
      })}
    </section>)}
    {library.length > 0 && <details className="panel"><summary>Conteúdo de apoio e demonstrações · {library.length}</summary>
      <p className="muted">Não compõem o edital. Para incluir um assunto confirmado no edital, use Editar.</p>
      {library.map(topic => <div className="task-row" key={topic.id}><div><h3>{topic.title}</h3><p>{topic.discipline}</p></div>
        <button className="text-button" onClick={() => setEditing(topic)}>Editar</button>
        <RemoveButton kind="topic" id={topic.id} title={topic.title} mutate={mutate}/>
        <button className="button secondary" onClick={() => study(topic, 'study')}>Estudar</button></div>)}
    </details>}
  </>;
}

function TopicEquivalence({ topic, state, mutate }: Pick<SharedProps, 'state' | 'mutate'> & { topic: Topic }) {
  const related = relatedTopics(state, topic).filter(row => row.id !== topic.id);
  const links = (state.topicLinks ?? []).filter(link => link.sourceId === topic.id || link.targetId === topic.id);
  const label = (row: Topic) => `${row.discipline} → ${row.title} · ${state.trails.find(trail => trail.id === row.trailId)?.title ?? row.trailId} · ${state.trails.flatMap(trail => trail.editions).find(edition => edition.id === row.editionId)?.title ?? ''}`;
  return <details className="topic-equivalence"><summary>Reaproveitamento de estudo{related.length ? ' · ' + related.length + ' vínculos' : ''}</summary>
    <p className="muted">Assuntos idênticos na mesma disciplina compartilham os registros. Confirme uma equivalência apenas quando o conteúdo e o escopo forem os mesmos.</p>
    {related.map(row => <p className="meta" key={row.id}>{label(row)}</p>)}
    {links.map(link => <button className="text-button" key={link.sourceId + ':' + link.targetId} onClick={() => void mutate(() =>
      api('/topic-links', 'DELETE', link), 'Equivalência removida. O histórico foi preservado.')}>
      Remover equivalência com {state.topics.find(row => row.id === (link.sourceId === topic.id ? link.targetId : link.sourceId))?.title}
    </button>)}
    <form onSubmit={event => {
      event.preventDefault(); const targetId = new FormData(event.currentTarget).get('targetId');
      void mutate(() => api('/topic-links', 'POST', { sourceId: topic.id, targetId }), 'Equivalência confirmada.');
    }}><label>Assunto equivalente<select name="targetId" required defaultValue=""><option value="">Selecionar assunto existente</option>
      {state.topics.filter(row => row.id !== topic.id && !related.some(item => item.id === row.id)).map(row => <option key={row.id} value={row.id}>{label(row)}</option>)}
    </select></label><button className="button secondary">Confirmar equivalência</button></form>
  </details>;
}

export function Settings({ state, mutate }: SharedProps) {
  return <form className="panel" onSubmit={event => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    void mutate(async () => {
      await api('/settings', 'PUT', {
        schedule: state.schedule.map((_, i) => Number(data.get('day' + i))),
      });
    }, 'Disponibilidade salva.');
  }}>
    <h2>Tempo de estudo</h2><p className="muted">Uma disponibilidade para todos os concursos. Use zero nos dias de descanso.</p>
    <div className="days">{['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'].map((day, i) =>
      <label key={day}>{day}<input name={'day' + i} type="number" min="0" max="720" required defaultValue={state.schedule[i]}/></label>)}</div>
    <button className="button primary">Salvar disponibilidade</button>
  </form>;
}
