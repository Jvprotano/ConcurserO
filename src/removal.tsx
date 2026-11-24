import { useEffect, useId, useRef, useState } from 'react';
import { Trash2 } from 'lucide-react';
import type { RemovableKind, RemovedItem } from '../shared/types.ts';
import type { SharedProps } from './study.tsx';
import { api, message } from './api.ts';

const labels: Record<RemovableKind, string> = {
  import: 'Documento', trail: 'Concurso', edition: 'Edição', topic: 'Tópico', material: 'Material', card: 'Cartão', summary: 'Resumo',
  'study-time': 'Registro de tempo',
  'gran-question': 'Questão do Gran',
};
const effects: Record<RemovableKind, string> = {
  import: 'O documento e seu conteúdo saem das listas e análises do acervo. Questões que dependem deste gabarito ficam pendentes.',
  trail: 'O concurso e seu conteúdo saem das listas e do plano. Conteúdo compartilhado com outros concursos continua disponível.',
  edition: 'A edição e seus tópicos saem das listas e do plano.',
  topic: 'O tópico e as questões vinculadas saem das listas e do plano. Conteúdo compartilhado com outros tópicos continua disponível.',
  material: 'O material deixa de aparecer nos tópicos vinculados.',
  card: 'O cartão sai da lista e da fila de revisões.',
  summary: 'O resumo sai da biblioteca e das próximas cópias de segurança.',
  'study-time': 'O tempo sai do histórico visível e do total do dia.',
  'gran-question': 'A questão sai do banco local e das atividades de prática.',
};

type RemovalTarget = Pick<RemovedItem, 'kind' | 'id' | 'title'>;
type RemovalProps = Pick<SharedProps, 'mutate'> & { onRemoved?: () => void; disabled?: boolean };

export function RemoveButton({ kind, id, title, ...props }: RemovalTarget & RemovalProps) {
  return <RemoveItemsButton items={[{ kind, id, title }]} {...props}/>;
}

function RemoveItemsButton({ items, mutate, onRemoved, disabled, batch = false }: RemovalProps & {
  items: RemovalTarget[]; batch?: boolean;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const heading = useId();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const single = !batch ? items[0] : undefined;
  const action = single ? 'Remover ' + single.title : 'Remover selecionados (' + items.length + ')';
  return <>
    <button type="button" className="text-button remove-button" disabled={disabled || busy || !items.length}
      aria-label={action} onClick={() => { setError(''); dialog.current?.showModal(); }}>
      <Trash2 size={15} aria-hidden="true"/> {single ? 'Remover' : action}
    </button>
    <dialog ref={dialog} className="remove-dialog" aria-labelledby={heading} onCancel={event => { if (busy) event.preventDefault(); }}>
      <h2 id={heading}>{single ? 'Remover ' + labels[single.kind].toLowerCase() + '?' :
        'Remover ' + items.length + (items.length === 1 ? ' item?' : ' itens?')}</h2>
      {single ? <p><strong>{single.title}</strong></p> : <ul>{items.map(item => <li key={itemKey(item)}>{item.title}</li>)}</ul>}
      {[...new Set(items.map(item => item.kind))].map(kind => <p key={kind}>{effects[kind]}</p>)}
      <p className="muted">O histórico de estudo será preservado. Você pode restaurar em Acervo → Itens removidos.</p>
      {error && <p role="alert" className="alert">{error}</p>}
      <div className="actions"><button type="button" autoFocus className="button secondary" disabled={busy} onClick={() => dialog.current?.close()}>Cancelar</button>
        <button type="button" className="button danger" disabled={busy} onClick={async () => {
          if (busy) return; setBusy(true); setError('');
          const ok = await mutate(async () => {
            try {
              await api('/items/batch-remove', 'POST', { items: items.map(({ kind, id }) => ({ kind, id })) });
            }
            catch (error) { setError(message(error)); throw error; }
          }, items.length === 1 ? 'Item removido.' : 'Itens removidos.');
          setBusy(false);
          if (ok) { dialog.current?.close(); onRemoved?.(); }
        }}>{busy ? 'Removendo…' : 'Confirmar remoção'}</button></div>
    </dialog>
  </>;
}

const itemKey = ({ kind, id }: Pick<RemovalTarget, 'kind' | 'id'>) => kind + ':' + id;

export function useBatchRemoval(items: RemovalTarget[], mutate: SharedProps['mutate'], onRemoved?: (items: RemovalTarget[]) => void) {
  const [selecting, setSelecting] = useState(false);
  const [keys, setKeys] = useState<string[]>([]);
  const selected = items.filter(item => keys.includes(itemKey(item)));
  function close() {
    setSelecting(false);
    setKeys([]);
  }
  const toolbar = !!items.length && <div className="actions">
    {selecting ? <>
      <button type="button" className="text-button" onClick={close}>Cancelar seleção</button>
      <label className="check"><input type="checkbox" checked={selected.length === items.length}
        onChange={event => setKeys(event.target.checked ? items.map(itemKey) : [])}/> Selecionar todos</label>
      <RemoveItemsButton batch items={selected} mutate={mutate} onRemoved={() => { close(); onRemoved?.(selected); }}/>
    </> : <button type="button" className="text-button" onClick={() => setSelecting(true)}>Selecionar</button>}
  </div>;
  function checkbox(item: RemovalTarget) {
    const key = itemKey(item);
    return selecting && <input type="checkbox" aria-label={'Selecionar ' + item.title} checked={keys.includes(key)}
      onChange={event => {
        const checked = event.target.checked;
        setKeys(current => checked ? [...current, key] : current.filter(value => value !== key));
      }}/>;
  }
  return { toolbar, checkbox, close, selecting };
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
