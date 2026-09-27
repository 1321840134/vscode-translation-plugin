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
 * 查询文本归一化（智能取词核心）：snake_case/kebab-case/驼峰拆分为独立单词并小写。
 * 划选文本与光标取词共用，保证词典查询一致（驼峰整词直接查引擎效果差）。
 */
export function normalizeWordQuery(raw: string): string {
    return raw
        .replace(/[_']/g, ' ')
        .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
        .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2') // 连续大写结尾处拆分：HTTPServer → HTTP Server
        .replace(/\s+/g, ' ')
        .trim()
        .toLowerCase();
}

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
    // 中文无空格分隔，连续汉字段会整体取词：超过 12 字视为句子而非单词，
    // 不作为词典查询（句子翻译由面板路径处理）
    const han = raw.match(/[\u3400-\u9fff\uf900-\ufaff]/g)?.length ?? 0;
    if (han > 12) {
        return undefined;
    }
    // 词典查询惯例：英文统一小写（中文等不受影响）
    const query = normalizeWordQuery(raw);
    if (!query) {
        return undefined;
    }
    return { query, raw, range: new vscode.Range(position.line, s, position.line, e) };
}
