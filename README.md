# Saybetter-A lingoisland 0.8.1

一款极简的 macOS 菜单栏表达与语言学习工具，基于开源项目 [eSeaFiller/saybetter](https://github.com/eSeaFiller/saybetter) 持续开发。

## 主要功能

- 复制有效文本后，在刘海下方显示灵动岛胶囊；胶囊可自由拖动并记住位置。
- 鼠标移入胶囊后立即展开结果。
- 一次请求生成默认、正式、口语、简洁和学习五种结果。
- 默认、正式、口语、简洁模式用橙色高亮不同表达。
- 学习模式按目标语言标注主语、谓语和宾语，并提供公开新闻示例来源。
- 支持自动检测源语言，输出英语、法语、德语或日语。
- 支持自定义 Prompt。
- 收藏单词和语句，并导出 CSV。
- 原生 macOS 菜单栏 `L`，可进入设置、切换目标语言和外观、查看收藏、反馈问题。
- 菜单栏可暂停/恢复剪贴板读取；暂停时停止轮询、终止生成并隐藏胶囊。

## API 支持

内置 OpenAI、Anthropic Claude、DeepSeek、Kimi、通义千问、智谱 GLM、豆包/火山方舟、Ollama，并支持任意 OpenAI Chat Completions 兼容接口。

## 安装

1. 从 [Releases](https://github.com/eSeaFiller/saybetter/releases/latest) 下载 Apple Silicon DMG。
2. 打开 DMG，将 `Saybetter-A lingoisland.app` 拖入“应用程序”。
3. 当前构建未经过 Apple Developer ID 公证；若 macOS 阻止打开，可在“系统设置 → 隐私与安全性”中选择仍要打开。
4. 启动后进入 API 设置，选择服务商、模型并填写 API Key。

系统要求：macOS 13 或更高版本、Apple Silicon（M1/M2/M3/M4）。

## 隐私

- API Key 使用 Electron `safeStorage` 加密后保存在本机。
- 收藏保存在本机应用数据目录，可手动导出 CSV。
- 开启剪贴板读取时，新复制的有效文本会自动发送给所选模型服务商。
- 复制敏感信息前，可从菜单栏选择“暂停读取复制内容”；暂停后应用不会读取新的剪贴板文本。
- 纯网址、纯邮箱、少于 2 个字符或超过 1200 个字符的内容会跳过。

## 从源码构建

需要 Node.js 18、Xcode Command Line Tools 和 Swift 编译器。

```bash
npm install
npm test
npm start
npm run dist
```

`npm run dist` 会先编译并临时签名原生菜单栏辅助程序，再生成 DMG。

## 许可与归属

Copyright © 2026 Saybetter-A lingoisland contributors.

本项目遵循 [MIT License](LICENSE)。第三方模型服务及其商标归各自权利人所有。
