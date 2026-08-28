'use strict';

const $ = (s) => document.querySelector(s);
const input = $('#input');
const result = $('#result');
const status = $('#status');
const viewIntro = $('#view-intro');
const viewMain = $('#view-main');
const viewSettings = $('#view-settings');

let tone = 'default';
let raw = '';
let running = false;
let fixedText = '';
let lastCopied = ''; // 自己写进剪贴板的东西，别再当成新输入抓回来
let copiedThisRun = false;
let presets = [];
let language = 'zh';
let externalViewRequested = false;

const LOCALES = {
  zh: {
    htmlLang: 'zh-CN', settings: '设置', close: '关闭', language: '语言', provider: '服务商',
    baseUrl: 'API 地址', baseUrlPlaceholder: '留空则用默认', model: '模型', apiKey: 'API Key',
    apiKeyPlaceholder: '存在本机钥匙串，不会外传', hotkey: '全局快捷键', hotkeyPlaceholder: 'Alt+Space',
    hotkeyHelp: '写法：Alt / Command / Control / Shift 加一个键，例如', save: '保存', viewIntro: '查看介绍', saved: '已保存',
    savedHotkeyError: '已保存，但快捷键没注册上：', inputPlaceholder: '粘贴一段话，⌘↵ 检查',
    defaultTone: '默认', formalTone: '正式', casualTone: '口语', conciseTone: '简洁',
    emptyLine1: '把要检查的句子粘进来，按', emptyLine2: '改好的句子可以按', copySuffix: '直接复制走，', closeSuffix: '收起面板。', copy: '复制', copied: '已复制',
    watchClipboard: '监听复制，自动弹出浮窗', watchHelp: '每次复制都会把内容送到你配置的模型，敏感内容请先关掉',
    currentVersion: '当前版本', checkUpdate: '检查更新', checkingUpdate: '查询中…', upToDate: '已是最新', newVersion: '有新版本', download: '下载', checkFailed: '查不到（网络或仓库不可达）',
    checking: '检查中…', error: '出错', errorTitle: '调不通', errorHelp: '检查一下设置里的服务商 / 模型名 / API Key。',
  },
  en: {
    htmlLang: 'en', settings: 'Settings', close: 'Close', language: 'Language', provider: 'Provider',
    baseUrl: 'API URL', baseUrlPlaceholder: 'Leave blank to use the default', model: 'Model', apiKey: 'API Key',
    apiKeyPlaceholder: 'Stored in your local keychain', hotkey: 'Global shortcut', hotkeyPlaceholder: 'Alt+Space',
    hotkeyHelp: 'Use Alt / Command / Control / Shift plus one key, for example', save: 'Save', viewIntro: 'View introduction', saved: 'Saved',
    savedHotkeyError: 'Saved, but the shortcut could not be registered:', inputPlaceholder: 'Paste text, then press ⌘↵ to check',
    defaultTone: 'Default', formalTone: 'Formal', casualTone: 'Casual', conciseTone: 'Concise',
    emptyLine1: 'Paste a sentence to check, then press', emptyLine2: 'Press', copySuffix: 'to copy the corrected sentence,', closeSuffix: 'to close the panel.', copy: 'Copy', copied: 'Copied',
    watchClipboard: 'Watch the clipboard and pop up automatically', watchHelp: 'Every copy is sent to your configured model. Turn this off for sensitive text.',
    currentVersion: 'Version', checkUpdate: 'Check for updates', checkingUpdate: 'Checking…', upToDate: 'Up to date', newVersion: 'New version', download: 'Download', checkFailed: 'Could not check (network or repo unreachable)',
    checking: 'Checking…', error: 'Error', errorTitle: 'Request failed', errorHelp: 'Check the provider, model name, and API Key in Settings.',
  },
  vi: {
    htmlLang: 'vi', settings: 'Cài đặt', close: 'Đóng', language: 'Ngôn ngữ', provider: 'Nhà cung cấp',
    baseUrl: 'Địa chỉ API', baseUrlPlaceholder: 'Để trống để dùng mặc định', model: 'Mô hình', apiKey: 'API Key',
    apiKeyPlaceholder: 'Được lưu trong chuỗi khóa trên máy', hotkey: 'Phím tắt toàn cục', hotkeyPlaceholder: 'Alt+Space',
    hotkeyHelp: 'Dùng Alt / Command / Control / Shift cùng một phím, ví dụ', save: 'Lưu', viewIntro: 'Xem lại giới thiệu', saved: 'Đã lưu',
    savedHotkeyError: 'Đã lưu nhưng không đăng ký được phím tắt:', inputPlaceholder: 'Dán câu cần kiểm tra, rồi nhấn ⌘↵',
    defaultTone: 'Mặc định', formalTone: 'Trang trọng', casualTone: 'Thân mật', conciseTone: 'Ngắn gọn',
    emptyLine1: 'Dán câu cần kiểm tra rồi nhấn', emptyLine2: 'Nhấn', copySuffix: 'để sao chép câu đã sửa,', closeSuffix: 'để đóng bảng điều khiển.', copy: 'Sao chép', copied: 'Đã sao chép',
    watchClipboard: 'Theo dõi clipboard và tự động hiện', watchHelp: 'Mỗi lần sao chép đều được gửi tới mô hình bạn đã cấu hình. Hãy tắt khi xử lý nội dung nhạy cảm.',
    currentVersion: 'Phiên bản', checkUpdate: 'Kiểm tra cập nhật', checkingUpdate: 'Đang kiểm tra…', upToDate: 'Đã mới nhất', newVersion: 'Có bản mới', download: 'Tải về', checkFailed: 'Không kiểm tra được',
    checking: 'Đang kiểm tra…', error: 'Lỗi', errorTitle: 'Yêu cầu thất bại', errorHelp: 'Kiểm tra nhà cung cấp, tên mô hình và API Key trong Cài đặt.',
  },
  id: {
    htmlLang: 'id', settings: 'Pengaturan', close: 'Tutup', language: 'Bahasa', provider: 'Penyedia',
    baseUrl: 'URL API', baseUrlPlaceholder: 'Kosongkan untuk menggunakan default', model: 'Model', apiKey: 'API Key',
    apiKeyPlaceholder: 'Disimpan di keychain lokal', hotkey: 'Pintasan global', hotkeyPlaceholder: 'Alt+Space',
    hotkeyHelp: 'Gunakan Alt / Command / Control / Shift dan satu tombol, misalnya', save: 'Simpan', viewIntro: 'Lihat pengenalan', saved: 'Tersimpan',
    savedHotkeyError: 'Tersimpan, tetapi pintasan tidak dapat didaftarkan:', inputPlaceholder: 'Tempel teks, lalu tekan ⌘↵ untuk memeriksa',
    defaultTone: 'Default', formalTone: 'Formal', casualTone: 'Santai', conciseTone: 'Ringkas',
    emptyLine1: 'Tempel kalimat yang ingin diperiksa, lalu tekan', emptyLine2: 'Tekan', copySuffix: 'untuk menyalin kalimat yang telah diperbaiki,', closeSuffix: 'untuk menutup panel.', copy: 'Salin', copied: 'Tersalin',
    watchClipboard: 'Pantau papan klip dan tampil otomatis', watchHelp: 'Setiap salinan dikirim ke model yang Anda konfigurasikan. Matikan untuk teks sensitif.',
    currentVersion: 'Versi', checkUpdate: 'Periksa pembaruan', checkingUpdate: 'Memeriksa…', upToDate: 'Sudah terbaru', newVersion: 'Versi baru', download: 'Unduh', checkFailed: 'Tidak dapat memeriksa',
    checking: 'Memeriksa…', error: 'Error', errorTitle: 'Permintaan gagal', errorHelp: 'Periksa penyedia, nama model, dan API Key di Pengaturan.',
  },
  th: {
    htmlLang: 'th', settings: 'การตั้งค่า', close: 'ปิด', language: 'ภาษา', provider: 'ผู้ให้บริการ',
    baseUrl: 'ที่อยู่ API', baseUrlPlaceholder: 'เว้นว่างเพื่อใช้ค่าเริ่มต้น', model: 'โมเดล', apiKey: 'API Key',
    apiKeyPlaceholder: 'จัดเก็บไว้ในพวงกุญแจของเครื่อง', hotkey: 'ปุ่มลัดส่วนกลาง', hotkeyPlaceholder: 'Alt+Space',
    hotkeyHelp: 'ใช้ Alt / Command / Control / Shift ร่วมกับปุ่มหนึ่งปุ่ม เช่น', save: 'บันทึก', viewIntro: 'ดูคำแนะนำอีกครั้ง', saved: 'บันทึกแล้ว',
    savedHotkeyError: 'บันทึกแล้ว แต่ไม่สามารถลงทะเบียนปุ่มลัดได้:', inputPlaceholder: 'วางข้อความแล้วกด ⌘↵ เพื่อตรวจสอบ',
    defaultTone: 'ค่าเริ่มต้น', formalTone: 'เป็นทางการ', casualTone: 'ภาษาพูด', conciseTone: 'กระชับ',
    emptyLine1: 'วางประโยคที่ต้องการตรวจสอบแล้วกด', emptyLine2: 'กด', copySuffix: 'เพื่อคัดลอกประโยคที่แก้ไขแล้ว', closeSuffix: 'เพื่อปิดแผง', copy: 'คัดลอก', copied: 'คัดลอกแล้ว',
    watchClipboard: 'เฝ้าดูคลิปบอร์ดและแสดงอัตโนมัติ', watchHelp: 'ทุกครั้งที่คัดลอกจะถูกส่งไปยังโมเดลที่คุณตั้งค่าไว้ ปิดไว้หากเป็นข้อมูลอ่อนไหว',
    currentVersion: 'เวอร์ชัน', checkUpdate: 'ตรวจสอบอัปเดต', checkingUpdate: 'กำลังตรวจสอบ…', upToDate: 'เป็นเวอร์ชันล่าสุดแล้ว', newVersion: 'มีเวอร์ชันใหม่', download: 'ดาวน์โหลด', checkFailed: 'ตรวจสอบไม่ได้',
    checking: 'กำลังตรวจสอบ…', error: 'เกิดข้อผิดพลาด', errorTitle: 'คำขอล้มเหลว', errorHelp: 'ตรวจสอบผู้ให้บริการ ชื่อโมเดล และ API Key ในการตั้งค่า',
  },
  ms: {
    htmlLang: 'ms', settings: 'Tetapan', close: 'Tutup', language: 'Bahasa', provider: 'Penyedia',
    baseUrl: 'URL API', baseUrlPlaceholder: 'Biarkan kosong untuk guna lalai', model: 'Model', apiKey: 'API Key',
    apiKeyPlaceholder: 'Disimpan dalam rantai kunci tempatan', hotkey: 'Pintasan global', hotkeyPlaceholder: 'Alt+Space',
    hotkeyHelp: 'Gunakan Alt / Command / Control / Shift bersama satu kekunci, contohnya', save: 'Simpan', viewIntro: 'Lihat pengenalan', saved: 'Disimpan',
    savedHotkeyError: 'Disimpan, tetapi pintasan tidak dapat didaftarkan:', inputPlaceholder: 'Tampal teks, kemudian tekan ⌘↵ untuk menyemak',
    defaultTone: 'Lalai', formalTone: 'Formal', casualTone: 'Santai', conciseTone: 'Ringkas',
    emptyLine1: 'Tampal ayat untuk disemak, kemudian tekan', emptyLine2: 'Tekan', copySuffix: 'untuk menyalin ayat yang telah dibetulkan,', closeSuffix: 'untuk menutup panel.', copy: 'Salin', copied: 'Disalin',
    watchClipboard: 'Pantau papan klip dan muncul automatik', watchHelp: 'Setiap salinan dihantar ke model yang anda tetapkan. Matikan untuk teks sensitif.',
    currentVersion: 'Versi', checkUpdate: 'Semak kemas kini', checkingUpdate: 'Menyemak…', upToDate: 'Sudah terkini', newVersion: 'Versi baharu', download: 'Muat turun', checkFailed: 'Tidak dapat menyemak',
    checking: 'Sedang menyemak…', error: 'Ralat', errorTitle: 'Permintaan gagal', errorHelp: 'Semak penyedia, nama model dan API Key dalam Tetapan.',
  },
};

function t(key) {
  return (LOCALES[language] || LOCALES.zh)[key] || LOCALES.zh[key] || key;
}

function renderEmpty() {
  if (raw || running) return;
  $('#empty-line-1').innerHTML = `${t('emptyLine1')} <kbd>⌘</kbd><kbd>↵</kbd>.`;
  $('#empty-line-2').innerHTML = `${t('emptyLine2')} <kbd>⌘</kbd><kbd>C</kbd> ${t('copySuffix')} <kbd>esc</kbd> ${t('closeSuffix')}`;
}

function applyLanguage(next) {
  language = LOCALES[next] ? next : 'zh';
  const locale = LOCALES[language];
  document.documentElement.lang = locale.htmlLang;
  document.querySelectorAll('[data-i18n]').forEach((el) => { el.textContent = t(el.dataset.i18n); });
  document.querySelectorAll('[data-i18n-placeholder]').forEach((el) => { el.placeholder = t(el.dataset.i18nPlaceholder); });
  document.querySelectorAll('[data-i18n-title]').forEach((el) => { el.title = t(el.dataset.i18nTitle); });
  $('#hotkey-help').innerHTML = `${t('hotkeyHelp')} <code>Command+Shift+K</code>`;
  renderEmpty();
}

/* ---------------- 极简 markdown ---------------- */

function esc(s) {
  return s.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
}

function inline(s) {
  return esc(s)
    .replace(/~~(.+?)~~/g, '<del>$1</del>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/`([^`]+)`/g, '<code>$1</code>');
}

// 把模型输出切成 [{heading, lines[]}]
function parseSections(md) {
  const sections = [];
  let cur = null;
  for (const line of md.split('\n')) {
    const h = line.match(/^#{1,4}\s+(.*)$/);
    if (h) {
      cur = { heading: h[1].trim(), lines: [] };
      sections.push(cur);
    } else if (cur) {
      cur.lines.push(line);
    } else if (line.trim()) {
      cur = { heading: '', lines: [line] };
      sections.push(cur);
    }
  }
  return sections;
}

function renderBody(lines) {
  let html = '';
  let inList = false;
  for (const line of lines) {
    const li = line.match(/^\s*[-*]\s+(.*)$/);
    if (li) {
      if (!inList) { html += '<ul>'; inList = true; }
      html += `<li>${inline(li[1])}</li>`;
    } else {
      if (inList) { html += '</ul>'; inList = false; }
      if (line.trim()) html += `<p>${inline(line)}</p>`;
    }
  }
  if (inList) html += '</ul>';
  return html;
}

function render(md, streaming) {
  const sections = parseSections(md);
  fixedText = '';
  let html = '';

  sections.forEach((sec, i) => {
    const body = sec.lines.join('\n').trim();
    // 第一段固定是“修改后”，标题会随输出语言变化。
    const isFixed = i === 0;
    if (sec.heading) html += `<h3>${esc(sec.heading)}</h3>`;
    if (isFixed) {
      fixedText = body;
      html += `<div class="fixed">${inline(body).replace(/\n/g, '<br>')}` +
              `<button class="copy" id="btn-copy">${t('copy')}</button></div>`;
    } else {
      html += renderBody(sec.lines);
    }
  });

  // 第二个小标题一出现，就说明第一节（译文/修改后）已经写完了。
  // 这时立刻复制，不用干等后面的说明和备选方案 —— 那部分占了输出的八成。
  if (!copiedThisRun && fixedText && sections.length >= 2) {
    copiedThisRun = true;
    copyFixed();
  }

  if (streaming) html += '<span class="cursor"></span>';
  // 换 innerHTML 会把滚动位置打回顶部，所以先存后还原。
  // 不要自动滚到底 —— 否则边流边往下跑，你根本看不住开头的译文/修改后和问题。
  const keepScroll = result.scrollTop;
  result.innerHTML = html || '<span class="cursor"></span>';
  result.scrollTop = keepScroll;

  const copyBtn = $('#btn-copy');
  if (copyBtn) copyBtn.onclick = () => copyFixed();
}

function copyFixed() {
  if (!fixedText) return;
  lastCopied = fixedText;
  window.api.copy(fixedText);
  status.textContent = t('copied');
  status.classList.remove('err');
  const copiedText = t('copied');
  setTimeout(() => { if (status.textContent === copiedText) status.textContent = ''; }, 1500);
}

/* ---------------- 跑检查 ---------------- */

async function run() {
  const text = input.value.trim();
  if (!text || running) return;
  running = true;
  raw = '';
  fixedText = '';
  copiedThisRun = false;
  status.classList.remove('err');
  status.textContent = t('checking');
  result.innerHTML = '<span class="cursor"></span>';
  result.scrollTop = 0; // 新的一轮从头看起

  const r = await window.api.run(text, tone);
  running = false;
  // 只清掉"检查中…"。这时 onDone 可能已经把状态换成"已复制"了，别把它抹掉。
  if (r && (r.ok || r.aborted) && status.textContent === t('checking')) status.textContent = '';
}

window.api.onDelta((d) => {
  raw += d;
  render(raw, true);
});

window.api.onDone(() => {
  running = false;
  // 同样只清"检查中…"：复制在流式中途就发生了，别把"已复制"抹掉。
  if (status.textContent === t('checking')) status.textContent = '';
  render(raw, false);
  // 正常情况下第一节写完时已经复制过了；这里兜住只输出一节的情况。
  if (!copiedThisRun) { copiedThisRun = true; copyFixed(); }
});

window.api.onError((msg) => {
  running = false;
  status.textContent = t('error');
  status.classList.add('err');
  result.innerHTML = `<h3>${t('errorTitle')}</h3><p>${esc(msg)}</p>` +
    `<p class="dim">${t('errorHelp')}</p>`;
});

/* ---------------- 交互 ---------------- */

function autosize() {
  input.style.height = 'auto';
  input.style.height = Math.min(input.scrollHeight, 140) + 'px';
}
input.addEventListener('input', autosize);

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    if (!viewSettings.hidden) { showMain(); return; }
    window.api.hide();
    return;
  }
  if (e.metaKey && e.key === 'Enter') { e.preventDefault(); run(); return; }
  // 没选中任何文字时，⌘C 直接拿走改好的句子
  if (e.metaKey && e.key === 'c' && fixedText && !String(window.getSelection())) {
    e.preventDefault();
    copyFixed();
  }
});

document.querySelectorAll('.tone').forEach((b) => {
  b.onclick = () => {
    document.querySelectorAll('.tone').forEach((x) => x.classList.remove('on'));
    b.classList.add('on');
    tone = b.dataset.tone;
    if (raw) run(); // 换语气就用同一句重跑
  };
});

window.api.onShown(({ clipboard }) => {
  if (!viewIntro.hidden || !viewSettings.hidden) return;
  input.focus();
  input.select();
  // 剪贴板里有新东西就直接填进来，省一次 ⌘V。
  // 但跳过上一轮我们自己复制进去的结果，否则会拿自己的输出再翻一遍。
  const pasted = (clipboard || '').trim();
  if (pasted && pasted !== input.value.trim() && pasted !== lastCopied.trim()) {
    input.value = pasted;
    autosize();
    input.select();
  }
});

/* ---------------- 设置 ---------------- */

function showMain() {
  window.api.allowBlur();
  viewIntro.hidden = true;
  viewSettings.hidden = true;
  viewMain.hidden = false;
  input.focus();
}
function showIntro() {
  externalViewRequested = true;
  viewMain.hidden = true;
  viewSettings.hidden = true;
  viewIntro.hidden = false;
  input.blur();
  $('#btn-intro-start').focus();
}
function showSettings() {
  externalViewRequested = true;
  viewIntro.hidden = true;
  viewMain.hidden = true;
  viewSettings.hidden = false;
  $('#f-provider').focus();
}
function showApiKeySettings() {
  showSettings();
  const field = $('#field-api-key');
  field.classList.remove('api-key-focus');
  requestAnimationFrame(() => field.classList.add('api-key-focus'));
  $('#f-key').focus();
}

$('#btn-settings').onclick = showSettings;
$('#btn-back').onclick = showMain;
$('#btn-intro-later').onclick = async () => { await window.api.completeIntro(); showMain(); };
$('#btn-intro-start').onclick = async () => { await window.api.completeIntro(); showApiKeySettings(); };
$('#btn-replay-intro').onclick = showIntro;
window.api.onSettings(showSettings);
window.api.onApiKey(showApiKeySettings);
window.api.onIntro(showIntro);
// 从菜单栏切换了「暂停复制翻译」时，设置页里的勾选状态要跟着变
window.api.onConfigChanged((c) => {
  if (c && typeof c.watchClipboard === 'boolean') {
    const box = $('#f-watch');
    if (box) box.checked = c.watchClipboard;
  }
});

function applyPreset(id, { fillModel } = {}) {
  const p = presets.find((x) => x.id === id);
  if (!p) return;
  $('#hint-provider').textContent = p.keyHint || '';
  $('#f-baseurl').placeholder = p.baseUrl || '必填';
  $('#model-list').innerHTML = p.models.map((m) => `<option value="${m}">`).join('');
  if (fillModel) {
    $('#f-baseurl').value = '';
    $('#f-model').value = p.models[0] || '';
  }
}

$('#f-provider').onchange = (e) => applyPreset(e.target.value, { fillModel: true });
$('#f-language').onchange = (e) => applyLanguage(e.target.value);

$('#btn-save').onclick = async () => {
  const cfg = {
    providerId: $('#f-provider').value,
    baseUrl: $('#f-baseurl').value.trim(),
    model: $('#f-model').value.trim(),
    apiKey: $('#f-key').value,
    hotkey: $('#f-hotkey').value.trim(),
    language,
    watchClipboard: $('#f-watch').checked,
  };
  const r = await window.api.setConfig(cfg);
  const msg = $('#save-msg');
  if (r && r.ok) {
    msg.textContent = t('saved');
    setTimeout(showMain, 500);
  } else {
    msg.textContent = t('savedHotkeyError') + (r && r.error ? r.error : '');
  }
};

/* ---------------- 更新检查 ---------------- */

let updateUrlReady = false;

function paintUpdate({ current, info }) {
  const line = $('#update-line');
  const btn = $('#btn-check-update');
  btn.textContent = t('checkUpdate');
  if (!info) {
    line.textContent = `${t('currentVersion')} ${current}`;
    return;
  }
  if (info.hasUpdate) {
    updateUrlReady = true;
    line.innerHTML = `<span class="has-update">${t('newVersion')} ${esc(info.version)}</span> · ${t('currentVersion')} ${esc(current)}`;
    btn.textContent = t('download');
  } else {
    line.textContent = `${t('currentVersion')} ${current} · ${t('upToDate')}`;
  }
}

$('#btn-check-update').onclick = async () => {
  if (updateUrlReady) { window.api.openUpdate(); return; }
  $('#btn-check-update').textContent = t('checkingUpdate');
  const r = await window.api.checkUpdate();
  if (!r || !r.info) {
    $('#update-line').textContent = t('checkFailed');
    $('#btn-check-update').textContent = t('checkUpdate');
    return;
  }
  paintUpdate(r);
};

// 主进程后台查到新版本，直接把设置页那行点亮
window.api.onUpdate((info) => {
  updateUrlReady = true;
  const line = $('#update-line');
  if (line) line.innerHTML = `<span class="has-update">${t('newVersion')} ${esc(info.version)}</span>`;
  const btn = $('#btn-check-update');
  if (btn) btn.textContent = t('download');
});

(async function init() {
  const { config, presets: ps } = await window.api.getConfig();
  presets = ps;
  language = config.language || 'zh';
  $('#f-language').value = language;
  applyLanguage(language);
  $('#f-provider').innerHTML = ps.map((p) => `<option value="${p.id}">${p.label}</option>`).join('');
  $('#f-provider').value = config.providerId;
  applyPreset(config.providerId);
  $('#f-baseurl').value = config.baseUrl || '';
  $('#f-model').value = config.model || '';
  $('#f-key').value = config.apiKey || '';
  $('#f-hotkey').value = config.hotkey || 'Alt+Space';
  $('#f-watch').checked = config.watchClipboard !== false;
  window.api.checkUpdate().then((r) => { if (r) paintUpdate(r); }).catch(() => {});
  if (!externalViewRequested) showMain();
})();
