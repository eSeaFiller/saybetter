'use strict';

const {
  app,
  BrowserWindow,
  Tray,
  Menu,
  ipcMain,
  clipboard,
  safeStorage,
  nativeImage,
  shell,
  dialog,
  nativeTheme,
  screen,
} = require('electron');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { PRESETS, streamCheck } = require('./providers');
const { checkForUpdate, CHECK_INTERVAL_MS, REPO } = require('./updater');

const CONFIG_PATH = () => path.join(app.getPath('userData'), 'config.json');
const FAVORITES_PATH = () => path.join(app.getPath('userData'), 'favorites.json');
const PILL_POSITION_PATH = () => path.join(app.getPath('userData'), 'pill-position.json');
const DEFAULT_CONFIG = {
  providerId: 'openai',
  baseUrl: '',
  model: 'gpt-4o-mini',
  apiKey: '',
  language: 'zh',
  appearance: 'system',
  watchClipboard: true,
  pillMode: 'default',
  targetLanguage: 'en',
  customPrompt: '',
};

const PILL_WIDTH = 320;
const PILL_HEIGHT = 54;
const PILL_EXPANDED_WIDTH = 580;
const PILL_EXPANDED_HEIGHT = 460;
const PILL_HOVER_POLL_MS = 45;
const PILL_COLLAPSE_DELAY_MS = 320;
const CLIPBOARD_POLL_MS = 500;
const MAX_CLIPBOARD_CHARS = 1200;

let tray;
let nativeStatusProcess;
let win;
let pillWin;
let currentAbort;
let pillAbort;
let pillBundleText = '';
let pillBundleOutput = '';
let pillBundleSources = [];
let clipboardTimer;
let lastClipboard = '';
let selfWrote = '';
let pillExpanded = false;
let pillTargetExpanded = false;
let pillHoverTimer;
let pillCollapseTimer;
let pillPointerInside = false;
let pillPosition;
let pillPositionLocked = false;
let pillProgrammaticMove = false;
let pillPositionSaveTimer;
let rendererReady = false;
let pendingView = 'intro';
let updateTimer;

function readJSON(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return fallback; }
}

function writeJSON(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(value, null, 2), { mode: 0o600 });
}

function encryptSecret(value) {
  if (!value) return '';
  return safeStorage.isEncryptionAvailable()
    ? `enc:${safeStorage.encryptString(value).toString('base64')}`
    : `plain:${value}`;
}

function decryptSecret(value) {
  if (!value) return '';
  try {
    if (value.startsWith('enc:') && safeStorage.isEncryptionAvailable()) {
      return safeStorage.decryptString(Buffer.from(value.slice(4), 'base64'));
    }
    return value.startsWith('plain:') ? value.slice(6) : value;
  } catch { return ''; }
}

// 服务商下线老模型后，老用户 config 里存的还是旧模型名，光更新 app 照样 404 —— 读配置时
// 顺手换成该服务商当前的默认模型。只匹配确认已下线的型号，没把握的一律不动。
const RETIRED_MODELS = {
  moonshot: [/^moonshot-v1/, /^kimi-k2(-|$)/, /^kimi-k2\.5/, /^kimi-latest/, /^kimi-thinking-preview/],
  deepseek: [/^deepseek-chat$/, /^deepseek-reasoner$/],
};

function migrateRetiredModel(config) {
  const rules = RETIRED_MODELS[config.providerId];
  if (!rules || !rules.some((re) => re.test(config.model || ''))) return config;
  const replacement = (PRESETS.find((p) => p.id === config.providerId) || {}).models[0];
  return replacement ? { ...config, model: replacement } : config;
}

function loadConfig() {
  const saved = readJSON(CONFIG_PATH(), {});
  return migrateRetiredModel({ ...DEFAULT_CONFIG, ...saved, apiKey: decryptSecret(saved.apiKey || '') });
}

function saveConfig(next) {
  const clean = {
    ...DEFAULT_CONFIG,
    providerId: String(next.providerId || DEFAULT_CONFIG.providerId),
    baseUrl: String(next.baseUrl || '').trim(),
    model: String(next.model || '').trim(),
    apiKey: encryptSecret(String(next.apiKey || '').trim()),
    language: PRESETS.length && String(next.language || 'zh'),
    appearance: ['system', 'light', 'dark'].includes(next.appearance) ? next.appearance : 'system',
    watchClipboard: next.watchClipboard !== false,
    pillMode: ['default', 'formal', 'casual', 'concise', 'learning', 'custom'].includes(next.pillMode) ? next.pillMode : 'default',
    targetLanguage: ['en', 'fr', 'de', 'ja'].includes(next.targetLanguage) ? next.targetLanguage : 'en',
    customPrompt: String(next.customPrompt || '').slice(0, 4000),
  };
  writeJSON(CONFIG_PATH(), clean);
  nativeTheme.themeSource = clean.appearance;
  buildTrayMenu();
  applyClipboardWatch(loadConfig());
  return loadConfig();
}

function publicConfig() {
  const config = loadConfig();
  return {
    ...config,
    presets: PRESETS.map(({ id, label, baseUrl, models, keyHint }) => ({ id, label, baseUrl, models, keyHint })),
    version: app.getVersion(),
    repository: REPO,
  };
}

function loadFavorites() {
  const rows = readJSON(FAVORITES_PATH(), []);
  return Array.isArray(rows) ? rows : [];
}

function saveFavorites(rows) {
  writeJSON(FAVORITES_PATH(), rows.slice(0, 2000));
  return rows;
}

function csvCell(value) {
  const text = String(value ?? '').replace(/\r?\n/g, ' ');
  return `"${text.replace(/"/g, '""')}"`;
}

async function exportFavorites() {
  const rows = loadFavorites();
  const result = await dialog.showSaveDialog(win, {
    title: '导出收藏',
    defaultPath: path.join(app.getPath('downloads'), `Saybetter-A lingoisland-Favorites-${new Date().toISOString().slice(0, 10)}.csv`),
    filters: [{ name: 'CSV', extensions: ['csv'] }],
  });
  if (result.canceled || !result.filePath) return { ok: false, canceled: true };
  const header = ['收藏时间', '模式', '原文', '结果', '参考来源'];
  const lines = rows.map((item) => [
    item.createdAt,
    item.mode,
    item.source,
    item.output,
    (item.sources || []).map((s) => `${s.title} (${s.url})`).join(' | '),
  ].map(csvCell).join(','));
  fs.writeFileSync(result.filePath, `\uFEFF${header.map(csvCell).join(',')}\n${lines.join('\n')}`, 'utf8');
  return { ok: true, filePath: result.filePath };
}

function decodeEntities(text) {
  return String(text || '')
    .replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>');
}

function tag(xml, name) {
  const match = xml.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${name}>`, 'i'));
  return match ? decodeEntities(match[1].replace(/^<!\[CDATA\[|\]\]>$/g, '').trim()) : '';
}

async function searchNewsExamples(text, targetLanguage = 'en') {
  const query = String(text || '').trim().slice(0, 180);
  if (!query) return [];
  const locale = {
    en: { hl: 'en-US', gl: 'US', ceid: 'US:en' },
    fr: { hl: 'fr', gl: 'FR', ceid: 'FR:fr' },
    de: { hl: 'de', gl: 'DE', ceid: 'DE:de' },
    ja: { hl: 'ja', gl: 'JP', ceid: 'JP:ja' },
  }[targetLanguage] || { hl: 'en-US', gl: 'US', ceid: 'US:en' };
  const url = `https://news.google.com/rss/search?q=${encodeURIComponent(`"${query}"`)}&hl=${locale.hl}&gl=${locale.gl}&ceid=${locale.ceid}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 7000);
  try {
    const response = await fetch(url, { signal: controller.signal, headers: { 'user-agent': 'Saybetter-A lingoisland/0.6' } });
    if (!response.ok) return [];
    const xml = await response.text();
    return [...xml.matchAll(/<item>([\s\S]*?)<\/item>/gi)].slice(0, 4).map((match) => {
      const item = match[1];
      const source = tag(item, 'source');
      let title = tag(item, 'title');
      if (source && title.endsWith(` - ${source}`)) title = title.slice(0, -(source.length + 3));
      return { title, source, url: tag(item, 'link'), publishedAt: tag(item, 'pubDate') };
    }).filter((item) => item.title && /^https?:\/\//.test(item.url));
  } catch { return []; }
  finally { clearTimeout(timer); }
}

function createWindow() {
  win = new BrowserWindow({
    width: 640,
    height: 760,
    minWidth: 560,
    minHeight: 640,
    show: false,
    frame: true,
    transparent: false,
    resizable: true,
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 18, y: 18 },
    backgroundColor: '#f7f7f9',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  win.on('close', (event) => {
    if (!app.isQuitting) { event.preventDefault(); win.hide(); }
  });
  win.webContents.on('did-finish-load', () => {
    rendererReady = true;
    showView(pendingView || 'intro', true);
  });
}

function positionNearTray() {
  if (!tray || !win) return;
  const trayBounds = tray.getBounds();
  const display = require('electron').screen.getDisplayNearestPoint({ x: trayBounds.x, y: trayBounds.y });
  const area = display.workArea;
  const bounds = win.getBounds();
  const x = Math.min(Math.max(Math.round(trayBounds.x + trayBounds.width / 2 - bounds.width / 2), area.x + 12), area.x + area.width - bounds.width - 12);
  const y = area.y + 10;
  win.setPosition(x, y, false);
}

function showView(view, force = false) {
  pendingView = view;
  if (!win) return;
  if (rendererReady) win.webContents.send('app:view', view);
  positionNearTray();
  if (force || !win.isVisible()) {
    win.show();
    win.focus();
  }
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), Math.max(min, max));
}

function keepPillVisible() {
  if (!pillWin || pillWin.isDestroyed()) return;
  pillWin.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true, skipTransformProcessType: true });
  pillWin.setAlwaysOnTop(true, 'screen-saver');
}

function loadPillPosition() {
  const saved = readJSON(PILL_POSITION_PATH(), null);
  if (!saved || ![saved.x, saved.y].every(Number.isFinite)) return null;
  return { x: Math.round(saved.x), y: Math.round(saved.y) };
}

function savePillPosition() {
  if (!pillWin || pillWin.isDestroyed() || pillProgrammaticMove) return;
  const { x, y, width } = pillWin.getBounds();
  pillPosition = { x: x + Math.round((width - PILL_WIDTH) / 2), y };
  pillPositionLocked = true;
  clearTimeout(pillPositionSaveTimer);
  pillPositionSaveTimer = setTimeout(() => writeJSON(PILL_POSITION_PATH(), pillPosition), 180);
}

function notchCenteredPosition(width, height) {
  const cursor = screen.getCursorScreenPoint();
  const display = screen.getDisplayNearestPoint(cursor);
  const bounds = display.bounds;
  const area = display.workArea;
  return {
    x: clamp(Math.round(bounds.x + (bounds.width - width) / 2), area.x + 10, area.x + area.width - width - 10),
    y: clamp(Math.round(area.y + 8), area.y + 8, area.y + area.height - height - 8),
  };
}

function positionPill(width, height) {
  if (!pillWin || pillWin.isDestroyed()) return;
  const current = pillWin.getBounds();
  const centerX = current.x + current.width / 2;
  const centerY = current.y + current.height / 2;
  const display = pillPositionLocked
    ? screen.getDisplayNearestPoint({ x: Math.round(centerX), y: Math.round(centerY) })
    : screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
  const area = display.workArea;
  let target;
  if (pillPositionLocked && pillPosition) {
    target = {
      x: clamp(Math.round(pillPosition.x + (PILL_WIDTH - width) / 2), area.x + 10, area.x + area.width - width - 10),
      y: clamp(Math.round(pillPosition.y), area.y + 8, area.y + area.height - height - 8),
    };
  } else {
    target = notchCenteredPosition(width, height);
  }
  pillProgrammaticMove = true;
  pillWin.setBounds({ ...target, width, height }, false);
  setTimeout(() => { pillProgrammaticMove = false; }, 120);
  pillPosition = { x: target.x + Math.round((width - PILL_WIDTH) / 2), y: target.y };
}

function createPill() {
  pillWin = new BrowserWindow({
    width: PILL_WIDTH,
    height: PILL_HEIGHT,
    type: 'panel',
    show: false,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    resizable: false,
    movable: true,
    focusable: true,
    acceptFirstMouse: true,
    skipTaskbar: true,
    hiddenInMissionControl: true,
    hasShadow: false,
    fullscreenable: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload-pill.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  pillPosition = loadPillPosition();
  pillPositionLocked = Boolean(pillPosition);
  pillWin.on('moved', savePillPosition);
  pillWin.on('move', savePillPosition);
  pillWin.webContents.once('did-finish-load', () => {
    pillWin.hide();
    keepPillVisible();
    positionPill(PILL_WIDTH, PILL_HEIGHT);
    pillSend('pill:expanded', false);
  });
  pillWin.loadFile(path.join(__dirname, 'renderer', 'pill.html'));
}

function pillSend(channel, payload) {
  if (!pillWin || pillWin.isDestroyed() || pillWin.webContents.isDestroyed()) return;
  pillWin.webContents.send(channel, payload);
}

function pointInsideBounds(point, bounds) {
  return point.x >= bounds.x && point.x < bounds.x + bounds.width && point.y >= bounds.y && point.y < bounds.y + bounds.height;
}

function syncPillExpanded(value) {
  if (!pillWin || pillWin.isDestroyed()) return;
  pillExpanded = value;
  pillTargetExpanded = value;
  pillSend('pill:expanded', value);
}

function applyPillSize(value) {
  if (!pillWin || pillWin.isDestroyed()) return;
  const width = value ? PILL_EXPANDED_WIDTH : PILL_WIDTH;
  const height = value ? PILL_EXPANDED_HEIGHT : PILL_HEIGHT;
  const current = pillWin.getBounds();
  positionPill(width, height);
  syncPillExpanded(value);
}

function schedulePillExpanded(value) {
  if (!pillWin || pillWin.isDestroyed()) return;
  if (value) {
    clearTimeout(pillCollapseTimer);
    pillCollapseTimer = null;
    pillTargetExpanded = true;
    applyPillSize(true);
    return;
  }
  pillTargetExpanded = false;
  clearTimeout(pillCollapseTimer);
  pillCollapseTimer = setTimeout(() => {
    pillCollapseTimer = null;
    if (!pillPointerInside && !pillTargetExpanded) applyPillSize(false);
  }, PILL_COLLAPSE_DELAY_MS);
}

function startPillHoverWatch() {
  if (pillHoverTimer) clearInterval(pillHoverTimer);
  pillHoverTimer = setInterval(() => {
    if (!pillWin || pillWin.isDestroyed() || !pillWin.isVisible()) return;
    const inside = pointInsideBounds(screen.getCursorScreenPoint(), pillWin.getBounds());
    if (inside === pillPointerInside) return;
    pillPointerInside = inside;
    schedulePillExpanded(inside);
  }, PILL_HOVER_POLL_MS);
}

function stopPillHoverWatch() {
  if (pillHoverTimer) clearInterval(pillHoverTimer);
  if (pillCollapseTimer) clearTimeout(pillCollapseTimer);
  pillHoverTimer = null;
  pillCollapseTimer = null;
  pillPointerInside = false;
}

function setPillExpanded(value) {
  if (!pillWin || pillWin.isDestroyed()) return;
  schedulePillExpanded(Boolean(value));
}

function hidePill() {
  pillAbort?.abort();
  pillAbort = null;
  stopPillHoverWatch();
  pillExpanded = false;
  pillTargetExpanded = false;
  if (pillWin && !pillWin.isDestroyed()) pillWin.hide();
}

async function runInPill(text, requestedMode) {
  if (!pillWin || pillWin.isDestroyed()) return;
  const config = loadConfig();
  const mode = ['default', 'formal', 'casual', 'concise', 'learning'].includes(requestedMode) ? requestedMode : ['default', 'formal', 'casual', 'concise', 'learning'].includes(config.pillMode) ? config.pillMode : 'default';
  pillAbort?.abort();
  const controller = new AbortController();
  pillAbort = controller;
  pillBundleText = text;
  pillBundleOutput = '';
  pillBundleSources = [];
  stopPillHoverWatch();
  pillExpanded = false;
  pillTargetExpanded = false;
  pillSend('pill:start', { source: text.slice(0, 300), mode, targetLanguage: config.targetLanguage || 'en', bundled: true });
  positionPill(PILL_WIDTH, PILL_HEIGHT);
  pillSend('pill:expanded', false);
  pillWin.showInactive();
  keepPillVisible();
  positionPill(PILL_WIDTH, PILL_HEIGHT);
  startPillHoverWatch();
  try {
    const output = await streamCheck({
      config,
      text,
      tone: 'default',
      targetLanguage: config.targetLanguage || 'en',
      variant: 'pill-bundle',
      signal: controller.signal,
      onDelta: (chunk) => pillSend('pill:delta', chunk),
    });
    pillBundleOutput = output;
    const queryMatch = output.match(/<!--\s*NEWS_QUERY\s*:\s*([^>]+?)\s*-->/i);
    pillBundleSources = await searchNewsExamples(queryMatch ? queryMatch[1].trim() : text, config.targetLanguage || 'en');
    if (!controller.signal.aborted) pillSend('pill:done', { sources: pillBundleSources, output });
  } catch (error) {
    if (!controller.signal.aborted) pillSend('pill:error', error?.message || '生成失败');
  } finally {
    if (pillAbort === controller) pillAbort = null;
  }
}

function shouldWatchClipboard(text) {
  const value = String(text || '').trim();
  if (value.length < 2 || value.length > MAX_CLIPBOARD_CHARS) return false;
  if (value === selfWrote.trim()) return false;
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(value)) return false;
  if (/^[\w.-]+@[\w.-]+\.\w+$/.test(value)) return false;
  return true;
}

function startClipboardWatch() {
  stopClipboardWatch();
  lastClipboard = clipboard.readText();
  clipboardTimer = setInterval(() => {
    let value;
    try { value = clipboard.readText(); } catch { return; }
    if (value === lastClipboard) return;
    lastClipboard = value;
    if (!loadConfig().watchClipboard || !shouldWatchClipboard(value)) return;
    runInPill(value.trim());
  }, CLIPBOARD_POLL_MS);
}

function stopClipboardWatch() {
  if (clipboardTimer) clearInterval(clipboardTimer);
  clipboardTimer = null;
}

function applyClipboardWatch(config) {
  if (config.watchClipboard !== false) startClipboardWatch();
  else {
    stopClipboardWatch();
    pillAbort?.abort();
    pillAbort = null;
    hidePill();
  }
}

function setAppearance(value) {
  const cfg = loadConfig();
  saveConfig({ ...cfg, appearance: value });
  if (rendererReady) win.webContents.send('config:changed', publicConfig());
}

function buildTrayMenu() {
  if (!tray) return;
  const config = loadConfig();
  const provider = PRESETS.find((p) => p.id === config.providerId);
  const keyReady = provider?.id === 'ollama' || Boolean(config.apiKey);
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: '打开 Saybetter-A lingoisland', click: () => showView('translate', true) },
    { label: 'Introduction', click: () => showView('intro', true) },
    { type: 'separator' },
    { label: '更换 API Key…', sublabel: keyReady ? `${provider?.label || '模型'} · 已配置` : '尚未配置', click: () => showView('settings', true) },
    { label: '复制后自动显示灵动岛', type: 'checkbox', checked: config.watchClipboard !== false, click: (item) => saveConfig({ ...config, watchClipboard: item.checked }) },
    { label: '收藏', click: () => showView('favorites', true) },
    { label: '导出收藏…', click: async () => { const result = await exportFavorites(); if (rendererReady) win.webContents.send('export:done', result); } },
    { type: 'separator' },
    {
      label: '外观', submenu: [
        { label: '跟随系统', type: 'radio', checked: config.appearance === 'system', click: () => setAppearance('system') },
        { label: '浅色', type: 'radio', checked: config.appearance === 'light', click: () => setAppearance('light') },
        { label: '深色', type: 'radio', checked: config.appearance === 'dark', click: () => setAppearance('dark') },
      ],
    },
    { label: '关于 Saybetter-A lingoisland', click: () => showView('about', true) },
    { label: '问题反馈…', click: () => shell.openExternal('mailto:xujianghao02@gmail.com?subject=Saybetter-A lingoisland%20Feedback') },
    { type: 'separator' },
    { label: '退出 Saybetter-A lingoisland', role: 'quit' },
  ]));
}

function trayLog(message, detail = '') {
  const line = `[${new Date().toISOString()}] ${message}${detail ? ` ${detail}` : ''}\n`;
  console.log(`[tray] ${message}`, detail);
  try { fs.appendFileSync(path.join(app.getPath('userData'), 'tray.log'), line, 'utf8'); } catch {}
}

function handleNativeStatusCommand(rawUrl) {
  try {
    const action = new URL(rawUrl).searchParams.get('action') || '';
    if (action.startsWith('show:')) return showView(action.slice(5), true);
    if (action === 'feedback') return shell.openExternal('mailto:xujianghao02@gmail.com?subject=Saybetter-A lingoisland%20Feedback');
    if (action === 'export:favorites') return exportFavorites();
    if (action === 'clipboard:pause' || action === 'clipboard:resume') {
      const next = { ...loadConfig(), watchClipboard: action === 'clipboard:resume' };
      saveConfig(next);
      return;
    }
    if (action.startsWith('language:')) {
      const targetLanguage = action.slice(9);
      if (['en', 'fr', 'de', 'ja'].includes(targetLanguage)) saveConfig({ ...loadConfig(), targetLanguage });
      return;
    }
    if (action.startsWith('appearance:')) return setAppearance(action.slice(11));
    if (action === 'quit') return app.quit();
  } catch (error) {
    trayLog('native-command-failed', error?.message || String(error));
  }
}

function startNativeStatusItem() {
  if (process.platform !== 'darwin') return createTray();
  const helper = path.join(process.resourcesPath, 'native', 'LingoIslandStatus');
  const developmentHelper = path.join(__dirname, 'native', 'bin', 'LingoIslandStatus');
  const binary = app.isPackaged ? helper : developmentHelper;
  if (!fs.existsSync(binary)) {
    trayLog('native-helper-missing', binary);
    return createTray();
  }
  nativeStatusProcess?.kill();
  const statusArgs = loadConfig().watchClipboard === false ? ['paused'] : [];
  nativeStatusProcess = spawn(binary, statusArgs, { detached: false, stdio: 'ignore' });
  nativeStatusProcess.once('spawn', () => trayLog('native-helper-started', JSON.stringify({ pid: nativeStatusProcess.pid, binary })));
  nativeStatusProcess.once('exit', (code, signal) => {
    trayLog('native-helper-exited', JSON.stringify({ code, signal }));
    nativeStatusProcess = null;
    if (!app.isQuitting) setTimeout(startNativeStatusItem, 800);
  });
  nativeStatusProcess.once('error', (error) => {
    trayLog('native-helper-error', error?.message || String(error));
    nativeStatusProcess = null;
    createTray();
  });
}

function trayIcon() {
  const image = nativeImage.createFromPath(path.join(__dirname, 'trayLTemplate.png'));
  if (image.isEmpty()) throw new Error('trayLTemplate.png could not be loaded');
  image.setTemplateImage(true);
  return image;
}

function trayBoundsAreVisible(bounds) {
  if (!bounds || bounds.width <= 0 || bounds.height <= 0) return false;
  return screen.getAllDisplays().some(({ bounds: display }) => (
    bounds.x >= display.x
    && bounds.x + bounds.width <= display.x + display.width
    && bounds.y >= display.y - 2
    && bounds.y <= display.y + 40
  ));
}

function createTray() {
  try {
    if (tray && !tray.isDestroyed()) tray.destroy();
    tray = new Tray(trayIcon());
    tray.setToolTip('Saybetter-A lingoisland');
    tray.on('click', () => tray.popUpContextMenu());
    tray.on('right-click', () => tray.popUpContextMenu());
    buildTrayMenu();
    trayLog('created', JSON.stringify({ title: tray.getTitle(), bounds: tray.getBounds(), version: app.getVersion(), activationPolicy: 'accessory' }));
    setTimeout(() => {
      if (!tray || tray.isDestroyed()) return;
      const bounds = tray.getBounds();
      trayLog('verified', JSON.stringify({ title: tray.getTitle(), bounds, visible: trayBoundsAreVisible(bounds) }));
    }, 1200);
  } catch (error) {
    trayLog('failed', error?.stack || error?.message || String(error));
    throw error;
  }
}

ipcMain.handle('config:get', () => publicConfig());
ipcMain.handle('config:set', (_event, config) => publicConfig(saveConfig(config)));
ipcMain.handle('window:hide', () => win?.hide());
ipcMain.handle('window:minimize', () => win?.minimize());
ipcMain.handle('clipboard:write', (_event, text) => {
  selfWrote = String(text || '');
  lastClipboard = selfWrote;
  clipboard.writeText(selfWrote);
  return true;
});
ipcMain.handle('app:view', (_event, view) => showView(view, true));
ipcMain.handle('external:open', (_event, url) => {
  if (/^(https?:|mailto:)/i.test(String(url))) return shell.openExternal(String(url));
  return false;
});
ipcMain.handle('check:cancel', () => currentAbort?.abort());
ipcMain.handle('check:run', async (_event, payload) => {
  const text = String(payload?.text || '').trim();
  const mode = String(payload?.mode || 'default');
  const customPrompt = String(payload?.customPrompt || '').trim();
  const targetLanguage = ['en', 'fr', 'de', 'ja'].includes(payload?.targetLanguage) ? payload.targetLanguage : 'en';
  const silent = payload?.silent === true;
  const bundle = payload?.bundle === true;
  if (!text) return { ok: false, error: '请输入要处理的内容' };
  currentAbort?.abort();
  const controller = new AbortController();
  currentAbort = controller;
  const config = loadConfig();
  try {
    const output = await streamCheck({
      config,
      text,
      tone: mode,
      targetLanguage,
      variant: bundle ? 'pill-bundle' : 'main',
      customPrompt,
      signal: controller.signal,
      onDelta: (chunk) => { if (!silent) win?.webContents.send('check:delta', chunk); },
    });
    const queryMatch = output.match(/<!--\s*NEWS_QUERY\s*:\s*([^>]+?)\s*-->/i);
    const newsQuery = queryMatch ? queryMatch[1].trim() : text;
    const sources = mode === 'learning' || bundle ? await searchNewsExamples(newsQuery, targetLanguage) : [];
    if (!silent) win?.webContents.send('check:done', { sources });
    return { ok: true, sources, output };
  } catch (error) {
    if (controller.signal.aborted) return { ok: false, canceled: true };
    const message = error?.message || '请求失败';
    if (!silent) win?.webContents.send('check:error', message);
    return { ok: false, error: message };
  } finally {
    if (currentAbort === controller) currentAbort = null;
  }
});
ipcMain.handle('favorites:list', () => loadFavorites());
ipcMain.handle('favorites:add', (_event, item) => {
  const rows = loadFavorites();
  const entry = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    createdAt: new Date().toISOString(),
    mode: String(item?.mode || 'default'),
    source: String(item?.source || '').slice(0, 5000),
    output: String(item?.output || '').slice(0, 12000),
    sources: Array.isArray(item?.sources) ? item.sources.slice(0, 6) : [],
  };
  saveFavorites([entry, ...rows]);
  return entry;
});
ipcMain.handle('favorites:remove', (_event, id) => saveFavorites(loadFavorites().filter((item) => item.id !== id)));
ipcMain.handle('pill:favorite', (_event, item) => {
  const rows = loadFavorites();
  const entry = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    createdAt: new Date().toISOString(),
    mode: String(item?.mode || 'default'),
    source: String(item?.source || '').slice(0, 5000),
    output: String(item?.output || '').slice(0, 12000),
    sources: Array.isArray(item?.sources) ? item.sources.slice(0, 6) : [],
  };
  saveFavorites([entry, ...rows]);
  if (rendererReady) win.webContents.send('favorites:changed');
  return entry;
});
ipcMain.handle('favorites:export', () => exportFavorites());
ipcMain.handle('update:check', () => checkForUpdate(app.getVersion()));
ipcMain.handle('update:open', () => shell.openExternal(`https://github.com/${REPO}/releases/latest`));
ipcMain.on('pill:expand', () => setPillExpanded(true));
ipcMain.on('pill:collapse', () => setPillExpanded(false));
ipcMain.on('pill:close', () => hidePill());
ipcMain.on('pill:mode', (_event, payload) => {
  const current = loadConfig();
  const mode = String(payload?.mode || 'default');
  const customPrompt = String(payload?.customPrompt ?? current.customPrompt ?? '').slice(0, 4000);
  if (!['default', 'formal', 'casual', 'concise', 'learning'].includes(mode)) return;
  saveConfig({ ...current, pillMode: mode, customPrompt });
  if (pillBundleText && pillBundleOutput) pillSend('pill:bundle-select', { mode, output: pillBundleOutput, sources: mode === 'learning' ? pillBundleSources : [] });
});
ipcMain.on('pill:copy', (_event, text) => {
  selfWrote = String(text || '');
  lastClipboard = selfWrote;
  clipboard.writeText(selfWrote);
});

app.whenReady().then(() => {
  app.setAsDefaultProtocolClient('lingoisland');
  app.setActivationPolicy('regular');
  nativeTheme.themeSource = loadConfig().appearance;
  createWindow();
  startNativeStatusItem();
  createPill();
  applyClipboardWatch(loadConfig());
  showView('intro', true);
  setTimeout(async () => {
    const info = await checkForUpdate(app.getVersion()).catch(() => null);
    if (info?.available && rendererReady) win.webContents.send('update:available', info);
  }, 8000);
  updateTimer = setInterval(async () => {
    const info = await checkForUpdate(app.getVersion()).catch(() => null);
    if (info?.available && rendererReady) win.webContents.send('update:available', info);
  }, CHECK_INTERVAL_MS);

  const e2eDir = process.env.LINGOISLAND_E2E_DIR || process.env.SAYBETTER_E2E_DIR;
  if (e2eDir) {
    setTimeout(async () => {
      fs.mkdirSync(e2eDir, { recursive: true });
      const intro = await win.webContents.capturePage();
      fs.writeFileSync(path.join(e2eDir, 'intro.png'), intro.toPNG());
      const initialHidden = !pillWin.isVisible();
      clipboard.writeText(`Saybetter-A lingoisland E2E ${Date.now()}`);
      setTimeout(async () => {
        const collapsedImage = await pillWin.webContents.capturePage();
        fs.writeFileSync(path.join(e2eDir, 'pill-collapsed.png'), collapsedImage.toPNG());
        const hoverCycles = [];
        for (let cycle = 0; cycle < 6; cycle += 1) {
          await pillWin.webContents.executeJavaScript("document.querySelector('#island').dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }))");
          await new Promise((resolve) => setTimeout(resolve, 100));
          const opened = pillWin.getBounds();
          hoverCycles.push(opened.width === PILL_EXPANDED_WIDTH && opened.height === PILL_EXPANDED_HEIGHT);
          pillPointerInside = false;
          schedulePillExpanded(false);
          await new Promise((resolve) => setTimeout(resolve, PILL_COLLAPSE_DELAY_MS + 80));
          const closed = pillWin.getBounds();
          hoverCycles.push(closed.width === PILL_WIDTH && closed.height === PILL_HEIGHT);
        }
        await pillWin.webContents.executeJavaScript("document.querySelector('#island').dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }))");
        setTimeout(async () => {
          const expandedImage = await pillWin.webContents.capturePage();
          fs.writeFileSync(path.join(e2eDir, 'pill-expanded.png'), expandedImage.toPNG());
          writeJSON(path.join(e2eDir, 'report.json'), {
            trayBounds: tray.getBounds(),
            trayTitle: tray.getTitle(),
            mainBounds: win.getBounds(),
            pillBounds: pillWin.getBounds(),
            spaceWheelAnchor,
            initialHidden,
            pillVisible: pillWin.isVisible(),
            hoverExpanded: pillWin.getBounds().width === PILL_EXPANDED_WIDTH && pillWin.getBounds().height === PILL_EXPANDED_HEIGHT,
            hoverCycles,
            clipboardDetected: lastClipboard.startsWith('Saybetter-A lingoisland E2E '),
          });
          app.quit();
        }, 350);
      }, 1300);
    }, 900);
  }
});

app.on('open-url', (event, url) => {
  event.preventDefault();
  handleNativeStatusCommand(url);
});
app.on('activate', () => showView('intro', true));
app.on('before-quit', () => {
  app.isQuitting = true;
  clearInterval(updateTimer);
  clearTimeout(pillPositionSaveTimer);
  if (nativeStatusProcess && !nativeStatusProcess.killed) nativeStatusProcess.kill();
  nativeStatusProcess = null;
  stopClipboardWatch();
  stopPillHoverWatch();
  currentAbort?.abort();
  pillAbort?.abort();
});
app.on('window-all-closed', () => {});
