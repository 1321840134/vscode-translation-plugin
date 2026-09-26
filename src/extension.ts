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
import { wordAtPosition } from './word';

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
}async function translateSelectionsCommand(): Promise<void> {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
        showPanel({ focusInput: true });
        return;
    }
    const sel = editor.selection;
    const selText = sel && !sel.isEmpty ? editor.document.getText(sel).trim() : '';

    // 单词级查询（选中单词或光标处取词）→ 选中该词并弹出词典悬浮卡片
    let wordRange: vscode.Range | undefined;
    if (selText && selText.length <= 40 && !/\s/.test(selText)) {
        wordRange = sel;
    } else if (!selText) {
        const word = wordAtPosition(editor.document, editor.selection.active);
        if (word) {
            wordRange = word.range;
        }
    }
    if (wordRange) {
        editor.selection = new vscode.Selection(wordRange.start, wordRange.end);
        void vscode.commands.executeCommand('editor.action.showHover');
        return;
    }

    if (!selText) {
        showPanel({ focusInput: true });
        return;
    }
    const queries = [selText];
    const from = config.sourceLanguage();
    const to = config.targetLanguage();
    await vscode.window.withProgress(
        { location: vscode.ProgressLocation.Window, title: '正在翻译…' },
        async () => {
            const results: TranslationResult[] = [];
            const errors: string[] = [];
            for (const q of queries) {
                try {
                    results.push(await translateQuery(q, from, to));
                } catch (e) {
                    errors.push(errMessage(e));
                }
            }
            if (results.length > 0) {
                showResultsInPanel(results);
            }
            if (errors.length > 0) {
                void vscode.window.showErrorMessage(`翻译失败: ${errors[0]}`);
            }
        }
    );
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
            targets.push({ range: sel, query: t });
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

async function switchEngineCommand(): Promise<void> {
    const current = config.engine();
    const picks: { label: string; description: string; detail: string; id: string }[] = [
        {
            label: '$(settings-gear) 打开当前引擎设置',
            description: '快速配置',
            detail: `跳转到 VSCode 设置: translation.${current}`,
            id: '__open_settings__'
        },
        ...ENGINES.map(e => ({
            label: e.name,
            description: e.id === current ? '$(check) 当前' : '',
            detail: e.configHint ?? '免费，无需配置',
            id: e.id
        }))
    ];
    const picked = await vscode.window.showQuickPick(picks, { placeHolder: '选择翻译引擎' });
    if (!picked) {
        return;
    }
    if (picked.id === '__open_settings__') {
        await vscode.commands.executeCommand('workbench.action.openSettings', `translation.${current}`);
        return;
    }
    await config.setEngine(picked.id);
    updateStatusBar();
    void vscode.window.showInformationMessage(`翻译引擎已切换为 ${picked.label}`);
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

export function activate(context: vscode.ExtensionContext): void {
    storage.init(context);
    initStatusBar(context);
    showFirstRunGuide(context);

    const commands: [string, () => Promise<void> | void][] = [
        ['translation.showDialog', () => showPanel({ focusInput: true })],
        ['translation.translate', translateSelectionsCommand],
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
        ['translation.wordOfTheDay', wordOfTheDayCommand]
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
                const restored = { ...result, text: guarded.restore(result.text) };
                storage.pushHistory({
                    query: docText.slice(0, 100),
                    translation: restored.text,
                    from: restored.from,
                    to: restored.to,
                    engineName: restored.engineName
                });
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
