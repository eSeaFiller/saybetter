'use strict';

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];
const MODE_NAMES = { default: '默认', formal: '专业', casual: '轻松', concise: '简洁', learning: '学习', custom: '自定义' };
const TARGET_LANGUAGE_NAMES = { en: '英语', fr: '法语', de: '德语', ja: '日语' };
const STANDARD_MODES = new Set(['default', 'formal', 'casual', 'concise']);
const BUNDLED_MODES = new Set(['default', 'formal', 'casual', 'concise', 'learning']);

let config;
let mode = 'default';
let raw = '';
let bundleRaw = '';
let cleanOutput = '';
let running = false;
let runningBundle = false;
let sources = [];
let modeBaselines = new Map();

function escapeHTML(value) {
  return String(value || '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
}

function inlineMarkdown(value) {
  return escapeHTML(value)
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

function sharedTokenSequence(values) {
  return values.map(lexicalKeys).reduce((common, value) => lcs(common, value));
}

function highlightAgainstSharedSequence(value, shared) {
  let sharedIndex = 0;
  return tokenize(value).map((token) => {
    const key = tokenKey(token);
    const html = inlineMarkdown(token);
    if (!key) return html;
    if (key === shared[sharedIndex]) { sharedIndex += 1; return html; }
    return `<span class="mode-diff">${html}</span>`;
  }).join('');
}

function highlightDifferences(value, baseline) {
  const reference = new Set(tokenize(baseline).map(tokenKey).filter(Boolean));
  if (!reference.size) return inlineMarkdown(value);
  return tokenize(value).map((token) => {
    const key = tokenKey(token);
    const html = inlineMarkdown(token);
    return key && !reference.has(key) ? `<span class="mode-diff">${html}</span>` : html;
  }).join('');
}

function sectionForMode(markdown, selectedMode) {
  const clean = String(markdown || '').replace(/<!--\s*NEWS_QUERY[\s\S]*?-->/gi, '');
  const marker = /^\s{0,3}#{1,4}\s+(?:MODE\s*[:：-]\s*)?(default|formal|casual|concise|learning)\s*$/gim;
  const sections = [...clean.matchAll(marker)];
  const index = sections.findIndex((entry) => entry[1].toLowerCase() === selectedMode);
  if (index < 0) return sections.length ? '' : clean.trim();
  const start = sections[index].index + sections[index][0].length;
  const end = sections[index + 1]?.index ?? clean.length;
  return clean.slice(start, end).trim();
}

function standardPrimaries(markdown) {
  return [...STANDARD_MODES].map((itemMode) => extractPrimary(sectionForMode(markdown, itemMode), itemMode)).filter(Boolean);
}

function commonTokenKeys(values) {
  return new Set(sharedTokenSequence(values));
}

function highlightModeDifferences(value, values) {
  return highlightAgainstSharedSequence(value, sharedTokenSequence(values));
}

function renderMarkdown(markdown) {
  const sanitized = String(markdown || '').replace(/<!--\s*NEWS_QUERY[\s\S]*?-->/gi, '').trim();
  const primary = extractPrimary(sanitized, mode);
  const bundleValues = bundleRaw && STANDARD_MODES.has(mode) ? standardPrimaries(bundleRaw) : [];
  const baseline = STANDARD_MODES.has(mode) && mode !== 'default' ? modeBaselines.get('default') : '';
  const lines = sanitized.split(/\r?\n/);
  const html = [];
  let listOpen = false;
  for (const line of lines) {
    const heading = line.match(/^#{1,6}\s+(.+)$/);
    const bullet = line.match(/^\s*[-*•]\s+(.+)$/);
    const grammarLine = line.match(/^\s*\[(?:SUBJECT|PREDICATE|OBJECT)\]/);
    if (heading) {
      if (listOpen) { html.push('</ul>'); listOpen = false; }
      html.push(`<h3>${inlineMarkdown(heading[1])}</h3>`);
    } else if (grammarLine) {
      if (listOpen) { html.push('</ul>'); listOpen = false; }
      html.push(`<p class="grammar-sentence">${inlineMarkdown(line.trim())}</p>`);
    } else if (bullet) {
      if (!listOpen) { html.push('<ul>'); listOpen = true; }
      html.push(`<li>${inlineMarkdown(bullet[1])}</li>`);
    } else if (line.trim()) {
      if (listOpen) { html.push('</ul>'); listOpen = false; }
      const content = line.trim() === primary && bundleValues.length === 4
        ? highlightModeDifferences(line.trim(), bundleValues)
        : line.trim() === primary && baseline
          ? highlightDifferences(line.trim(), baseline)
          : inlineMarkdown(line.trim());
      html.push(`<p>${content}</p>`);
    }
  }
  if (listOpen) html.push('</ul>');
  return html.join('');
}

function extractPrimary(markdown, selectedMode = mode) {
  const clean = String(markdown || '').replace(/<!--\s*NEWS_QUERY[\s\S]*?-->/gi, '').trim();
  const targetHeading = selectedMode === 'learning' ? '自然表达' : selectedMode === 'custom' ? '' : '优化表达';
  const sections = [...clean.matchAll(/^#{1,6}\s+(.+)\n([\s\S]*?)(?=^#{1,6}\s+|$)/gm)];
  const target = targetHeading ? sections.find((match) => match[1].trim().includes(targetHeading)) : sections[0];
  if (target) return target[2].replace(/^[-*•]\s+/gm, '').trim();
  const fallback = sections[0]?.[2] || clean;
  return fallback.replace(/^[-*•]\s+/gm, '').trim();
}

function setView(name) {
  $$('.view').forEach((view) => { view.hidden = view.id !== `view-${name}`; });
  if (name === 'settings') fillSettings();
  if (name === 'favorites') renderFavorites();
  if (name === 'about' && config) $('#version-line').textContent = `Version ${config.version}`;
  if (name === 'translate') setTimeout(() => $('#input').focus(), 40);
}

function setMode(next) {
  mode = next;
  if (bundleRaw && BUNDLED_MODES.has(next)) {
    raw = sectionForMode(bundleRaw, next);
    renderResult();
    renderSources();
    $('#result-actions').hidden = !cleanOutput;
  }
  $$('.mode').forEach((button) => button.classList.toggle('on', button.dataset.mode === next));
  $('#custom-prompt-panel').hidden = next !== 'custom';
  const target = TARGET_LANGUAGE_NAMES[$('#target-language')?.value || config?.targetLanguage || 'en'] || '英语';
  $('#empty-detail').textContent = next === 'learning'
    ? `学习模式会拆解主谓宾，并检索可核验的${target}新闻标题原文。`
    : next === 'custom'
      ? `自定义模式会严格按你填写的 Prompt 处理，并默认输出${target}。`
      : STANDARD_MODES.has(next) && next !== 'default'
        ? `输出${target}；完成默认模式后，会用橙色标出相对默认表达变化的词汇。`
        : `自动检测源语言并输出${target}。`;
}

function setRunning(value) {
  running = value;
  $('#btn-run').disabled = value;
  $('#empty-state').hidden = value || Boolean(raw);
  $('#loading-state').hidden = !value;
  $('#result-content').hidden = !raw;
  $('#result-actions').hidden = value || !raw;
}

function renderResult() {
  cleanOutput = String(raw || '').replace(/<!--\s*NEWS_QUERY[\s\S]*?-->/gi, '').trim();
  if (STANDARD_MODES.has(mode) && mode !== 'default') {
    const key = `${$('#target-language').value}\n${$('#input').value.trim()}`;
    const baseline = modeBaselines.get(key);
    if (baseline) modeBaselines.set('default', baseline);
  }
  $('#result-content').innerHTML = renderMarkdown(raw);
  $('#result-content').hidden = !cleanOutput;
  $('#empty-state').hidden = Boolean(cleanOutput) || running;
}

function renderSources() {
  const section = $('#source-section');
  const list = $('#source-list');
  if (mode !== 'learning') { section.hidden = true; return; }
  section.hidden = false;
  if (!sources.length) {
    list.innerHTML = '<p class="source-empty">暂未找到足够匹配、可核验的公开新闻标题。自然表达仍可使用，但不会伪造出处。</p>';
    return;
  }
  list.innerHTML = sources.map((item, index) => `
    <button class="source-card" data-source="${index}">
      <strong>${escapeHTML(item.title)}</strong>
      <small>${escapeHTML(item.source || '公开新闻来源')}${item.publishedAt ? ` · ${escapeHTML(new Date(item.publishedAt).toLocaleDateString())}` : ''}</small>
    </button>`).join('');
}

async function run() {
  const text = $('#input').value.trim();
  if (!text || running) return;
  const customPrompt = $('#custom-prompt').value.trim();
  const targetLanguage = $('#target-language').value;
  if (mode === 'custom' && !customPrompt) {
    $('#custom-prompt').focus();
    $('#status').textContent = '请先填写自定义 Prompt';
    return;
  }
  bundleRaw = '';
  raw = '';
  cleanOutput = '';
  sources = [];
  runningBundle = BUNDLED_MODES.has(mode);
  $('#status').textContent = '';
  $('#source-section').hidden = true;
  setRunning(true);
  $('#loading-text').textContent = mode === 'learning' ? '正在生成五种表达并拆解句式…' : '正在生成五种表达…';
  const result = await window.api.run(text, mode, customPrompt, targetLanguage, false, runningBundle);
  if (!result?.ok && !result?.canceled) {
    $('#status').textContent = result?.error || '请求失败';
    setRunning(false);
  }
}

function providerChanged() {
  const preset = (config?.presets || []).find((item) => item.id === $('#f-provider').value);
  if (!preset) return;
  $('#f-baseurl').placeholder = preset.baseUrl || 'https://api.example.com/v1';
  if (!$('#f-baseurl').value || $('#f-baseurl').dataset.autofill === '1') {
    $('#f-baseurl').value = preset.baseUrl || '';
    $('#f-baseurl').dataset.autofill = '1';
  }
  const modelList = $('#model-list');
  modelList.innerHTML = (preset.models || []).map((model) => `<option value="${escapeHTML(model)}"></option>`).join('');
  if ((!$('#f-model').value || $('#f-model').dataset.autofill === '1') && preset.models?.[0]) {
    $('#f-model').value = preset.models[0];
    $('#f-model').dataset.autofill = '1';
  }
  $('#provider-hint').textContent = preset.keyHint || '';
}

function fillSettings() {
  if (!config) return;
  $('#f-provider').innerHTML = config.presets.map((item) => `<option value="${escapeHTML(item.id)}">${escapeHTML(item.label)}</option>`).join('');
  $('#f-provider').value = config.providerId;
  $('#f-baseurl').value = config.baseUrl || (config.presets.find((item) => item.id === config.providerId)?.baseUrl || '');
  $('#f-model').value = config.model || '';
  $('#f-key').value = config.apiKey || '';
  $('#f-language').value = config.language || 'zh';
  $('#f-appearance').value = config.appearance || 'system';
  $('#custom-prompt').value = config.customPrompt || '';
  $('#f-baseurl').dataset.autofill = '0';
  $('#f-model').dataset.autofill = '0';
  providerChanged();
}

async function saveSettings() {
  config = await window.api.setConfig({
    providerId: $('#f-provider').value,
    baseUrl: $('#f-baseurl').value.trim(),
    model: $('#f-model').value.trim(),
    apiKey: $('#f-key').value.trim(),
    language: $('#f-language').value,
    appearance: $('#f-appearance').value,
    pillMode: config.pillMode || 'default',
    targetLanguage: $('#target-language').value,
    customPrompt: $('#custom-prompt').value.trim(),
  });
  $('#provider-hint').textContent = '已保存';
  setTimeout(() => setView('translate'), 350);
}

async function renderFavorites() {
  const rows = await window.api.listFavorites();
  const list = $('#favorites-list');
  if (!rows.length) {
    list.innerHTML = '<div class="no-favorites">还没有收藏。生成结果后点“收藏”即可加入。</div>';
    return;
  }
  list.innerHTML = rows.map((item) => `
    <article class="favorite-card">
      <div class="favorite-meta"><span>${escapeHTML(MODE_NAMES[item.mode] || item.mode)}</span><time>${escapeHTML(new Date(item.createdAt).toLocaleString())}</time></div>
      <p class="favorite-output">${escapeHTML(item.output)}</p>
      <p class="favorite-source">原文：${escapeHTML(item.source)}</p>
      <div class="favorite-actions"><button class="delete-button" data-delete="${escapeHTML(item.id)}">删除</button></div>
    </article>`).join('');
}

async function addFavorite() {
  const output = extractPrimary(raw);
  if (!output) return;
  await window.api.addFavorite({ mode, source: $('#input').value.trim(), output, sources });
  $('#status').textContent = '已收藏到本机';
  $('#btn-favorite').textContent = '已收藏';
  setTimeout(() => { $('#btn-favorite').textContent = '收藏'; }, 1100);
}

function setMenuOpen(value) {
  $('#app-menu').hidden = !value;
  $('#btn-settings').classList.toggle('open', value);
}

function appearanceLabel(value) {
  return ({ system: '跟随系统', light: '浅色', dark: '深色' })[value] || '跟随系统';
}

async function cycleAppearance() {
  const next = ({ system: 'light', light: 'dark', dark: 'system' })[config.appearance || 'system'];
  config = await window.api.setConfig({ ...config, appearance: next, targetLanguage: $('#target-language').value });
  $('#menu-appearance-label').textContent = appearanceLabel(config.appearance);
  setMenuOpen(false);
}

function wireEvents() {
  $('#btn-settings').addEventListener('click', (event) => { event.stopPropagation(); setMenuOpen($('#app-menu').hidden); });
  $('#app-menu').addEventListener('click', (event) => event.stopPropagation());
  $('#menu-target-language').addEventListener('change', async () => {
    const target = $('#menu-target-language').value;
    $('#target-language').value = target;
    modeBaselines.clear();
    setMode(mode);
    if (config) config = await window.api.setConfig({ ...config, targetLanguage: target });
  });
  document.addEventListener('click', () => setMenuOpen(false));
  $$('[data-menu-view]').forEach((button) => button.addEventListener('click', () => { setMenuOpen(false); setView(button.dataset.menuView); }));
  $('[data-menu-appearance]').addEventListener('click', cycleAppearance);
  $('#menu-feedback').addEventListener('click', () => { setMenuOpen(false); window.api.openExternal('mailto:xujianghao02@gmail.com?subject=Saybetter-A lingoisland%20Feedback'); });
  $('#btn-enter').addEventListener('click', () => setView('translate'));
  $('#btn-intro-settings').addEventListener('click', () => setView('settings'));
  $$('[data-go]').forEach((button) => button.addEventListener('click', () => setView(button.dataset.go)));
  $$('.mode').forEach((button) => button.addEventListener('click', () => setMode(button.dataset.mode)));
  $('#target-language').addEventListener('change', async () => {
    const target = $('#target-language').value;
    $('#menu-target-language').value = target;
    modeBaselines.clear();
    setMode(mode);
    if (config) config = await window.api.setConfig({ ...config, targetLanguage: target });
  });
  $('#custom-prompt').addEventListener('change', async () => {
    if (!config) return;
    config = await window.api.setConfig({ ...config, customPrompt: $('#custom-prompt').value.trim() });
  });
  $('#input').addEventListener('input', () => { $('#char-count').textContent = `${$('#input').value.length} / 5000`; });
  $('#input').addEventListener('keydown', (event) => { if (event.key === 'Enter' && event.metaKey) { event.preventDefault(); run(); } });
  $('#btn-run').addEventListener('click', run);
  $('#btn-copy').addEventListener('click', async () => {
    const text = extractPrimary(raw);
    if (text) { await window.api.copy(text); $('#status').textContent = '已复制'; }
  });
  $('#btn-favorite').addEventListener('click', addFavorite);
  $('#f-provider').addEventListener('change', () => {
    $('#f-baseurl').dataset.autofill = '1'; $('#f-model').dataset.autofill = '1'; providerChanged();
  });
  $('#f-baseurl').addEventListener('input', () => { $('#f-baseurl').dataset.autofill = '0'; });
  $('#f-model').addEventListener('input', () => { $('#f-model').dataset.autofill = '0'; });
  $('#btn-save-settings').addEventListener('click', saveSettings);
  $('#btn-export').addEventListener('click', async () => {
    const result = await window.api.exportFavorites();
    if (result?.ok) $('#btn-export').textContent = '已导出';
  });
  $('#favorites-list').addEventListener('click', async (event) => {
    const button = event.target.closest('[data-delete]');
    if (button) { await window.api.removeFavorite(button.dataset.delete); renderFavorites(); }
  });
  $('#source-list').addEventListener('click', (event) => {
    const button = event.target.closest('[data-source]');
    const item = button ? sources[Number(button.dataset.source)] : null;
    if (item?.url) window.api.openExternal(item.url);
  });
  $('#btn-repository').addEventListener('click', () => window.api.openExternal(`https://github.com/${config.repository}`));
  $('#btn-feedback').addEventListener('click', () => window.api.openExternal('mailto:xujianghao02@gmail.com?subject=Saybetter-A lingoisland%20Feedback'));
}

window.api.onView((view) => setView(view));
window.api.onConfigChanged((next) => {
  config = next;
  if ($('#target-language')) $('#target-language').value = next.targetLanguage || 'en';
  if ($('#menu-target-language')) $('#menu-target-language').value = next.targetLanguage || 'en';
  if ($('#menu-appearance-label')) $('#menu-appearance-label').textContent = appearanceLabel(next.appearance);
});
window.api.onDelta((chunk) => {
  if (runningBundle) {
    bundleRaw += chunk;
    raw = sectionForMode(bundleRaw, mode);
  } else {
    raw += chunk;
  }
  setRunning(false);
  renderResult();
  $('#result-actions').hidden = true;
});
window.api.onDone((payload) => {
  sources = payload?.sources || [];
  if (runningBundle) {
    raw = sectionForMode(bundleRaw, mode);
  } else if (mode === 'default') {
    const key = `${$('#target-language').value}\n${$('#input').value.trim()}`;
    modeBaselines.set(key, extractPrimary(raw, 'default'));
  }
  runningBundle = false;
  setRunning(false);
  renderResult();
  renderSources();
  $('#result-actions').hidden = !cleanOutput;
  $('#status').textContent = mode === 'learning' && !sources.length ? '学习解析完成，未找到匹配来源' : '完成';
});
window.api.onError((message) => {
  setRunning(false);
  raw = `### 无法生成\n${message}`;
  renderResult();
  $('#result-actions').hidden = true;
  $('#status').textContent = '请检查 API 设置';
});
window.api.onExportDone((result) => { if (result?.ok) $('#status').textContent = '收藏已导出'; });

(async function init() {
  wireEvents();
  config = await window.api.getConfig();
  $('#version-line').textContent = `Version ${config.version}`;
  $('#custom-prompt').value = config.customPrompt || '';
  $('#target-language').value = config.targetLanguage || 'en';
  $('#menu-target-language').value = config.targetLanguage || 'en';
  $('#menu-appearance-label').textContent = appearanceLabel(config.appearance);
  setMode(config.pillMode || 'default');
  setView('intro');
})();
