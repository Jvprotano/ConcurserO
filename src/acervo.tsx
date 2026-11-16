import { useEffect, useState } from 'react';
import { examPacks } from '../shared/exam-packs.ts';
import { historicalExams, subjects } from '../shared/exam-history.ts';
import { itemNumbers, type Subject } from '../shared/overview.ts';
import { FileText, Plus, Upload } from 'lucide-react';
import { api, message, pdfUrl } from './api.ts';
import { Empty, SourceLink } from './common.tsx';
import { RemoveButton, RemovedItems } from './removal.tsx';
import { Materials } from './materials.tsx';
import type { SharedProps } from './study.tsx';
import type { DraftKey, DraftQuestion, DraftTopic, ImportJob, ImportKind, ImportSummary, PageText, Topic } from '../shared/types.ts';

type Draft = { topics: DraftTopic[]; questions: DraftQuestion[]; keys: DraftKey[] };
type Detail = { job: ImportJob; pages: PageText[]; draft: Draft; availability?: ImportSummary; preliminary?: boolean };
const labels = { edital: 'Edital', prova: 'Caderno de prova', gabarito: 'Gabarito' };
const status = { queued: 'Na fila', processing: 'Processando', review: 'Importado', done: 'Salvo', failed: 'Falhou', cancelled: 'Cancelado' };
const versions = (trail: string) => trail === 'pr' ? ['A', 'B', 'C'] : ['Única'];
const blockFor = (trail: string, n: number) => n <= (trail === 'pr' ? 40 : 50) ? 'basico' : 'especifico';
const maxNumber = (trail: string) => trail === 'pr' ? 80 : trail === 'pf' ? 120 : 9999;

export function Acervo({ state, trail, mutate, initialJobId, initialKind = 'prova', initialEditionId, openDocument }: SharedProps & {
  initialJobId?: string; initialKind?: ImportKind; initialEditionId?: string; openDocument: (job: ImportJob) => void;
}) {
  const [jobId, setJobId] = useState<string | undefined>(initialJobId);
  const [kind, setKind] = useState<ImportKind>(initialKind);
  const [busy, setBusy] = useState(false);
  const [loadingPack, setLoadingPack] = useState<string>();
  const jobs = state.imports;
  const owner = state.trails.find(row => row.id === jobs.find(job => job.id === jobId)?.trailId) ?? trail;
  if (jobId) return <ReviewImport key={jobId} jobId={jobId} jobs={jobs.filter(job => job.trailId === owner.id)} state={state} trail={owner} mutate={mutate}
    initialEditionId={initialEditionId}
    open={setJobId} close={() => setJobId(undefined)} importKey={() => { setJobId(undefined); setKind('gabarito'); }}/>;
  return <>
    <Materials state={state} trail={trail} mutate={mutate}/>
    <details className="panel upload-panel"><summary>Baixar provas disponíveis</summary>
      {examPacks.filter(pack => pack.trailId === trail.id).map(pack => {
        const proof = jobs.find(job => job.kind === 'prova' && job.pair === pack.id + ':especifico');
        const ready = pack.blocks.every(block => (['prova', 'gabarito'] as const).every(kind =>
          jobs.some(job => job.pair === pack.id + ':' + block.id && job.kind === kind &&
            (job.status === 'review' || job.status === 'done'))));
        return <article className="task-row" key={pack.id}>
          <span className="icon-tile"><FileText size={19}/></span>
          <div><h3>{pack.title}</h3><p>{pack.description}</p></div>
          <button type="button" className="button secondary" disabled={!!loadingPack || busy} onClick={async () => {
            if (ready && proof) { setJobId(proof.id); return; }
            setLoadingPack(pack.id);
            try {
              await mutate(async () => {
                const result = await api<{ ids: string[] }>('/exam-packs/' + pack.id, 'POST');
                setJobId(result.ids.at(-2));
              }, 'Provas importadas. Salve as questões para responder.');
            } finally { setLoadingPack(undefined); }
          }}>{loadingPack === pack.id ? 'Carregando…' : ready ? 'Abrir caderno específico' : 'Carregar prova'}</button>
        </article>;
      })}
      {trail.id === 'pr' && <p className="muted">
        <a href="https://concursos-adm-sigcp.ibfc.org.br/informacoes/449/" target="_blank" rel="noreferrer">IBFC · Paraná 2024 · Área 3</a>:
        importe o gabarito preliminar ou pós-recurso da Área 3, na versão correspondente ao caderno.
      </p>}
    </details>
    <form className="panel upload-panel" onSubmit={async event => {
      event.preventDefault();
      const form = event.currentTarget;
      const file = new FormData(form).get('file');
      if (!(file instanceof File) || !file.size || busy || loadingPack) return;
      setBusy(true);
      const ok = await mutate(async () => {
        const result = await api<{ id: string }>('/imports/' + trail.id + '/' + kind + '?name=' + encodeURIComponent(file.name), 'POST', file);
        setJobId(result.id);
      }, 'PDF recebido.');
      if (ok) form.reset();
      setBusy(false);
    }}>
      <h2><Upload size={20}/> Importar PDF</h2>
      <p className="muted">{kind === 'edital' ? 'O edital define os assuntos do seu plano. Depois de importar, clique em Salvar tópicos.' :
        kind === 'prova' ? 'As questões aparecerão na lista e nas análises. Com o gabarito, salve todas para responder.' :
        'O gabarito permite corrigir suas respostas. Depois de importar, abra o caderno e salve as questões.'}</p>
      <div className="form-grid">
        <label>Tipo de documento <select value={kind} onChange={event => setKind(event.target.value as ImportKind)}>
          {Object.entries(labels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select></label>
        <label>Arquivo PDF <input name="file" type="file" accept="application/pdf,.pdf" required/></label>
      </div>
      <button className="button primary" disabled={busy || !!loadingPack}>{busy ? 'Enviando…' : 'Importar PDF'}</button>
    </form>
    <section className="section"><h2>Seus documentos</h2>
      {!jobs.length && <Empty>Os PDFs importados aparecerão aqui.</Empty>}
      {jobs.map(job => <article className="task-row" key={job.id}>
        <span className="icon-tile"><FileText size={19}/></span><div><h3>{job.name}</h3><p>{labels[job.kind]} · {status[job.status]} · {state.trails.find(row => row.id === job.trailId)?.title}</p></div>
        <button className="button secondary" onClick={() => { setJobId(job.id); openDocument(job); }}>Abrir</button>
        <RemoveButton kind="import" id={job.id} title={job.name} mutate={mutate}/>
      </article>)}
    </section>
    <RemovedItems mutate={mutate} refreshKey={state}/>
  </>;
}


function ReviewImport({ jobId, jobs, state, trail, mutate, close, open, importKey, initialEditionId }: Omit<SharedProps, 'topics'> & {
  jobId: string; jobs: ImportJob[]; close: () => void; open: (id: string) => void; importKey: () => void; initialEditionId?: string;
}) {
  const [detail, setDetail] = useState<Detail>();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [keyId, setKeyId] = useState('');
  const [edition, setEdition] = useState(initialEditionId ?? trail.editionId);
  const [advanced, setAdvanced] = useState(false);
  const [result, setResult] = useState<{ published: number; pending: string[] }>();
  useEffect(() => {
    let current = true;
    let timer: ReturnType<typeof setTimeout>;
    async function load() {
      try {
        const value = await api<Detail>('/imports/' + jobId);
        if (!current) return;
        setDetail(value);
        if (value.job.status === 'queued' || value.job.status === 'processing') timer = setTimeout(() => void load(), 700);
      } catch (error) { if (current) setError(message(error)); }
    }
    void load();
    return () => { current = false; clearTimeout(timer); };
  }, [jobId]);
  if (!detail) return <p role={error ? 'alert' : 'status'}>{error || 'Abrindo documento…'}</p>;
  const { job, draft, availability } = detail;
  const processing = job.status === 'queued' || job.status === 'processing';
  const count = job.kind === 'edital' ? draft.topics.length : job.kind === 'prova' ? draft.questions.length : draft.keys.length;
  const selectedKey = keyId || availability?.keyId || '';
  const proofs = jobs.filter(item => item.kind === 'prova' && item.pair === job.pair && item.exam === job.exam);
  async function saveAll() {
    if (busy) return;
    setBusy(true); setError('');
    try {
      const value = await api<{ published: number; pending: string[] }>('/imports/' + jobId + '/save-all', 'POST',
        { requestId: crypto.randomUUID(), editionId: edition, keyId: selectedKey || undefined });
      setResult(value);
      setDetail(await api<Detail>('/imports/' + jobId));
      await mutate(async () => undefined);
    } catch (error) { setError(message(error)); }
    finally { setBusy(false); }
  }
  return <>
    <button className="text-button" disabled={busy} onClick={close}>Voltar ao acervo</button>
    <section className="panel"><div className="section-heading"><h2>{job.name}</h2>
      <RemoveButton kind="import" id={job.id} title={job.name} mutate={mutate} disabled={busy} onRemoved={close}/></div>
      {processing ? <><p role="status">Extraindo {labels[job.kind].toLowerCase()}…</p><progress max={job.total || 1} value={job.completed}/></> : <>
        <p className="muted">{count} {job.kind === 'edital' ? 'tópicos extraídos' : job.kind === 'prova' ? 'questões disponíveis' : 'respostas extraídas'}</p>
        {job.kind === 'edital' && <p>Salve os tópicos para organizar seu plano de estudo.</p>}
        {job.kind === 'prova' && <p>{availability?.message}</p>}
        {job.kind === 'gabarito' && <p>{detail.preliminary ? 'Gabarito preliminar disponível para correção. Abra o caderno e salve as questões.' : 'Abra o caderno para salvar as questões com este gabarito.'}</p>}
        {job.kind !== 'gabarito' && trail.editions.length > 1 && <label>Edital de estudo<select value={edition}
          onChange={event => setEdition(event.target.value)}>{trail.editions.map(item => <option key={item.id} value={item.id}>{item.title}</option>)}</select></label>}
        {job.kind === 'prova' && !availability?.keyId && (availability?.keys.length ?? 0) > 0 && <label>Gabarito<select value={selectedKey}
          onChange={event => setKeyId(event.target.value)}><option value="">Selecionar</option>
          {availability!.keys.map(item => <option key={item.id} value={item.id}>{item.name}{item.preliminary ? ' · Preliminar' : ''}</option>)}</select></label>}
        {job.kind === 'prova' && availability?.keys.find(item => item.id === selectedKey)?.preliminary &&
          <p className="muted">A correção usará o gabarito preliminar.</p>}
        <div className="actions">
          {job.kind !== 'gabarito' && <button className="button primary" disabled={busy || !count || (job.kind === 'prova' && !selectedKey)}
            onClick={() => void saveAll()}>{busy ? 'Salvando…' : job.kind === 'edital' ? 'Salvar tópicos' : 'Salvar todas as questões'}</button>}
          {job.kind === 'prova' && !availability?.hasKey && <button className="button secondary" onClick={importKey}>Importar gabarito</button>}
          {job.kind === 'gabarito' && proofs.map(proof => <button className="button secondary" key={proof.id} onClick={() => open(proof.id)}>Abrir {proof.name}</button>)}
        </div>
      </>}
      {result && <div className="feedback" role="status">{result.published} {job.kind === 'edital' ? 'tópicos salvos. Abra Edital para ver seu plano.' : 'questões salvas. Abra Questões para responder.'}
        {result.pending.length > 0 && <p>{result.pending.length} questão(ões) com pendência. Consulte os detalhes abaixo.</p>}</div>}
      {error && <p className="alert" role="alert">{error}</p>}
    </section>
    <details open={advanced} onToggle={event => {
      const next = event.currentTarget.open;
      setAdvanced(next);
      if (!next) void api<Detail>('/imports/' + jobId).then(setDetail).catch(error => setError(message(error)));
    }}><summary>Detalhes e edição</summary>
      {advanced && <ImportDetails jobId={jobId} jobs={jobs} state={state} trail={trail} mutate={mutate} close={() => setAdvanced(false)}/>}
      {result?.pending.map((item, index) => <p className="meta" key={index}>{item}</p>)}
    </details>
  </>;
}

function ImportDetails({ jobId, jobs, state, trail, mutate, close }: Omit<SharedProps, 'topics'> & {
  jobId: string; jobs: ImportJob[]; close: () => void;
}) {
  const [detail, setDetail] = useState<Detail>();
  const [draft, setDraft] = useState<Draft>();
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [page, setPage] = useState(1);
  const [keyId, setKeyId] = useState('');
  const [keyDetail, setKeyDetail] = useState<Detail>();
  const [edition, setEdition] = useState(trail.editionId);
  const [version, setVersion] = useState(versions(trail.id)[0]);
  const [rowOffset, setRowOffset] = useState(0);
  const [subject, setSubject] = useState('');
  const [selected, setSelected] = useState<Record<number, { topicId?: string; comment?: string }>>({});
  const [confirmed, setConfirmed] = useState(false);
  const [defaultTopic, setDefaultTopic] = useState('');
  const [summary, setSummary] = useState<{ published: number; pending: string[] }>();
  const [dirty, setDirty] = useState(false);
  const pair = detail?.job.pair;
  const suggestedKey = pair ? jobs.find(item => item.kind === 'gabarito' && item.pair === pair &&
    (item.status === 'review' || item.status === 'done'))?.id : undefined;

  useEffect(() => {
    if (suggestedKey) setKeyId(previous => previous || suggestedKey);
  }, [suggestedKey]);

  useEffect(() => {
    let alive = true;
    let timer: ReturnType<typeof setTimeout>;
    async function poll() {
      try {
        const result = await api<Detail>('/imports/' + jobId);
        if (!alive) return;
        setDetail(result);
        if (result.job.status === 'processing' || result.job.status === 'queued') timer = setTimeout(() => void poll(), 700);
        else setDraft(previous => previous ?? result.draft);
      } catch (error) { if (alive) setError(message(error)); }
    }
    void poll();
    return () => { alive = false; clearTimeout(timer); };
  }, [jobId, detail?.job.status === 'processing' || detail?.job.status === 'queued']);

  useEffect(() => {
    let alive = true;
    setKeyDetail(undefined);
    if (keyId) api<Detail>('/imports/' + keyId).then(result => { if (alive) setKeyDetail(result); })
      .catch(error => { if (alive) setError(message(error)); });
    return () => { alive = false; };
  }, [keyId]);

  async function run(action: () => Promise<void>) {
    if (saving) return;
    setSaving(true); setError('');
    try { await action(); } catch (error) { setError(message(error)); }
    finally { setSaving(false); }
  }

  if (!detail) return <p role={error ? 'alert' : 'status'}>{error || 'Abrindo documento…'}</p>;
  const { job, pages } = detail;
  const active = job.status === 'processing' || job.status === 'queued';
  const currentPage = pages.find(row => row.page === page);
  const topics = state.topics.filter(topic => topic.editionId === edition);
  const chosen = Object.entries(selected).map(([index, value]) => ({ index: Number(index), ...value }));
  const matching = (row: DraftQuestion) => keyDetail?.draft.keys.filter(key =>
    key.number === row.number && key.block === row.block && key.version === row.version) ?? [];
  function update(next: Draft, reset = false) {
    setDraft(next); setDirty(true); setConfirmed(false); setSummary(undefined);
    if (reset) setSelected({});
  }
  async function operation(name: string, body?: unknown) {
    await run(async () => {
      if (dirty && draft) await api('/imports/' + jobId + '/draft', 'PUT', draft);
      setDirty(false);
      const result = await api<Detail>('/imports/' + jobId + '/' + name, 'POST', body);
      setDetail(result);
    });
  }
  function addRow() {
    if (!draft) return;
    if (job.kind === 'edital') update({ ...draft, topics: [...draft.topics, { page, title: '', discipline: '' }] });
    else if (job.kind === 'prova') update({ ...draft, questions: [...draft.questions, {
      page, version, number: 1, block: 'basico', prompt: '', context: '',
      type: trail.id === 'pr' ? 'choice' : 'boolean',
      options: trail.id === 'pr' ? Array.from('ABCDE', key => ({ key, text: '' })) : [{ key: 'C', text: 'Certo' }, { key: 'E', text: 'Errado' }],
    }] });
    else update({ ...draft, keys: [...draft.keys, { page, version, number: 1, block: 'basico', key: trail.id === 'pr' ? 'A' : 'C' }] });
  }
  const keyJobs = jobs.filter(item => item.kind === 'gabarito' && item.pair === job.pair &&
    item.exam === job.exam && (item.status === 'review' || item.status === 'done'));
  return <section className="panel review-import" aria-label="Conferência de documento">
    <div className="section-heading"><div><p className="eyebrow">{labels[job.kind]}{job.exam && ' · Edital ' + job.exam}</p><h2>{job.name}</h2></div>
      <button className="button secondary" onClick={() => {
        if (!dirty) close();
        else void run(async () => {
          await api('/imports/' + jobId + '/draft', 'PUT', draft);
          close();
        });
      }}>Fechar</button></div>
    <p className="muted" role="status">{status[job.status]} · {job.message}</p>
    {active && <><progress max={job.total || 1} value={job.completed}/><div className="actions">
      <button className="button secondary" disabled={saving} onClick={() => void operation('cancel')}>Cancelar processamento</button></div></>}
    {(job.status === 'failed' || job.status === 'cancelled') &&
      <button className="button secondary" disabled={saving} onClick={() => void operation('retry')}>Reprocessar PDF</button>}
    <div className="document-preview">
      <div className="toolbar wrap"><label>Página <input type="number" min="1" max={job.total || 400} value={page}
        onChange={event => setPage(Math.min(job.total || 400, Math.max(1, Number(event.target.value))))}/></label>
        <SourceLink source={{ id: job.id, page }} label="Abrir PDF original"/>
        {job.sourceUrl && <a href={job.sourceUrl} target="_blank" rel="noreferrer">Ver publicação oficial</a>}
        {currentPage && <button className="button secondary" disabled={active || saving} onClick={() => void operation('ocr', { page })}>Reconhecer texto (OCR)</button>}
      </div>
      <details><summary>Texto extraído da página{currentPage?.needsOcr ? ' · OCR recomendado' : ''}</summary>
        <pre>{currentPage?.text || 'Nenhum texto extraído nesta página.'}</pre></details>
    </div>
    {draft && <>
      <div className="toolbar wrap">
        {job.kind !== 'edital' && <label>Versão do caderno <select value={version} onChange={event => { setVersion(event.target.value); setRowOffset(0); setSelected({}); setConfirmed(false); }}>
          {versions(trail.id).map(item => <option key={item}>{item}</option>)}
        </select></label>}
        {job.kind !== 'gabarito' && <label>Edição de destino <select value={edition}
          onChange={event => { setEdition(event.target.value); setSelected({}); setDefaultTopic(''); setConfirmed(false); }}>
          {trail.editions.map(item => <option key={item.id} value={item.id}>{item.title}</option>)}
        </select></label>}
        {job.kind === 'prova' && <>
          <label>Gabarito <select value={keyId} onChange={event => { setKeyId(event.target.value); setConfirmed(false); }}>
            <option value="">Selecionar</option>{keyJobs.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
          </select></label>
          {keyDetail?.preliminary && <p className="muted">A correção usará o gabarito preliminar nas páginas identificadas como tal.</p>}
          <label>Tópico para seleção em lote <select value={defaultTopic} onChange={event => setDefaultTopic(event.target.value)}>
            <option value="">Selecionar</option>{topics.map(item => <option key={item.id} value={item.id}>{item.title}</option>)}
          </select></label>
        </>}
      </div>
      <div className="actions">
        <button className="button secondary" onClick={addRow}><Plus size={16}/> Adicionar linha</button>
        <button className="button secondary" disabled={active || saving} onClick={() => void run(async () => {
          const suggestions = await api<Draft>('/imports/' + jobId + '/suggestions', 'POST');
          const additions = (existing: { page: number }[], next: { page: number }[]) => next.filter(row => row.page === page)
            .filter(row => !existing.some(old => JSON.stringify(old) === JSON.stringify(row)));
          update({
            topics: [...draft.topics, ...additions(draft.topics, suggestions.topics) as DraftTopic[]],
            questions: [...draft.questions, ...additions(draft.questions, suggestions.questions) as DraftQuestion[]],
            keys: [...draft.keys, ...additions(draft.keys, suggestions.keys) as DraftKey[]],
          });
        })}>Adicionar sugestões desta página</button>
        <button className="button secondary" disabled={saving} onClick={() => void run(async () => {
          await api('/imports/' + jobId + '/draft', 'PUT', draft); setDirty(false);
        })}>{dirty ? 'Salvar alterações' : 'Salvar rascunho'}</button>
      </div>
      {job.kind === 'edital' && <div className="draft-rows">
        {draft.topics.map((row, index) => <div className="draft-row" key={index}>
          <label className="check"><input type="checkbox" checked={index in selected}
            onChange={event => toggle(index, event.target.checked)}/> Incluir</label>
          <label>Disciplina <input value={row.discipline} onChange={event => editTopic(index, { discipline: event.target.value })}/></label>
          <label>Tópico <input value={row.title} onChange={event => editTopic(index, { title: event.target.value })}/></label>
          <label>Página <input type="number" min="1" max={job.total} value={row.page} onChange={event => editTopic(index, { page: Number(event.target.value) })}/></label>
          <button className="text-button" onClick={() => update({ ...draft, topics: draft.topics.filter((_, i) => i !== index) }, true)}>Remover</button>
        </div>)}
      </div>}
      {job.kind === 'gabarito' && <div className="draft-rows">
        {draft.keys.map((row, index) => ({ row, index })).filter(item => item.row.version === version).map(({ row, index }) =>
          <div className="draft-row key-row" key={index}>
            <label>Questão <input type="number" min="1" max={maxNumber(trail.id)} value={row.number} onChange={event => {
              const number = Number(event.target.value); editKey(index, { number, block: blockFor(trail.id, number) });
            }}/></label>
            <label>Resposta <select value={row.key} onChange={event => editKey(index, { key: event.target.value })}>
              {Array.from(trail.id === 'pr' ? 'ABCDEX' : 'CEX', value => <option key={value} value={value}>{value === 'X' ? 'Anulada' : value}</option>)}
            </select></label>
            <label>Página <input type="number" min="1" max={job.total} value={row.page} onChange={event => editKey(index, { page: Number(event.target.value) })}/></label>
            <SourceLink source={{ id: job.id, page: row.page }}/>
            <button className="text-button" onClick={() => update({ ...draft, keys: draft.keys.filter((_, i) => i !== index) })}>Remover</button>
          </div>)}
        <p className="muted">Salve o gabarito conferido e abra o caderno correspondente para publicar.</p>
      </div>}
      {job.kind === 'prova' && (() => {
        const historical = historicalExams.find(item => item.id === pair?.split(':')[0]);
        const byNumber = new Map<number, string>();
        for (const [id, range] of Object.entries(historical?.groups ?? {})) {
          for (const number of itemNumbers(range)) byNumber.set(number, subjects[id as Subject]);
        }
        const versionRows = draft.questions.map((row, index) => ({ row, index })).filter(item => item.row.version === version);
        const availableSubjects = [...new Set(versionRows.map(item => byNumber.get(item.row.number)).filter(Boolean))].sort();
        const rows = subject ? versionRows.filter(item => byNumber.get(item.row.number) === subject) : versionRows;
        return <div className="draft-rows">
          <div className="toolbar wrap">
            {availableSubjects.length > 0 && <label>Assunto sugerido <select value={subject}
              onChange={event => { setSubject(event.target.value); setRowOffset(0); }}>
              <option value="">Todos os assuntos</option>
              {availableSubjects.map(name => <option key={name}>{name}</option>)}
            </select></label>}
            <span>{rows.length} questão(ões) · {chosen.length} selecionada(s)</span>
            <button className="text-button" disabled={!defaultTopic || !keyDetail} onClick={() => {
              const batch = Object.fromEntries(rows.filter(item => matching(item.row).length === 1)
                .map(item => [item.index, { topicId: defaultTopic }]));
              setSelected(previous => ({ ...batch, ...previous })); setConfirmed(false);
            }}>Adicionar itens filtrados com gabarito</button></div>
          {rows.slice(rowOffset, rowOffset + 15).map(({ row, index }) => {
            const keys = matching(row);
            return <details className="question-draft" key={index}>
              <summary>Item {row.number} · {byNumber.get(row.number) ?? (row.block === 'basico' ? 'Básico / geral' : 'Específico')} · {keys.length === 1 ? keys[0].key === 'X' ? 'Anulado' : 'Gabarito ' + keys[0].key : 'Conferir gabarito'} {index in selected ? ' · Selecionado' : ''}</summary>
              <label className="check"><input type="checkbox" checked={index in selected} onChange={event => toggle(index, event.target.checked)}/> Incluir na publicação</label>
              <div className="form-grid">
                <label>Número <input type="number" min="1" max={maxNumber(trail.id)} value={row.number} onChange={event => {
                  const number = Number(event.target.value); editQuestion(index, { number, block: blockFor(trail.id, number) });
                }}/></label>
                <label>Página de origem <input type="number" min="1" max={job.total} value={row.page} onChange={event => editQuestion(index, { page: Number(event.target.value) })}/></label>
              </div>
              <SourceLink source={{ id: job.id, page: row.page }}/>
              <label>Comando ou texto comum <textarea rows={2} value={row.context} onChange={event => editQuestion(index, { context: event.target.value })}/></label>
              <label>Enunciado <textarea rows={3} value={row.prompt} onChange={event => editQuestion(index, { prompt: event.target.value })}/></label>
              <label className="check"><input type="checkbox" checked={Boolean(row.needsSupport)}
                onChange={event => editQuestion(index, { needsSupport: event.target.checked })}/> Depende de imagem ou página de apoio</label>
              <label>Páginas de apoio, separadas por vírgula <input key={row.page + '-' + index} defaultValue={row.supportPages?.join(', ')}
                onBlur={event => editQuestion(index, { supportPages: event.target.value.split(/[;, ]/).filter(Boolean)
                  .map(Number).filter(value => Number.isInteger(value) && value >= 1 && value <= job.total).slice(0, 8) })}/></label>
              {row.type === 'choice' && Array.from('ABCDE', key => <label key={key}>Alternativa {key}
                <input value={row.options.find(option => option.key === key)?.text ?? ''} onChange={event => editQuestion(index, {
                  options: Array.from('ABCDE', value => ({ key: value, text: value === key ? event.target.value : row.options.find(option => option.key === value)?.text ?? '' })),
                })}/></label>)}
              {index in selected && <><TopicSelect topics={topics} value={selected[index].topicId ?? ''} changed={topicId => {
                setSelected({ ...selected, [index]: { ...selected[index], topicId } }); setConfirmed(false);
              }}/>
                <label>Comentário da correção <textarea value={selected[index].comment ?? ''} onChange={event => {
                  setSelected({ ...selected, [index]: { ...selected[index], comment: event.target.value } }); setConfirmed(false);
                }}/></label></>}
              <button className="text-button" onClick={() => update({ ...draft, questions: draft.questions.filter((_, i) => i !== index) }, true)}>Remover linha</button>
            </details>;
          })}
          {rows.length > 15 && <div className="actions">
            <button className="button secondary" disabled={!rowOffset} onClick={() => setRowOffset(Math.max(0, rowOffset - 15))}>Linhas anteriores</button>
            <button className="button secondary" disabled={rowOffset + 15 >= rows.length} onClick={() => setRowOffset(rowOffset + 15)}>Próximas linhas</button>
          </div>}
        </div>;
      })()}
      {job.kind !== 'gabarito' && <>
        {job.kind === 'edital' && <button className="text-button" onClick={() => {
          setSelected(Object.fromEntries(draft.topics.map((_, i) => [i, {}]))); setConfirmed(false);
        }}>Selecionar todos os tópicos</button>}
        {chosen.length > 0 && <div className="callout"><strong>Prévia · {chosen.length} linha(s) selecionada(s)</strong>
          {job.kind === 'prova' && <p>{chosen.filter(item => item.topicId && matching(draft.questions[item.index]).length === 1).length}
            {' '}com tópico e chave correspondente. Confira os enunciados e as alternativas antes de publicar.</p>}
          <label className="check"><input type="checkbox" checked={confirmed} onChange={event => setConfirmed(event.target.checked)}/>
            {job.kind === 'prova' ? 'Conferi o caderno, o bloco, a versão e o gabarito.' : 'Conferi os tópicos e a edição de destino.'}</label>
          <button className="button primary" disabled={!confirmed || saving || active || (job.kind === 'prova' && !keyDetail)}
            onClick={() => void run(async () => {
              await api('/imports/' + jobId + '/draft', 'PUT', draft);
              setDirty(false);
              const result = await api<{ published: number; pending: string[] }>('/imports/' + jobId + '/publish', 'POST',
                { requestId: crypto.randomUUID(), editionId: edition, keyId: keyId || undefined, confirmed, selected: chosen });
              setSummary(result); setConfirmed(false); await mutate(async () => undefined);
            })}>Publicar selecionados</button>
        </div>}
      </>}
    </>}
    {summary && <div className="callout" role="status"><strong>{summary.published} linha(s) publicada(s)</strong>
      {summary.pending.length > 0 && <ul>{summary.pending.map((item, i) => <li key={i}>{item}</li>)}</ul>}</div>}
    {error && <p className="alert" role="alert">{error}</p>}
    <a className="source" href={pdfUrl(jobId, page)} target="_blank" rel="noreferrer">Consultar arquivo original</a>
  </section>;

  function toggle(index: number, checked: boolean) {
    const next = { ...selected };
    if (checked) next[index] = job.kind === 'prova' ? { topicId: defaultTopic || undefined } : {};
    else delete next[index];
    setSelected(next); setConfirmed(false);
  }
  function editTopic(index: number, patch: Partial<DraftTopic>) {
    if (draft) update({ ...draft, topics: draft.topics.map((item, i) => i === index ? { ...item, ...patch } : item) });
  }
  function editQuestion(index: number, patch: Partial<DraftQuestion>) {
    if (draft) update({ ...draft, questions: draft.questions.map((item, i) => i === index ? { ...item, ...patch } : item) });
  }
  function editKey(index: number, patch: Partial<DraftKey>) {
    if (draft) update({ ...draft, keys: draft.keys.map((item, i) => i === index ? { ...item, ...patch } : item) });
  }
}

function TopicSelect({ topics, value, changed }: { topics: Topic[]; value: string; changed: (id: string) => void }) {
  return <label>Tópico <select value={value} onChange={event => changed(event.target.value)}>
    <option value="">Selecionar</option>{topics.map(item => <option key={item.id} value={item.id}>{item.discipline} · {item.title}</option>)}
  </select></label>;
}
