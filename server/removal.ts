import { Problem, required, type Store } from './db.ts';
import type { RemovedItem, RemovableKind } from '../shared/types.ts';

const entities = {
  import: { table: 'imports', title: 'name' }, trail: { table: 'trails', title: 'title' },
  edition: { table: 'editions', title: 'title' }, topic: { table: 'topics', title: 'title' },
  material: { table: 'materials', title: 'title' }, card: { table: 'cards', title: 'front' },
} as const;

export function removedItems(store: Store): RemovedItem[] {
  return (Object.keys(entities) as RemovableKind[]).flatMap(kind => {
    const { table, title } = entities[kind];
    return store.all<RemovedItem>(`SELECT d.kind,d.id,d.removed,e.${title} AS title
      FROM removed_items d JOIN ${table} e ON e.id=d.id WHERE d.kind=?`, kind);
  }).sort((a, b) => b.removed.localeCompare(a.removed));
}

export function removeItem(store: Store, kind: RemovableKind, id: string) {
  return store.transaction(() => {
    required(store.get(`SELECT id FROM ${entities[kind].table} WHERE id=?`, id), 'Item inexistente.');
    if (kind === 'edition' && store.get('SELECT 1 FROM trails WHERE active_edition=?', id)) {
      throw new Problem('Ative outra edição antes de remover esta. Para retirar todo o objetivo, remova o concurso.', 409);
    }
    store.run('INSERT OR IGNORE INTO removed_items VALUES (?,?,?)', kind, id, new Date().toISOString());
    return { id };
  });
}

export function restoreItem(store: Store, kind: RemovableKind, id: string) {
  return store.transaction(() => {
    required(store.get(`SELECT id FROM ${entities[kind].table} WHERE id=?`, id), 'Item inexistente.');
    const parent = kind === 'import' || kind === 'edition'
      ? store.get<{ parent: string }>(`SELECT trail_id AS parent FROM ${entities[kind].table} WHERE id=?`, id)
      : kind === 'topic' ? store.get<{ parent: string }>('SELECT edition_id AS parent FROM topics WHERE id=?', id) : undefined;
    if (parent && !store.get(`SELECT 1 FROM ${kind === 'topic' ? 'active_editions' : 'active_trails'} WHERE id=?`, parent.parent)) {
      throw new Problem('Restaure primeiro o concurso ou a edição deste item.', 409);
    }
    if (kind === 'topic' && store.get(`SELECT 1 FROM topics WHERE id=? AND source_id IS NOT NULL
      AND source_id NOT IN (SELECT id FROM active_imports)`, id)) {
      throw new Problem('Restaure primeiro o edital de origem deste tópico.', 409);
    }
    if (kind === 'card' && !store.get(`SELECT 1 FROM card_topics WHERE card_id=? AND topic_id IN (SELECT id FROM active_topics)`, id)) {
      throw new Problem('Restaure primeiro um tópico deste cartão.', 409);
    }
    store.run('DELETE FROM removed_items WHERE kind=? AND id=?', kind, id);
    return { id };
  });
}
