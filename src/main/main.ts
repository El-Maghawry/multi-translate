import {
  app,
  BrowserWindow,
  ipcMain,
  screen,
  globalShortcut,
  Tray,
  Menu,
} from 'electron';
import * as path from 'path';
import theme from '../renderer/theme';
import updater from './updater';

import axios from 'axios';
import Store from 'electron-store';

// TODO improve code structure
const store = new Store();

const backgroundColor = theme.colors.background;
const isDev = process.env.NODE_ENV === 'development';

let mainWindow: Electron.BrowserWindow | null;
let aboutWin: Electron.BrowserWindow | null;
let preferencesWin: Electron.BrowserWindow | null;
let welcomeWin: Electron.BrowserWindow | null;
let tray: Tray | null | undefined;
let accelerator: string = store.has('shortcut') ? (store.get('shortcut') as string) : 'Ctrl+Alt+T';

const webPreferences: Electron.WebPreferences = {
  nodeIntegration: true,
  webSecurity: false,
  webviewTag: true,
  preload: app.isPackaged
    ? path.join(__dirname, 'preload.js')
    : path.join(__dirname, '../../.erb/dll/preload.js'),
};

const winConfig: Electron.BrowserWindowConstructorOptions = {
  width: 680,
  height: 85,
  frame: false,
  fullscreenable: false,
  resizable: process.platform !== 'darwin',
  backgroundColor: backgroundColor,
  useContentSize: true,
  show: isDev,
  webPreferences,
};

app.commandLine.appendSwitch('disable-features', 'OutOfBlinkCors');

const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', () => showWindow());
}

const appVersion = process.env.VERSION;

const indexPath = isDev
  ? `http://localhost:${process.env.PORT || '1212'}`
  :`file://${path.resolve(__dirname, '../renderer/', 'index.html')}`

app.on('ready', appReady);

// app.allowRendererProcessReuse = true;

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
});


const createTray = () => {
  const RESOURCES_PATH = app.isPackaged
    ? path.join(process.resourcesPath, 'assets')
    : path.join(__dirname, '../../assets');
  const file = process.platform === 'win32' ? 'icon_16x16.ico' : 'iconTemplate.png';
  const iconPath = path.resolve(RESOURCES_PATH, file)

  tray = new Tray(iconPath);

  const contextMenu = Menu.buildFromTemplate([
    { label: 'About Transee', click: showAboutWindow },
    { label: 'Check for update', click: () => updater.checkForUpdates() },
    { type: 'separator' },
    { label: 'Preferences...', click: showPreferencesWindow },
    { type: 'separator' },
    {
      label: 'Show translation bar',
      accelerator,
      click: showWindow,
    },
    { type: 'separator' },
    { label: 'Welcome Guide', click: showWelcomeWindow },
    { type: 'separator' },
    { label: 'Quit', accelerator: 'Command+Q', click: app.quit },
  ]);

  tray.setContextMenu(contextMenu);
}

// Init ------------------------------------------------------------------------
async function appReady() {
  // HANDLE APP VERSION
  const versionInSettings = store.get('version');
  if (appVersion !== versionInSettings) {
    store.clear();
    store.set('version', appVersion);
  }

  if (isDev) {
    createTray();

    createWindow();
    createAboutWindow();
    createWelcomeWindow();
    createPreferencesWindow();
  } else {
    //  SET START AT LOGIN
    const check = app.getLoginItemSettings().openAtLogin;
    store.set('startAtLogin', check);

    // SET GLOBAL SHORTCUT
    store.set('shortcut', accelerator);
    globalShortcut.register(accelerator, showWindow);

    // CREATE TRAY AND CONTEXT MENU
    createTray()

    // AUTOMATICALLY UPDATES
    const checkAutomaticallyUpdates = store.has('checkUpdates')
      ? store.get('checkUpdates')
      : true;
    if (checkAutomaticallyUpdates) {
      setTimeout(() => updater.checkForUpdates(false), 1000 * 60 * 3);
    }

    store.set('platform', process.platform);
    // CREATE TRANSEE WINDOW IN BACKGROUND
    createWindow();

    // SHOW WELCOME GUIDE
    const showWelcome = store.has('showWelcome') ? store.get('showWelcome') : true;
    if (showWelcome) {
      createWelcomeWindow();
    }

    // HIDE DOCK ICON IN MACOS
    if (process.platform === 'darwin' && !showWelcome) app.dock.hide();
  }
}

// Create Windows --------------------------------------------------------------
function createWindow() {
  mainWindow = new BrowserWindow(winConfig);
  mainWindow.loadURL(`${indexPath}?main`);
  mainWindow.visibleOnAllWorkspaces = true;
  mainWindow.on('blur', () => {
    if (!isDev) hideWindow();
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}
// -----------------------------------------------------------------------------
const createAboutWindow = () => {
  const aboutConfg: Electron.BrowserWindowConstructorOptions = {
    width: 520,
    height: 253,
    backgroundColor: backgroundColor,
    titleBarStyle: 'hidden',
    minimizable: false,
    maximizable: false,
    resizable: false,
    webPreferences,
  };
  aboutWin = new BrowserWindow(aboutConfg);

  aboutWin.loadURL(`${indexPath}?about`);

  aboutWin.on('close', () => {
    aboutWin = null;
  });
};

// -----------------------------------------------------------------------------
const createPreferencesWindow = () => {
  const preferencesConfig: Electron.BrowserWindowConstructorOptions = {
    width: 420,
    height: 430,
    backgroundColor: backgroundColor,
    titleBarStyle: 'hidden',
    minimizable: false,
    maximizable: false,
    resizable: false,
    webPreferences,
  };
  preferencesWin = new BrowserWindow(preferencesConfig);

  preferencesWin.loadURL(`${indexPath}?preferences`);

  preferencesWin.on('close', () => {
    preferencesWin = null;
  });
};

// -----------------------------------------------------------------------------
const createWelcomeWindow = () => {
  const welcomeConfig: Electron.BrowserWindowConstructorOptions = {
    width: 520,
    height: 430,
    titleBarStyle: 'hidden',
    backgroundColor: backgroundColor,
    minimizable: false,
    maximizable: false,
    resizable: false,
    webPreferences,
  };

  welcomeWin = new BrowserWindow(welcomeConfig);

  welcomeWin.loadURL(`${indexPath}?welcome`);

  welcomeWin.on('close', () => {
    welcomeWin = null;
    app.dock.hide();
  });
};

// -----------------------------------------------------------------------------
function hideWindow() {
  if (mainWindow) {
    mainWindow.hide();
  }
}

function showWindow() {
  if (!mainWindow) {
    createWindow();
  } else {
    const { x, y } = getWindowPosition();
    mainWindow.setPosition(x, y);
    mainWindow.show();
  }
}

function getWindowPosition() {
  const point = screen.getCursorScreenPoint();
  const displayBounds = screen.getDisplayNearestPoint(point).bounds;
  const windowBounds = mainWindow ? mainWindow.getBounds() : { width: 680, height: 85 };

  let maxAppHeight = 800;
  if (displayBounds.height < 768) {
    maxAppHeight = 768;
  }

  const x = Math.round(displayBounds.x + (displayBounds.width - windowBounds.width) / 2);
  const y = (displayBounds.height - maxAppHeight) / 2 + displayBounds.y;

  return { x, y };
}

function showAboutWindow() {
  if (!aboutWin) {
    createAboutWindow();
  }
}

function showWelcomeWindow() {
  if (!welcomeWin) {
    createWelcomeWindow();
  }
}

function showPreferencesWindow() {
  if (!preferencesWin) {
    createPreferencesWindow();
  }
}

// IPC listener ----------------------------------------------------------------

ipcMain.on('window-height', (event, height) => {
  if (mainWindow) {
    mainWindow.setSize(680, height);
    event.returnValue = true;
  }
});

ipcMain.on('hide-window', (event, msg) => {
  hideWindow();
});

ipcMain.on('set-start-login', (event, check) => {
  app.setLoginItemSettings({
    openAtLogin: check,
  });
});

ipcMain.on('change-shortcut', (event, shortcut) => {
  globalShortcut.unregisterAll();
  globalShortcut.register(shortcut, () => {
    showWindow();
  });
});

ipcMain.on('devtools', (event) => {
  mainWindow?.webContents.openDevTools();
});

ipcMain.on('restore-settings', () => {
  const check = app.getLoginItemSettings().openAtLogin;
  store.set('version', appVersion);
  store.set('showWelcome', true);
  store.set('startAtLogin', check);
  store.set('shortcut', 'Ctrl+Alt+T');
  app.relaunch();
  // TODO verify
});

ipcMain.on('store-get', async (event, key) => {
  if (key) {
    event.returnValue = store.get(key);
  } else {
    event.returnValue = store.store
  }
});
ipcMain.on('store-set', async (event, key, val) => {
  store.set(key, val);
});
ipcMain.on('store-clear', async () => {
  store.clear();
});

ipcMain.on('request', async (event, options, operation) => {
  try {
    const { data } = await axios(options);
    event.reply('response', data, operation);
  } catch (err) {
    // TODO create error channel
    event.reply('response', null, operation);
  }
});

// TODO handle init store
// const initialStore = {
//   version: '2.1.0',
//   startAtLogin: true,
//   checkUpdates: true,
//   showWelcome: true,
//   shortcut: 'Ctrl+Alt+T',
//   langs: {
//     threesome: {
//       from: [
//         {
//           value: 'en',
//           label: 'English',
//         },
//         {
//           value: 'it',
//           label: 'Italian',
//         },
//         {
//           value: 'es',
//           label: 'Spanish',
//         },
//       ],
//       to: [
//         {
//           value: 'it',
//           label: 'Italian',
//         },
//         {
//           value: 'en',
//           label: 'English',
//         },
//         {
//           value: 'es',
//           label: 'Spanish',
//         },
//       ],
//     },
//     selected: {
//       from: 'en',
//       to: 'it',
//     },
//   },
// };
