'use strict';

// 轻量更新检查：只问「有没有新版本」，不自己装。
//
// 为什么不用 electron-updater 的静默更新：macOS 上 Squirrel.Mac 会校验代码签名，
// 而我们目前是 adhoc 签名（没有 Apple Developer ID），装不上更新。等哪天有证书了，
// 把这个文件换成 electron-updater 即可，其余代码不用动。

const REPO = 'eSeaFiller/saybetter';
const FEED = `https://api.github.com/repos/${REPO}/releases/latest`;
const CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000; // 6 小时

// "0.2.7" → [0, 2, 7]，非数字段一律当 0，避免 NaN 比较出错
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

/**
 * 查一次最新发布版。永远不抛异常 —— 更新检查失败绝不能影响主功能。
 * 返回 { hasUpdate, version, url, notes } 或 null（查不到/网络不通）。
 */
async function checkForUpdate(currentVersion) {
  try {
    const res = await fetch(FEED, {
      headers: {
        accept: 'application/vnd.github+json',
        'user-agent': 'SayBetter',
      },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return null;
    const rel = await res.json();
    if (!rel || rel.draft || rel.prerelease) return null;

    const version = String(rel.tag_name || rel.name || '').replace(/^v/i, '');
    if (!version) return null;

    // 优先给出 dmg 的直链，没有就退回 release 页面
    const dmg = (rel.assets || []).find((a) => /\.dmg$/i.test(a.name || ''));
    return {
      hasUpdate: isNewer(version, currentVersion),
      version,
      url: dmg ? dmg.browser_download_url : rel.html_url,
      notes: String(rel.body || '').slice(0, 400),
    };
  } catch {
    return null; // 网络不通、超时、仓库还没建 —— 都静默跳过
  }
}

module.exports = { checkForUpdate, isNewer, parseVersion, CHECK_INTERVAL_MS, REPO };
