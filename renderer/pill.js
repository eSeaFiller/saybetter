'use strict';

const $ = (s) => document.querySelector(s);
const pillEl = $('#pill');
const dot = $('#dot');
const directionEl = $('#direction');
const peek = $('#peek');
const headline = $('#headline');
const sourceEl = $('#source');
const tonesEl = $('#tones');
const whyWrap = $('#why-wrap');
const whyLabel = $('#why-label');
const whyEl = $('#why');
const hint = $('#hint');
const btnCopy = $('#btn-copy');
const btnClose = $('#btn-close');
const progressFill = $('#progress-fill');
const waitingEl = $('#waiting');

// 悬停进度：鼠标移上来之后，灵动岛下沿走一条进度；走满才展开结果。
// 请求在复制那一刻就发出去了，所以这段时间通常已经把结果等回来了。
let dwellTimer = null;

let raw = '';
let variants = [];   // [{ tone, text, why[] }]
let chosen = 0;
let expanded = false;
let pinned = false;
let sourceText = '';
let t = (k) => k;

const STRINGS = {
  zh: { idle: '移入即可翻译', working: '正在看', done: '', error: '出错', copied: '已复制', copy: '复制译文',
        why: '为什么这样说', hint: '移开自动收起', pinned: '已钉住', empty: '模型没有返回内容',
        translate: '译 → 英', proofread: '英文校对' },
  en: { idle: 'Hover to translate', working: 'Working', done: '', error: 'Error', copied: 'Copied', copy: 'Copy',
        why: 'Why it reads better', hint: 'Move away to collapse', pinned: 'Pinned', empty: 'The model returned nothing',
        translate: '→ EN', proofread: 'Polish' },
  vi: { idle: 'Di chuột vào để dịch', working: 'Đang xử lý', done: '', error: 'Lỗi', copied: 'Đã sao chép', copy: 'Sao chép',
        why: 'Vì sao nên viết vậy', hint: 'Di chuột ra để thu gọn', pinned: 'Đã ghim', empty: 'Mô hình không trả về nội dung',
        translate: '→ EN', proofread: 'Hiệu đính' },
  id: { idle: 'Arahkan kursor untuk menerjemahkan', working: 'Memproses', done: '', error: 'Error', copied: 'Tersalin', copy: 'Salin',
        why: 'Kenapa begini lebih baik', hint: 'Jauhkan kursor untuk menutup', pinned: 'Disematkan', empty: 'Model tidak mengembalikan apa pun',
        translate: '→ EN', proofread: 'Perbaiki' },
  th: { idle: 'เลื่อนเมาส์เข้ามาเพื่อแปล', working: 'กำลังทำงาน', done: '', error: 'ผิดพลาด', copied: 'คัดลอกแล้ว', copy: 'คัดลอก',
        why: 'ทำไมจึงดีกว่า', hint: 'เลื่อนเมาส์ออกเพื่อย่อ', pinned: 'ปักหมุดแล้ว', empty: 'โมเดลไม่ได้ส่งเนื้อหากลับมา',
        translate: '→ EN', proofread: 'ขัดเกลา' },
  ms: { idle: 'Halakan tetikus untuk terjemah', working: 'Memproses', done: '', error: 'Ralat', copied: 'Disalin', copy: 'Salin',
        why: 'Kenapa ini lebih baik', hint: 'Alihkan tetikus untuk tutup', pinned: 'Disemat', empty: 'Model tidak mengembalikan apa-apa',
        translate: '→ EN', proofread: 'Perhalus' },
};

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

// 两级结构：最浅的一级标题是一个方案，更深的是它的「为什么」。
// 模型不一定给「为什么」那级标题，所以还有一条兜底：方案内部第一条列表项
// 之前是句子，从它开始都是理由。
function parseVariants(md) {
  const lines = md.split('\n').map((ln) => ln.replace(/^\s*```\w*\s*$/, ''));
  const HEAD = /^(#{1,6})\s*(.+?)\s*$/;

  let top = 7;
  for (const line of lines) {
    const h = line.match(HEAD);
    if (h) top = Math.min(top, h[1].length);
  }

  const out = [];
  let cur = null;
  let inWhy = false;
  for (const line of lines) {
    const h = line.match(HEAD);
    if (h) {
      if (h[1].length > top) inWhy = true;
      else { cur = { tone: h[2], text: [], why: [] }; out.push(cur); inWhy = false; }
    } else if (cur) {
      (inWhy ? cur.why : cur.text).push(line);
    }
  }

  const BULLET = /^\s*(?:[-*+•]|\d+[.)])\s+/;
  for (const v of out) {
    if (v.why.length) continue;
    const i = v.text.findIndex((l) => BULLET.test(l));
    if (i > 0) { v.why = v.text.slice(i); v.text = v.text.slice(0, i); }
  }
  return out.map((v) => ({ tone: v.tone, text: v.text.join('\n').trim(), why: v.why }));
}

// 「为什么」里已经用 **粗体** 标出了改成的说法。把这些词在主句里也高亮，
// 一眼就能看出这句话动了哪儿 —— 这是 PhrasePeek 那种「关键词着色」的做法。
function highlight(sentence, why) {
  const marks = [];
  for (const line of why) {
    for (const m of line.matchAll(/\*\*(.+?)\*\*/g)) {
      const w = m[1].trim();
      if (w.length >= 2 && w.length <= 60) marks.push(w);
    }
  }
  let html = esc(sentence);
  // 长的先替换，避免短词把长短语切碎
  for (const w of [...new Set(marks)].sort((a, b) => b.length - a.length)) {
    const safe = esc(w).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    html = html.replace(new RegExp(`(?<!<em>)${safe}`, 'g'), `<em>${esc(w)}</em>`);
  }
  return html;
}

function renderWhy(lines) {
  const BULLET = /^\s*(?:[-*+•]|\d+[.)])\s+(.*)$/;
  return lines
    .map((l) => {
      const m = l.match(BULLET);
      const body = m ? m[1] : l;
      return body.trim() ? `<p>${inline(body)}</p>` : '';
    })
    .join('');
}

/* ---------------- 悬停进度 ---------------- */

function startDwell(ms) {
  clearTimeout(dwellTimer);
  pillEl.classList.add('dwelling');
  progressFill.style.transition = 'none';
  progressFill.style.width = '0%';
  void progressFill.offsetWidth;                  // 强制回流，否则不会从 0 开始跑
  progressFill.style.transition = `width ${ms}ms linear`;
  progressFill.style.width = '100%';
}

function cancelDwell() {
  clearTimeout(dwellTimer);
  // 中途移开：快速收回去，别停在半截上
  progressFill.style.transition = 'width 180ms ease-out';
  progressFill.style.width = '0%';
  dwellTimer = setTimeout(() => pillEl.classList.remove('dwelling'), 180);
}

/* ---------------- 渲染 ---------------- */

function paint(streaming) {
  variants = parseVariants(raw);
  if (chosen >= variants.length) chosen = 0;

  const v = variants[chosen];
  const sentence = v ? v.text : '';

  // 收起态：只露一小截，很淡
  peek.textContent = sentence.replace(/\n/g, ' ');

  if (!variants.length) {
    headline.innerHTML = raw.trim()
      ? esc(raw.trim())                      // 模型没按结构输出，原样显示
      : (streaming ? '' : esc(t('empty')));
    tonesEl.innerHTML = '';
    whyWrap.hidden = true;
    return;
  }

  headline.innerHTML = highlight(sentence, v.why);
  // 字号随长度自适应：一句话就给足气势，一整段就退到能读下去的尺寸，
  // 否则长文本会把下面的东西全顶出可视区。
  const n = sentence.length;
  headline.className =
    'headline' + (n > 320 ? ' len-xl' : n > 180 ? ' len-l' : n > 90 ? ' len-m' : '');
  sourceEl.textContent = sourceText;

  // 语气切换：纯文字
  tonesEl.innerHTML = variants
    .map((x, i) => `<button class="tone${i === chosen ? ' on' : ''}" data-i="${i}">${esc(x.tone)}</button>`)
    .join('');

  const why = renderWhy(v.why);
  whyWrap.hidden = !why;
  whyLabel.textContent = t('why');
  whyEl.innerHTML = why;
}

/* ---------------- 交互 ---------------- */

document.addEventListener('click', (e) => {
  const tone = e.target.closest('.tone');
  if (tone) {
    e.stopPropagation();
    chosen = Number(tone.dataset.i);
    paint(false);
    return;
  }
  if (e.target.closest('#btn-copy')) {
    e.stopPropagation();
    const txt = variants[chosen] ? variants[chosen].text : raw.trim();
    if (txt) { window.pill.copy(txt); hint.textContent = t('copied'); }
    return;
  }
  if (e.target.closest('#btn-close')) { e.stopPropagation(); window.pill.close(); return; }
  window.pill.click();   // 点其它地方 = 钉住 / 取消钉住
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') window.pill.close();
});

/* ---------------- 主进程事件 ---------------- */

window.pill.onExpanded((v) => {
  expanded = !!v;
  pillEl.classList.toggle('expanded', expanded);
  pillEl.classList.toggle('collapsed', !expanded);
});

window.pill.onPinned((v) => {
  pinned = !!v;
  pillEl.classList.toggle('pinned', pinned);
  hint.textContent = pinned ? t('pinned') : t('hint');
});

window.pill.onDwell((ms) => startDwell(ms));
window.pill.onDwellCancel(() => cancelDwell());

window.pill.onStart(({ language, mode, source }) => {
  const s = STRINGS[language] || STRINGS.zh;
  t = (k) => (s[k] !== undefined ? s[k] : k);

  raw = '';
  variants = [];
  chosen = 0;
  sourceText = source || '';

  directionEl.textContent = t(mode === 'proofread' ? 'proofread' : 'translate');
  headline.innerHTML = '';
  sourceEl.textContent = '';
  tonesEl.innerHTML = '';
  whyWrap.hidden = true;
  peek.textContent = '';
  hint.textContent = t('hint');
  btnCopy.textContent = t('copy');
  dot.className = 'dot working';
  pillEl.classList.add('working');
  pillEl.classList.remove('pinned');
  pinned = false;
  waitingEl.textContent = t('working');
});

window.pill.onDelta((d) => { raw += d; paint(true); });

window.pill.onDone(() => {
  dot.className = 'dot';
  pillEl.classList.remove('working');
  paint(false);
});

window.pill.onError((msg) => {
  dot.className = 'dot error';
  pillEl.classList.remove('working');
  headline.innerHTML = `<span style="font-size:14px">${esc(msg)}</span>`;
  sourceEl.textContent = '';
  tonesEl.innerHTML = '';
  whyWrap.hidden = true;
  peek.textContent = t('error');
});
