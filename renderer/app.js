'use strict';

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];
const { t, setLanguage, setText, matchesHeading } = window.i18n;
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
  const targetHeading = selectedMode === 'learning' ? 'headingNatural' : selectedMode === 'custom' ? '' : 'headingRewrite';
  const sections = [...clean.matchAll(/^#{1,6}\s+(.+)\n([\s\S]*?)(?=^#{1,6}\s+|$)/gm)];
  const target = targetHeading ? sections.find((match) => matchesHeading(match[1], targetHeading)) : sections[0];
  if (target) return target[2].replace(/^[-*•]\s+/gm, '').trim();
  const fallback = sections[0]?.[2] || clean;
  return fallback.replace(/^[-*•]\s+/gm, '').trim();
}

function setView(name) {
  $$('.view').forEach((view) => { view.hidden = view.id !== `view-${name}`; });
  if (name === 'settings') fillSettings();
  if (name === 'favorites') renderFavorites();
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
  renderModeDetail();
}

function renderModeDetail() {
  const target = t(`language_${$('#target-language').value || 'en'}`);
  const detail = mode === 'learning' || mode === 'custom' || mode === 'default' ? mode : 'compare';
  $('#empty-detail').textContent = t(`detail_${detail}`, { target });
}

function applyInterfaceLanguage() {
  setLanguage(config.language);
  $('#interface-language').value = config.language;
  $('#f-language').value = config.language;
  $('#version-line').textContent = t('version', { version: config.version });
  renderModeDetail();
  if (!$('#source-section').hidden) renderSources();
  if (!$('#view-favorites').hidden) renderFavorites();
  if (!$('#view-settings').hidden) renderProviderLabels();
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
    list.innerHTML = `<p class="source-empty">${t('noNews')}</p>`;
    return;
  }
  list.innerHTML = sources.map((item, index) => `
    <button class="source-card" data-source="${index}">
      <strong>${escapeHTML(item.title)}</strong>
      <small>${escapeHTML(item.source || t('newsSource'))}${item.publishedAt ? ` · ${escapeHTML(new Date(item.publishedAt).toLocaleDateString(document.documentElement.lang))}` : ''}</small>
    </button>`).join('');
}

async function run() {
  const text = $('#input').value.trim();
  if (!text || running) return;
  const customPrompt = $('#custom-prompt').value.trim();
  const targetLanguage = $('#target-language').value;
  if (mode === 'custom' && !customPrompt) {
    $('#custom-prompt').focus();
    setText($('#status'), 'customRequired');
    return;
  }
  bundleRaw = '';
  raw = '';
  cleanOutput = '';
  sources = [];
  runningBundle = BUNDLED_MODES.has(mode);
  $('#status').textContent = '';
  delete $('#status').dataset.i18n;
  $('#source-section').hidden = true;
  setRunning(true);
  setText($('#loading-text'), mode === 'learning' ? 'loadingLearning' : runningBundle ? 'loadingBundle' : 'loadingCustom');
  const result = await window.api.run(text, mode, customPrompt, targetLanguage, false, runningBundle);
  if (!result?.ok && !result?.canceled && running) {
    if (result?.error) $('#status').textContent = result.error;
    else setText($('#status'), 'requestFailed');
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
  renderProviderLabels();
}

function renderProviderLabels() {
  const select = $('#f-provider');
  const selected = select.value || config.providerId;
  select.replaceChildren(...config.presets.map((preset) => new Option(t(`provider_${preset.id}`, {}, preset.label), preset.id)));
  select.value = selected;
  const preset = config.presets.find((item) => item.id === selected);
  $('#provider-hint').textContent = preset ? t(`hint_${preset.id}`, {}, preset.keyHint || '') : '';
}

function fillSettings() {
  if (!config) return;
  renderProviderLabels();
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
    customPrompt: $('#custom-prompt').value.trim(),
  });
  applyInterfaceLanguage();
  $('#provider-hint').textContent = t('settingsSaved');
  setTimeout(() => setView('translate'), 350);
}

async function renderFavorites() {
  const rows = await window.api.listFavorites();
  const list = $('#favorites-list');
  if (!rows.length) {
    list.innerHTML = `<div class="no-favorites">${t('noFavorites')}</div>`;
    return;
  }
  list.innerHTML = rows.map((item) => `
    <article class="favorite-card">
      <div class="favorite-meta"><span>${escapeHTML(t(`mode_${item.mode}`, {}, item.mode))}</span><time>${escapeHTML(new Date(item.createdAt).toLocaleString(document.documentElement.lang))}</time></div>
      <p class="favorite-output">${escapeHTML(item.output)}</p>
      <p class="favorite-source">${t('original')} · ${escapeHTML(item.source)}</p>
      <div class="favorite-actions"><button class="delete-button" data-delete="${escapeHTML(item.id)}">${t('delete')}</button></div>
    </article>`).join('');
}

async function addFavorite() {
  const output = extractPrimary(raw);
  if (!output) return;
  await window.api.addFavorite({ mode, source: $('#input').value.trim(), output, sources });
  setText($('#status'), 'savedLocally');
  setText($('#btn-favorite'), 'favoriteSaved');
  setTimeout(() => { setText($('#btn-favorite'), 'favorite'); }, 1100);
}

function setMenuOpen(value) {
  $('#app-menu').hidden = !value;
  $('#btn-settings').classList.toggle('open', value);
}

function appearanceKey(value) {
  return `appearance_${value || 'system'}`;
}

async function cycleAppearance() {
  const next = ({ system: 'light', light: 'dark', dark: 'system' })[config.appearance || 'system'];
  config = await window.api.setConfig({ appearance: next });
  setText($('#menu-appearance-label'), appearanceKey(config.appearance));
  setMenuOpen(false);
}

function wireEvents() {
  $('#interface-language').addEventListener('change', async () => {
    config = await window.api.setConfig({ language: $('#interface-language').value });
    applyInterfaceLanguage();
  });
  $('#btn-settings').addEventListener('click', (event) => { event.stopPropagation(); setMenuOpen($('#app-menu').hidden); });
  $('#app-menu').addEventListener('click', (event) => event.stopPropagation());
  $('#menu-target-language').addEventListener('change', async () => {
    const target = $('#menu-target-language').value;
    $('#target-language').value = target;
    modeBaselines.clear();
    setMode(mode);
    if (config) config = await window.api.setConfig({ targetLanguage: target });
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
    if (config) config = await window.api.setConfig({ targetLanguage: target });
  });
  $('#custom-prompt').addEventListener('change', async () => {
    if (!config) return;
    config = await window.api.setConfig({ customPrompt: $('#custom-prompt').value.trim() });
  });
  $('#input').addEventListener('input', () => { $('#char-count').textContent = `${$('#input').value.length} / 5000`; });
  $('#input').addEventListener('keydown', (event) => { if (event.key === 'Enter' && event.metaKey) { event.preventDefault(); run(); } });
  $('#btn-run').addEventListener('click', run);
  $('#btn-copy').addEventListener('click', async () => {
    const text = extractPrimary(raw);
    if (text) { await window.api.copy(text); setText($('#status'), 'copied'); }
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
    if (result?.ok) setText($('#btn-export'), 'exported');
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
  const languageChanged = config?.language !== next.language;
  config = next;
  if (languageChanged) applyInterfaceLanguage();
  if ($('#target-language')) $('#target-language').value = next.targetLanguage || 'en';
  if ($('#menu-target-language')) $('#menu-target-language').value = next.targetLanguage || 'en';
  if ($('#menu-appearance-label')) setText($('#menu-appearance-label'), appearanceKey(next.appearance));
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
  setText($('#status'), mode === 'learning' && !sources.length ? 'learningDone' : 'done');
});
window.api.onError((message) => {
  setRunning(false);
  raw = `### ${t('generationFailed')}\n${message}`;
  renderResult();
  $('#result-actions').hidden = true;
  setText($('#status'), 'checkSettings');
});
window.api.onExportDone((result) => { if (result?.ok) setText($('#status'), 'favoritesExported'); });

(async function init() {
  wireEvents();
  config = await window.api.getConfig();
  applyInterfaceLanguage();
  $('#custom-prompt').value = config.customPrompt || '';
  $('#target-language').value = config.targetLanguage || 'en';
  $('#menu-target-language').value = config.targetLanguage || 'en';
  setText($('#menu-appearance-label'), appearanceKey(config.appearance));
  setMode(config.pillMode || 'default');
  setView('intro');
})();
