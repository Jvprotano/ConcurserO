import { createApp } from './index.ts';
import { Store } from './db.ts';

// The launcher's stdin pipe owns the server lifetime, even if the launcher dies.
const store = new Store();
const port = Number(process.env.CONCURSERO_PORT ?? 4183);
const server = createApp(store).listen(port, '127.0.0.1', () => {
  console.log('ConcurserO disponível em http://127.0.0.1:' + port);
});
let stopping = false;
function shutdown() {
  if (stopping) return;
  stopping = true;
  server.close(() => {
    store.db.close();
    process.exit(0);
  });
  server.closeIdleConnections();
  // Bound shutdown even if an import or a connection is still running.
  setTimeout(() => process.exit(0), 5000).unref();
}
process.stdin.on('data', shutdown);
process.stdin.on('end', shutdown);
process.stdin.resume();
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
