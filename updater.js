'use strict';

// 轻量更新检查：只问「有没有新版本」，不自己装。
//
// 为什么不用 electron-updater 的静默更新：macOS 上 Squirrel.Mac 会校验代码签名，
// 而我们目前是 adhoc 签名（没有 Apple Developer ID），装不上更新。等哪天有证书了，
// 把这个文件换成 electron-updater 即可，其余代码不用动。
//
// 为什么不直接查 GitHub API：api.github.com 对匿名请求限 60 次/小时，而且是按
// 出口 IP 算的。公司网络下几百号人共用一个出口 IP，额度早被别的工具用光，
// 实测直接 403。raw.githubusercontent.com 是 CDN，不受这个限制，所以主用它读
// 一个仓库里的 latest.json；API 只作为兜底。

const REPO = 'eSeaFiller/saybetter';
const BRANCH = 'main';
const FEED_RAW = `https://raw.githubusercontent.com/${REPO}/${BRANCH}/latest.json`;
const FEED_API = `https://api.github.com/repos/${REPO}/releases/latest`;
const CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000; // 6 小时

// "0.2.10" → [0, 2, 10]，非数字段一律当 0，避免字符串比较把 0.2.10 判成小于 0.2.9
function parseVersion(v) {
  return String(v || '')
    .replace(/^v/i, '')
    .split(/[.\-+]/)
    .map((n) => (/^\d+$/.test(n) ? Number(n) : 0));
}

function isNewer(remote, local) {
  const a = parseVersion(remote);
  const b = parseVersion(local);
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const x = a[i] || 0;
    const y = b[i] || 0;
    if (x !== y) return x > y;
  }
  return false;
}

async function getJson(url, headers = {}) {
  const res = await fetch(url, {
    headers: { 'user-agent': 'SayBetter', ...headers },
    signal: AbortSignal.timeout(8000),
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(String(res.status));
  return res.json();
}

// latest.json 长这样：{ "version": "0.2.8", "url": "https://…dmg", "notes": "…" }
async function fromRaw() {
  const j = await getJson(`${FEED_RAW}?t=${Date.now()}`); // 绕开 CDN 缓存
  const version = String(j.version || '').replace(/^v/i, '');
  if (!version) throw new Error('no version');
  return {
    version,
    url: j.url || `https://github.com/${REPO}/releases/latest`,
    notes: String(j.notes || '').slice(0, 400),
  };
}

async function fromApi() {
  const rel = await getJson(FEED_API, { accept: 'application/vnd.github+json' });
  if (!rel || rel.draft || rel.prerelease) throw new Error('not a release');
  const version = String(rel.tag_name || rel.name || '').replace(/^v/i, '');
  if (!version) throw new Error('no tag');
  const dmg = (rel.assets || []).find((a) => /\.dmg$/i.test(a.name || ''));
  return {
    version,
    url: dmg ? dmg.browser_download_url : rel.html_url,
    notes: String(rel.body || '').slice(0, 400),
  };
}

/**
 * 查一次最新版本。永远不抛异常 —— 更新检查失败绝不能影响主功能。
 * 返回 { hasUpdate, version, url, notes, via } 或 null（都查不到）。
 */
async function checkForUpdate(currentVersion) {
  for (const [via, fn] of [['raw', fromRaw], ['api', fromApi]]) {
    try {
      const r = await fn();
      return { ...r, via, hasUpdate: isNewer(r.version, currentVersion) };
    } catch {
      // 这一路不通就试下一路；两路都不通就返回 null，静默跳过
    }
  }
  return null;
}

module.exports = { checkForUpdate, isNewer, parseVersion, CHECK_INTERVAL_MS, REPO };
