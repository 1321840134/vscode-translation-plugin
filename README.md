# Translation Plugin for VSCode

参考 JetBrains 平台插件 [TranslationPlugin](https://github.com/YiiGuxing/TranslationPlugin) 实现的 VSCode 翻译插件。

## 功能

- **多引擎翻译**：微软翻译（Edge 公开端点，默认）、Google、DeepL、OpenAI、有道、百度、阿里
- **多语言互译**：20+ 种语言，自动检测源语言
- **词典悬浮卡片**：右键"翻译"命令对单词级查询（选中单词或光标处取词）弹出词典卡片（音标/释义/文档翻译）；鼠标悬浮自动翻译默认关闭，可在 `translation.hover.enabled` 开启
- **文档翻译（悬浮）**：悬停处有文档注释时，自动翻译整段文档内容并追加显示
- **翻译对话框**：独立翻译面板，随时输入翻译（相当于参考插件的翻译对话框）
- **翻译**：选中文本翻译；无选区时自动提取光标处单词（智能驼峰/下划线取词）
- **选中自动翻译**：选中文本后自动翻译并静默更新到面板（可选开启）
- **翻译并替换**：将选中文本替换为译文；目标语言为英文时可格式化为 camelCase、snake_case 等命名风格
- **文档翻译（整篇）**：将整个文档翻译后在新窗口打开；可开启"保留原文"输出逐段原文/译文对照（`translation.document.preserveSource`）；内联技术标签（`{var}`、`<tag>`、`` `code` ``、`%s` 等）自动保护，翻译后原样还原
- **文本转语音**：Edge 神经网络语音（默认）、OpenAI TTS（可配模型/音色）、Google TTS 三引擎，auto 模式自动回退；支持自动朗读
- **对话框快捷键**：`Alt+S`/`Alt+T` 切换源/目标语言、`Alt+Enter` 朗读原文、`Ctrl+F` 收藏、`Ctrl+H` 历史、`Ctrl+Shift+C` 复制译文、`Ctrl+Shift+Backspace` 清空输入
- **单词本**：翻译结果一键收藏，支持查看、移除、清空、导出 JSON、搜索
- **翻译历史**：自动记录，支持搜索（含正则）、点击重译、删除、清空
- **切换引擎**：快捷键/状态栏快速切换翻译引擎
- **每日一词**：随机回顾单词本中的单词（为空时使用内置词库）
- **词典结果**：单词查询时显示音标与分词性释义（Google/有道）

## 快捷键

参考原插件快捷键（原插件：`Ctrl+Shift+O` 翻译对话框、`Ctrl+Shift+Y` 翻译、`Ctrl+Shift+X` 翻译并替换、`Ctrl+Shift+S` 切换引擎）。为避免与 VSCode 默认键冲突，本插件默认绑定：

| 功能 | Windows / Linux | macOS |
| --- | --- | --- |
| 翻译（选中文本或光标处单词） | `Ctrl+Shift+Y` | `Ctrl+Cmd+U` |
| 打开翻译对话框 | `Ctrl+Alt+O` | `Ctrl+Cmd+I` |
| 翻译并替换 | `Ctrl+Alt+X` | `Ctrl+Cmd+O` |
| 切换翻译引擎 | `Ctrl+Alt+S` | `Ctrl+Cmd+Y` |

所有快捷键均可在键盘快捷方式中自定义。

## 使用

1. **翻译**：选中代码/文本后按 `Ctrl+Shift+Y`（或右键菜单"翻译: 翻译"）。选中的是单词（或光标停在单词上）→ 弹出词典悬浮卡片；选中的是句子 → 结果进翻译面板。
2. **翻译对话框**：`Ctrl+Alt+O` 打开面板，直接输入文本翻译，支持交换语言、朗读、收藏。
3. **翻译并替换**：选中文本后按 `Ctrl+Alt+X`，译文将替换原文（英文目标支持命名风格格式化）。
4. **文档翻译**：命令面板执行“翻译: 翻译文档”，译文在新窗口打开。
5. **单词本 / 历史**：命令面板或面板顶部的标签页切换。

## 翻译引擎配置

- **微软翻译（默认）**：使用 Edge 浏览器公开的免费翻译端点，**无需任何密钥，开箱即用**（与参考插件行为一致）。
- **Google 翻译**：免费、无需配置，但官方域名在部分地区无法直连，可在设置中更换 `translation.google.host` 镜像域名。
- 其余引擎需要到对应开放平台申请密钥后，在 VSCode 设置中填入：

| 引擎 | 设置项 |
| --- | --- |
| 微软 | `translation.microsoft.subscriptionKey`、`translation.microsoft.region`（可选，不填则使用 Edge 免费端点） |
| Google | `translation.google.host`（默认官方域名，可改为镜像域名） |
| DeepL | `translation.deepl.authKey`（免费版密钥以 `:fx` 结尾，自动识别） |
| OpenAI | `translation.openai.apiKey`、`translation.openai.model`、`translation.openai.apiBase`（可配置兼容接口）；高级配置：`openai.systemPrompt`（自定义提示词，支持 `{sourceLang}/{targetLang}` 占位符）、`openai.temperature` |
| 有道 | `translation.youdao.appKey`、`translation.youdao.appSecret` |
| 百度 | `translation.baidu.appId`、`translation.baidu.appSecret` |
| 阿里 | `translation.alibaba.accessKeyId`、`translation.alibaba.accessKeySecret` |

## 主要设置项

| 设置 | 默认值 | 说明 |
| --- | --- | --- |
| `translation.engine` | `microsoft` | 默认翻译引擎 |
| `translation.sourceLanguage` | `auto` | 源语言（auto = 自动检测） |
| `translation.targetLanguage` | `zh-CN` | 目标语言 |
| `translation.autoSelectWord` | `true` | 无选区时自动提取光标处单词 |
| `translation.autoSwapTarget` | `true` | 源语言=目标语言时自动换向（中文↔英文），避免中译中/英译英 |
| `translation.autoTranslateSelection` | `false` | 选中文本后自动翻译（静默更新面板） |
| `translation.hover.enabled` | `true` | 悬浮翻译单词（含音标/释义） |
| `translation.hover.translateDocumentation` | `true` | 悬浮时翻译文档注释内容 |
| `translation.tts.enabled` | `true` | 启用语音朗读 |
| `translation.tts.service` | `auto` | 语音服务：auto = Edge 优先、Google 兜底 |
| `translation.tts.autoPlay` | `false` | 翻译后自动朗读原文 |
| `translation.replace.style` | `original` | 翻译并替换的英文命名风格 |
| `translation.history.enabled` | `true` | 记录翻译历史 |
| `translation.history.limit` | `200` | 历史最大条数 |
| `translation.panel.position` | `beside` | 面板打开位置 |

## 本地开发

```bash
npm install
npm run compile   # 或者 npm run watch
```

- 用 VSCode 打开本项目，按 `F5` 启动扩展开发宿主进行调试。
- 打包安装：`npx @vscode/vsce package`（生成 `.vsix` 后执行 `code --install-extension xxx.vsix`）。

## 测试

**修改代码后必须完整跑过以下两步再打包发布**：

```bash
npm test         # 单元+协议测试（53 用例，无需网络）：语言判定/换向决策/取词/存储/格式化/HTTP/代理/WebSocket/Webview一致性
npm run test:live  # 真机集成测试（需网络）：微软引擎多方向翻译、自动换向全场景、Edge TTS
```

覆盖说明：`test/` 目录为离线测试，用本地 mock 服务器验证 HTTP 行为（重定向/超时/取消/代理 CONNECT 隧道）、WebSocket 帧编解码（掩码/分片/ping-pong）以及 Webview 的 HTML/JS 交叉一致性（元素 ID、消息分支、CSP、脚本语法防白屏）；`scripts/smoke-*.js` 为真实网络集成测试。新增功能请同步补充对应测试用例。

## 说明

- **代理环境**：插件尊重 VSCode 的 `http.proxy` 设置（HTTP 代理，CONNECT 隧道），配置后即可在企业代理下使用 Google/DeepL/OpenAI 等境外引擎。
- 参考插件的 JetBrains 深度集成能力（悬浮文档翻译、取词等）在 VSCode 中以 HoverProvider、右键菜单、命令面板方式等价实现；其"多行翻译替换""取词排除"等细节行为未完全复刻。
- Edge 翻译/语音端点与 Google 免费接口均为微软/谷歌未公开承诺的接口，理论上可能变动；引擎报错信息已做可读化处理，届时可切换其他引擎。

## License

[MIT](./LICENSE)
