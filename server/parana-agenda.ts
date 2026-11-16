import { createHash } from 'node:crypto';
import mapping from './parana-agenda-map.json' with { type: 'json' };
import type { DraftQuestion } from '../shared/types.ts';

const itemMap = new Map(mapping.groups.flatMap(group =>
  Object.entries(group.items).map(([number, signature]) => [Number(number), { signature, topic: group.topic }] as const)));

export function paranaSyllabusTitle(job: { trailId: string; hash: string }, row: DraftQuestion) {
  if (job.trailId !== 'pr' || job.hash !== mapping.hash || row.version !== 'A') return;
  const item = itemMap.get(row.number);
  if (!item) return;
  const signature = createHash('sha256').update(JSON.stringify([row.prompt, row.options.map(option => [option.key, option.text])])).digest('hex');
  if (signature === item.signature) return item.topic;
}
