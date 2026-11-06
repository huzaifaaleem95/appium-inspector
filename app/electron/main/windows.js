import {join} from 'node:path';

import {BrowserWindow, ipcMain, Menu, nativeTheme} from 'electron';
import settings from 'electron-settings';

import {PREFERRED_THEME} from '../../common/shared/setting-defs.js';
import {isDev} from './helpers.js';
import i18n from './i18next.js';
import {rebuildMenus} from './menus.js';

const mainPath = isDev ? process.env.ELECTRON_RENDERER_URL : join(__dirname, '..', 'renderer', 'index.html'); // from 'main' in package.json
const splashPath = isDev
  ? `${process.env.ELECTRON_RENDERER_URL}/splash.html`
  : join(__dirname, '..', 'renderer', 'splash.html'); // from 'main' in package.json
const pathLoadMethod = isDev ? 'loadURL' : 'loadFile';

let mainWindow = null;

export async function setupMainWindow() {
  const preferredTheme = await settings.get(PREFERRED_THEME);
  const isDarkTheme = preferredTheme === 'dark' || (preferredTheme === 'system' && nativeTheme.shouldUseDarkColors);
  const backgroundColor = isDarkTheme ? '#191919' : '#f5f5f5';

  const splashWindow = buildSplashWindow(backgroundColor);
  splashWindow[pathLoadMethod](splashPath);
  splashWindow.show();

  mainWindow = buildSessionWindow(backgroundColor);
  mainWindow[pathLoadMethod](mainPath);

  mainWindow.webContents.on('did-finish-load', () => {
    rebuildMenus(mainWindow);
    splashWindow.destroy();
    mainWindow.show();
    mainWindow.focus();
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  // The device screen handles its own right-click (Inspect menu) and calls preventDefault,
  // which suppresses this event there. Elsewhere, only offer 'Inspect element' in dev builds.
  mainWindow.webContents.on('context-menu', (e, props) => {
    if (!isDev) {
      return;
    }
    const {x, y} = props;

    Menu.buildFromTemplate([
      {
        label: i18n.t('Inspect element'),
        click() {
          mainWindow.inspectElement(x, y);
        },
      },
    ]).popup(mainWindow);
  });

  // Override the 'content-type' header to allow connecting to Selenium Grid devices
  mainWindow.webContents.session.webRequest.onBeforeSendHeaders((details, callback) => {
    details.requestHeaders['content-type'] = 'application/json; charset=utf-8';
    callback({requestHeaders: details.requestHeaders});
  });

  if (isDev) {
    allowCrossOriginServerRequestsInDev(mainWindow.webContents.session);
  }

  // Not included in `setupIPCListeners` to avoid circular dependency
  ipcMain.on('electron:updateLanguage', async (_evt, lngCode) => {
    await i18n.changeLanguage(lngCode);
    rebuildMenus(mainWindow);
  });
}

// In dev mode the renderer is served from the Vite dev server (http://localhost:<port>), so every
// call to an Appium server is cross-origin, and Chromium blocks it unless the server was started
// with '--allow-cors'. Production builds load from file:// and are not affected. To make dev mode
// behave like production, answer CORS for those requests here (preflights become 204 responses).
// Requests to the dev server itself are left untouched.
function allowCrossOriginServerRequestsInDev(session) {
  const devOrigin = new URL(process.env.ELECTRON_RENDERER_URL).origin;
  const CORS_HEADER = /^access-control-/i;

  session.webRequest.onHeadersReceived((details, callback) => {
    if (details.url.startsWith(devOrigin) || !['xhr', 'fetch'].includes(details.resourceType)) {
      return callback({});
    }
    const responseHeaders = Object.fromEntries(
      Object.entries(details.responseHeaders || {}).filter(([name]) => !CORS_HEADER.test(name)),
    );
    responseHeaders['Access-Control-Allow-Origin'] = [devOrigin];
    responseHeaders['Access-Control-Allow-Methods'] = ['GET, POST, PUT, DELETE, OPTIONS'];
    // '*' does not cover Authorization, which cloud vendors' servers need
    responseHeaders['Access-Control-Allow-Headers'] = ['Authorization, *'];
    const isPreflight = details.method === 'OPTIONS';
    callback({responseHeaders, ...(isPreflight && {statusLine: 'HTTP/1.1 204 No Content'})});
  });
}

export function launchNewSessionWindow() {
  const win = buildSessionWindow();
  win[pathLoadMethod](mainPath);
  win.show();
}

function buildSplashWindow(backgroundColor) {
  return new BrowserWindow({
    width: 300,
    height: 300,
    minWidth: 300,
    minHeight: 300,
    frame: false,
    backgroundColor,
    webPreferences: {
      devTools: false,
    },
  });
}

function buildSessionWindow(backgroundColor) {
  return new BrowserWindow({
    show: false,
    width: 1100,
    height: 710,
    minWidth: 500,
    minHeight: 600,
    backgroundColor,
    webPreferences: {
      preload: join(__dirname, '..', 'preload', 'preload.mjs'), // from 'main' in package.json
      sandbox: false,
      nodeIntegration: true,
      contextIsolation: false,
    },
  });
}
