'use strict';

const { app, BrowserWindow, ipcMain, nativeTheme } = require('electron');
const path = require('path');
const fs = require('fs');

const root = path.join(__dirname, '..');
const out = path.join(root, '.ui-smoke');
const config = {
  providerId: 'openai', baseUrl: 'https://api.openai.com/v1', model: 'gpt-4o-mini', apiKey: '', language: 'zh', appearance: 'system', targetLanguage: 'en', version: '0.6.0', repository: 'eSeaFiller/lingoisland',
  presets: [{ id: 'openai', label: 'OpenAI', baseUrl: 'https://api.openai.com/v1', models: ['gpt-4o-mini'], keyHint: 'platform.openai.com' }],
};

ipcMain.handle('config:get', () => config);
ipcMain.handle('config:set', (_event, value) => ({ ...config, ...value }));
ipcMain.handle('window:hide', () => true);
ipcMain.handle('window:minimize', () => true);
ipcMain.handle('clipboard:write', () => true);
ipcMain.handle('app:view', () => true);
ipcMain.handle('external:open', () => true);
ipcMain.handle('check:run', () => ({ ok: true }));
ipcMain.handle('check:cancel', () => true);
ipcMain.handle('favorites:list', () => []);
ipcMain.handle('favorites:add', () => true);
ipcMain.handle('favorites:remove', () => []);
ipcMain.handle('favorites:export', () => ({ ok: false, canceled: true }));
ipcMain.handle('update:check', () => null);
ipcMain.handle('update:open', () => true);

async function capture(win, name) {
  await new Promise((resolve) => setTimeout(resolve, 350));
  const image = await win.webContents.capturePage();
  fs.writeFileSync(path.join(out, name), image.toPNG());
}

app.whenReady().then(async () => {
  fs.mkdirSync(out, { recursive: true });
  nativeTheme.themeSource = 'light';
  const win = new BrowserWindow({
    width: 640, height: 760, show: false, frame: true, transparent: false,
    titleBarStyle: 'hiddenInset', trafficLightPosition: { x: 18, y: 18 }, backgroundColor: '#f7f7f9',
    webPreferences: { preload: path.join(root, 'preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: true },
  });
  await win.loadFile(path.join(root, 'renderer', 'index.html'));
  await capture(win, '01-intro-light.png');
  await win.webContents.executeJavaScript("document.querySelector('#btn-enter').click()");
  await capture(win, '02-translate-light.png');
  nativeTheme.themeSource = 'dark';
  await capture(win, '03-translate-dark.png');
  await win.webContents.executeJavaScript("document.querySelector('#btn-settings').click()");
  await capture(win, '04-app-menu-dark.png');
  await win.webContents.executeJavaScript("document.querySelector('[data-menu-view=\"settings\"]').click()");
  await capture(win, '05-settings-dark.png');
  app.quit();
});
