import { useState } from 'react';
import { FileText, Upload } from 'lucide-react';
import type { MaterialLink, StudyPdf } from '../shared/agenda.ts';
import { api, message } from './api.ts';
import { studyPdfUrl } from './agenda.tsx';
import { Empty } from './common.tsx';
import { RemoveButton } from './removal.tsx';
import type { SharedProps } from './study.tsx';

const normalized = (text: string) => text.normalize('NFD').replace(/\p{Diacritic}/gu, '').trim().toLowerCase();
const labels = { apostila: 'Apostila', nota: 'Nota de conferência', referencia: 'Referência' };

export function Materials({ state, trail, mutate }: Pick<SharedProps, 'state' | 'trail' | 'mutate'>) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [query, setQuery] = useState('');
  const [onlyUnlinked, setOnlyUnlinked] = useState(false);
  const [result, setResult] = useState('');
  const pdfs = state.agenda?.materials ?? [];
  const topics = state.topics.filter(topic => topic.syllabus && topic.trailId === trail.id);
  const activeTopics = topics.filter(topic => topic.editionId === trail.editionId);
  const visible = pdfs.filter(row => (!onlyUnlinked || !row.links.length) &&
    normalized(row.title + ' ' + row.origin).includes(normalized(query)));
  return <section className="panel">
    <div className="section-heading wrap"><h2>Materiais de estudo</h2>
      <button className="button secondary" onClick={() => setOpen(!open)}><FileText size={16}/>{open ? 'Recolher' : 'Ver materiais'} · {pdfs.length}</button></div>
    {open && <>
      <form className="section" onSubmit={async event => {
        event.preventDefault();
        if (busy) return;
        const form = event.currentTarget;
        const data = new FormData(form);
        const files = data.getAll('files').filter((file): file is File => file instanceof File && file.size > 0);
        const category = String(data.get('category'));
        const origin = String(data.get('origin') || '').trim();
        setBusy(true); setResult('');
        const imported: string[] = [], duplicates: string[] = [], errors: string[] = [];
        try {
          await mutate(async () => {
            for (const file of files) {
              try {
                const query = new URLSearchParams({ filename: file.name, category, origin: origin || 'Importação local' });
                const saved = await api<{ id: string; duplicate: boolean }>('/study-pdfs?' + query, 'POST', file);
                (saved.duplicate ? duplicates : imported).push(file.name);
                const title = normalized(file.name.replace(/\.pdf$/i, '').replace(/^Apostila\s+\d+\.\d+\s*[-—–]\s*/i, ''));
                const matching = activeTopics.filter(topic => normalized(topic.title) === title);
                if (!saved.duplicate && category === 'apostila' && matching.length === 1) {
                  await api('/study-pdfs/' + saved.id + '/links', 'PUT', { topicId: matching[0].id });
                }
              } catch (error) { errors.push(file.name + ' — ' + message(error)); }
            }
          }, '');
          setResult(imported.length + ' PDF(s) cadastrado(s). ' + duplicates.length + ' já cadastrado(s).' +
            (errors.length ? '\n' + errors.join('\n') : ''));
          if (!errors.length) form.reset();
        } finally { setBusy(false); }
      }}>
        <div className="form-grid">
          <label>PDFs locais <input name="files" type="file" accept=".pdf,application/pdf" multiple required/></label>
          <label>Tipo <select name="category"><option value="apostila">Apostila</option><option value="nota">Nota de conferência</option><option value="referencia">Referência</option></select></label>
        </div>
        <details><summary>Identificar caderno ou pasta</summary><label>Origem <input name="origin" maxLength={1000}/></label></details>
        <button className="button primary" disabled={busy}><Upload size={16}/>{busy ? 'Cadastrando…' : 'Cadastrar PDFs'}</button>
      </form>
      {result && <p className="prose" role="status">{result}</p>}
      <div className="toolbar wrap">
        <label>Buscar material <input type="search" value={query} onChange={event => setQuery(event.target.value)}/></label>
        <label className="check"><input type="checkbox" checked={onlyUnlinked} onChange={event => setOnlyUnlinked(event.target.checked)}/> Sem vínculo</label>
      </div>
      {!visible.length && <Empty>Nenhum material neste recorte.</Empty>}
      {visible.map(pdf => <div className="material-entry" key={pdf.id}>
        <article className="task-row"><div><h3>{pdf.title}</h3><p>{labels[pdf.category]} · {pdf.origin} · Versão {pdf.version}</p>
          <p>{pdf.available ? (pdf.links.length ? pdf.links.length + ' vínculo(s)' : 'Sem vínculo com o edital') : 'Arquivo indisponível. Cadastre novamente o mesmo PDF.'}</p></div>
          {pdf.available && <a className="button secondary" href={studyPdfUrl(pdf.id)} target="_blank" rel="noreferrer">Abrir PDF</a>}
        </article>
        <details><summary>Vínculos com o edital</summary>
          <MaterialLinks pdf={pdf} topics={topics} mutate={mutate}/>
          <RemoveButton kind="material" id={pdf.id} title={pdf.title} mutate={mutate}/>
        </details>
      </div>)}
    </>}
  </section>;
}

function MaterialLinks({ pdf, topics, mutate }: { pdf: StudyPdf; topics: SharedProps['topics']; mutate: SharedProps['mutate'] }) {
  const [topicId, setTopicId] = useState('');
  const link = pdf.links.find(row => row.topicId === topicId);
  const pages = (item: MaterialLink) => item.firstPage ? ' · p. ' + item.firstPage + (item.lastPage ? '–' + item.lastPage : '') : '';
  return <>
    {pdf.links.map(row => {
      const topic = topics.find(topic => topic.id === row.topicId);
      return topic && <div className="task-row" key={row.topicId}>
        <p>{topic.title}{pages(row)}</p>
        <div className="actions">
          <button className="text-button" onClick={() => setTopicId(row.topicId)}>Editar recorte</button>
          <button className="text-button" onClick={() => void mutate(() =>
            api('/study-pdfs/' + pdf.id + '/links/' + row.topicId, 'DELETE'), 'Vínculo removido.')}>Desvincular</button>
        </div>
      </div>;
    })}
    <form onSubmit={event => {
      event.preventDefault();
      const data = new FormData(event.currentTarget);
      const first = data.get('firstPage'), last = data.get('lastPage');
      const body = {
        topicId, firstPage: first ? Number(first) : undefined, lastPage: last ? Number(last) : undefined,
        section: data.get('section'), prompt: data.get('prompt'), answer: data.get('answer'),
      };
      void mutate(() => api('/study-pdfs/' + pdf.id + '/links', 'PUT', body), 'Material vinculado.');
    }}>
      <label>Tópico do edital <select required value={topicId} onChange={event => setTopicId(event.target.value)}>
        <option value="">Selecionar tópico</option>
        {topics.map(row => <option key={row.id} value={row.id}>{row.title} · {row.discipline} · {row.editionId}</option>)}
      </select></label>
      {topicId && <div key={topicId}>
        <div className="form-grid">
          <label>Página inicial <input name="firstPage" type="number" min={1} max={50000} defaultValue={link?.firstPage}/></label>
          <label>Página final <input name="lastPage" type="number" min={1} max={50000} defaultValue={link?.lastPage}/></label>
        </div>
        <label>Seção <input name="section" maxLength={200} defaultValue={link?.section}/></label>
        <details><summary>Pergunta e resposta de revisão</summary>
          <label>Pergunta <textarea name="prompt" rows={2} maxLength={1000} defaultValue={link?.prompt}/></label>
          <label>Resposta <textarea name="answer" rows={3} maxLength={3000} defaultValue={link?.answer}/></label>
        </details>
        <button className="button secondary">Salvar vínculo</button>
      </div>}
    </form>
  </>;
}
