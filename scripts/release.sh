#!/usr/bin/env bash
# 一条命令发一个版本，顺便保证 latest.json 和真实 Release 永远一致。
#   用法：scripts/release.sh 0.2.8 "这一版改了什么"
set -euo pipefail
cd "$(dirname "$0")/.."

VERSION="${1:?用法: scripts/release.sh <版本号> [说明]}"
NOTES="${2:-}"
DMG="dist/SayBetter-${VERSION}-arm64.dmg"
URL="https://github.com/eSeaFiller/saybetter/releases/download/v${VERSION}/SayBetter-${VERSION}-arm64.dmg"

# 1) 写版本号
node -e "
const fs=require('fs'); const p='package.json';
const d=JSON.parse(fs.readFileSync(p)); d.version='${VERSION}';
fs.writeFileSync(p, JSON.stringify(d,null,2)+'\n');
"

# 2) 打包前自检：运行时要加载的文件必须都在 files 白名单里
node -e "
const fs=require('fs');
const files=JSON.parse(fs.readFileSync('package.json')).build.files;
const need=new Set();
for (const f of ['main.js','providers.js','updater.js','preload.js','preload-pill.js']) {
  const s=fs.readFileSync(f,'utf8');
  for (const m of s.matchAll(/__dirname, '([^']+)'/g)) need.add(m[1]);
  for (const m of s.matchAll(/require\('\.\/([^']+)'\)/g)) need.add(m[1].endsWith('.js')?m[1]:m[1]+'.js');
}
const missing=[...need].filter(n=>!files.includes(n) && !files.includes(n.split('/')[0]+'/**'));
if (missing.length) { console.error('✗ 这些文件没进 files 白名单:', missing); process.exit(1); }
console.log('✓ 打包白名单完整');
"

# 3) 卸掉可能还挂着的旧 dmg 卷，否则 hdiutil 会失败
for v in /Volumes/SayBetter*; do [ -e "$v" ] && hdiutil detach "$v" -force >/dev/null 2>&1 || true; done

# 4) 打包
rm -rf dist/mac-arm64
npm run dist

# 5) latest.json 用真实的下载地址，杜绝和 Release 不同步
cat > latest.json <<JSON
{
  "version": "${VERSION}",
  "url": "${URL}",
  "notes": "${NOTES}"
}
JSON

# 6) 提交并发布
git add -A
git commit -m "发布 ${VERSION}${NOTES:+：${NOTES}}" || true
git push origin main
gh release create "v${VERSION}" "${DMG}" --title "SayBetter ${VERSION}" --notes "${NOTES:-见提交记录}"

# 7) 验一下更新检查真能查到这一版
sleep 3
node -e "
require('./updater.js').checkForUpdate('0.0.1').then(r => {
  if (!r) return console.error('✗ 更新检查查不到，检查 latest.json 是否已推上去');
  console.log('✓ 更新检查可用：', r.via, r.version, r.url);
});
"
echo "完成：https://github.com/eSeaFiller/saybetter/releases/tag/v${VERSION}"
