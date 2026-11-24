const { app, BrowserWindow, dialog, protocol, session, shell } = require('electron');
const { join, resolve } = require('node:path');
const { startLocalService } = require('./local-service.cjs');

const scheme = 'concursero';
const home = `${scheme}://app/`;
const icon = join(__dirname, 'ConcurserO.ico');
const webPreferences = { sandbox: true, contextIsolation: true, nodeIntegration: false, plugins: true };
let mainWindow;
let service;
let stopping = false;

protocol.registerSchemesAsPrivileged([{ scheme, privileges: {
  standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true,
} }]);

function localUrl(url) {
  return url.protocol === scheme + ':' && url.host === 'app' && !url.username && !url.password;
}

function allowedPage(url) {
  return localUrl(url) && (url.pathname === '/' || url.pathname === '/index.html' ||
    /^\/api\/(study-pdfs|imports)\/[^/]+\/pdf$/.test(url.pathname));
}

function dataDirectory() {
  const argument = process.argv.find(value => value.startsWith('--data-dir='))?.slice('--data-dir='.length);
  const configured = argument || process.env.CONCURSERO_DATA;
  const defaultDirectory = app.isPackaged ? app.getPath('userData') : app.getAppPath();
  return configured ? resolve(configured) : join(defaultDirectory, 'data');
}

function createWindow() {
  app.setAppUserModelId('ConcurserO');
  mainWindow = new BrowserWindow({
    width: 1440, height: 920, minWidth: 650, minHeight: 520,
    title: 'ConcurserO', icon, backgroundColor: '#142e27', show: false,
    webPreferences,
  });
  mainWindow.setMenu(null);
  mainWindow.once('ready-to-show', () => mainWindow.show());
  return mainWindow.loadURL(home);
}

app.on('web-contents-created', (_event, contents) => {
  contents.on('will-navigate', (event, destination) => {
    const url = new URL(destination);
    if (allowedPage(url)) return;
    event.preventDefault();
    if (url.protocol === 'https:') void shell.openExternal(url.href).catch(console.error);
  });
  contents.setWindowOpenHandler(({ url: destination }) => {
    const url = new URL(destination);
    if (allowedPage(url)) return { action: 'allow', overrideBrowserWindowOptions: {
      autoHideMenuBar: true, icon, webPreferences,
    } };
    if (url.protocol === 'https:') void shell.openExternal(url.href).catch(console.error);
    return { action: 'deny' };
  });
  contents.on('will-prevent-unload', (event) => {
    const window = BrowserWindow.fromWebContents(contents);
    if (!window) return;
    const choice = dialog.showMessageBoxSync(window, {
      type: 'question', message: 'Descartar as alterações ainda não salvas?',
      buttons: ['Continuar editando', 'Descartar'], defaultId: 0, cancelId: 0, noLink: true,
    });
    if (choice === 1) event.preventDefault();
  });
});

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    const window = mainWindow && !mainWindow.isDestroyed() ? mainWindow : BrowserWindow.getAllWindows()[0];
    if (!window) return;
    if (window.isMinimized()) window.restore();
    window.show();
    window.focus();
  });
  app.on('window-all-closed', () => app.quit());
  app.on('before-quit', (event) => {
    if (!service) return;
    event.preventDefault();
    if (stopping) return;
    stopping = true;
    setTimeout(() => app.exit(), 5000).unref();
    service.close(() => app.exit());
  });
  app.whenReady().then(async () => {
    session.defaultSession.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
    session.defaultSession.setPermissionCheckHandler(() => false);
    service = await startLocalService(app.getAppPath(), dataDirectory());
    protocol.handle(scheme, async (request) => {
      const url = new URL(request.url);
      if (!localUrl(url) || stopping) return new Response(null, { status: 404 });
      try {
        return await service.fetch(request, url);
      } catch (error) {
        if (!request.signal.aborted) console.error(error);
        return Response.json({ error: 'Não foi possível acessar os dados locais.' }, { status: 502 });
      }
    });
    await createWindow();
  }).catch((error) => {
    dialog.showErrorBox('ConcurserO', 'Não foi possível abrir o aplicativo.\n\n' + error.message);
    app.quit();
  });
}
