import { useState } from 'react';
import type { MaterialLink, StudyPdf } from '../shared/agenda.ts';
import { api, message } from './api.ts';
import type { SharedProps } from './study.tsx';

export const normalized = (text: string) => text.normalize('NFD').replace(/\p{Diacritic}/gu, '').trim().toLowerCase();
export const materialLabels = { apostila: 'Apostila', nota: 'Nota de conferência', referencia: 'Referência' };

export async function importMaterials(files: File[], category: StudyPdf['category'], origin: string, topics: SharedProps['topics']) {
  let imported = 0, duplicates = 0;
  const errors: string[] = [];
  for (const file of files) {
    try {
      const query = new URLSearchParams({ filename: file.name, category, origin: origin || 'Importação local' });
      const saved = await api<{ id: string; duplicate: boolean; restored?: boolean }>('/study-pdfs?' + query, 'POST', file);
      if (saved.duplicate) {
        duplicates++;
        continue;
      }
      imported++;
      const title = normalized(file.name.replace(/\.pdf$/i, '').replace(/^Apostila\s+\d+\.\d+\s*[-—–]\s*/i, ''));
      const matching = topics.filter(topic => normalized(topic.title) === title);
      if (!saved.restored && category === 'apostila' && matching.length === 1) {
        await api('/study-pdfs/' + saved.id + '/links', 'PUT', { topicId: matching[0].id });
      }
    } catch (error) { errors.push(file.name + ' — ' + message(error)); }
  }
  return {
    failed: errors.length > 0,
    feedback: imported + ' PDF(s) importado(s). ' + duplicates + ' já cadastrado(s).' +
      (errors.length ? '\n' + errors.join('\n') : ''),
  };
}

export function MaterialLinks({ pdf, topics, mutate }: { pdf: StudyPdf; topics: SharedProps['topics']; mutate: SharedProps['mutate'] }) {
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
