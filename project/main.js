const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const isDev = process.env.NODE_ENV === 'development';

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 960,
    minHeight: 700,
    frame: false,                    // Custom title bar
    backgroundColor: '#0f0f0f',
    show: false,                     // Prevent flash
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,       // For simplicity (you can change later)
      enableRemoteModule: true,
    }
  });

  mainWindow.loadFile('index.html');

  // Show window when ready (no flash)
  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  // Open DevTools automatically in development
  if (isDev) {
    mainWindow.webContents.openDevTools();
  }

  // Optional: Save window size/position
  mainWindow.on('resize', saveWindowState);
  mainWindow.on('move', saveWindowState);
}

function saveWindowState() {
  if (!mainWindow) return;
  // You can save bounds to a config file later if wanted
}

// Single Instance Lock
const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });
}

// App Events
app.whenReady().then(createWindow);

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// IPC for custom title bar controls
ipcMain.on('window-minimize', () => {
  mainWindow.minimize();
});

ipcMain.on('window-maximize', () => {
  if (mainWindow.isMaximized()) {
    mainWindow.unmaximize();
  } else {
    mainWindow.maximize();
  }
});

ipcMain.on('window-close', () => {
  mainWindow.close();
});