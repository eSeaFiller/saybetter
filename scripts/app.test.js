'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { PRESETS, streamCheck, systemPrompt } = require('../providers');

const root = path.join(__dirname, '..');

function sseResponse(payload) {
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`));
      controller.enqueue(encoder.encode('data: [DONE]\n\n'));
      controller.close();
    },
  });
  return { ok: true, status: 200, statusText: 'OK', body: stream };
}

test('ships six modes, custom prompt, and colored learning grammar protocol', () => {
  const standard = systemPrompt('zh', 'formal');
  const learning = systemPrompt('zh', 'learning');
  const custom = systemPrompt('zh', 'custom', 'Turn it into a friendly email.');
  assert.match(standard, /优化表达/);
  assert.match(learning, /句子骨架/);
  assert.match(learning, /主语（Subject）/);
  assert.match(learning, /谓语（Predicate）/);
  assert.match(learning, /宾语（Object）/);
  assert.match(learning, /\[SUBJECT\]/);
  assert.match(learning, /\[PREDICATE\]/);
  assert.match(learning, /\[OBJECT\]/);
  assert.match(learning, /NEWS_QUERY/);
  assert.match(custom, /Turn it into a friendly email/);
});

test('keeps the original four registers and supports four target languages', () => {
  const formal = systemPrompt('zh', 'formal', '', 'fr');
  const casual = systemPrompt('zh', 'casual', '', 'de');
  const concise = systemPrompt('zh', 'concise', '', 'ja');
  assert.match(formal, /French/);
  assert.match(formal, /client or senior colleague/);
  assert.match(casual, /German/);
  assert.match(casual, /message to a teammate/);
  assert.match(concise, /Japanese/);
  assert.match(concise, /Cut every word that earns nothing/);
});

test('includes in-app overflow menu, target selector, and orange mode diff styling', () => {
  const html = fs.readFileSync(path.join(root, 'renderer', 'index.html'), 'utf8');
  const js = fs.readFileSync(path.join(root, 'renderer', 'app.js'), 'utf8');
  const css = fs.readFileSync(path.join(root, 'renderer', 'style.css'), 'utf8');
  for (const target of ['en', 'fr', 'de', 'ja']) assert.match(html, new RegExp(`option value="${target}"`));
  for (const view of ['settings', 'favorites', 'about']) assert.match(html, new RegExp(`data-menu-view="${view}"`));
  assert.match(html, /data-menu-appearance/);
  assert.match(html, /menu-target-language/);
  assert.match(html, /menu-feedback/);
  assert.match(js, /highlightModeDifferences/);
  assert.match(js, /sharedTokenSequence/);
  assert.match(css, /\.mode-diff/);
  assert.match(css, /#c86a08/);
  const pillJs = fs.readFileSync(path.join(root, 'renderer', 'pill.js'), 'utf8');
  const pillCss = fs.readFileSync(path.join(root, 'renderer', 'pill.css'), 'utf8');
  assert.match(pillJs, /highlightModeDifferences/);
  assert.match(pillJs, /STANDARD_MODES\.includes\(mode\)/);
  assert.match(pillCss, /\.output \.mode-diff/);
});
test('creates one bundled clipboard request and keeps only the pill always-on-top', () => {
  const main = fs.readFileSync(path.join(root, 'main.js'), 'utf8');
  const providers = fs.readFileSync(path.join(root, 'providers.js'), 'utf8');
  const pill = fs.readFileSync(path.join(root, 'renderer', 'pill.js'), 'utf8');
  assert.match(main, /variant: 'pill-bundle'/);
  assert.match(main, /bundle \? 'pill-bundle' : 'main'/);
  assert.match(main, /pill:bundle-select/);
  assert.match(providers, /Produce FIVE complete views in one response/);
  assert.match(pill, /sectionForMode/);
  assert.match(pill, /const sections = \[\.\.\.clean\.matchAll\(marker\)\]/);
  assert.match(pill, /正在生成该模式的结果/);
  assert.doesNotMatch(main, /win\.setAlwaysOnTop\(true/);
  assert.match(main, /pillWin\.setAlwaysOnTop\(true/);
});

test('learning prompt requires target-language subject predicate and object', () => {
  const prompt = systemPrompt('zh', 'learning', '', 'ja');
  assert.match(prompt, /final Japanese sentence/);
  assert.match(prompt, /exact subject from the final Japanese sentence/);
  assert.match(prompt, /Do not use the source-language sentence/);
});
test('centers the pill below the notch and persists free dragging', () => {
  const main = fs.readFileSync(path.join(root, 'main.js'), 'utf8');
  const pillCss = fs.readFileSync(path.join(root, 'renderer', 'pill.css'), 'utf8');
  assert.match(main, /PILL_POSITION_PATH/);
  assert.match(main, /notchCenteredPosition/);
  assert.match(main, /bounds\.x \+ \(bounds\.width - width\) \/ 2/);
  assert.match(main, /pillWin\.on\('moved', savePillPosition\)/);
  assert.match(main, /pillPositionLocked/);
  assert.match(main, /writeJSON\(PILL_POSITION_PATH\(\), pillPosition\)/);
  assert.match(pillCss, /-webkit-app-region: drag/);
  assert.doesNotMatch(main, /process "SpaceWheel"/);
});

test('native status menu can pause clipboard reading without moving the L item', () => {
  const main = fs.readFileSync(path.join(root, 'main.js'), 'utf8');
  const swift = fs.readFileSync(path.join(root, 'native', 'LingoIslandStatus.swift'), 'utf8');
  assert.match(swift, /statusItem = NSStatusBar\.system\.statusItem\(withLength: 24\)/);
  assert.match(swift, /button\.title = "L"/);
  assert.match(swift, /暂停读取复制内容/);
  assert.match(swift, /恢复读取复制内容/);
  assert.match(swift, /clipboard:pause/);
  assert.match(swift, /clipboard:resume/);
  assert.match(main, /action === 'clipboard:pause' \|\| action === 'clipboard:resume'/);
  assert.match(main, /watchClipboard: action === 'clipboard:resume'/);
  assert.match(main, /stopClipboardWatch\(\)/);
  assert.match(main, /pillAbort\?\.abort\(\)/);
});
test('supports mainstream and custom API providers', () => {
  const ids = PRESETS.map((item) => item.id);
  for (const id of ['openai', 'anthropic', 'deepseek', 'moonshot', 'qwen', 'zhipu', 'ark', 'ollama', 'custom']) {
    assert.ok(ids.includes(id), `missing provider ${id}`);
  }
});

test('uses OpenAI-compatible endpoint and streams content', async () => {
  const originalFetch = global.fetch;
  const calls = [];
  global.fetch = async (url, options) => {
    calls.push({ url, options });
    return sseResponse({ choices: [{ delta: { content: 'Natural sentence.' } }] });
  };
  try {
    let output = '';
    const result = await streamCheck({
      config: { providerId: 'custom', baseUrl: 'https://example.com/v1/', model: 'model-a', apiKey: 'secret', language: 'zh' },
      text: 'hello', tone: 'default', signal: new AbortController().signal,
      onDelta: (piece) => { output += piece; },
    });
    assert.equal(result, 'Natural sentence.');
    assert.equal(output, 'Natural sentence.');
    assert.equal(calls[0].url, 'https://example.com/v1/chat/completions');
    assert.equal(calls[0].options.headers.authorization, 'Bearer secret');
  } finally { global.fetch = originalFetch; }
});

test('restores clipboard detection without registering a global shortcut', () => {
  const main = fs.readFileSync(path.join(root, 'main.js'), 'utf8');
  const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  assert.doesNotMatch(main, /globalShortcut/);
  assert.match(main, /watchClipboard/);
  assert.match(main, /clipboard\.readText\(\)/);
  assert.match(main, /runInPill/);
  assert.match(main, /startPillHoverWatch/);
  assert.match(main, /screen\.getCursorScreenPoint\(\)/);
  assert.match(main, /PILL_HOVER_POLL_MS/);
  assert.match(main, /PILL_COLLAPSE_DELAY_MS/);
  assert.match(main, /createPill/);
  assert.doesNotMatch(main, /new Tray\(nativeImage\.createEmpty\(\)\)/);
  assert.match(main, /startNativeStatusItem/);
  assert.match(main, /path\.join\(process\.resourcesPath, 'native', 'LingoIslandStatus'\)/);
  assert.match(main, /app\.setAsDefaultProtocolClient\('lingoisland'\)/);
  assert.match(main, /app\.on\('open-url'/);
  assert.match(main, /app\.setActivationPolicy\('regular'\)/);
  assert.equal(pkg.build.mac.extendInfo.LSUIElement, false);
  assert.equal(pkg.build.extraResources[0].to, 'native/LingoIslandStatus');
  assert.match(main, /tray\.on\('click', \(\) => tray\.popUpContextMenu\(\)\)/);
  assert.match(main, /打开 Saybetter-A lingoisland/);
  assert.match(main, /更换 API Key/);
});

test('release metadata and updater use the packaged DMG filename', () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  const latest = JSON.parse(fs.readFileSync(path.join(root, 'latest.json'), 'utf8'));
  const updater = fs.readFileSync(path.join(root, 'updater.js'), 'utf8');
  assert.equal(pkg.version, '0.8.1');
  assert.equal(latest.version, pkg.version);
  assert.match(latest.url, /Saybetter-A-lingoisland-0\.8\.1-arm64\.dmg$/);
  assert.match(updater, /Saybetter-A-lingoisland-\$\{version\}-arm64\.dmg/);
  assert.match(pkg.scripts.predist, /build:native/);
});

test('uses the Saybetter-A lingoisland brand with an absolutely centered logo lockup', () => {
  const html = fs.readFileSync(path.join(root, 'renderer', 'index.html'), 'utf8');
  const css = fs.readFileSync(path.join(root, 'renderer', 'style.css'), 'utf8');
  const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  assert.match(html, /Saybetter-A lingoisland/);
  assert.match(html, /logo-l\.png/);
  assert.match(css, /\.logo img, \.about-mark img/);
  assert.equal(pkg.version, '0.8.1');
  assert.equal(pkg.build.productName, 'Saybetter-A lingoisland');
  assert.equal(pkg.build.mac.artifactName, 'Saybetter-A-lingoisland-${version}-${arch}.${ext}');
});
test('removes the translucent outer frame from the main window', () => {
  const main = fs.readFileSync(path.join(root, 'main.js'), 'utf8');
  const css = fs.readFileSync(path.join(root, 'renderer', 'style.css'), 'utf8');
  assert.doesNotMatch(main, /vibrancy: 'under-window'/);
  assert.match(main, /backgroundColor: '#f7f7f9'/);
  assert.match(css, /--bg: #f7f7f9/);
  assert.match(css, /\.window-shell \{[\s\S]*?border: 0; border-radius: 0; background: var\(--bg\); box-shadow: none;/);
});

test('adds favorite action to the expanded pill result page', () => {
  const html = fs.readFileSync(path.join(root, 'renderer', 'pill.html'), 'utf8');
  const preload = fs.readFileSync(path.join(root, 'preload-pill.js'), 'utf8');
  const pill = fs.readFileSync(path.join(root, 'renderer', 'pill.js'), 'utf8');
  const main = fs.readFileSync(path.join(root, 'main.js'), 'utf8');
  assert.match(html, /id="btn-favorite"/);
  assert.match(preload, /pill:favorite/);
  assert.match(pill, /window\.pill\.favorite/);
  assert.match(main, /ipcMain\.handle\('pill:favorite'/);
  assert.match(pill, /已收藏到本机/);
});

test('includes requested menu pages and packages the clipboard island', () => {
  const html = fs.readFileSync(path.join(root, 'renderer', 'index.html'), 'utf8');
  const app = fs.readFileSync(path.join(root, 'renderer', 'app.js'), 'utf8');
  const pillCss = fs.readFileSync(path.join(root, 'renderer', 'pill.css'), 'utf8');
  const main = fs.readFileSync(path.join(root, 'main.js'), 'utf8');
  const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  for (const id of ['view-intro', 'view-translate', 'view-settings', 'view-favorites', 'view-about']) assert.match(html, new RegExp(id));
  for (const mode of ['default', 'formal', 'casual', 'concise', 'learning', 'custom']) assert.match(html, new RegExp(`data-mode="${mode}"`));
  assert.match(html, /版权与许可/);
  assert.match(html, /问题反馈/);
  assert.match(app, /exportFavorites/);
  assert.match(main, /backgroundColor: '#00000000'/);
  assert.match(main, /hasShadow: false/);
  assert.doesNotMatch(main, /vibrancy: 'popover'/);
  assert.match(pillCss, /body \{ padding: 0;/);
  assert.match(pillCss, /border-radius: 27px/);
  assert.ok(!pkg.build.files.includes('!renderer/pill.*'));
  assert.ok(pkg.build.files.includes('preload-pill.js'));
});
