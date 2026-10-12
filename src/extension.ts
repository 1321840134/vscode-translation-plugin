import * as vscode from 'vscode';
import * as config from './config';
import { buildReplaceCandidates } from './candidates';
import { TranslationHoverProvider, extractPlainText } from './hover';
import { AUTO, LANGUAGES, langName } from './languages';
import { exportWordBook, showPanel, showResultsInPanel } from './panel';
import { protectInlineTokens } from './protect';
import { ENGINES, TranslationResult, clearCache, translateLong, translateQuery } from './services';
import { disposeHttpAgents } from './net';
import { initStatusBar, updateStatusBar } from './statusbar';
import { storage } from './storage';
import { wordAtPosition, normalizeWordQuery } from './word';

/** 每日一词的内置词库（用户单词本非空时优先使用单词本） */
const BUILTIN_WORDS = [
    'serendipity', 'ephemeral', 'eloquent', 'resilient', 'lucid',
    'meticulous', 'pragmatic', 'nuance', 'ambiguity', 'paradigm',
    'robust', 'concise', 'verbose', 'deprecated', 'refactor',
    'intuitive', 'obsolete', 'intricate', 'profound', 'subtle',
    'diligent', 'arduous', 'tenacious', 'versatile', 'prolific',
    'candid', 'vivid', 'crucial', 'inevitable'
];

function errMessage(e: unknown): string {
    return e instanceof Error ? e.message : String(e);
}

/** 将编辑器选区设为指定范围（已是目标范围时跳过，避免触发多余的选区变更事件） */
function selectRangeQuietly(editor: vscode.TextEditor, range: vscode.Range): void {
    const current = editor.selection;
    const alreadySelected =
        !current.isEmpty && typeof current.isEqual === 'function' && current.isEqual(range);
    if (!alreadySelected) {
        editor.selection = new vscode.Selection(range.start, range.end);
    }
}

/**
 * 单词词典查询 → 面板词典卡片（右键翻译/强制取词/剪贴板共用）。
 * 面板为持久 UI，不受鼠标移动影响，且与句子翻译路径统一。
 */
async function queryWordInPanel(wordQuery: string): Promise<void> {
    try {
        const result = await vscode.window.withProgress(
            { location: vscode.ProgressLocation.Window, title: `正在查询词典: ${wordQuery.slice(0, 20)}` },
            () => translateQuery(wordQuery, AUTO, config.targetLanguage())
        );
        showResultsInPanel([result]);
    } catch (e) {
        void vscode.window.showErrorMessage(`词典查询失败: ${errMessage(e)}`);
    }
}

/** 文本翻译 → 面板（右键句子/整行翻译/剪贴板共用） */
async function translateTextInPanel(text: string, from: string = config.sourceLanguage()): Promise<void> {
    const to = config.targetLanguage();
    await vscode.window.withProgress(
        { location: vscode.ProgressLocation.Window, title: '正在翻译…' },
        async () => {
            try {
                const result = await translateQuery(text, from, to);
                showResultsInPanel([result]);
            } catch (e) {
                void vscode.window.showErrorMessage(`翻译失败: ${errMessage(e)}`);
            }
        }
    );
}

async function translateSelectionsCommand(): Promise<void> {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
        showPanel({ focusInput: true });
        return;
    }
    const sel = editor.selection;
    const selText = sel && !sel.isEmpty ? editor.document.getText(sel).trim() : '';

    // 单词级查询（选中单词或光标处取词）→ 词典卡片
    // 划选文本同样经过智能拆分归一化（驼峰整词直接查引擎效果差）
    let wordRange: vscode.Range | undefined;
    let wordQuery: string | undefined;
    if (selText && selText.length <= 40 && !/\s/.test(selText)) {
        wordRange = sel;
        wordQuery = normalizeWordQuery(selText);
    } else if (!selText) {
        const word = wordAtPosition(editor.document, editor.selection.active);
        if (word) {
            wordRange = word.range;
            wordQuery = word.query;
        }
    }
    if (wordRange && wordQuery) {
        selectRangeQuietly(editor, wordRange);
        await queryWordInPanel(wordQuery);
        return;
    }

    if (!selText) {
        showPanel({ focusInput: true });
        return;
    }
    await translateTextInPanel(selText);
}

/**
 * 强制取词（对齐参考插件 Translate(Exclusive)）：
 * 忽略当前选区，仅翻译光标处单词——选区跨多个词/句子时也能只查光标词。
 */
async function translateWordCommand(): Promise<void> {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
        showPanel({ focusInput: true });
        return;
    }
    const word = wordAtPosition(editor.document, editor.selection.active);
    if (!word) {
        void vscode.window.showWarningMessage('光标处没有可识别的单词');
        return;
    }
    selectRangeQuietly(editor, word.range);
    await queryWordInPanel(word.query);
}

/**
 * 整行翻译（对齐参考插件 Translate(Inclusive)）：
 * 忽略当前选区，翻译光标所在行的完整内容。
 */
async function translateLineCommand(): Promise<void> {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
        showPanel({ focusInput: true });
        return;
    }
    const line = editor.document.lineAt(editor.selection.active.line).text.trim();
    if (!line) {
        void vscode.window.showWarningMessage('当前行没有可翻译的内容');
        return;
    }
    await translateTextInPanel(line, AUTO);
}

/**
 * 翻译剪贴板内容（参考插件"翻译文本组件"在 VSCode 的等价物）：
 * 从任意位置复制文本后直接翻译查看，覆盖 IDE 外的取词场景。
 */
async function translateClipboardCommand(): Promise<void> {
    let text = '';
    try {
        text = (await vscode.env.clipboard.readText()).trim();
    } catch {
        // 剪贴板不可用时按空内容处理
    }
    if (!text) {
        void vscode.window.showWarningMessage('剪贴板中没有可翻译的文本');
        return;
    }
    // 与右键翻译的判定一致：单个词走词典卡片，其余整段翻译（源语言自动检测）
    if (text.length <= 40 && !/\s/.test(text)) {
        const q = normalizeWordQuery(text);
        if (q) {
            await queryWordInPanel(q);
            return;
        }
    }
    await translateTextInPanel(text, AUTO);
}

async function translateAndReplaceCommandSafe(): Promise<void> {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
        return;
    }
    const from = config.sourceLanguage();
    const to = config.targetLanguage();

    interface ReplaceTarget {
        range: vscode.Range;
        query: string;
    }
    const targets: ReplaceTarget[] = [];
    for (const sel of editor.selections) {
        const t = editor.document.getText(sel).trim();
        if (t) {
            // 单词级选区做智能拆分归一化（驼峰整词直接查引擎效果差）；句子原样
            const query = /\s/.test(t) ? t : normalizeWordQuery(t);
            targets.push({ range: sel, query });
        }
    }
    if (targets.length === 0) {
        const word = wordAtPosition(editor.document, editor.selection.active);
        if (word) {
            targets.push({ range: word.range, query: word.query });
        }
    }
    if (targets.length === 0) {
        void vscode.window.showWarningMessage('请先选中要替换的文本');
        return;
    }

    await vscode.window.withProgress(
        { location: vscode.ProgressLocation.Window, title: '正在翻译并替换…' },
        async progress => {
            let replaced = 0;
            let lastRange: vscode.Range | undefined;
            let lastText: string | undefined;
            for (let i = 0; i < targets.length; i++) {
                progress.report({ message: `${i + 1}/${targets.length}` });
                let result;
                try {
                    result = await translateQuery(targets[i].query, from, to);
                } catch (e) {
                    void vscode.window.showErrorMessage(`翻译失败: ${errMessage(e)}`);
                    continue;
                }
                // 候选列表：主译文/义项/词典释义/命名风格变体，由用户选择后替换
                const candidates = buildReplaceCandidates(result);
                if (candidates.length === 0) {
                    continue;
                }
                const picked = await vscode.window.showQuickPick(candidates, {
                    placeHolder: `替换为…（原文: ${targets[i].query.slice(0, 50)}）`
                });
                if (!picked) {
                    continue; // Esc/关闭：跳过该选区，不做任何修改
                }
                let applied = false;
                try {
                    applied = await editor.edit(editBuilder => {
                        editBuilder.replace(targets[i].range, picked.label);
                    });
                } catch (e) {
                    void vscode.window.showErrorMessage(
                        `替换失败：当前文档不可编辑（${errMessage(e)}）`
                    );
                    return;
                }
                if (!applied) {
                    void vscode.window.showWarningMessage('替换未生效：当前文档不可编辑（如只读视图、diff 或输出面板）');
                    return;
                }
                replaced++;
                lastRange = targets[i].range;
                lastText = picked.label;
            }
            if (replaced > 0) {
                // 替换后选中最后一次的译文，便于直观核对
                try {
                    if (lastRange && lastText && !lastText.includes('\n') && lastRange.isSingleLine) {
                        editor.selection = new vscode.Selection(
                            lastRange.start,
                            lastRange.start.translate(0, lastText.length)
                        );
                    }
                } catch {
                    // 选区恢复失败不影响替换结果
                }
                void vscode.window.setStatusBarMessage(`已替换 ${replaced} 处文本`, 3000);
            }
        }
    );
}

async function translateDocumentCommand(): Promise<void> {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
        return;
    }
    const text = editor.document.getText();
    if (!text.trim()) {
        void vscode.window.showWarningMessage('文档为空');
        return;
    }
    const from = config.sourceLanguage();
    const to = config.targetLanguage();
    const preserveSource = config.docPreserveSource();
    await vscode.window.withProgress(
        { location: vscode.ProgressLocation.Notification, title: '正在翻译文档…', cancellable: false },
        async progress => {
            try {
                const result = await translateLong(
                    text,
                    from,
                    to,
                    (done, total) => {
                        progress.report({ message: `${done}/${total} 段`, increment: (1 / total) * 100 });
                    },
                    { preserveSource }
                );
                const doc = await vscode.workspace.openTextDocument({ content: result.text, language: 'plaintext' });
                await vscode.window.showTextDocument(doc, vscode.ViewColumn.Beside);
                void vscode.window.showInformationMessage(
                    `文档翻译完成${preserveSource ? '（含原文对照）' : ''}: ${langName(result.from)} → ${langName(result.to)}（${result.engineName}）`
                );
            } catch (e) {
                void vscode.window.showErrorMessage(`文档翻译失败: ${errMessage(e)}`);
            }
        }
    );
}

/** 语音引擎清单（translation.tts.service 的枚举，切换入口与翻译引擎合并） */
const TTS_ENGINES: { id: string; name: string; hint: string }[] = [
    { id: 'auto', name: '自动', hint: 'Edge 优先，失败自动回退 Google/OpenAI' },
    { id: 'edge', name: 'Edge 神经语音', hint: '免费，无需配置' },
    { id: 'google', name: 'Google 语音', hint: '免费，无需配置' },
    { id: 'openai', name: 'OpenAI 语音', hint: '需配置 OpenAI API Key' }
];

/**
 * 切换引擎（对齐参考插件：翻译引擎与语音引擎在同一入口切换）。
 */
async function switchEngineCommand(): Promise<void> {
    const current = config.engine();
    const currentTts = config.ttsService();
    interface EnginePick extends vscode.QuickPickItem {
        id: string;
        cat: 'translation' | 'tts' | 'settings';
    }
    const picks: EnginePick[] = [
        {
            label: '$(settings-gear) 打开翻译引擎设置',
            description: '快速配置',
            detail: `跳转到 VSCode 设置: translation.${current}`,
            id: '__open_settings__',
            cat: 'settings'
        },
        ...ENGINES.map(
            (e): EnginePick => ({
                label: `$(globe) ${e.name}`,
                description: `翻译引擎${e.id === current ? ' · $(check) 当前' : ''}`,
                detail: e.configHint ?? '免费，无需配置',
                id: e.id,
                cat: 'translation'
            })
        ),
        ...TTS_ENGINES.map(
            (t): EnginePick => ({
                label: `$(unmute) ${t.name}`,
                description: `语音引擎${t.id === currentTts ? ' · $(check) 当前' : ''}`,
                detail: t.hint,
                id: `tts:${t.id}`,
                cat: 'tts'
            })
        )
    ];
    const picked = await vscode.window.showQuickPick(picks, {
        placeHolder: '选择引擎（翻译 / 语音朗读）'
    });
    if (!picked) {
        return;
    }
    if (picked.cat === 'settings') {
        await vscode.commands.executeCommand('workbench.action.openSettings', `translation.${current}`);
        return;
    }
    if (picked.cat === 'tts') {
        await config.setTtsService(picked.id.slice(4));
        void vscode.window.showInformationMessage(`语音引擎已切换为 ${picked.label.replace('$(unmute) ', '')}`);
        return;
    }
    await config.setEngine(picked.id);
    updateStatusBar();
    void vscode.window.showInformationMessage(`翻译引擎已切换为 ${picked.label.replace('$(globe) ', '')}`);
}

async function pickLanguage(includeAuto: boolean, current: string): Promise<string | undefined> {
    const items: { label: string; description: string; code: string }[] = [];
    if (includeAuto) {
        items.push({ label: '自动检测', description: 'auto', code: AUTO });
    }
    for (const l of LANGUAGES) {
        items.push({ label: l.name, description: l.code, code: l.code });
    }
    const picked = await vscode.window.showQuickPick(items, {
        placeHolder: `选择语言（当前: ${langName(current)}）`
    });
    return picked?.code;
}

async function selectTargetLanguageCommand(): Promise<void> {
    const code = await pickLanguage(false, config.targetLanguage());
    if (code) {
        await config.setTargetLanguage(code);
        updateStatusBar();
    }
}

async function selectSourceLanguageCommand(): Promise<void> {
    const code = await pickLanguage(true, config.sourceLanguage());
    if (code) {
        await config.setSourceLanguage(code);
        updateStatusBar();
    }
}

async function clearHistoryCommand(): Promise<void> {
    const pick = await vscode.window.showWarningMessage('确定要清空全部翻译历史吗？', { modal: true }, '清空');
    if (pick === '清空') {
        storage.clearHistory();
        void vscode.window.showInformationMessage('翻译历史已清空');
    }
}

async function wordOfTheDayCommand(): Promise<void> {
    const words = storage.listWords();
    const pool = words.length > 0 ? words.map(w => w.text) : BUILTIN_WORDS;
    const word = pool[Math.floor(Math.random() * pool.length)];
    const from = AUTO;
    const to = config.targetLanguage();
    await vscode.window.withProgress(
        { location: vscode.ProgressLocation.Window, title: `每日一词: ${word}` },
        async () => {
            try {
                const result = await translateQuery(word, from, to);
                showResultsInPanel([result]);
            } catch (e) {
                void vscode.window.showErrorMessage(`翻译失败: ${errMessage(e)}`);
            }
        }
    );
}

/**
 * 一键诊断：用标准词 put 走一遍真实查询路径，直接展示引擎路径结果。
 * 用于快速判定"翻译结果/词典不符合预期"时问题出在哪一层。
 */
async function diagnoseCommand(): Promise<void> {
    const lines: string[] = [];
    lines.push(`引擎: ${config.engine()}（语音: ${config.ttsService()}）`);
    await vscode.window.withProgress(
        { location: vscode.ProgressLocation.Window, title: '正在诊断翻译链路…' },
        async () => {
            try {
                const r = await translateQuery('put', AUTO, config.targetLanguage());
                lines.push(`put → ${r.text}`);
                lines.push(`检测语言: ${langName(r.from)} → ${langName(r.to)} · ${r.engineName}`);
                lines.push(`词典条目: ${(r.definitions ?? []).length}`);
                for (const d of (r.definitions ?? []).slice(0, 3)) {
                    lines.push(`  [${d.pos}] ${d.terms.slice(0, 5).join('；')}`);
                }
                const ok = r.text === '放' && (r.definitions ?? []).length > 0;
                lines.push(ok ? '✅ 与参考插件一致（Bing 主路径正常）' : '⚠️ 结果与预期不符，详见扩展宿主日志（帮助→切换开发人员工具/日志）');
            } catch (e) {
                lines.push(`查询失败: ${errMessage(e)}`);
            }
        }
    );
    const message = lines.join('\n');
    console.log(`[translation][diagnose] ${message.replace(/\n/g, ' | ')}`);
    void vscode.window.showInformationMessage(message, '确定');
}

export function activate(context: vscode.ExtensionContext): void {
    storage.init(context);
    initStatusBar(context);
    showFirstRunGuide(context);

    const commands: [string, () => Promise<void> | void][] = [
        ['translation.showDialog', () => showPanel({ focusInput: true })],
        ['translation.translate', translateSelectionsCommand],
        ['translation.translateWord', translateWordCommand],
        ['translation.translateLine', translateLineCommand],
        ['translation.translateClipboard', translateClipboardCommand],
        ['translation.translateAndReplace', translateAndReplaceCommandSafe],
        ['translation.translateDocument', translateDocumentCommand],
        ['translation.translateDocComment', translateDocCommentCommand],
        ['translation.switchEngine', switchEngineCommand],
        ['translation.selectTargetLanguage', selectTargetLanguageCommand],
        ['translation.selectSourceLanguage', selectSourceLanguageCommand],
        ['translation.showWordBook', () => showPanel({ tab: 'wordbook' })],
        ['translation.showHistory', () => showPanel({ tab: 'history' })],
        ['translation.clearHistory', clearHistoryCommand],
        ['translation.exportWordBook', exportWordBook],
        ['translation.wordOfTheDay', wordOfTheDayCommand],
        ['translation.diagnose', diagnoseCommand]
    ];

    for (const [id, handler] of commands) {
        context.subscriptions.push(vscode.commands.registerCommand(id, handler));
    }

    context.subscriptions.push(
        vscode.languages.registerHoverProvider('*', new TranslationHoverProvider())
    );


    context.subscriptions.push(
        vscode.workspace.onDidChangeConfiguration(e => {
            if (e.affectsConfiguration('translation')) {
                // 引擎配置（镜像/模型/密钥等）变化后立即失效缓存，避免命中旧结果
                clearCache();
                updateStatusBar();
            }
        })
    );
}

/** 翻译文档注释（对齐参考插件的快速文档翻译 Ctrl+Shift+Q）：提取悬停处内置文档 → 翻译 → 面板显示 */
async function translateDocCommentCommand(): Promise<void> {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
        return;
    }
    const position = editor.selection.active;
    let docText = '';
    try {
        const hovers = await vscode.commands.executeCommand<vscode.Hover[]>(
            'vscode.executeHoverProvider',
            editor.document.uri,
            position
        );
        docText = extractPlainText(hovers);
    } catch {
        // 内置文档获取失败时退回选区/取词文本
    }
    if (!docText) {
        const selText = editor.document.getText(editor.selection).trim();
        docText = selText || wordAtPosition(editor.document, position)?.query || '';
    }
    if (!docText) {
        void vscode.window.showWarningMessage('未找到可翻译的文档内容');
        return;
    }
    await vscode.window.withProgress(
        { location: vscode.ProgressLocation.Window, title: '正在翻译文档…' },
        async () => {
            try {
                const guarded = protectInlineTokens(docText.slice(0, 800));
                const result = await translateQuery(guarded.text, AUTO, config.targetLanguage());
                // query 使用还原后的原文预览（避免历史/面板显示占位符），历史由 showResultsInPanel 统一记录；
                // docSource 携带完整原文，面板卡片提供"原文/译文"切换（对齐参考插件的文档翻译 toggle）
                const restored: TranslationResult = {
                    ...result,
                    query: docText.slice(0, 200),
                    text: guarded.restore(result.text),
                    docSource: docText.slice(0, 800)
                };
                showResultsInPanel([restored]);
            } catch (e) {
                void vscode.window.showErrorMessage(`文档翻译失败: ${errMessage(e)}`);
            }
        }
    );
}

/** 首次安装后的一次性使用引导 */
function showFirstRunGuide(context: vscode.ExtensionContext): void {
    const GUIDE_KEY = 'translation.guideShown';
    if (context.globalState.get(GUIDE_KEY)) {
        return;
    }
    void context.globalState.update(GUIDE_KEY, true).then(() => {
        void vscode.window
            .showInformationMessage(
                'Translation 已就绪：选中文字按 Ctrl+Shift+Y 翻译；鼠标悬浮单词即显示翻译。',
                '打开翻译面板',
                '查看说明'
            )
            .then(pick => {
                if (pick === '打开翻译面板') {
                    showPanel({ focusInput: true });
                } else if (pick === '查看说明') {
                    void vscode.env.openExternal(
                        vscode.Uri.parse('https://github.com/1321840134/vscode-translation-plugin#readme')
                    );
                }
            });
    });
}

export function deactivate(): void {
    storage.flush();
    disposeHttpAgents();
}
