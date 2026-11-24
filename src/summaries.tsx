import { useEffect, useMemo, useRef, useState } from 'react';
import { Archive, Cloud, LibraryBig, Plus, Save } from 'lucide-react';
import type { StudyPdf } from '../shared/agenda.ts';
import { summaryChangesChannel, type Summary, type SummaryBackup, type SummaryDraft } from '../shared/summaries.ts';
import type { StudyState } from '../shared/types.ts';
import { studyPdfUrl } from './agenda.tsx';
import { api, message } from './api.ts';
import { Empty } from './common.tsx';
import { RemoveButton, useBatchRemoval } from './removal.tsx';
import type { SharedProps } from './study.tsx';
import { SummaryEditor, summaryText } from './summary-editor.tsx';
import './summaries.css';

interface Library { summaries: Summary[]; backup: SummaryBackup }
interface Editor { draft: SummaryDraft; existing?: Summary; key: number }
const blank: SummaryDraft = { title: '', html: '', discipline: '', subject: '', topicId: null, source: null };
const searchText = (value: string) => value.normalize('NFD').replace(/\p{M}/gu, '').toLocaleLowerCase('pt-BR');
const displayTime = (value: string) => new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(value));
const pdfSource = (pdf: StudyPdf, page?: number): SummaryDraft['source'] => ({
  id: pdf.id, title: pdf.title, version: pdf.version, page: page ?? null,
});

const summaryTarget = ({ id, title }: Summary) => ({ kind: 'summary' as const, id, title });

function notifySummaryChanges() {
  const channel = new BroadcastChannel(summaryChangesChannel);
  channel.postMessage(null);
  channel.close();
}

export function Summaries({ state, context, changed, mutate }: Pick<SharedProps, 'mutate'> & {
  state: StudyState; context: URLSearchParams; changed: (dirty: boolean) => void;
}) {
  const topics = state.topics.filter(topic => topic.syllabus);
  const materials = state.agenda?.materials ?? [];
  const [editor, setEditor] = useState<Editor | null>(() => {
    if (!context.has('novo')) return null;
    const topic = topics.find(topic => topic.id === context.get('topico'));
    const pdf = materials.find(pdf => pdf.id === context.get('apostila'));
    const page = Number(context.get('pagina'));
    return { key: 0, draft: { ...blank, title: topic?.title ?? '', topicId: topic?.id ?? null,
      discipline: topic?.discipline ?? '', subject: topic?.title ?? '',
      source: pdf ? pdfSource(pdf, Number.isInteger(page) && page > 0 && page <= 50000 ? page : undefined) : null } };
  });
  const [library, setLibrary] = useState<Library>();
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [editorKey, setEditorKey] = useState(0);
  const titleInput = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState('');
  const [discipline, setDiscipline] = useState('');
  const [archived, setArchived] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [saveError, setSaveError] = useState('');
  const [status, setStatus] = useState('');
  async function load(openLinked = false) {
    try {
      const result = await api<Library>('/summaries');
      setLibrary(result);
      setError('');
      const linkedId = context.get('resumo');
      if (openLinked && linkedId && !context.has('novo')) {
        const linked = result.summaries.find(row => row.id === linkedId);
        if (linked) {
          setEditor({ draft: linked, existing: linked, key: 0 });
          setArchived(linked.archived);
        } else setError('Este resumo não está disponível.');
      }
    } catch (error) { setError(message(error)); }
  }
  useEffect(() => { void load(true); }, []);
  const libraryReady = !!library;
  const currentEditorKey = editor?.key;
  useEffect(() => { titleInput.current?.focus(); }, [libraryReady, currentEditorKey]);
  useEffect(() => {
    if (!dirty) return;
    function beforeUnload(event: BeforeUnloadEvent) { event.preventDefault(); event.returnValue = true; }
    window.addEventListener('beforeunload', beforeUnload);
    return () => window.removeEventListener('beforeunload', beforeUnload);
  }, [dirty]);
  const index = useMemo(() => library?.summaries.map(row => ({
    row, content: searchText([row.title, row.discipline, row.subject, summaryText(row.html)].join(' ')),
  })) ?? [], [library?.summaries]);
  const disciplines = [...new Set(index.filter(({ row }) => row.archived === archived)
    .map(({ row }) => row.discipline).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'pt-BR'));
  const words = searchText(query.trim()).split(/\s+/);
  const selectedDiscipline = disciplines.includes(discipline) ? discipline : '';
  const visible = index.filter(({ row, content }) => row.archived === archived
    && (!selectedDiscipline || row.discipline === selectedDiscipline) && words.every(word => content.includes(word)));
  const batch = useBatchRemoval(visible.map(({ row }) => summaryTarget(row)), mutate, removed => {
    if (removed.some(row => row.id === editor?.existing?.id)) setEditor(null);
    notifySummaryChanges();
    void load();
  });

  function markDirty(value: boolean) { setDirty(value); changed(value); }
  function open(existing?: Summary) {
    if (busy) return;
    if (existing && existing.id === editor?.existing?.id) {
      setLibraryOpen(false);
      titleInput.current?.focus();
      return;
    }
    if (dirty && !window.confirm('Descartar as alterações ainda não salvas?')) return;
    setEditorKey(editorKey + 1);
    setEditor({ draft: existing ?? { ...blank }, existing, key: editorKey + 1 });
    setLibraryOpen(false);
    markDirty(false); setError(''); setSaveError(''); setStatus('');
    batch.close();
  }
  function update(part: Partial<SummaryDraft>) {
    batch.close();
    setEditor(current => current && { ...current, draft: { ...current.draft, ...part } });
    setSaveError('');
    markDirty(true);
  }
  async function run(action: () => Promise<void>, failed = setError) {
    setError(''); setStatus(''); setBusy(true);
    try { await action(); } catch (error) { failed(message(error)); }
    finally { setBusy(false); }
  }
  async function save(archive?: boolean) {
    if (!editor || !library) return;
    const { draft, existing } = editor;
    if (!draft.title.trim()) {
      setSaveError('Informe o título do resumo.');
      titleInput.current?.focus();
      return;
    }
    setSaveError('');
    await run(async () => {
      const result = await api<{ summary: Summary; backup: SummaryBackup }>(
        existing ? '/summaries/' + existing.id : '/summaries', existing ? 'PUT' : 'POST',
        { ...draft, revision: existing?.revision, archived: archive ?? existing?.archived ?? false });
      const { summary, backup } = result;
      notifySummaryChanges();
      setLibrary({ summaries: [summary, ...library.summaries.filter(row => row.id !== summary.id)], backup });
      setEditor({ ...editor, draft: summary, existing: summary });
      if (archive !== undefined) { setArchived(archive); setDiscipline(''); }
      markDirty(false);
      if (archive !== undefined) setStatus(archive ? 'Resumo arquivado.' : 'Resumo restaurado.');
    }, archive === undefined ? setSaveError : setError);
  }

  if (!library) return <>
    <header className="summaries-heading"><h1>Resumos</h1></header>
    {error ? <><p className="alert" role="alert">{error}</p>
      <button className="button secondary" onClick={() => void load(true)}>Tentar novamente</button></> : <p role="status">Carregando resumos…</p>}
  </>;

  const selectedPdf = materials.find(pdf => pdf.id === editor?.draft.source?.id && pdf.version === editor?.draft.source?.version);
  const selectedTopic = topics.find(topic => topic.id === editor?.draft.topicId);
  const topicList = [...topics].sort((a, b) => (a.discipline + a.title).localeCompare(b.discipline + b.title, 'pt-BR'));
  const allDisciplines = [...new Set([...disciplines, ...topicList.map(topic => topic.discipline)])].sort((a, b) => a.localeCompare(b, 'pt-BR'));
  const source = editor?.draft.source;
  return <>
    <header className="summaries-heading">
      <h1>Resumos</h1>
      <div className="summary-actions">
        {editor && <button type="button" className="button secondary summary-library-toggle" aria-expanded={libraryOpen}
          aria-controls="summary-library" onClick={() => setLibraryOpen(!libraryOpen)}>
          <LibraryBig size={16} aria-hidden="true"/>Meus resumos
        </button>}
        <button type="button" className={editor ? 'button secondary' : 'button primary'} disabled={busy} onClick={() => open()}>
          <Plus size={17} aria-hidden="true"/>Novo resumo
        </button>
      </div>
    </header>
    {error && <p className="alert" role="alert">{error}</p>}
    {status && <p className="feedback" role="status">{status}</p>}
    {library.backup.error && <p className="alert" role="status">{library.backup.error}</p>}
    <div className={editor ? 'summary-layout has-editor' : 'summary-layout'}>
      <section id="summary-library" className={libraryOpen ? 'panel summary-library is-open' : 'panel summary-library'}
        aria-label="Biblioteca de resumos">
        <label>Buscar resumos<input type="search" value={query} placeholder="Título ou conteúdo" onChange={event => { batch.close(); setQuery(event.target.value); }}/></label>
        <label>Disciplina<select value={selectedDiscipline} onChange={event => { batch.close(); setDiscipline(event.target.value); }}>
          <option value="">Todas</option>
          {disciplines.map(name => <option key={name}>{name}</option>)}
        </select></label>
        <div className="segmented summary-tabs" aria-label="Situação">
          {[false, true].map(value => <button key={String(value)} aria-pressed={archived === value} onClick={() => {
            batch.close(); setArchived(value); setDiscipline('');
          }}>{value ? 'Arquivados' : 'Ativos'}</button>)}
        </div>
        {!dirty && !busy && batch.toolbar}
        <div className="summary-list">
          {!visible.length && <Empty>{archived ? 'Nenhum resumo arquivado encontrado.' : 'Nenhum resumo encontrado.'}</Empty>}
          {visible.map(({ row }) => <div className="summary-row" key={row.id}>
            {batch.checkbox(summaryTarget(row))}
            <button type="button" className="summary-result" disabled={busy}
              aria-current={row.id === editor?.existing?.id ? 'true' : undefined} onClick={() => open(row)}>
            <strong>{row.title}</strong>
            <small>{[row.discipline, row.subject].filter(Boolean).join(' · ') || 'Sem classificação'}</small>
            </button>
          </div>)}
        </div>
      </section>
      {editor && <form key={editor.key} className="panel summary-form" onSubmit={event => { event.preventDefault(); void save(); }}>
        <fieldset disabled={busy}>
          <div className="summary-header">
            <label>Título<input ref={titleInput} value={editor.draft.title} maxLength={180} required readOnly={editor.existing?.archived}
              onChange={event => update({ title: event.target.value })}/></label>
          </div>
          {editor.existing?.archived && <p>Resumo arquivado</p>}
          <details className="summary-details"><summary>Classificação e apostila</summary>
            <label>Assunto do edital<select value={editor.draft.topicId ?? ''} disabled={editor.existing?.archived} onChange={event => {
              const topic = topicList.find(topic => topic.id === event.target.value);
              update(topic ? { topicId: topic.id, discipline: topic.discipline, subject: topic.title } : { topicId: null });
            }}>
              <option value="">Sem vínculo com edital</option>
              {editor.draft.topicId && !selectedTopic && <option value={editor.draft.topicId}>{editor.draft.subject} (cadastro indisponível)</option>}
              {topicList.map(topic => <option key={topic.id} value={topic.id}>
                {topic.discipline} · {topic.title} · {state.trails.find(trail => trail.id === topic.trailId)?.title}
              </option>)}
            </select></label>
            <div className="form-grid">
              <label>Disciplina<input list="summary-disciplines" maxLength={250} value={editor.draft.discipline}
                readOnly={!!selectedTopic || editor.existing?.archived} onChange={event => update({ discipline: event.target.value })}/></label>
              <label>Assunto<input maxLength={500} value={editor.draft.subject}
                readOnly={!!selectedTopic || editor.existing?.archived} onChange={event => update({ subject: event.target.value })}/></label>
            </div>
            <datalist id="summary-disciplines">{allDisciplines.map(name => <option key={name} value={name}/>)}</datalist>
            <label>Apostila ou PDF<select value={source?.id ?? ''} disabled={editor.existing?.archived} onChange={event => {
              const pdf = materials.find(pdf => pdf.id === event.target.value);
              update({ source: pdf ? pdfSource(pdf, pdf.links.find(link => link.topicId === editor.draft.topicId)?.firstPage) : null });
            }}>
              <option value="">Sem PDF</option>
              {source && !selectedPdf && <option value={source.id}>{source.title} (cadastro indisponível)</option>}
              {materials.filter(pdf => !source || pdf.id !== source.id || selectedPdf).map(pdf =>
                <option key={pdf.id} value={pdf.id}>{pdf.title} · v{pdf.version}</option>)}
            </select></label>
            {source && <label>Página da referência<input type="number" min={1} max={50000} value={source.page ?? ''}
              readOnly={editor.existing?.archived} onChange={event => update({ source: { ...source, page: event.target.valueAsNumber || null } })}/></label>}
          </details>
          {source && <p className="summary-meta">
            {selectedPdf?.available ? <a href={studyPdfUrl(source.id, source.page ?? undefined)} target="_blank" rel="noreferrer">{source.title}</a> : source.title + ' (PDF indisponível)'}
            {source.page ? ' · p. ' + source.page : ''}
          </p>}
          <SummaryEditor initialHtml={editor.draft.html} changed={html => update({ html })}
            readOnly={!!editor.existing?.archived} busy={busy}
            action={<>
              <span className="summary-edit-status summary-meta" role="status">{dirty ? 'Não salvo' : editor.existing ? 'Resumo salvo' : ''}</span>
              <button className="button primary summary-save" type="submit" disabled={!!editor.existing && !dirty}>
                <Save size={16} aria-hidden="true"/>{busy ? 'Salvando…' : 'Salvar resumo'}
              </button>
            </>} error={saveError}/>
          {editor.existing && <div className="summary-footer">
            <small>Editado em {displayTime(editor.existing.updatedAt)}</small>
            <button type="button" className="text-button" disabled={dirty} onClick={() => void save(!editor.existing?.archived)}>
              <Archive size={16}/>{editor.existing.archived ? 'Restaurar resumo' : 'Arquivar resumo'}
            </button>
            {!batch.selecting && <RemoveButton {...summaryTarget(editor.existing)} mutate={mutate} disabled={dirty}
              onRemoved={() => { setEditor(null); setStatus(''); void load(); }}/>}
          </div>}
        </fieldset>
      </form>}
    </div>
    <BackupPanel backup={library.backup} busy={busy} configure={directory => void run(async () => {
      const backup = await api<SummaryBackup>('/summaries/backup', 'PUT', { directory });
      setLibrary({ ...library, backup });
    })} restore={file => void run(async () => {
      const response = await fetch('/api/summaries/restore', { method: 'POST',
        headers: { 'Content-Type': 'application/octet-stream' }, body: file });
      const result = await response.json() as Library & { added: number; copies: number; skipped: number; error?: string };
      if (!response.ok) throw new Error(result.error ?? 'Não foi possível restaurar.');
      if (result.added || result.copies) notifySummaryChanges();
      setLibrary(result);
      setStatus(`Restaurados: ${result.added}. Cópias de versões diferentes: ${result.copies}. Já existentes: ${result.skipped}.`);
    })}/>
  </>;
}

function BackupPanel({ backup, busy, configure, restore }: {
  backup: SummaryBackup; busy: boolean; configure: (directory: string) => void; restore: (file: File) => void;
}) {
  const [file, setFile] = useState<File>();
  const [directory, setDirectory] = useState(backup.directory);
  useEffect(() => { setDirectory(backup.directory); }, [backup.directory]);
  return <details className="panel summary-backup">
    <summary><Cloud size={17} aria-hidden="true"/> Backup dos resumos</summary>
    <p>Para manter uma cópia na nuvem, informe o caminho de uma pasta do Google Drive para computador.</p>
    <form onSubmit={event => { event.preventDefault(); configure(directory); }}>
      <label>Pasta para backup automático<input value={directory} onChange={event => setDirectory(event.target.value)}
        placeholder="Ex. C:\Google Drive\Resumos" maxLength={1024} required disabled={busy}/></label>
      <div className="actions">
        <button className="button secondary" disabled={busy}>{directory === backup.directory && directory ? 'Gravar cópia agora' : 'Usar esta pasta'}</button>
        {backup.directory && <button type="button" className="text-button" disabled={busy} onClick={() => configure('')}>Desativar backup automático</button>}
      </div>
      {backup.savedAt && <p className="summary-meta">Última cópia gravada na pasta em {displayTime(backup.savedAt)}. O Drive envia o arquivo ao sincronizar.</p>}
    </form>
    <form onSubmit={event => { event.preventDefault(); if (file) restore(file); }}>
      <label>Arquivo de backup<input type="file" accept=".json,application/json" onChange={event => setFile(event.target.files?.[0])} disabled={busy}/></label>
      <div className="actions">
        <button className="button secondary" disabled={busy || !file}>Restaurar do arquivo</button>
        <a className="button secondary" href="/api/summaries/backup" download>Baixar backup</a>
      </div>
    </form>
  </details>;
}
