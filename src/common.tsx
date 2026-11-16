import type { ReactNode } from 'react';
import { FileText, Inbox } from 'lucide-react';
import { pdfUrl } from './api.ts';
import type { Topic } from '../shared/types.ts';

export function Empty({ children }: { children: ReactNode }) {
  return <div className="empty"><Inbox size={22} aria-hidden="true"/><p>{children}</p></div>;
}
export function SourceLink({ source, label = 'Página de origem' }: {
  source?: { id: string; page: number }; label?: string;
}) {
  return source && <a className="source" href={pdfUrl(source.id, source.page)} target="_blank" rel="noreferrer">
    <FileText size={15} aria-hidden="true"/>{label} · p. {source.page}
  </a>;
}
export function TopicLinks({ topics, value, onChange }: {
  topics: Topic[]; value: string[]; onChange: (value: string[]) => void;
}) {
  return <fieldset className="check-list">
    <legend>Tópicos vinculados</legend>
    {topics.map(topic => <label key={topic.id} className="check">
      <input type="checkbox" checked={value.includes(topic.id)}
        onChange={event => onChange(event.target.checked ? [...value, topic.id] : value.filter(id => id !== topic.id))}/>
      {topic.title} · {topic.trailId.toUpperCase()}
    </label>)}
  </fieldset>;
}
