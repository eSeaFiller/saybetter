# SayBetter

macOS 菜单栏常驻的小工具。按一下全局快捷键，粘贴一段话，直接告诉你语法错在哪、有什么更地道的说法。不用切浏览器，不用开另一个客户端。

**两种模式，自动切换**（由模型判断粘进来的是什么语言，你不用选）：

- 粘的是**非英文**（中文、越南语、泰语…）→ **翻译成英文**，保留原文的语气和正式程度。输出「英文翻译 / 翻译说明 / 更地道的说法」。
- 粘的是**英文** → 语法校对。输出「修改后 / 问题 / 更地道的说法」。

跑完第一节的内容（译文或改好的句子）**自动进剪贴板**，状态栏会闪一下「已复制」，切回去直接 `⌘V` 就行。

## 跑起来

```bash
cd wo-shuo-de-dui-ma
npm install
npm start
```

启动后 Dock 里没有图标，只在菜单栏右侧出现一个 ✓，面板会自动弹出。每次启动都会先显示中英文介绍页，再进入设置页。

## 用法

| 操作 | 说明 |
| --- | --- |
| `⌥Space` | 唤出/收起面板（可在设置里改） |
| `⌘↵` | 检查 |
| `⌘C` | 没选中文字时，直接复制第一节那句（跑完已自动复制过一次，这个是补一刀） |
| `esc` | 收起面板 |

唤出时如果剪贴板里有新内容，会自动填进输入框，省掉一次 `⌘V`。上一轮自己复制进剪贴板的结果会被跳过，不会拿自己的输出再翻一遍。上方的「默认 / 正式 / 口语 / 简洁」是语气，点一下会用同一句话重跑。设置页支持中文、English、Tiếng Việt、Bahasa Indonesia、ไทย和 Bahasa Melayu 界面切换。

## 接哪个 AI

底层只认两种协议：Anthropic 的 `/v1/messages`，和 OpenAI 兼容的 `/chat/completions`。后者覆盖了绝大多数服务商，所以设置页里换个下拉、填上 key 就能换模型，不用改代码。

内置的预设：Anthropic、DeepSeek、Kimi、通义千问、智谱 GLM、豆包/火山方舟、OpenAI、Ollama（本地，免 key），以及「自定义」——任何 OpenAI 兼容网关填进去都能用。

默认是**火山方舟**。

几个坑：
- **豆包/火山方舟**：`model` 填豆包模型 ID（如 `doubao-1-5-pro-32k-250115`）或接入点 ID（`ep-` 开头）都可以。Base URL 保持 `https://ark.cn-beijing.volces.com/api/v3`。
- **DeepSeek**：`deepseek-chat` / `deepseek-reasoner` 已于 2026-07-24 下线，用 `deepseek-v4-flash`。
- **Ollama**：先 `ollama serve`，模型名填 `ollama list` 里的名字，API Key 留空。
- **自定义网关**：API 地址填到 `/v1` 为止，代码会自己接 `/chat/completions`。

API Key 通过 `safeStorage` 用系统钥匙串加密后存在应用自己的配置目录中，不会出现在明文里（钥匙串不可用时才退回明文，并且文件权限是 600）。

## 打包成正式 app

```bash
npm run dist
```

产物在 `dist/`。装到「应用程序」后，想开机自启就去 系统设置 → 通用 → 登录项 里加上。

## 代码结构

- `main.js` — 主进程：菜单栏图标、全局快捷键、窗口显隐、配置读写
- `providers.js` — 模型层：服务商预设、两种协议的流式请求
- `preload.js` — IPC 桥
- `renderer/` — 面板界面（`app.js` 里有个极简 markdown 渲染器）

应用图标是 `build/SayBetter.icns`，来源于 `icon.png`；菜单栏图标仍使用 `iconTemplate.png` / `iconTemplate@2x.png`，自动跟随明暗菜单栏。

## 更新

应用每 6 小时（以及启动后 8 秒）静默查一次 `latest.json`。**跟安装包怎么拿到的无关**——飞书传的、AirDrop 的、U 盘拷的都一样，只要能上网就能收到更新提示。有新版时菜单栏菜单顶部会多出一条「有新版本 x.y.z，点击下载」，设置页底部也会亮起。点一下打开 dmg 下载链接，手动拖进「应用程序」覆盖即可。

**为什么不查 GitHub API**：`api.github.com` 对匿名请求限 60 次/小时，且按出口 IP 计。公司网络下几百人共用一个出口 IP，额度早被别的工具用光（实测直接 403）。所以主用 `raw.githubusercontent.com` 上的 `latest.json`（CDN，无此限制），API 仅作兜底。

**为什么不是静默自动更新**：macOS 上 electron-updater 依赖 Squirrel.Mac 校验代码签名，而本应用目前是 adhoc 签名（没有 Apple Developer ID，$99/年）。adhoc 包装不上更新，这是系统机制不是配置问题。等有了证书，把 `updater.js` 换成 electron-updater 即可，其余代码不用动。

首次安装因为没有公证，macOS 会拦一下：

```bash
xattr -dr com.apple.quarantine /Applications/SayBetter.app
```

## 思考模式

DeepSeek v4 系列、豆包、通义默认开启思考模式，思维链会占掉 token 预算，严重时正文为空、响应也慢。应用会对这三家自动下发关闭参数（DeepSeek/方舟 `thinking:{type:"disabled"}`，通义 `enable_thinking:false`），其余服务商不下发，免得不认识的参数导致 400。

## 发版

```bash
scripts/release.sh 0.2.9 "这一版改了什么"
```

脚本会依次：写版本号 → 自检打包白名单是否漏文件（`updater.js`、`preload-pill.js` 都曾漏过）→ 卸载残留的 dmg 卷 → 打包 → 用真实下载地址重写 `latest.json` → 提交推送 → 建 Release → 最后实测一次更新检查确认能查到这一版。

## 程序坞

应用保留程序坞图标，可以从程序坞/启动台打开，点图标即唤出面板，⌘Q 退出。（早期版本调用 `app.dock.hide()` 只留菜单栏图标，但打包后的托盘图标在部分环境不显示，用户就没有任何可见入口了。）
