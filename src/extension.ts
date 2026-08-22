import * as vscode from 'vscode';
import * as config from './config';
import { TranslationHoverProvider } from './hover';
import { AUTO, LANGUAGES, langName } from './languages';
import { exportWordBook, showPanel, showResultsInPanel, updatePanelResults } from './panel';
import { ENGINES, TranslationResult, translateLong, translateQuery } from './services';
import { initStatusBar, updateStatusBar } from './statusbar';
import { storage } from './storage';
import { formatTranslated } from './textFormat';
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

interface WordAtCursor {
    /** 供翻译用的查询文本（驼峰已拆分） */
    query: string;
    /** 编辑器中的原文 */
    raw: string;
    range: vscode.Range;
}

/** 收集要翻译的文本：优先选区，其次光标处单词 */
function collectQueries(editor: vscode.TextEditor): { queries: string[]; word?: WordAtCursor } {
    const queries: string[] = [];
    for (const sel of editor.selections) {
        const t = editor.document.getText(sel).trim();
        if (t && !queries.includes(t)) {
            queries.push(t);
        }
    }
    let word: WordAtCursor | undefined;
    if (queries.length === 0 && config.autoSelectWord()) {
        word = wordAtPosition(editor.document, editor.selection.active);
        if (word) {
            queries.push(word.query);
        }
    }
    return { queries, word };
}

function errMessage(e: unknown): string {
    return e instanceof Error ? e.message : String(e);
}

async function translateSelectionsCommand(): Promise<void> {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
        showPanel({ focusInput: true });
        return;
    }
    const { queries } = collectQueries(editor);
    if (queries.length === 0) {
        showPanel({ focusInput: true });
        return;
    }
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
    const style = config.replaceStyle();
    const separator = config.replaceSeparator();
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
    if (targets.length === 0 && config.autoSelectWord()) {
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
            const translations: (string | undefined)[] = [];
            for (let i = 0; i < targets.length; i++) {
                progress.report({ message: `${i + 1}/${targets.length}` });
                try {
                    const result = await translateQuery(targets[i].query, from, to);
                    translations.push(formatTranslated(result.text, style, separator));
                } catch (e) {
                    translations.push(undefined);
                    void vscode.window.showErrorMessage(`翻译失败: ${errMessage(e)}`);
                }
            }
            let replaced = 0;
            await editor.edit(editBuilder => {
                for (let i = 0; i < targets.length; i++) {
                    const t = translations[i];
                    if (t !== undefined && t.length > 0) {
                        editBuilder.replace(targets[i].range, t);
                        replaced++;
                    }
                }
            });
            if (replaced > 0) {
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
    await vscode.window.withProgress(
        { location: vscode.ProgressLocation.Notification, title: '正在翻译文档…', cancellable: false },
        async progress => {
            try {
                const result = await translateLong(text, from, to, (done, total) => {
                    progress.report({ message: `${done}/${total} 段`, increment: (1 / total) * 100 });
                });
                const doc = await vscode.workspace.openTextDocument({ content: result.text, language: 'plaintext' });
                await vscode.window.showTextDocument(doc, vscode.ViewColumn.Beside);
                void vscode.window.showInformationMessage(
                    `文档翻译完成: ${langName(result.from)} → ${langName(result.to)}（${result.engineName}）`
                );
            } catch (e) {
                void vscode.window.showErrorMessage(`文档翻译失败: ${errMessage(e)}`);
            }
        }
    );
}

async function switchEngineCommand(): Promise<void> {
    const current = config.engine();
    const picks = ENGINES.map(e => ({
        label: e.name,
        description: e.id === current ? '$(check) 当前' : '',
        detail: e.configHint ?? '免费，无需配置',
        id: e.id
    }));
    const picked = await vscode.window.showQuickPick(picks, { placeHolder: '选择翻译引擎' });
    if (picked) {
        await config.setEngine(picked.id);
        updateStatusBar();
        void vscode.window.showInformationMessage(`翻译引擎已切换为 ${picked.label}`);
    }
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

/** 选中自动翻译：选区变化防抖后静默翻译并更新面板（不抢焦点） */
function setupAutoTranslate(context: vscode.ExtensionContext): void {
    let timer: NodeJS.Timeout | undefined;
    let lastText = '';
    context.subscriptions.push(
        vscode.window.onDidChangeTextEditorSelection(e => {
            if (!config.autoTranslateSelection()) {
                return;
            }
            const sel = e.selections.find(s => !s.isEmpty);
            const text = sel ? e.textEditor.document.getText(sel).trim() : '';
            if (!text || text.length > 800 || text === lastText) {
                return;
            }
            if (timer) {
                clearTimeout(timer);
            }
            timer = setTimeout(() => {
                lastText = text;
                void (async () => {
                    try {
                        const result = await translateQuery(
                            text,
                            config.sourceLanguage(),
                            config.targetLanguage()
                        );
                        storage.pushHistory({
                            query: result.query,
                            translation: result.text,
                            from: result.from,
                            to: result.to,
                            engineName: result.engineName
                        });
                        updatePanelResults([result]);
                    } catch {
                        // 自动翻译失败时静默，避免打扰输入
                    }
                })();
            }, 600);
        })
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

    setupAutoTranslate(context);

    context.subscriptions.push(
        vscode.workspace.onDidChangeConfiguration(e => {
            if (e.affectsConfiguration('translation')) {
                updateStatusBar();
            }
        })
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
}
