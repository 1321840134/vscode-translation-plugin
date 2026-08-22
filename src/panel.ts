import * as vscode from 'vscode';
import * as config from './config';
import { buildHtml } from './html';
import { AUTO, LANGUAGES, langName } from './languages';
import { Definition, TranslationResult, translateQuery } from './services';
import { HistoryItem, WordBookItem, storage } from './storage';
import { synthesize } from './tts';

export type PanelTab = 'translate' | 'history' | 'wordbook';

export interface ResultView {
    query: string;
    text: string;
    phonetic?: string;
    from: string;
    to: string;
    fromName: string;
    toName: string;
    definitions?: Definition[];
    starred: boolean;
    engineName: string;
}

export function toResultView(r: TranslationResult): ResultView {
    const view: ResultView = {
        query: r.query,
        text: r.text,
        from: r.from,
        to: r.to,
        fromName: langName(r.from),
        toName: langName(r.to),
        starred: storage.hasWord(r.query, r.to),
        engineName: r.engineName
    };
    if (r.phonetic) {
        view.phonetic = r.phonetic;
    }
    if (r.definitions && r.definitions.length > 0) {
        view.definitions = r.definitions;
    }
    return view;
}

interface LastState {
    results: ResultView[];
    query?: string;
    error?: string;
}

let lastState: LastState = { results: [] };
let pendingShow: { tab?: PanelTab; focus?: boolean } | undefined;

class TranslationPanel {
    private static instance: TranslationPanel | undefined;
    /** 翻译请求序号：旧请求的响应不得覆盖新请求的结果 */
    private requestSeq = 0;

    static show(opts: { tab?: PanelTab; focusInput?: boolean } = {}): void {
        if (TranslationPanel.instance) {
            const p = TranslationPanel.instance;
            p.panel.reveal();
            p.applyShow(opts);
            return;
        }
        const viewColumn = config.panelPosition();
        const panel = vscode.window.createWebviewPanel(
            'translationPanel',
            '翻译',
            viewColumn,
            {
                enableScripts: true,
                retainContextWhenHidden: true,
                localResourceRoots: []
            }
        );
        TranslationPanel.instance = new TranslationPanel(panel);
        pendingShow = { tab: opts.tab, focus: opts.focusInput };
    }

    static get isOpen(): boolean {
        return TranslationPanel.instance !== undefined;
    }

    /** 面板未打开时的后续操作缓存 */
    static consumePendingShow(): { tab?: PanelTab; focus?: boolean } | undefined {
        const p = pendingShow;
        pendingShow = undefined;
        return p;
    }

    private constructor(private readonly panel: vscode.WebviewPanel) {
        panel.webview.html = buildHtml(panel.webview.cspSource, getNonce());
        panel.onDidDispose(() => {
            TranslationPanel.instance = undefined;
        });
        panel.webview.onDidReceiveMessage(msg => this.handle(msg));
    }

    private applyShow(opts: { tab?: PanelTab; focus?: boolean }): void {
        if (opts.tab) {
            this.post({ type: 'setTab', tab: opts.tab });
        }
        if (opts.focus) {
            this.post({ type: 'focus' });
        }
    }

    private post(message: unknown): void {
        void this.panel.webview.postMessage(message);
    }

    private refreshResults(): void {
        this.post({
            type: 'results',
            results: lastState.results.map(r => ({
                ...r,
                starred: storage.hasWord(r.query, r.to)
            })),
            query: lastState.query
        });
    }

    private async handle(msg: { type?: string } & Record<string, unknown>): Promise<void> {
        try {
            switch (msg.type) {
                case 'init-request':
                    this.post({
                        type: 'init',
                        languages: LANGUAGES,
                        from: config.sourceLanguage(),
                        to: config.targetLanguage(),
                        autoPlay: config.ttsAutoPlay(),
                        tab: pendingShow?.tab,
                        query: lastState.query,
                        results: lastState.results
                    });
                    {
                        const pending = TranslationPanel.consumePendingShow();
                        if (pending?.focus) {
                            this.post({ type: 'focus' });
                        }
                    }
                    break;
                case 'translate':
                    await this.doTranslate(String(msg.text ?? ''), String(msg.from ?? AUTO), String(msg.to ?? 'zh-CN'));
                    break;
                case 'langsChanged':
                    await config.setTargetLanguage(String(msg.to ?? 'zh-CN'));
                    if (msg.from && msg.from !== config.sourceLanguage()) {
                        await config.setSourceLanguage(String(msg.from));
                    }
                    break;
                case 'speak':
                    await this.doSpeak(String(msg.text ?? ''), String(msg.lang ?? 'en'));
                    break;
                case 'copy':
                    await vscode.env.clipboard.writeText(String(msg.text ?? ''));
                    vscode.window.setStatusBarMessage('已复制到剪贴板', 2500);
                    break;
                case 'star':
                    this.toggleStar(String(msg.text ?? ''), String(msg.to ?? 'zh-CN'));
                    break;
                case 'loadHistory':
                    this.post({ type: 'history', items: storage.listHistory() });
                    break;
                case 'loadWords':
                    this.post({ type: 'wordbook', items: storage.listWords() });
                    break;
                case 'removeHistory':
                    storage.removeHistory(String(msg.id ?? ''));
                    this.post({ type: 'history', items: storage.listHistory() });
                    break;
                case 'clearHistory':
                    storage.clearHistory();
                    this.post({ type: 'history', items: [] as HistoryItem[] });
                    break;
                case 'removeWord':
                    storage.removeWord(String(msg.id ?? ''));
                    this.post({ type: 'wordbook', items: storage.listWords() });
                    this.refreshResults();
                    break;
                case 'clearWordBook': {
                    const pick = await vscode.window.showWarningMessage('确定要清空单词本吗？', { modal: true }, '清空');
                    if (pick === '清空') {
                        storage.clearWordBook();
                        this.post({ type: 'wordbook', items: [] as WordBookItem[] });
                        this.refreshResults();
                    }
                    break;
                }
                case 'exportWordBook':
                    await exportWordBook();
                    break;
            }
        } catch (e) {
            const message = e instanceof Error ? e.message : String(e);
            this.post({ type: 'error', message });
        }
    }

    private async doTranslate(text: string, from: string, to: string): Promise<void> {
        const query = text.trim();
        if (!query) {
            return;
        }
        const seq = ++this.requestSeq;
        this.post({ type: 'loading' });
        try {
            const result = await translateQuery(query, from, to);
            if (seq !== this.requestSeq) {
                return; // 已有更新的翻译请求，丢弃本次结果
            }
            lastState = { results: [toResultView(result)], query };
            storage.pushHistory({
                query: result.query,
                translation: result.text,
                from: result.from,
                to: result.to,
                engineName: result.engineName
            });
            this.refreshResults();
            if (config.ttsAutoPlay()) {
                await this.doSpeak(result.query, result.from);
            }
        } catch (e) {
            if (seq !== this.requestSeq) {
                return;
            }
            const message = e instanceof Error ? e.message : String(e);
            lastState = { results: [], query, error: message };
            this.post({ type: 'error', message });
        }
    }

    private async doSpeak(text: string, lang: string): Promise<void> {
        try {
            const uri = await synthesize(text, lang);
            this.post({ type: 'tts', uri });
        } catch (e) {
            const message = e instanceof Error ? e.message : String(e);
            vscode.window.setStatusBarMessage(`朗读失败: ${message}`, 3000);
        }
    }

    private toggleStar(text: string, to: string): void {
        if (storage.hasWord(text, to)) {
            storage.removeWordByText(text, to);
        } else {
            const r = lastState.results.find(x => x.query === text && x.to === to);
            storage.addWord({
                text,
                translation: r?.text ?? '',
                phonetic: r?.phonetic,
                from: r?.from ?? AUTO,
                to
            });
        }
        this.post({ type: 'wordbook', items: storage.listWords() });
        this.refreshResults();
    }

    /** 命令入口：展示一批翻译结果；preserveFocus 为 true 时不抢编辑器焦点 */
    showResults(results: TranslationResult[], preserveFocus = false): void {
        const views = results.map(toResultView);
        lastState = { results: views, query: results.map(r => r.query).join('\n') };
        this.requestSeq++; // 外部结果到达时，作废面板内挂起的旧请求
        this.panel.reveal(undefined, preserveFocus);
        this.post({ type: 'setTab', tab: 'translate' });
        this.refreshResults();
    }

    static showResultsInPanel(results: TranslationResult[], preserveFocus = false): void {
        TranslationPanel.show({ tab: 'translate' });
        // show() 同步创建实例；直接投递结果
        TranslationPanel.instance?.showResults(results, preserveFocus);
    }

    /** 供自动翻译等后台场景使用：面板已打开则静默更新 */
    static postResultsQuiet(results: TranslationResult[]): void {
        const inst = TranslationPanel.instance;
        if (inst) {
            inst.showResults(results, true);
            return;
        }
        TranslationPanel.showResultsInPanel(results, true);
    }
}

function getNonce(): string {
    let text = '';
    const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    for (let i = 0; i < 32; i++) {
        text += possible.charAt(Math.floor(Math.random() * possible.length));
    }
    return text;
}

/** 供命令模块使用：打开/复用面板 */
export function showPanel(opts: { tab?: PanelTab; focusInput?: boolean } = {}): void {
    TranslationPanel.show(opts);
}

export function showResultsInPanel(results: TranslationResult[]): void {
    TranslationPanel.showResultsInPanel(results);
}

/** 后台更新面板结果（不抢焦点，面板未打开时在侧边打开） */
export function updatePanelResults(results: TranslationResult[]): void {
    TranslationPanel.postResultsQuiet(results);
}

export async function exportWordBook(): Promise<void> {
    const words = storage.listWords();
    if (words.length === 0) {
        void vscode.window.showInformationMessage('单词本为空，没有可导出的内容');
        return;
    }
    const uri = await vscode.window.showSaveDialog({
        defaultUri: vscode.Uri.file('wordbook.json'),
        filters: { 'JSON 文件': ['json'] }
    });
    if (!uri) {
        return;
    }
    const content = JSON.stringify(
        words.map(w => ({
            word: w.text,
            translation: w.translation,
            phonetic: w.phonetic,
            from: w.from,
            to: w.to,
            addTime: new Date(w.addTime).toISOString()
        })),
        null,
        2
    );
    await vscode.workspace.fs.writeFile(uri, Buffer.from(content, 'utf8'));
    void vscode.window.showInformationMessage(`已导出 ${words.length} 个单词到 ${uri.fsPath}`);
}
