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
const PILL_H = 52;  // 44 的文字行 + 下沿 8px 容纳悬停进度条
const PILL_EXPANDED_W = 440;
const PILL_EXPANDED_H = 380;
const CLIPBOARD_POLL_MS = 400;
// 鼠标移上来之后，灵动岛下沿走一条进度条；走满才展开结果。
// 请求本身在复制时就已经发出去了，这段时间通常已经跑完，所以进度一到就有内容。
const HOVER_DELAY_MS = 1000;
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
let hoverTimer = null;  // 悬停计时：进入后要停够 HOVER_DELAY_MS 才展开
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
  // 浮窗正待命时，快捷键的意思是「就翻这段」，不用把鼠标挪到屏幕顶上去。
  // （PhrasePeek 是连按两次复制来实现同一件事，但那要读 NSPasteboard 的
  //   changeCount —— 复制同一段文字时内容没变，轮询式的剪贴板监听看不到，
  //   Electron 也没暴露这个接口，所以这里用快捷键代替。）
  if (win && win.isVisible()) hidePanel();
  else showPanel();
}

/* ---------------- 灵动岛浮窗 ---------------- */

// 放在主屏顶部正中、菜单栏正下方 —— 刘海机上刘海本身是物理黑块，
// 窗口盖上去会被挡住，所以贴着它的下沿。
function positionPill(w, h) {
  if (!pillWin || pillWin.isDestroyed()) return;
  // 放在「你正在用的那块屏」顶端，而不是写死主屏 —— 否则你在外接屏上敲字，
  // 浮窗却弹在笔记本屏幕上，看起来就像"只在某一个桌面才有"。
  const d = screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
  const x = Math.round(d.bounds.x + (d.bounds.width - w) / 2);
  const y = Math.round(d.workArea.y); // workArea.y 已经把菜单栏/刘海让开
  pillWin.setBounds({ x, y, width: w, height: h });
}

// 让浮窗跟着你走：所有桌面（Space）、全屏应用之上都能看到。
// macOS 上窗口每次 hide/show 之后 collectionBehavior 可能被重置，
// 所以不能只在创建时设一次，每次显示都要重新声明。
function keepPillEverywhere() {
  if (!pillWin || pillWin.isDestroyed()) return;
  pillWin.setVisibleOnAllWorkspaces(true, {
    visibleOnFullScreen: true,
    skipTransformProcessType: true, // 不加这个，切换时 app 会被短暂拉成前台
  });
  pillWin.setAlwaysOnTop(true, 'screen-saver');
}

function createPill() {
  pillWin = new BrowserWindow({
    width: PILL_W,
    height: PILL_H,
    show: false,
    frame: false,
    transparent: true,
    // 原生毛玻璃。不能用 CSS backdrop-filter —— 那只能模糊页面内部的东西，
    // 模糊不了窗口背后的桌面内容；真玻璃必须走 macOS 的 vibrancy。
    // 'popover' 是浅色系材质；页面里再叠一层白，深色模式下也保持浅色。
    vibrancy: 'popover',
    visualEffectState: 'active',
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
  keepPillEverywhere(); // screen-saver 层级 + 所有桌面可见
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

    // 进入后要停够 HOVER_DELAY_MS 才展开：鼠标只是路过顶部时不该炸开一整块面板。
    // 移开只收成胶囊，不隐藏 —— 结果得一直在那等着你。
    if (inside) {
      if (!pillExpanded && !hoverTimer) {
        pillSend('pill:dwell', HOVER_DELAY_MS);   // 让界面开始画那条进度
        hoverTimer = setTimeout(() => {
          hoverTimer = null;
          setPillExpanded(true);
        }, HOVER_DELAY_MS);
      }
    } else {
      if (hoverTimer) {
        clearTimeout(hoverTimer);
        hoverTimer = null;
        pillSend('pill:dwell-cancel');            // 中途移开就把进度收回去
      }
      if (!pillPinned && pillExpanded) setPillExpanded(false);
    }
  }, 120);
}

function stopCursorWatch() {
  if (cursorTimer) clearInterval(cursorTimer);
  cursorTimer = null;
}

function hidePill() {
  if (hoverTimer) { clearTimeout(hoverTimer); hoverTimer = null; }
  pillExpanded = false;
  pillPinned = false;
  stopCursorWatch();
  if (pillAbort) { pillAbort.abort(); pillAbort = null; }
  if (pillWin && !pillWin.isDestroyed() && pillWin.isVisible()) pillWin.hide();
}

// 浮窗不再自己消失。只要还在处理中/已出结果，它就一直挂在刘海下面，
// 鼠标移开只是收成一颗胶囊。真正关掉靠：✕、esc、或者下一次复制。

// 非英文（含中日韩、泰、越等）→ 翻译；否则是英文校对。
// 只用来显示方向标，真正的判断仍由模型自己做。
function detectMode(text) {
  const nonLatin = (text.match(/[^\u0000-\u024F\s\p{P}\d]/gu) || []).length;
  return nonLatin > text.length * 0.15 ? 'translate' : 'proofread';
}

async function runInPill(text) {
  const cfg = loadConfig();
  if (!pillWin || pillWin.isDestroyed()) return;

  pillSend('pill:start', { language: cfg.language || 'zh', mode: detectMode(text), source: text.slice(0, 300) });
  setTrayBusy(true);
  pillExpanded = false;
  pillPinned = false;
  pillSend('pill:expanded', false);
  // 先摆好再显示 —— 否则窗口会先在上一次的位置（首次是屏幕正中）闪一帧再跳过来。
  positionPill(PILL_W, PILL_H);
  pillWin.showInactive();
  keepPillEverywhere();
  // 显示后再摆一次：窗口还隐藏时设的 bounds 在 macOS 上不一定生效。
  positionPill(PILL_W, PILL_H);
  // 再补一次，兜住系统的异步重排（切空间、接显示器时容易发生）。
  setTimeout(() => {
    if (pillWin && !pillWin.isDestroyed() && pillWin.isVisible() && !pillExpanded) {
      keepPillEverywhere();
      positionPill(PILL_W, PILL_H);
    }
  }, 250);
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
    setTrayBusy(false);
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

// 菜单栏那颗绿点。必须是 PNG —— nativeImage 在 macOS 上不认 SVG。
// 这里刻意不设 setTemplateImage：模板图会被系统按明暗主题重绘成黑白，
// 绿色就没了。绿点本身在深浅菜单栏下都够清楚。
function trayIcon(busy = false) {
  const file = busy ? 'trayDotBusy.png' : 'trayDot.png';
  return nativeImage.createFromPath(path.join(__dirname, file));
}

// 正在处理时把实心点换成空心圈，给一个"它在干活"的信号
function setTrayBusy(busy) {
  if (!tray || tray.isDestroyed()) return;
  try {
    tray.setImage(trayIcon(busy));
  } catch {
    /* 托盘可能已销毁 */
  }
}

// 菜单栏下拉菜单。只有一份构建逻辑 —— 之前有两份几乎一样的拷贝，
// 改一处忘另一处就会不一致。
function buildTrayMenu() {
  if (!tray || tray.isDestroyed()) return;
  const cfg = loadConfig();
  const watching = cfg.watchClipboard !== false;

  tray.setContextMenu(Menu.buildFromTemplate([
    ...(updateInfo
      ? [{ label: `有新版本 ${updateInfo.version}，点击下载`, click: () => shell.openExternal(updateInfo.url) },
         { type: 'separator' }]
      : []),

    { label: '翻译剪贴板内容', accelerator: cfg.hotkey || 'Alt+Space', click: translateClipboardNow },
    {
      // 最常用的开关，不该藏在设置页里
      label: '暂停复制翻译',
      type: 'checkbox',
      checked: !watching,
      click: () => {
        const next = { ...loadConfig(), watchClipboard: !watching };
        saveConfig(next);
        applyClipboardWatch(loadConfig());
        buildTrayMenu();                     // 勾选状态要立刻反映出来
        send('config:changed', { watchClipboard: !watching });
      },
    },

    { type: 'separator' },

    { label: '模型设置…', accelerator: 'CommandOrControl+,', click: openSettings },
    { label: '打开配置文件夹', click: () => shell.showItemInFolder(CONFIG_PATH()) },

    { type: 'separator' },

    { label: '查看介绍', click: () => { showPanel(); send('panel:intro'); } },
    { label: `关于 SayBetter ${app.getVersion()}`, click: () => shell.openExternal(`https://github.com/${REPO}`) },

    { type: 'separator' },

    { label: '退出 SayBetter', accelerator: 'CommandOrControl+Q', click: () => app.quit() },
  ]));
}

function openSettings() {
  showPanel();
  send('panel:settings');
}

// 拿当前剪贴板内容跑一轮；没有可处理的内容就打开输入面板
function translateClipboardNow() {
  const text = (clipboard.readText() || '').trim();
  if (shouldWatch(text)) {
    lastClipboard = clipboard.readText();   // 别让轮询紧接着再触发一次
    runInPill(text);
  } else {
    showPanel();
  }
}

// macOS 上托盘菜单里的 accelerator 只是显示用的，不会真的触发。
// 想让 ⌘, 和 ⌘Q 生效，得有一份真正的应用菜单。
// 注意：Edit 那一组必须留着，否则设置页里 ⌘V 粘贴 API Key 都会失灵。
function buildAppMenu() {
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    {
      label: 'SayBetter',
      submenu: [
        { label: `关于 SayBetter ${app.getVersion()}`, click: () => shell.openExternal(`https://github.com/${REPO}`) },
        { type: 'separator' },
        { label: '模型设置…', accelerator: 'CommandOrControl+,', click: openSettings },
        { type: 'separator' },
        { role: 'hide', label: '隐藏 SayBetter' },
        { role: 'hideOthers', label: '隐藏其他' },
        { role: 'unhide', label: '全部显示' },
        { type: 'separator' },
        { label: '退出 SayBetter', accelerator: 'CommandOrControl+Q', click: () => app.quit() },
      ],
    },
    {
      label: '编辑',
      submenu: [
        { role: 'undo', label: '撤销' },
        { role: 'redo', label: '重做' },
        { type: 'separator' },
        { role: 'cut', label: '剪切' },
        { role: 'copy', label: '拷贝' },
        { role: 'paste', label: '粘贴' },
        { role: 'selectAll', label: '全选' },
      ],
    },
  ]));
}

function buildTray() {
  tray = new Tray(trayIcon());
  tray.setToolTip('SayBetter');
  buildTrayMenu();
  // 点绿点 = 直接翻剪贴板里的内容；浮窗已经开着就收起
  tray.on('click', () => {
    if (pillWin && !pillWin.isDestroyed() && pillWin.isVisible()) {
      hidePill();
      return;
    }
    translateClipboardNow();
  });
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
  buildTrayMenu();
  applyClipboardWatch(loadConfig());
  return r;
});


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
    buildTrayMenu();
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
  buildAppMenu();
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
    buildTrayMenu();
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
