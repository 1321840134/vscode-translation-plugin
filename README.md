# Translation Plugin for VSCode

参考 JetBrains 平台插件 [TranslationPlugin](https://github.com/YiiGuxing/TranslationPlugin) 实现的 VSCode 翻译插件。

## 功能

- **多引擎翻译**：微软翻译（Edge 公开端点，默认）、Google、DeepL、OpenAI、有道、百度、阿里
- **多语言互译**：20+ 种语言，自动检测源语言
- **词典卡片**：右键"翻译"命令对单词级查询（选中单词或光标处取词）在翻译面板呈现词典卡片（音标/分词性释义/朗读/收藏/复制）；鼠标悬浮自动翻译默认关闭，可在 `translation.hover.enabled` 开启
- **文档翻译（悬浮）**：悬停处有文档注释时，自动翻译整段文档内容并追加显示
- **翻译对话框**：独立翻译面板，随时输入翻译（相当于参考插件的翻译对话框）
- **翻译**：选中文本翻译；无选区时自动提取光标处单词（智能驼峰/下划线取词）
- **翻译光标处单词**：忽略当前选区、只翻译光标处单词（对齐参考插件 Translate(Exclusive)，选区跨多词/句子时也能只查光标词）
- **翻译当前行**：忽略当前选区、翻译光标所在行的完整内容（对齐参考插件 Translate(Inclusive)）
- **翻译剪贴板内容**：读取剪贴板文本直接翻译（`Ctrl+Alt+V`，参考插件"翻译文本组件"的 VSCode 等价物，任意位置复制后即可翻译）
- **自动取词**：无选区执行翻译/替换命令时自动提取光标处单词（智能驼峰/下划线取词）
- **翻译并替换（候选选择制）**：翻译后弹出候选列表（主译文、拆分义项、词典释义、camelCase/PascalCase/SNAKE_CASE/kebab-case 等命名风格变体），自主选择后替换；Esc 取消不做任何修改
- **文档翻译（整篇）**：将整个文档翻译后在新窗口打开；可开启"保留原文"输出逐段原文/译文对照（`translation.document.preserveSource`）；内联技术标签（`{var}`、`<tag>`、`` `code` ``、`%s` 等）自动保护，翻译后原样还原
- **文档注释翻译（原文/译文切换）**：`Ctrl+Shift+Q` 翻译悬停处文档注释并在面板查看，卡片上的切换按钮可在完整原文与译文之间来回切换，朗读原文使用完整原文
- **文本转语音**：Edge 神经网络语音（默认）、OpenAI TTS（可配模型/音色）、Google TTS 三引擎，auto 模式自动回退；支持自动朗读
- **对话框快捷键**：`Alt+S`/`Alt+T` 切换源/目标语言、`Alt+Enter` 朗读原文、`Ctrl+F` 收藏、`Ctrl+H` 历史、`Ctrl+Shift+C` 复制译文、`Ctrl+Shift+Backspace` 清空输入
- **单词本**：翻译结果一键收藏，支持查看、移除、清空、导出 JSON、搜索
- **翻译历史**：自动记录，支持搜索（含正则）、点击重译、删除、清空
- **切换引擎**：快捷键/状态栏快速切换翻译引擎，同一入口还可切换语音朗读（TTS）引擎
- **每日一词**：随机回顾单词本中的单词（为空时使用内置词库）
- **词典结果**：单词查询时显示音标与分词性释义，每条释义附带同义词组（微软走 Bing 免密钥词典接口、Google 免费接口自带词典数据，均无需配置）

## 快捷键

参考原插件快捷键（原插件：`Ctrl+Shift+O` 翻译对话框、`Ctrl+Shift+Y` 翻译、`Ctrl+Shift+X` 翻译并替换、`Ctrl+Shift+S` 切换引擎）。为避免与 VSCode 默认键冲突，本插件默认绑定：

| 功能 | Windows / Linux | macOS |
| --- | --- | --- |
| 翻译（选中文本或光标处单词） | `Ctrl+Shift+Y` | `Ctrl+Cmd+U` |
| 打开翻译对话框 | `Ctrl+Alt+O` | `Ctrl+Cmd+I` |
| 翻译并替换 | `Ctrl+Alt+X` | `Ctrl+Cmd+O` |
| 翻译剪贴板内容 | `Ctrl+Alt+V` | `Ctrl+Cmd+B` |
| 切换翻译/语音引擎 | `Ctrl+Alt+S` | `Ctrl+Cmd+Y` |
| 翻译文档注释（悬浮处文档） | `Ctrl+Shift+Q` | `Ctrl+Cmd+J` |

"翻译光标处单词"与"翻译当前行"无默认快捷键（可在键盘快捷方式中自定义），均已加入编辑器右键菜单。

所有快捷键均可在键盘快捷方式中自定义。

## 使用

1. **翻译**：选中代码/文本后按 `Ctrl+Shift+Y`（或右键菜单"翻译: 翻译"）。选中的是单词（或光标停在单词上）→ 面板呈现词典卡片；选中的是句子 → 结果进翻译面板。
2. **强制取词 / 整行翻译**：右键菜单"翻译: 翻译光标处单词(忽略选区)"、"翻译: 翻译当前行(忽略选区)"，不受当前选区影响。
3. **翻译剪贴板**：任意位置复制文本后按 `Ctrl+Alt+V` 直接翻译（单词走词典卡片、句子进面板）。
4. **翻译对话框**：`Ctrl+Alt+O` 打开面板，直接输入文本翻译，支持交换语言、朗读、收藏。
5. **翻译并替换**：选中文本后按 `Ctrl+Alt+X`，译文将替换原文（英文目标支持命名风格格式化）。
6. **文档注释翻译**：光标停在标识符上按 `Ctrl+Shift+Q`，翻译悬停处文档注释；卡片上可切换原文/译文。
7. **文档翻译**：命令面板执行“翻译: 翻译文档”，译文在新窗口打开。
8. **单词本 / 历史**：命令面板或面板顶部的标签页切换。

## 翻译引擎配置

- **微软翻译（默认）**：使用 Edge 浏览器公开的免费翻译端点，**无需任何密钥，开箱即用**（与参考插件行为一致）。
- **Google 翻译**：免费、无需配置，但官方域名在部分地区无法直连，可在设置中更换 `translation.google.host` 镜像域名。
- 其余引擎需要到对应开放平台申请密钥后，在 VSCode 设置中填入：

| 引擎 | 设置项 |
| --- | --- |
| 微软 | `translation.microsoft.subscriptionKey`、`translation.microsoft.region`（可选，不填则使用 Edge 免费端点；两种模式均支持词典查询：免密钥走 Bing 词典接口，配置密钥后走 Azure 词典接口） |
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
| `translation.autoSwapTarget` | `true` | 源语言=目标语言时自动换向（中文↔英文），避免中译中/英译英 |
| `translation.hover.enabled` | `false` | 鼠标悬浮自动翻译（默认关闭，词典卡片由右键"翻译"触发） |
| `translation.tts.enabled` | `true` | 启用语音朗读 |
| `translation.tts.service` | `auto` | 语音服务：auto = Edge 优先、Google 兜底 |
| `translation.tts.autoPlay` | `false` | 翻译后自动朗读原文 |
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
npm test         # 单元+协议测试（131 用例，无需网络）：语言判定/换向决策/取词/存储/格式化/HTTP/代理/WebSocket/Webview一致性/命令分流/词典解析
npm run test:live  # 真机集成测试（需网络）：微软引擎多方向翻译、自动换向全场景、Edge TTS、Google/Bing 词典
npm run test:host  # 真实扩展宿主测试（@vscode/test-electron，本机 VS Code 内跑真实链路）：译文/词典/词性/换向
```

覆盖说明：`test/` 目录为离线测试，用本地 mock 服务器验证 HTTP 行为（重定向/超时/取消/代理 CONNECT 隧道）、WebSocket 帧编解码（掩码/分片/ping-pong）以及 Webview 的 HTML/JS 交叉一致性（元素 ID、消息分支、CSP、脚本语法防白屏）；`scripts/smoke-*.js` 为真实网络集成测试。新增功能请同步补充对应测试用例。

## 说明

- **代理环境**：插件尊重 VSCode 的 `http.proxy` 设置（HTTP 代理，CONNECT 隧道），配置后即可在企业代理下使用 Google/DeepL/OpenAI 等境外引擎。
- **对齐状态**：参考插件的可实现功能已全部对齐——多引擎翻译、三引擎语音、整篇文档/文档注释翻译、单词本、翻译历史、每日一词、翻译替换（候选选择）、取词（自动/强制取词/整行）、剪贴板翻译等；仅剩内联文档渲染视图翻译、任意 UI 文本组件选区翻译两项为 JetBrains 平台特有能力（VSCode 无对应 API），其中后者已用"翻译剪贴板"提供近似替代。
- Edge 翻译/语音端点与 Google 免费接口均为微软/谷歌未公开承诺的接口，理论上可能变动；引擎报错信息已做可读化处理，届时可切换其他引擎。

## License

[MIT](./LICENSE)
