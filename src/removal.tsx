import { useEffect, useId, useRef, useState } from 'react';
import { Trash2 } from 'lucide-react';
import type { RemovableKind, RemovedItem } from '../shared/types.ts';
import type { SharedProps } from './study.tsx';
import { api, message } from './api.ts';

const labels: Record<RemovableKind, string> = {
  import: 'Documento', trail: 'Concurso', edition: 'Edição', topic: 'Tópico', material: 'Material', card: 'Cartão',
};
const effects: Record<RemovableKind, string> = {
  import: 'O documento e seu conteúdo saem das listas e análises do acervo. Questões que dependem deste gabarito ficam pendentes.',
  trail: 'O concurso e seu conteúdo saem das listas e do plano. Conteúdo compartilhado com outros concursos continua disponível.',
  edition: 'A edição e seus tópicos saem das listas e do plano.',
  topic: 'O tópico e as questões vinculadas saem das listas e do plano. Conteúdo compartilhado com outros tópicos continua disponível.',
  material: 'O material deixa de aparecer nos tópicos vinculados.',
  card: 'O cartão sai da lista e da fila de revisões.',
};

export function RemoveButton({ kind, id, title, mutate, onRemoved, disabled = false }: Pick<SharedProps, 'mutate'> & {
  kind: RemovableKind; id: string; title: string; onRemoved?: () => void; disabled?: boolean;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const heading = useId();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  return <>
    <button type="button" className="text-button remove-button" disabled={disabled || busy}
      aria-label={'Remover ' + title} onClick={() => { setError(''); dialog.current?.showModal(); }}>
      <Trash2 size={15} aria-hidden="true"/> Remover
    </button>
    <dialog ref={dialog} className="remove-dialog" aria-labelledby={heading} onCancel={event => { if (busy) event.preventDefault(); }}>
      <h2 id={heading}>Remover {labels[kind].toLowerCase()}?</h2><p><strong>{title}</strong></p>
      <p>{effects[kind]}</p><p className="muted">O histórico de estudo será preservado. Você pode restaurar em Acervo → Itens removidos.</p>
      {error && <p role="alert" className="alert">{error}</p>}
      <div className="actions"><button type="button" autoFocus className="button secondary" disabled={busy} onClick={() => dialog.current?.close()}>Cancelar</button>
        <button type="button" className="button danger" disabled={busy} onClick={async () => {
          if (busy) return; setBusy(true); setError('');
          const ok = await mutate(async () => {
            try { await api('/items/' + kind + '/' + encodeURIComponent(id), 'DELETE'); }
            catch (error) { setError(message(error)); throw error; }
          }, labels[kind] + ' removido. Histórico preservado.');
          setBusy(false);
          if (ok) { dialog.current?.close(); onRemoved?.(); }
        }}>{busy ? 'Removendo…' : 'Confirmar remoção'}</button></div>
    </dialog>
  </>;
}

export function RemovedItems({ mutate, refreshKey }: Pick<SharedProps, 'mutate'> & { refreshKey: unknown }) {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<RemovedItem[]>([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    if (!open) return;
    let current = true; setLoading(true); setError('');
    api<RemovedItem[]>('/removed-items').then(value => { if (current) setItems(value); })
      .catch(error => { if (current) setError(message(error)); }).finally(() => { if (current) setLoading(false); });
    return () => { current = false; };
  }, [open, refreshKey]);
  return <details className="panel" onToggle={event => setOpen(event.currentTarget.open)}>
    <summary>Itens removidos</summary>
    <p className="muted">Restaure documentos e cadastros com o histórico preservado. Quando necessário, restaure primeiro o concurso, a edição ou o edital de origem.</p>
    {loading && <p role="status">Carregando…</p>}
    {error && <p role="alert" className="alert">{error}</p>}
    {!loading && !error && !items.length && <p className="muted">Nenhum item removido.</p>}
    {items.map(item => <div className="task-row" key={item.kind + ':' + item.id}><div><h3>{item.title}</h3><p>{labels[item.kind]}</p></div>
      <button className="button secondary" disabled={!!busy} onClick={async () => {
        setBusy(item.id); setError('');
        const ok = await mutate(async () => {
          try { await api('/items/' + item.kind + '/' + encodeURIComponent(item.id) + '/restore', 'POST'); }
          catch (error) { setError(message(error)); throw error; }
        }, labels[item.kind] + ' restaurado.');
        if (ok) setItems(rows => rows.filter(row => row.kind !== item.kind || row.id !== item.id));
        setBusy('');
      }}>{busy === item.id ? 'Restaurando…' : 'Restaurar'}</button></div>)}
  </details>;
}
