import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import * as config from './config';

export interface WordBookItem {
    id: string;
    text: string;
    translation: string;
    phonetic?: string;
    from: string;
    to: string;
    addTime: number;
}

export interface HistoryItem {
    id: string;
    query: string;
    translation: string;
    from: string;
    to: string;
    engineName: string;
    time: number;
}

interface StorageData {
    wordBook: WordBookItem[];
    history: HistoryItem[];
}

function newId(): string {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

/** 全局持久化存储（单词本 + 翻译历史），保存在插件 globalStorage 目录 */
export class Storage {
    private file = '';
    private data: StorageData = { wordBook: [], history: [] };
    private saveTimer?: NodeJS.Timeout;

    init(context: vscode.ExtensionContext): void {
        const dir = context.globalStorageUri.fsPath;
        try {
            fs.mkdirSync(dir, { recursive: true });
            this.file = path.join(dir, 'storage.json');
            const raw = fs.readFileSync(this.file, 'utf8');
            const parsed = JSON.parse(raw) as Partial<StorageData>;
            this.data = {
                wordBook: Array.isArray(parsed.wordBook) ? parsed.wordBook : [],
                history: Array.isArray(parsed.history) ? parsed.history : []
            };
        } catch (e) {
            // 文件不存在或损坏时使用空数据
        }
    }

    private save(): void {
        if (!this.file) {
            return;
        }
        if (this.saveTimer) {
            clearTimeout(this.saveTimer);
        }
        this.saveTimer = setTimeout(() => {
            try {
                fs.writeFileSync(this.file, JSON.stringify(this.data, null, 2), 'utf8');
            } catch (e) {
                // 忽略写入失败
            }
        }, 200);
    }

    /** 立即同步写盘（防抖窗口内退出时由 deactivate 调用，避免丢数据） */
    flush(): void {
        if (this.saveTimer) {
            clearTimeout(this.saveTimer);
            this.saveTimer = undefined;
        }
        if (this.file) {
            try {
                fs.writeFileSync(this.file, JSON.stringify(this.data, null, 2), 'utf8');
            } catch (e) {
                // 忽略写入失败
            }
        }
    }

    // ---- 单词本 ----

    hasWord(text: string, to: string): boolean {
        return this.data.wordBook.some(w => w.text === text && w.to === to);
    }

    addWord(item: {
        text: string;
        translation: string;
        phonetic?: string;
        from: string;
        to: string;
    }): WordBookItem {
        this.data.wordBook = this.data.wordBook.filter(w => !(w.text === item.text && w.to === item.to));
        const word: WordBookItem = {
            id: newId(),
            text: item.text,
            translation: item.translation,
            from: item.from,
            to: item.to,
            addTime: Date.now()
        };
        if (item.phonetic) {
            word.phonetic = item.phonetic;
        }
        this.data.wordBook.unshift(word);
        this.save();
        return word;
    }

    removeWord(id: string): void {
        this.data.wordBook = this.data.wordBook.filter(w => w.id !== id);
        this.save();
    }

    removeWordByText(text: string, to: string): void {
        this.data.wordBook = this.data.wordBook.filter(w => !(w.text === text && w.to === to));
        this.save();
    }

    clearWordBook(): void {
        this.data.wordBook = [];
        this.save();
    }

    listWords(): WordBookItem[] {
        return [...this.data.wordBook].sort((a, b) => b.addTime - a.addTime);
    }

    // ---- 翻译历史 ----

    pushHistory(item: {
        query: string;
        translation: string;
        from: string;
        to: string;
        engineName: string;
    }): void {
        if (!config.historyEnabled()) {
            return;
        }
        const trimmed = item.query.trim();
        if (!trimmed) {
            return;
        }
        const limit = config.historyLimit();
        // 相同查询去重，移到最前
        this.data.history = this.data.history.filter(
            h => !(h.query === trimmed && h.to === item.to)
        );
        this.data.history.unshift({
            id: newId(),
            query: trimmed,
            translation: item.translation,
            from: item.from,
            to: item.to,
            engineName: item.engineName,
            time: Date.now()
        });
        if (this.data.history.length > limit) {
            this.data.history = this.data.history.slice(0, limit);
        }
        this.save();
    }

    removeHistory(id: string): void {
        this.data.history = this.data.history.filter(h => h.id !== id);
        this.save();
    }

    clearHistory(): void {
        this.data.history = [];
        this.save();
    }

    listHistory(): HistoryItem[] {
        return [...this.data.history];
    }
}

export const storage = new Storage();
