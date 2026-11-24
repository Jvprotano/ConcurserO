import { existsSync } from 'node:fs';
import { copyFile, cp, mkdir, mkdtemp, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises';
import { basename, dirname, extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

if (process.platform !== 'win32' || process.arch !== 'x64') {
  throw new Error('Empacote o ConcurserO em um ambiente Node.js x64 no Windows.');
}

async function copyAll(operations) {
  const results = await Promise.allSettled(operations);
  const failure = results.find(result => result.status === 'rejected');
  if (failure) throw failure.reason;
}

const root = fileURLToPath(new URL('../', import.meta.url));
const release = join(root, 'release');
const target = join(release, 'ConcurserO-win32-x64');
const { default: electron } = await import('electron');
const executable = extname(electron) ? electron : electron + '.exe';
const runtime = dirname(executable);
const { name, productName, version, type, main } = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
const { packages } = JSON.parse(await readFile(join(root, 'package-lock.json'), 'utf8'));

await mkdir(release, { recursive: true });
const staging = await mkdtemp(join(release, '.package-'));
const bundle = join(staging, 'bundle');
const previous = join(staging, 'previous');
const payload = join(bundle, 'resources', 'app');
try {
  await mkdir(join(payload, 'desktop'), { recursive: true });
  console.log('Copiando o runtime Electron…');
  const runtimeFiles = (await readdir(runtime)).filter(name => name !== basename(executable) && name !== 'resources');
  await copyAll([
    copyFile(executable, join(bundle, 'ConcurserO.exe')),
    ...runtimeFiles.map(name => cp(join(runtime, name), join(bundle, name), { recursive: true })),
  ]);

  console.log('Copiando a aplicação e as dependências de produção…');
  await copyAll([
    writeFile(join(payload, 'package.json'), JSON.stringify({ name, productName, version, type, main }, null, 2)),
    ...['dist', 'server', 'shared'].map(name => cp(join(root, name), join(payload, name), { recursive: true })),
    ...['main.cjs', 'local-service.cjs', 'ConcurserO.ico'].map(name =>
      copyFile(join(root, 'desktop', name), join(payload, 'desktop', name))),
  ]);
  for (const [path, metadata] of Object.entries(packages)) {
    if (!path.startsWith('node_modules/') || metadata.dev) continue;
    const source = join(root, path);
    if (metadata.optional && !existsSync(source)) continue;
    await cp(source, join(payload, path), { recursive: true, filter: candidate => basename(candidate) !== 'node_modules' });
  }

  if (existsSync(target)) await rename(target, previous);
  try {
    await rename(bundle, target);
  } catch (error) {
    if (existsSync(previous)) await rename(previous, target);
    throw error;
  }
} finally {
  // Keep the previous build available if Windows prevents restoring it.
  if (existsSync(target) || !existsSync(previous)) {
    await rm(staging, { recursive: true, force: true, maxRetries: 3 }).catch(console.warn);
  }
}
console.log(join(target, 'ConcurserO.exe'));
