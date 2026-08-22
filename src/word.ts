import * as vscode from 'vscode';

export interface WordInfo {
    /** 供翻译用的查询文本（驼峰/下划线已拆分） */
    query: string;
    /** 编辑器中的原文 */
    raw: string;
    range: vscode.Range;
}

const WORD_CHAR = /[\p{L}\p{N}_']/u;

/**
 * 提取位置处的单词/词组（供翻译）：
 * 智能取词 —— snake_case/kebab-case/驼峰 拆分为独立单词，更符合词典查询；
 * 同时支持中日韩文及各 Unicode 字母文字。
 */
export function wordAtPosition(document: vscode.TextDocument, position: vscode.Position): WordInfo | undefined {
    const line = document.lineAt(position.line).text;
    const isWordChar = (c: string): boolean => WORD_CHAR.test(c);
    let s = position.character;
    let e = position.character;
    while (s > 0 && isWordChar(line[s - 1])) {
        s--;
    }
    while (e < line.length && isWordChar(line[e])) {
        e++;
    }
    if (s >= e) {
        return undefined;
    }
    const raw = line.slice(s, e);
    if (!/\p{L}/u.test(raw)) {
        return undefined;
    }
    const query = raw
        .replace(/[_']/g, ' ')
        .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
        .replace(/\s+/g, ' ')
        .trim();
    if (!query) {
        return undefined;
    }
    return { query, raw, range: new vscode.Range(position.line, s, position.line, e) };
}
