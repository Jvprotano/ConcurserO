import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, renameSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';
import { createApp } from '../server/index.ts';
import { Store } from '../server/db.ts';
import type { Summary, SummaryBackup } from '../shared/summaries.ts';

test('resumos persistem, atualizam o backup e restauram sem sobrescrever', async () => {
  const temporary = mkdtempSync(join(tmpdir(), 'concursero-resumos-'));
  async function start(name: string) {
    const store = new Store(join(temporary, name));
    const server = createApp(store).listen(0, '127.0.0.1');
    await once(server, 'listening');
    const address = server.address();
    assert(address && typeof address === 'object');
    const url = 'http://127.0.0.1:' + address.port + '/api/summaries';
    return {
      store,
      request(path = '', method = 'GET', body?: unknown) {
        return fetch(url + path, { method, ...(body === undefined ? {} : {
          headers: { 'Content-Type': path === '/restore' ? 'application/octet-stream' : 'application/json' },
          body: path === '/restore' ? String(body) : JSON.stringify(body),
        }) });
      },
      async close() {
        await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
        store.db.close();
      },
    };
  }

  const folder = join(temporary, 'Drive');
  const offline = join(temporary, 'Drive-desconectado');
  mkdirSync(folder);
  const source = await start('fonte');
  const target = await start('destino');
  try {
    assert.equal((await source.request('/backup', 'PUT', { directory: 'relativo' })).status, 400);
    const configured = await source.request('/backup', 'PUT', { directory: folder });
    assert((await configured.json() as SummaryBackup).savedAt);
    const draft = { title: 'Processo penal', html: '<h2>Princípios</h2><ul><li><b>Contraditório</b></li></ul>',
      discipline: 'Direito Processual Penal', subject: 'Princípios', topicId: 'topico-local',
      source: { id: 'material-local', title: 'Apostila de Processo Penal', version: 2, page: 11 } };
    const created = await source.request('', 'POST', draft);
    assert.equal(created.status, 201);
    const { summary } = await created.json() as { summary: Summary };
    const files = readdirSync(folder);
    assert.equal(files.length, 1);
    const path = join(folder, files[0]);
    assert.deepEqual(JSON.parse(readFileSync(path, 'utf8')).summaries, [summary]);
    assert.deepEqual(await (await source.request('/topic/' + draft.topicId)).json(), [{ id: summary.id, title: summary.title }]);
    assert.deepEqual(await (await source.request('/topic/outro-topico')).json(), []);
    const exported = await source.request('/backup');
    assert.match(exported.headers.get('content-disposition') ?? '', /attachment.*\.json/);
    const original = await exported.text();

    renameSync(folder, offline);
    const changed = await source.request('/' + summary.id, 'PUT', { ...summary, html: '<p>Versão nova</p>', archived: true });
    assert.equal(changed.status, 200);
    const updated = await changed.json() as { summary: Summary; backup: SummaryBackup };
    assert(updated.backup.error);
    assert.equal(updated.summary.revision, 2);
    assert.equal(updated.summary.archived, true);
    assert.deepEqual(await (await source.request('/topic/' + draft.topicId)).json(), []);
    assert.equal((await source.request('/' + summary.id, 'PUT', summary)).status, 409);
    renameSync(offline, folder);
    const retried = await source.request('/backup', 'PUT', { directory: folder });
    assert.equal((await retried.json() as SummaryBackup).error, '');
    const latest = readFileSync(path, 'utf8');
    assert.deepEqual(JSON.parse(latest).summaries, [updated.summary]);

    assert.equal((await target.request('/restore', 'POST', '{')).status, 400);
    const invalid = JSON.parse(original);
    invalid.summaries.push({ ...summary, title: '' });
    assert.equal((await target.request('/restore', 'POST', JSON.stringify(invalid))).status, 400);
    assert.deepEqual((await (await target.request()).json() as { summaries: Summary[] }).summaries, []);
    const imported = await (await target.request('/restore', 'POST', latest)).json() as { added: number; summaries: Summary[] };
    assert.equal(imported.added, 1);
    assert.deepEqual(imported.summaries, [updated.summary]);
    const conflict = await (await target.request('/restore', 'POST', original)).json() as { copies: number; summaries: Summary[] };
    assert.equal(conflict.copies, 1);
    assert.equal(conflict.summaries.length, 2);
    assert.deepEqual(conflict.summaries.find(row => row.id === summary.id), updated.summary);
    assert.deepEqual({ ...conflict.summaries.find(row => row.id !== summary.id), id: summary.id }, summary);
    const repeat = await (await target.request('/restore', 'POST', original)).json() as { skipped: number; summaries: Summary[] };
    assert.equal(repeat.skipped, 1);
    assert.equal(repeat.summaries.length, 2);
  } finally {
    await Promise.all([source.close(), target.close()]);
    rmSync(temporary, { recursive: true, force: true });
  }
});
