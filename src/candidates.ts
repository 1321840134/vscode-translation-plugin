import { TranslationResult } from './services';
import { formatTranslated } from './textFormat';

/**
 * "翻译并替换"的候选列表构建（对齐参考插件的替换选择弹窗）：
 * 主译文 → 译文拆分义项 → 词典释义 → 命名风格变体，去重后供用户选择。
 */

export interface ReplaceCandidate {
    /** 替换为目标文本 */
    label: string;
    /** 来源说明 */
    description: string;
}

export function buildReplaceCandidates(
    result: TranslationResult,
    spaceSeparator = ' '
): ReplaceCandidate[] {
    const seen = new Set<string>();
    const out: ReplaceCandidate[] = [];
    const push = (raw: string, description: string, exactMatch = false): void => {
        const text = raw.trim();
        if (!text) {
            return;
        }
        // 风格变体用精确匹配去重（camelCase 与 PascalCase 仅大小写不同，均为有效候选），
        // 语义候选用大小写不敏感去重
        const key = exactMatch ? text : text.toLowerCase();
        if (seen.has(key)) {
            return;
        }
        seen.add(key);
        out.push({ label: text, description });
    };

    // 1) 主译文与其按分号/顿号/换行拆分的义项
    push(result.text, '译文');
    for (const part of result.text.split(/[;；、\n]/)) {
        push(part, '义项');
    }
    // 2) 词典释义（各词性的候选词）
    for (const def of result.definitions ?? []) {
        for (const term of def.terms) {
            push(term, def.pos ? `释义·${def.pos}` : '释义');
        }
    }
    // 3) 命名风格变体（中文等非拉丁译文会被去重自动跳过）
    push(formatTranslated(result.text, 'camelCase', ''), 'camelCase', true);
    push(formatTranslated(result.text, 'PascalCase', ''), 'PascalCase', true);
    push(formatTranslated(result.text, 'snake_case', ''), 'SNAKE_CASE', true);
    push(formatTranslated(result.text, 'kebab-case', ''), 'kebab-case', true);
    push(formatTranslated(result.text, 'space', spaceSeparator), 'SPACE', true);
    return out;
}
