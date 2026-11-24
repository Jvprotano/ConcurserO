const { randomUUID } = require('node:crypto');
const { createServer, request } = require('node:http');
const { join } = require('node:path');
const { Readable } = require('node:stream');
const { pipeline } = require('node:stream/promises');

async function startLocalService(appDirectory, dataDirectory) {
  const { createApp } = await import('../server/index.ts');
  const { Store } = await import('../server/db.ts');
  const desktopToken = randomUUID();
  const socketPath = '\\\\.\\pipe\\ConcurserO-' + randomUUID();
  const store = new Store(dataDirectory);
  const server = createServer(createApp(store, { desktopToken, staticDirectory: join(appDirectory, 'dist') }));
  try {
    await new Promise((resolve, reject) => {
      server.once('error', reject);
      server.listen(socketPath, resolve);
    });
  } catch (error) {
    store.db.close();
    throw error;
  }

  return {
    fetch(incoming, url) {
      return new Promise((resolve, reject) => {
        const headers = { 'X-ConcurserO-Session': desktopToken };
        for (const name of ['accept', 'content-type', 'content-length', 'if-modified-since', 'if-none-match', 'if-range', 'range']) {
          const value = incoming.headers.get(name);
          if (value !== null) headers[name] = value;
        }
        if (incoming.body && !headers['content-length']) headers['transfer-encoding'] = 'chunked';
        const outgoing = request({ socketPath, path: url.pathname + url.search, method: incoming.method,
          headers, agent: false, signal: incoming.signal });
        outgoing.on('error', reject);
        outgoing.once('response', (response) => {
          const withoutBody = incoming.method === 'HEAD' || [204, 205, 304].includes(response.statusCode);
          const headers = new Headers();
          for (const name of ['content-type', 'content-length', 'content-disposition', 'content-range', 'accept-ranges',
            'etag', 'last-modified', 'location', 'cache-control', 'content-security-policy', 'referrer-policy', 'x-content-type-options']) {
            const value = response.headers[name];
            if (value !== undefined) headers.set(name, value);
          }
          if (withoutBody) response.resume();
          resolve(new Response(withoutBody ? null : Readable.toWeb(response), { status: response.statusCode, headers }));
        });
        if (incoming.body) void pipeline(Readable.fromWeb(incoming.body), outgoing).catch(reject);
        else outgoing.end();
      });
    },
    close(callback) {
      server.close(() => {
        store.db.close();
        callback();
      });
    },
  };
}

module.exports = { startLocalService };
