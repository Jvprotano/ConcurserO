import { useEffect, useMemo, useState } from 'react';
import { Archive, Cloud, FileText, Plus, Save } from 'lucide-react';
import type { StudyPdf } from '../shared/agenda.ts';
import type { Summary, SummaryBackup, SummaryDraft } from '../shared/summaries.ts';
import type { StudyState } from '../shared/types.ts';
import { studyPdfUrl } from './agenda.tsx';
import { api, message } from './api.ts';
import { Empty } from './common.tsx';
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

export function Summaries({ state, context, changed }: {
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
  const [editorKey, setEditorKey] = useState(0);
  const [query, setQuery] = useState('');
  const [discipline, setDiscipline] = useState('');
  const [archived, setArchived] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');
  async function load() {
    try { setLibrary(await api<Library>('/summaries')); setError(''); }
    catch (error) { setError(message(error)); }
  }
  useEffect(() => { void load(); }, []);
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

  function markDirty(value: boolean) { setDirty(value); changed(value); }
  function open(existing?: Summary) {
    if (busy || (dirty && !window.confirm('Descartar as alterações ainda não salvas?'))) return;
    setEditorKey(editorKey + 1);
    setEditor({ draft: existing ?? { ...blank }, existing, key: editorKey + 1 });
    markDirty(false); setError(''); setStatus('');
  }
  function update(part: Partial<SummaryDraft>) {
    setEditor(current => current && { ...current, draft: { ...current.draft, ...part } });
    markDirty(true);
  }
  async function run(action: () => Promise<void>) {
    setError(''); setStatus(''); setBusy(true);
    try { await action(); } catch (error) { setError(message(error)); }
    finally { setBusy(false); }
  }
  async function save(archive?: boolean) {
    if (!editor || !library) return;
    const { draft, existing } = editor;
    if (!draft.title.trim()) { setError('Informe o título do resumo.'); return; }
    await run(async () => {
      const result = await api<{ summary: Summary; backup: SummaryBackup }>(
        existing ? '/summaries/' + existing.id : '/summaries', existing ? 'PUT' : 'POST',
        { ...draft, revision: existing?.revision, archived: archive ?? existing?.archived ?? false });
      const { summary, backup } = result;
      setLibrary({ summaries: [summary, ...library.summaries.filter(row => row.id !== summary.id)], backup });
      setEditor({ ...editor, draft: summary, existing: summary });
      if (archive !== undefined) { setArchived(archive); setDiscipline(''); }
      markDirty(false);
      setStatus(archive === undefined ? 'Resumo salvo.' : archive ? 'Resumo arquivado.' : 'Resumo restaurado.');
    });
  }

  if (!library) return error ? <><p className="alert" role="alert">{error}</p>
    <button className="button secondary" onClick={() => void load()}>Tentar novamente</button></> : <p role="status">Carregando resumos…</p>;

  const selectedPdf = materials.find(pdf => pdf.id === editor?.draft.source?.id && pdf.version === editor?.draft.source?.version);
  const selectedTopic = topics.find(topic => topic.id === editor?.draft.topicId);
  const topicList = [...topics].sort((a, b) => (a.discipline + a.title).localeCompare(b.discipline + b.title, 'pt-BR'));
  const allDisciplines = [...new Set([...disciplines, ...topicList.map(topic => topic.discipline)])].sort((a, b) => a.localeCompare(b, 'pt-BR'));
  const source = editor?.draft.source;
  return <>
    {error && <p className="alert" role="alert">{error}</p>}
    {status && <p className="feedback" role="status">{status}</p>}
    {library.backup.error && <p className="alert" role="status">{library.backup.error}</p>}
    <div className="summary-layout">
      <section className="panel summary-library" aria-label="Biblioteca de resumos">
        <button className="button primary" disabled={busy} onClick={() => open()}><Plus size={17}/>Novo resumo</button>
        <label>Buscar resumos<input type="search" value={query} placeholder="Título ou conteúdo" onChange={event => setQuery(event.target.value)}/></label>
        <label>Disciplina<select value={selectedDiscipline} onChange={event => setDiscipline(event.target.value)}>
          <option value="">Todas</option>
          {disciplines.map(name => <option key={name}>{name}</option>)}
        </select></label>
        <div className="segmented summary-tabs" aria-label="Situação">
          {[false, true].map(value => <button key={String(value)} aria-pressed={archived === value} onClick={() => {
            setArchived(value); setDiscipline('');
          }}>{value ? 'Arquivados' : 'Ativos'}</button>)}
        </div>
        <div className="summary-list">
          {!visible.length && <Empty>{archived ? 'Nenhum resumo arquivado encontrado.' : 'Nenhum resumo encontrado.'}</Empty>}
          {visible.map(({ row }) => <button key={row.id} className="summary-result" disabled={busy}
            aria-current={row.id === editor?.existing?.id ? 'true' : undefined} onClick={() => open(row)}>
            <strong>{row.title}</strong>
            <small>{[row.discipline, row.subject].filter(Boolean).join(' · ') || 'Sem classificação'}</small>
          </button>)}
        </div>
      </section>
      {editor ? <form key={editor.key} className="panel summary-form" onSubmit={event => { event.preventDefault(); void save(); }}>
        <fieldset disabled={busy}>
          <div className="summary-header">
            <label>Título<input value={editor.draft.title} maxLength={180} required readOnly={editor.existing?.archived}
              onChange={event => update({ title: event.target.value })}/></label>
            {!editor.existing?.archived && <button className="button primary" type="submit" disabled={!!editor.existing && !dirty}>
              <Save size={16}/>{busy ? 'Aguarde…' : 'Salvar resumo'}
            </button>}
          </div>
          {editor.existing?.archived && <p>Resumo arquivado</p>}
          {dirty && <p className="summary-meta" role="status">Alterações não salvas</p>}
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
          <SummaryEditor initialHtml={editor.draft.html} changed={html => update({ html })} readOnly={busy || !!editor.existing?.archived}/>
          {editor.existing && <div className="summary-footer">
            <small>Editado em {displayTime(editor.existing.updatedAt)}</small>
            <button type="button" className="text-button" disabled={dirty} onClick={() => void save(!editor.existing?.archived)}>
              <Archive size={16}/>{editor.existing.archived ? 'Restaurar resumo' : 'Arquivar resumo'}
            </button>
          </div>}
        </fieldset>
      </form> : <div className="panel summary-empty"><FileText size={26} aria-hidden="true"/>
        <p>Escolha um resumo ou comece um novo.</p></div>}
    </div>
    <BackupPanel backup={library.backup} busy={busy} configure={directory => void run(async () => {
      const backup = await api<SummaryBackup>('/summaries/backup', 'PUT', { directory });
      setLibrary({ ...library, backup });
    })} restore={file => void run(async () => {
      const response = await fetch('/api/summaries/restore', { method: 'POST',
        headers: { 'Content-Type': 'application/octet-stream' }, body: file });
      const result = await response.json() as Library & { added: number; copies: number; skipped: number; error?: string };
      if (!response.ok) throw new Error(result.error ?? 'Não foi possível restaurar.');
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
