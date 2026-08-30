'use strict';

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];
const MODES = ['default', 'formal', 'casual', 'concise', 'learning'];
const STANDARD_MODES = ['default', 'formal', 'casual', 'concise'];
const LANGUAGE_BADGES = { en: 'EN', fr: 'FR', de: 'DE', ja: 'JA' };
let raw = '';
let bundleRaw = '';
let expanded = false;
let mode = 'default';
let sourceText = '';
let sources = [];
let pointerInside = false;

function esc(value) {
  return String(value || '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
}

function inline(value) {
  return esc(value)
    .replace(/\[SUBJECT\]([\s\S]+?)\[\/SUBJECT\]/g, '<span class="grammar-subject">$1</span>')
    .replace(/\[PREDICATE\]([\s\S]+?)\[\/PREDICATE\]/g, '<span class="grammar-predicate">$1</span>')
    .replace(/\[OBJECT\]([\s\S]+?)\[\/OBJECT\]/g, '<span class="grammar-object">$1</span>')
    .replace(/~~(.+?)~~/g, '<del>$1</del>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/`(.+?)`/g, '<code>$1</code>');
}

function tokenKey(value) {
  return String(value || '').toLocaleLowerCase().replace(/[\p{P}\p{S}\s]+/gu, '');
}

function tokenize(value) {
  return String(value || '').match(/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]|[\p{L}\p{N}]+(?:['’\-][\p{L}\p{N}]+)*|[^\p{L}\p{N}\s]+|\s+/gu) || [];
}

function lexicalKeys(value) {
  return tokenize(value).map(tokenKey).filter(Boolean);
}

function lcs(left, right) {
  const rows = Array.from({ length: left.length + 1 }, () => new Uint16Array(right.length + 1));
  for (let i = left.length - 1; i >= 0; i -= 1) {
    for (let j = right.length - 1; j >= 0; j -= 1) {
      rows[i][j] = left[i] === right[j] ? rows[i + 1][j + 1] + 1 : Math.max(rows[i + 1][j], rows[i][j + 1]);
    }
  }
  const result = [];
  let i = 0;
  let j = 0;
  while (i < left.length && j < right.length) {
    if (left[i] === right[j]) { result.push(left[i]); i += 1; j += 1; }
    else if (rows[i + 1][j] >= rows[i][j + 1]) i += 1;
    else j += 1;
  }
  return result;
}

function highlightModeDifferences(value) {
  const values = STANDARD_MODES.map((itemMode) => extractPrimary(sectionForMode(bundleRaw, itemMode), itemMode)).filter(Boolean);
  if (values.length !== STANDARD_MODES.length) return inline(value);
  const shared = values.map(lexicalKeys).reduce((common, item) => lcs(common, item));
  let sharedIndex = 0;
  return tokenize(value).map((token) => {
    const key = tokenKey(token);
    const html = inline(token);
    if (!key) return html;
    if (key === shared[sharedIndex]) { sharedIndex += 1; return html; }
    return `<span class="mode-diff">${html}</span>`;
  }).join('');
}

function renderMarkdown(markdown) {
  const clean = String(markdown || '').replace(/<!--\s*NEWS_QUERY[\s\S]*?-->/gi, '');
  const primary = extractPrimary(clean, mode);
  const lines = clean.split(/\r?\n/);
  const html = [];
  let list = false;
  for (const line of lines) {
    const heading = line.match(/^#{1,6}\s+(.+)$/);
    const bullet = line.match(/^\s*[-*•]\s+(.+)$/);
    if (heading) {
      if (list) { html.push('</ul>'); list = false; }
      html.push(`<h3>${inline(heading[1])}</h3>`);
    } else if (bullet) {
      if (!list) { html.push('<ul>'); list = true; }
      html.push(`<li>${inline(bullet[1])}</li>`);
    } else if (line.trim()) {
      if (list) { html.push('</ul>'); list = false; }
      const content = STANDARD_MODES.includes(mode) && line.trim() === primary
        ? highlightModeDifferences(line.trim())
        : inline(line.trim());
      html.push(`<p>${content}</p>`);
    }
  }
  if (list) html.push('</ul>');
  return html.join('');
}

function extractPrimary(markdown, selectedMode = mode) {
  const targetHeading = selectedMode === 'learning' ? '自然表达' : '优化表达';
  const clean = String(markdown || '').replace(/<!--\s*NEWS_QUERY[\s\S]*?-->/gi, '');
  const matches = [...clean.matchAll(/^#{1,6}\s+(.+)\n([\s\S]*?)(?=^#{1,6}\s+|$)/gm)];
  const target = matches.find((match) => match[1].includes(targetHeading)) || matches[0];
  return (target?.[2] || clean).replace(/^[-*•]\s+/gm, '').replace(/\[(?:SUBJECT|PREDICATE|OBJECT)\]|\[\/(?:SUBJECT|PREDICATE|OBJECT)\]/g, '').trim();
}

function sectionForMode(markdown, selectedMode) {
  const clean = String(markdown || '').replace(/<!--\s*NEWS_QUERY[\s\S]*?-->/gi, '');
  const marker = /^\s{0,3}#{1,4}\s+(?:MODE\s*[:：-]\s*)?(default|formal|casual|concise|learning)\s*$/gim;
  const sections = [...clean.matchAll(marker)];
  const selectedIndex = sections.findIndex((entry) => entry[1].toLowerCase() === selectedMode);
  if (selectedIndex >= 0) {
    const start = sections[selectedIndex].index + sections[selectedIndex][0].length;
    const end = sections[selectedIndex + 1]?.index ?? clean.length;
    return clean.slice(start, end).trim();
  }
  if (sections.length) {
    // The chosen section has not arrived yet during streaming. Keep the panel in
    // a loading state rather than exposing internal MODE delimiters as content.
    return '';
  }
  return clean.trim();
}

function paint() {
  raw = bundleRaw ? sectionForMode(bundleRaw, mode) : raw;
  $('#output').innerHTML = raw ? renderMarkdown(raw) : '<p class="result-pending">正在生成该模式的结果…</p>';
  $('#preview').textContent = extractPrimary(raw).replace(/\s+/g, ' ') || '正在生成…';
}

function setMode(next, notify = true) {
  if (!MODES.includes(next)) return;
  mode = next;
  $('#btn-favorite').textContent = '收藏';
  $('#btn-favorite').classList.remove('saved');
  $$('.pill-mode').forEach((button) => button.classList.toggle('on', button.dataset.mode === next));
  if (bundleRaw) paint();
  if (notify) window.pill.setMode(next, '');
}

function expandNow() {
  pointerInside = true;
  window.pill.expand();
}

function notePointerLeave() {
  pointerInside = false;
}

$('#island').addEventListener('mouseenter', expandNow);
$('#island').addEventListener('mousemove', expandNow);
$('#island').addEventListener('mouseleave', notePointerLeave);
$('#btn-close').addEventListener('click', (event) => { event.stopPropagation(); window.pill.close(); });
$('#btn-copy').addEventListener('click', (event) => {
  event.stopPropagation();
  const text = extractPrimary(raw);
  if (text) { window.pill.copy(text); $('#status').textContent = '已复制'; }
});
$('#btn-favorite').addEventListener('click', async (event) => {
  event.stopPropagation();
  const output = extractPrimary(raw);
  if (!output) return;
  await window.pill.favorite({ mode, source: sourceText, output, sources });
  const button = $('#btn-favorite');
  button.textContent = '已收藏';
  button.classList.add('saved');
  $('#status').textContent = '已收藏到本机';
});
$$('.pill-mode').forEach((button) => button.addEventListener('click', (event) => {
  event.stopPropagation();
  setMode(button.dataset.mode);
}));

window.pill.onExpanded((value) => {
  expanded = Boolean(value);
  $('#island').classList.toggle('expanded', expanded);
  $('#island').classList.toggle('collapsed', !expanded);
});
window.pill.onStart((payload) => {
  raw = '';
  bundleRaw = '';
  sources = [];
  sourceText = payload?.source || '';
  setMode(payload?.mode || 'default', false);
  $('#source').textContent = sourceText;
  $('#pill-language').textContent = `→ ${LANGUAGE_BADGES[payload?.targetLanguage] || 'EN'}`;
  $('#preview').textContent = '正在生成…';
  $('#output').innerHTML = '';
  $('#pill-sources').hidden = true;
  $('#status').textContent = '生成中…';
  $('#btn-copy').disabled = true;
  $('#btn-favorite').disabled = true;
  $('#btn-favorite').textContent = '收藏';
  $('#btn-favorite').classList.remove('saved');
  $('#dot').className = 'dot working';
});
window.pill.onDelta((chunk) => { bundleRaw += chunk; paint(); });
window.pill.onBundleSelect((payload) => {
  mode = payload?.mode || mode;
  bundleRaw = payload?.output || bundleRaw;
  sources = payload?.sources || [];
  setMode(mode, false);
  paint();
  const sourceBox = $('#pill-sources');
  sourceBox.hidden = mode !== 'learning' || !sources.length;
  sourceBox.innerHTML = sources.slice(0, 2).map((item) => `<button class="pill-source" title="${esc(item.source || '')}">${esc(item.title)}</button>`).join('');
});
window.pill.onDone((payload) => {
  sources = payload?.sources || [];
  bundleRaw = payload?.output || bundleRaw;
  paint();
  $('#dot').className = 'dot';
  $('#status').textContent = '完成';
  $('#btn-copy').disabled = !extractPrimary(raw);
  $('#btn-favorite').disabled = !extractPrimary(raw);
  const sourceBox = $('#pill-sources');
  sourceBox.hidden = mode !== 'learning' || !sources.length;
  sourceBox.innerHTML = sources.slice(0, 2).map((item) => `<button class="pill-source" title="${esc(item.source || '')}">${esc(item.title)}</button>`).join('');
});
window.pill.onError((message) => {
  raw = `### 无法生成\n${message}`;
  paint();
  $('#dot').className = 'dot error';
  $('#status').textContent = '请检查 API 设置';
  $('#btn-copy').disabled = true;
  $('#btn-favorite').disabled = true;
});
