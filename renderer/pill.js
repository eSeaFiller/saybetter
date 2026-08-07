'use strict';

const $ = (s) => document.querySelector(s);
const pillEl = $('#pill');
const dot = $('#dot');
const label = $('#label');
const peek = $('#peek');
const content = $('#content');
const btnCopy = $('#btn-copy');
const btnClose = $('#btn-close');
const hint = $('#hint');

let raw = '';
let fixedText = '';
let expanded = false;
let pinned = false;
let texts = [];        // 四种语气的正文
let chosen = 0;        // 当前选中哪一条（复制/摘要都跟着它）
const openWhy = new Set(); // 记住哪些「为什么」是展开的，免得重渲染时被收回去
let t = (k) => k;

const STRINGS = {
  zh: { working: '正在看…', done: '好了', error: '出错', copied: '已复制', copy: '复制', hint: '移开就自动收起', pinned: '已钉住，再点一下取消', close: '关闭', why: '为什么', empty: '模型没有返回内容' },
  en: { working: 'Working…', done: 'Ready', error: 'Error', copied: 'Copied', copy: 'Copy', hint: 'Move away to dismiss', pinned: 'Pinned — click again to release', close: 'Close', why: 'Why', empty: 'The model returned nothing' },
  vi: { working: 'Đang xử lý…', done: 'Xong', error: 'Lỗi', copied: 'Đã sao chép', copy: 'Sao chép', hint: 'Di chuột ra để đóng', pinned: 'Đã ghim — nhấp lại để bỏ', close: 'Đóng', why: 'Tại sao', empty: 'Mô hình không trả về nội dung' },
  id: { working: 'Memproses…', done: 'Siap', error: 'Error', copied: 'Tersalin', copy: 'Salin', hint: 'Jauhkan kursor untuk menutup', pinned: 'Disematkan — klik lagi untuk lepas', close: 'Tutup', why: 'Alasan', empty: 'Model tidak mengembalikan apa pun' },
  th: { working: 'กำลังทำงาน…', done: 'เสร็จแล้ว', error: 'ผิดพลาด', copied: 'คัดลอกแล้ว', copy: 'คัดลอก', hint: 'เลื่อนเมาส์ออกเพื่อปิด', pinned: 'ปักหมุดแล้ว — คลิกอีกครั้งเพื่อยกเลิก', close: 'ปิด', why: 'เหตุผล', empty: 'โมเดลไม่ได้ส่งเนื้อหากลับมา' },
  ms: { working: 'Memproses…', done: 'Siap', error: 'Ralat', copied: 'Disalin', copy: 'Salin', hint: 'Alihkan tetikus untuk tutup', pinned: 'Disemat — klik lagi untuk lepas', close: 'Tutup', why: 'Sebab', empty: 'Model tidak mengembalikan apa-apa' },
};

/* ---------------- 同一套极简 markdown（和主面板保持一致） ---------------- */

function esc(s) {
  return s.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
}
function inline(s) {
  return esc(s)
    .replace(/~~(.+?)~~/g, '<del>$1</del>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/`([^`]+)`/g, '<code>$1</code>');
}
// 浮窗的结构是两级：### 语气名 是一个方案，#### 为什么 是它下面的解释。
// 所以要按标题层级拆，不能像主面板那样一视同仁。
// 解析要宽容：模型偶尔会漏掉 # 后面的空格、多加一级、或者把整段包进代码块。
// 判定只看 # 的个数 —— 3 个（或更少）是一个方案，4 个（或更多）是它的「为什么」。
function parseVariants(md) {
  const lines = md.split('\n').map((ln) => ln.replace(/^\s*```\w*\s*$/, ''));
  const HEAD = /^(#{1,6})\s*(.+?)\s*$/;

  // 不写死「### 是方案、#### 是说明」——模型有时整体降一级或升一级。
  // 改成看相对层级：全文最浅的那一级就是方案，比它深的都是说明。
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
      if (h[1].length > top) {
        inWhy = true;
      } else {
        cur = { tone: h[2], text: [], why: [] };
        out.push(cur);
        inWhy = false;
      }
    } else if (cur) {
      (inWhy ? cur.why : cur.text).push(line);
    }
  }

  // 关键兜底：很多模型根本不输出「为什么」那一级小标题，而是把理由直接写成
  // 紧跟句子后面的一条条列表。那样理由会被并进正文气泡里，下拉就"消失"了。
  // 所以在一个方案内部再切一刀：第一条列表项之前是句子，从它开始都是理由。
  const BULLET = /^\s*(?:[-*+•]|\d+[.)])\s+/;
  for (const v of out) {
    if (v.why.length) continue;
    const i = v.text.findIndex((l) => BULLET.test(l));
    if (i > 0) {
      v.why = v.text.slice(i);
      v.text = v.text.slice(0, i);
    }
  }
  return out;
}
function renderBody(lines) {
  let html = '', inList = false;
  for (const line of lines) {
    // 各家模型用的项目符号五花八门：- * + • 还有 1. / 1)，都当列表处理，
    // 否则符号会被当成正文，跟渲染出来的圆点重复显示。
    const li = line.match(/^\s*(?:[-*+•]|\d+[.)])\s+(.*)$/);
    if (li) { if (!inList) { html += '<ul>'; inList = true; } html += `<li>${inline(li[1])}</li>`; }
    else { if (inList) { html += '</ul>'; inList = false; } if (line.trim()) html += `<p>${inline(line)}</p>`; }
  }
  if (inList) html += '</ul>';
  return html;
}

function render(streaming) {
  // 重渲染前先把「为什么」的开合状态从 DOM 上抄下来。
  // 不能依赖 toggle 事件 —— 它是异步派发的，流式更新会赶在它前面。
  content.querySelectorAll('.why').forEach((d) => {
    const i = Number(d.dataset.why);
    if (d.open) openWhy.add(i); else openWhy.delete(i);
  });

  const variants = parseVariants(raw);
  texts = variants.map((v) => v.text.join('\n').trim());
  fixedText = texts[0] || '';

  let html = '';
  variants.forEach((v, i) => {
    const body = v.text.join('\n').trim();
    const why = renderBody(v.why);
    const open = openWhy.has(i) ? ' open' : '';
    const selected = i === chosen ? ' selected' : '';
    html +=
      `<div class="variant${selected}" data-i="${i}">` +
        `<div class="v-head">` +
          `<span class="v-tone">${esc(v.tone)}</span>` +
          `<button class="v-copy" data-copy="${i}">${esc(t('copy'))}</button>` +
        `</div>` +
        `<div class="bubble">${inline(body).replace(/\n/g, '<br>')}</div>` +
        (why
          ? `<details class="why"${open} data-why="${i}">` +
              `<summary>${esc(t('why'))}</summary>` +
              `<div class="why-body">${why}</div>` +
            `</details>`
          : '') +
      `</div>`;
  });
  // 兜底：模型没按 ###/#### 的结构输出时，至少把原文照着画出来，
  // 绝不能出现「Ready 了但一片空白」。
  if (!variants.length && raw.trim()) {
    html = `<div class="bubble raw">${renderBody(raw.split('\n')) || esc(raw)}</div>`;
    texts = [raw.trim()];
    fixedText = raw.trim();
  }
  // 跑完了却连一个字都没有 —— 说明模型返回了空，得说出来而不是装作没事
  if (!streaming && !raw.trim()) {
    html = `<p class="dim-note">${esc(t('empty'))}</p>`;
  }

  if (streaming) html += '<span class="cursor"></span>';

  const keep = content.scrollTop;
  content.innerHTML = html;
  content.scrollTop = keep;

  // 收起态只露被选中那条的一小截
  peek.textContent = (texts[chosen] || texts[0] || '').replace(/\n/g, ' ');
}

/* ---------------- 展开 / 收起 ---------------- */
// 注意：这里不再自己判断 hover。macOS 上后台 app 的窗口收不到可靠的
// mouseenter/mouseleave，所以由主进程轮询真实光标位置后通知我们。

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

document.addEventListener('click', (e) => {
  if (e.target.closest('#btn-copy') || e.target.closest('#btn-close')) return;

  // 复制某一条
  const cp = e.target.closest('.v-copy');
  if (cp) {
    e.stopPropagation();
    const i = Number(cp.dataset.copy);
    chosen = i;
    if (texts[i]) { window.pill.copy(texts[i]); hint.textContent = t('copied'); }
    render(false);
    return;
  }

  // 点「为什么」只展开说明，别把整颗胶囊钉住
  if (e.target.closest('.why')) { e.stopPropagation(); return; }

  // 点某个方案 = 选中它（收起态摘要和 ⌘C 都跟着走）
  const v = e.target.closest('.variant');
  if (v) {
    e.stopPropagation();
    chosen = Number(v.dataset.i);
    render(false);
    if (!pinned) window.pill.click(); // 顺手钉住，方便继续挑
    return;
  }

  window.pill.click();
});

btnCopy.onclick = (e) => {
  e.stopPropagation();
  const txt = texts[chosen] || fixedText;
  if (!txt) return;
  window.pill.copy(txt);
  hint.textContent = t('copied');
};

btnClose.onclick = (e) => {
  e.stopPropagation();
  window.pill.close();
};

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') window.pill.close();
});

/* ---------------- 主进程事件 ---------------- */

window.pill.onStart(({ language }) => {
  const s = STRINGS[language] || STRINGS.zh;
  t = (k) => s[k] || k;
  raw = '';
  fixedText = '';
  content.innerHTML = '';
  peek.textContent = '';
  label.textContent = t('working');
  hint.textContent = t('hint');
  btnCopy.textContent = t('copy');
  dot.className = 'dot working';
  texts = [];
  chosen = 0;
  openWhy.clear();
  pinned = false;
  pillEl.classList.remove('pinned');
  btnClose.textContent = '✕';
});

window.pill.onDelta((d) => {
  raw += d;
  render(true);
});

window.pill.onDone(() => {
  dot.className = 'dot done';
  label.textContent = t('done');
  render(false);
});

window.pill.onError((msg) => {
  dot.className = 'dot error';
  label.textContent = t('error');
  peek.textContent = msg.slice(0, 60);
  content.innerHTML = `<p>${esc(msg)}</p>`;
});
