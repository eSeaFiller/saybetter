'use strict';

const {
  app,
  BrowserWindow,
  Tray,
  Menu,
  globalShortcut,
  ipcMain,
  clipboard,
  safeStorage,
  nativeImage,
  shell,
  screen,
} = require('electron');
const path = require('path');
const fs = require('fs');
const { PRESETS, streamCheck } = require('./providers');
const { checkForUpdate, CHECK_INTERVAL_MS, REPO } = require('./updater');

const CONFIG_PATH = () => path.join(app.getPath('userData'), 'config.json');
const LEGACY_CONFIG_PATHS = () => [
  path.join(app.getPath('appData'), 'wo-shuo-de-dui-ma', 'config.json'),
  path.join(app.getPath('appData'), '我说的对吗', 'config.json'),
];
const DEFAULT_CONFIG = {
  providerId: 'ark',
  baseUrl: '',
  model: '',
  apiKey: '',
  hotkey: 'Alt+Space',
  language: 'zh',
  watchClipboard: true,
};

// 灵动岛浮窗尺寸
const PILL_W = 260;
const PILL_H = 34;
const PILL_EXPANDED_W = 480;
const PILL_EXPANDED_H = 430;
const CLIPBOARD_POLL_MS = 400;
const MAX_WATCH_CHARS = 1200; // 太长的复制（整篇文档、大段代码）不自动送去 API

let tray = null;
let win = null;
let currentAbort = null;
let suppressBlurUntil = 0;
let rendererReady = false;
let showOnLaunch = true;
let keepPanelOpen = false;
let isQuitting = false;
const pendingSends = [];

let pillWin = null;
let pillAbort = null;
let pillExpanded = false;
let clipboardTimer = null;
let lastClipboard = '';
let selfWrote = ''; // 自己写进剪贴板的内容，不能再触发一轮
let cursorTimer = null;
let pillPinned = false; // 点过之后钉住，移开也不收
let updateInfo = null;  // 查到的新版本，null = 没有/没查到

/* ---------------- config（key 用系统钥匙串加密后落盘） ---------------- */

function loadConfig() {
  try {
    const configPath = [CONFIG_PATH(), ...LEGACY_CONFIG_PATHS()].find((p) => fs.existsSync(p));
    if (!configPath) throw new Error('config not found');
    const raw = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    let apiKey = '';
    if (raw.apiKeyEnc && safeStorage.isEncryptionAvailable()) {
      try {
        apiKey = safeStorage.decryptString(Buffer.from(raw.apiKeyEnc, 'base64'));
      } catch {
        apiKey = '';
      }
    } else if (raw.apiKeyPlain) {
      apiKey = raw.apiKeyPlain;
    }
    if (configPath !== CONFIG_PATH()) {
      try {
        fs.mkdirSync(path.dirname(CONFIG_PATH()), { recursive: true });
        fs.copyFileSync(configPath, CONFIG_PATH());
      } catch {
        // 迁移失败不影响本次读取，下一次启动仍会尝试迁移。
      }
    }
    return { ...DEFAULT_CONFIG, ...raw, apiKey };
  } catch {
    return { ...DEFAULT_CONFIG };
  }
}

function saveConfig(cfg) {
  const out = {
    providerId: cfg.providerId,
    baseUrl: cfg.baseUrl || '',
    model: cfg.model || '',
    hotkey: cfg.hotkey || DEFAULT_CONFIG.hotkey,
    language: cfg.language || DEFAULT_CONFIG.language,
    watchClipboard: cfg.watchClipboard !== false,
  };
  const key = cfg.apiKey || '';
  if (key && safeStorage.isEncryptionAvailable()) {
    out.apiKeyEnc = safeStorage.encryptString(key).toString('base64');
  } else if (key) {
    out.apiKeyPlain = key; // 钥匙串不可用时的退路
  }
  fs.mkdirSync(path.dirname(CONFIG_PATH()), { recursive: true });
  fs.writeFileSync(CONFIG_PATH(), JSON.stringify(out, null, 2), { mode: 0o600 });
}

/* ---------------- window ---------------- */

function createWindow() {
  win = new BrowserWindow({
    width: 720,
    height: 520,
    show: false,
    frame: false,
    resizable: false,
    transparent: true,
    vibrancy: 'under-window',
    visualEffectState: 'active',
    alwaysOnTop: true,
    skipTaskbar: true,
    fullscreenable: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  win.webContents.on('did-finish-load', () => {
    rendererReady = true;
    while (pendingSends.length) win.webContents.send(...pendingSends.shift());
    if (showOnLaunch) {
      showOnLaunch = false;
      setTimeout(() => showPanel({ keepOpen: true }), 150);
    }
  });
  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  // 刚弹出的瞬间会有一次假 blur（焦点还在原来那个 app 上），忽略掉它，
  // 否则面板会自己立刻收回去。
  win.on('blur', () => {
    if (keepPanelOpen) return;
    if (Date.now() < suppressBlurUntil) return;
    hidePanel();
  });
  // 点关闭只是收起面板，app 继续待在菜单栏。
  // 但真要退出时（托盘退出、注销、SIGTERM）必须放行，否则进程杀不掉、关机会卡住。
  win.on('close', (e) => {
    if (isQuitting) return;
    e.preventDefault();
    hidePanel();
  });
}

// 启动瞬间就按快捷键的话，渲染进程可能还没就绪，这时先攒着，加载完再发。
function send(channel, payload) {
  if (!win || win.isDestroyed() || win.webContents.isDestroyed()) return;
  if (!rendererReady) {
    pendingSends.push([channel, payload]);
    return;
  }
  try {
    win.webContents.send(channel, payload);
  } catch {
    // 帧可能正在销毁（退出中），丢掉就行
  }
}

function showPanel({ keepOpen = false } = {}) {
  if (!win) return;
  keepPanelOpen = keepOpen;
  // 出现在鼠标所在的那块屏幕上，靠上 1/4 处 —— Spotlight 的位置感
  const { workArea } = screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
  const [w, h] = win.getSize();
  win.setPosition(
    Math.round(workArea.x + (workArea.width - w) / 2),
    Math.round(workArea.y + workArea.height * 0.22),
  );
  suppressBlurUntil = Date.now() + 2000;
  win.show();
  // dock 图标是隐藏的，不 steal 焦点的话键盘输入不会进到面板里
  app.focus({ steal: true });
  win.focus();
  send('panel:shown', { clipboard: clipboard.readText().slice(0, 5000) });
}

function hidePanel() {
  keepPanelOpen = false;
  if (currentAbort) {
    currentAbort.abort();
    currentAbort = null;
  }
  if (win && win.isVisible()) win.hide();
}

function togglePanel() {
  if (win && win.isVisible()) hidePanel();
  else showPanel();
}

/* ---------------- 灵动岛浮窗 ---------------- */

// 放在主屏顶部正中、菜单栏正下方 —— 刘海机上刘海本身是物理黑块，
// 窗口盖上去会被挡住，所以贴着它的下沿。
function positionPill(w, h) {
  if (!pillWin || pillWin.isDestroyed()) return;
  const d = screen.getPrimaryDisplay();
  const x = Math.round(d.bounds.x + (d.bounds.width - w) / 2);
  const y = Math.round(d.workArea.y); // workArea.y 已经把菜单栏/刘海让开
  pillWin.setBounds({ x, y, width: w, height: h });
}

function createPill() {
  pillWin = new BrowserWindow({
    width: PILL_W,
    height: PILL_H,
    show: false,
    frame: false,
    transparent: true,
    resizable: false,
    // 不能设 movable: false —— macOS 上它连 setBounds 的程序化移动一起挡掉，
    // 结果窗口停在默认的「屏幕正中」，永远到不了刘海下面。
    movable: true,
    // 必须 focusable，否则点击落不进窗口。靠 showInactive() 保证不主动抢焦点。
    focusable: true,
    // macOS 上非活动窗口的第一次点击默认只用来激活窗口、事件被吞掉。
    // 浮窗永远是非活动的（你人在别的 app 里），不开这个就永远点不动。
    acceptFirstMouse: true,
    skipTaskbar: true,
    hasShadow: true,
    fullscreenable: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload-pill.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  // screen-saver 层级才能盖在菜单栏和全屏应用之上
  pillWin.setAlwaysOnTop(true, 'screen-saver');
  pillWin.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  pillWin.loadFile(path.join(__dirname, 'renderer', 'pill.html'));
}

function pillSend(channel, payload) {
  if (!pillWin || pillWin.isDestroyed() || pillWin.webContents.isDestroyed()) return;
  try {
    pillWin.webContents.send(channel, payload);
  } catch {
    /* 正在销毁，忽略 */
  }
}

// 展开 / 收起统一走这里：主进程说了算，渲染进程只负责画。
function setPillExpanded(next) {
  if (pillExpanded === next) return;
  pillExpanded = next;
  if (next) {
    positionPill(PILL_EXPANDED_W, PILL_EXPANDED_H);
  } else {
    positionPill(PILL_W, PILL_H);
  }
  pillSend('pill:expanded', next);
}

// macOS 上后台 app 的窗口收不到可靠的 mouseenter/mouseleave —— 浮窗属于 SayBetter，
// 而前台是你正在用的那个 app。所以直接轮询系统光标位置，跟窗口矩形比。
function startCursorWatch() {
  stopCursorWatch();
  cursorTimer = setInterval(() => {
    if (!pillWin || pillWin.isDestroyed() || !pillWin.isVisible()) return;
    const p = screen.getCursorScreenPoint();
    const b = pillWin.getBounds();
    // 收起态很扁，往下多给一点缓冲，免得刚要碰到就滑过去了
    const pad = pillExpanded ? 0 : 10;
    const inside =
      p.x >= b.x && p.x <= b.x + b.width &&
      p.y >= b.y - 4 && p.y <= b.y + b.height + pad;

    // 移开只收成胶囊，不再隐藏 —— 结果得一直在那等着你。
    if (inside) setPillExpanded(true);
    else if (!pillPinned && pillExpanded) setPillExpanded(false);
  }, 120);
}

function stopCursorWatch() {
  if (cursorTimer) clearInterval(cursorTimer);
  cursorTimer = null;
}

function hidePill() {
  pillExpanded = false;
  pillPinned = false;
  stopCursorWatch();
  if (pillAbort) { pillAbort.abort(); pillAbort = null; }
  if (pillWin && !pillWin.isDestroyed() && pillWin.isVisible()) pillWin.hide();
}

// 浮窗不再自己消失。只要还在处理中/已出结果，它就一直挂在刘海下面，
// 鼠标移开只是收成一颗胶囊。真正关掉靠：✕、esc、或者下一次复制。

async function runInPill(text) {
  const cfg = loadConfig();
  if (!pillWin || pillWin.isDestroyed()) return;

  pillExpanded = false;
  pillPinned = false;
  pillSend('pill:expanded', false);
  pillSend('pill:start', { language: cfg.language || 'zh' });
  pillWin.showInactive(); // 不抢焦点
  // 必须在 show 之后再定位：窗口还隐藏时设的 bounds 不生效，
  // macOS 会在显示的瞬间把它摆回默认的「屏幕正中」。
  positionPill(PILL_W, PILL_H);
  startCursorWatch();

  if (pillAbort) pillAbort.abort();
  const ac = new AbortController();
  pillAbort = ac;
  try {
    await streamCheck({
      config: cfg,
      text,
      tone: 'default',
      variant: 'pill', // 浮窗要四种语气并列
      signal: ac.signal,
      onDelta: (d) => pillSend('pill:delta', d),
    });
    if (!ac.signal.aborted) {
      pillSend('pill:done');
    }
  } catch (err) {
    if (!ac.signal.aborted) {
      pillSend('pill:error', String(err.message || err));
    }
  } finally {
    if (pillAbort === ac) pillAbort = null;
  }
}

/* ---------------- 剪贴板监听 ---------------- */
// 用轮询而不是注册 ⌘C 全局快捷键：注册会把复制这个动作本身截胡，
// 别的 app 就复制不了了。轮询不需要任何权限，也不干扰系统。

function shouldWatch(text) {
  const t = (text || '').trim();
  if (!t) return false;
  if (t.length < 2) return false;
  if (t.length > MAX_WATCH_CHARS) return false; // 整篇文档不自动送
  if (t === selfWrote.trim()) return false;     // 自己刚写进去的，别成环
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(t)) return false; // 纯 URL，没什么可改的
  if (/^[\w.-]+@[\w.-]+\.\w+$/.test(t)) return false;   // 纯邮箱地址
  return true;
}

function startClipboardWatch() {
  stopClipboardWatch();
  lastClipboard = clipboard.readText(); // 起点：不处理启动前就在里面的内容
  clipboardTimer = setInterval(() => {
    let cur;
    try {
      cur = clipboard.readText();
    } catch {
      return;
    }
    if (cur === lastClipboard) return;
    lastClipboard = cur;
    if (!loadConfig().watchClipboard) return;
    if (!shouldWatch(cur)) return;
    runInPill(cur.trim());
  }, CLIPBOARD_POLL_MS);
}

function stopClipboardWatch() {
  if (clipboardTimer) clearInterval(clipboardTimer);
  clipboardTimer = null;
}

function applyClipboardWatch(cfg) {
  if (cfg.watchClipboard !== false) startClipboardWatch();
  else { stopClipboardWatch(); hidePill(); }
}

/* ---------------- tray ---------------- */

function trayIcon() {
  // 必须是 PNG —— nativeImage 在 macOS 上不认 SVG。
  // 文件名带 Template 会被当作模板图，自动跟随明暗菜单栏。
  const img = nativeImage.createFromPath(path.join(__dirname, 'iconTemplate.png'));
  img.setTemplateImage(true);
  return img;
}

function buildTray() {
  tray = new Tray(trayIcon());
  tray.setToolTip('SayBetter');
  const cfg = loadConfig();
  const menu = Menu.buildFromTemplate([
    ...(updateInfo
      ? [{ label: `有新版本 ${updateInfo.version}，点击下载`, click: () => shell.openExternal(updateInfo.url) },
         { type: 'separator' }]
      : []),
    { label: `唤出（${cfg.hotkey}）`, click: showPanel },
    { type: 'separator' },
    {
      label: '设置…',
      click: () => {
        showPanel();
        send('panel:settings');
      },
    },
    {
      label: '打开配置文件夹',
      click: () => shell.showItemInFolder(CONFIG_PATH()),
    },
    { type: 'separator' },
    { label: '退出', click: () => { app.exit(0); } },
  ]);
  tray.setContextMenu(menu);
  tray.on('click', togglePanel);
}

/* ---------------- hotkey ---------------- */

function registerHotkey(accel) {
  globalShortcut.unregisterAll();
  if (!accel) return { ok: false, error: '快捷键为空' };
  try {
    const ok = globalShortcut.register(accel, togglePanel);
    return ok ? { ok: true } : { ok: false, error: `${accel} 被别的程序占用了` };
  } catch (e) {
    return { ok: false, error: String(e.message || e) };
  }
}

/* ---------------- IPC ---------------- */

ipcMain.handle('config:get', () => ({ config: loadConfig(), presets: PRESETS }));

ipcMain.handle('config:set', (_e, cfg) => {
  saveConfig(cfg);
  const r = registerHotkey(cfg.hotkey);
  if (tray) buildTrayMenuLabel(cfg.hotkey);
  applyClipboardWatch(loadConfig());
  return r;
});

function buildTrayMenuLabel(hotkey) {
  const menu = Menu.buildFromTemplate([
    ...(updateInfo
      ? [{ label: `有新版本 ${updateInfo.version}，点击下载`, click: () => shell.openExternal(updateInfo.url) },
         { type: 'separator' }]
      : []),
    { label: `唤出（${hotkey}）`, click: showPanel },
    { type: 'separator' },
    {
      label: '设置…',
      click: () => {
        showPanel();
        send('panel:settings');
      },
    },
    { label: '打开配置文件夹', click: () => shell.showItemInFolder(CONFIG_PATH()) },
    { type: 'separator' },
    { label: '退出', click: () => app.exit(0) },
  ]);
  tray.setContextMenu(menu);
}

ipcMain.handle('check:run', async (e, { text, tone }) => {
  if (currentAbort) currentAbort.abort();
  const ac = new AbortController();
  currentAbort = ac;
  const wc = e.sender;
  try {
    await streamCheck({
      config: loadConfig(),
      text,
      tone,
      signal: ac.signal,
      onDelta: (d) => {
        if (!wc.isDestroyed()) wc.send('check:delta', d);
      },
    });
    if (!wc.isDestroyed()) wc.send('check:done');
    return { ok: true };
  } catch (err) {
    if (ac.signal.aborted) return { ok: false, aborted: true };
    if (!wc.isDestroyed()) wc.send('check:error', String(err.message || err));
    return { ok: false, error: String(err.message || err) };
  } finally {
    if (currentAbort === ac) currentAbort = null;
  }
});

ipcMain.handle('check:cancel', () => {
  if (currentAbort) currentAbort.abort();
  currentAbort = null;
});

ipcMain.handle('update:check', async () => {
  const info = await checkForUpdate(app.getVersion());
  if (info && info.hasUpdate) {
    updateInfo = info;
    if (tray) buildTrayMenuLabel(loadConfig().hotkey);
  }
  return { current: app.getVersion(), info, repo: REPO };
});
ipcMain.handle('update:open', () => {
  if (updateInfo) shell.openExternal(updateInfo.url);
});

ipcMain.handle('panel:hide', () => hidePanel());
ipcMain.handle('panel:allow-blur', () => { keepPanelOpen = false; });
ipcMain.handle('clipboard:write', (_e, t) => {
  selfWrote = t || '';
  clipboard.writeText(t);
});

/* ---- 浮窗 IPC ---- */

// 点一下钉住：移开也不收，方便你去选中/复制里面的文字。再点一下解除。
ipcMain.on('pill:click', () => {
  if (!pillWin || pillWin.isDestroyed()) return;
  if (pillPinned) {
    pillPinned = false;
    pillSend('pill:pinned', false);
    return;
  }
  pillPinned = true;
  setPillExpanded(true);
  pillSend('pill:pinned', true);
});

ipcMain.on('pill:close', () => hidePill());

ipcMain.on('pill:copy', (_e, t) => {
  selfWrote = t || '';
  clipboard.writeText(t);
  lastClipboard = t || ''; // 立刻同步，免得轮询再触发一轮
});

/* ---------------- lifecycle ---------------- */

app.whenReady().then(() => {
  // 保留 Dock 图标：可以从程序坞打开，也让 ⌘Q 有个正经的退出入口。
  // （早期版本这里是 app.dock.hide()，结果正式包里托盘图标又不显示，
  //   用户就没有任何可见入口了。）
  if (process.platform === 'darwin' && app.dock) app.dock.show();
  createWindow();
  setTimeout(() => {
    if (showOnLaunch && win && !win.isDestroyed()) {
      showOnLaunch = false;
      showPanel({ keepOpen: true });
    }
  }, 1200);
  buildTray();
  createPill();
  const cfg = loadConfig();
  const r = registerHotkey(cfg.hotkey);
  if (!r.ok) console.warn('快捷键注册失败：', r.error);
  applyClipboardWatch(cfg);

  // 更新检查：延后 8 秒，别和启动抢资源；失败静默，绝不影响主功能
  const runUpdateCheck = async () => {
    const info = await checkForUpdate(app.getVersion());
    if (!info || !info.hasUpdate) return;
    updateInfo = info;
    if (tray) buildTrayMenuLabel(loadConfig().hotkey);
    send('update:available', info);
  };
  setTimeout(runUpdateCheck, 8000);
  setInterval(runUpdateCheck, CHECK_INTERVAL_MS);
});

app.on('window-all-closed', () => {}); // 菜单栏常驻，关掉面板不等于退出

// 点程序坞图标（或从启动台/访达打开已在运行的 app）→ 弹出面板
app.on('activate', () => {
  if (win && !win.isDestroyed()) showPanel();
});
app.on('before-quit', () => { isQuitting = true; });
app.on('will-quit', () => {
  globalShortcut.unregisterAll();
  stopClipboardWatch();
});

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) app.exit(0);
app.on('second-instance', () => showPanel());
