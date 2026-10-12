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

export function buildReplaceCandidates(result: TranslationResult): ReplaceCandidate[] {
    const seen = new Set<string>();
    const out: ReplaceCandidate[] = [];
    // 去重规则：
    // - 语义候选（译文/义项/释义）：按小写键互斥，并登记精确键（阻止 Title/lower 等
    //   与译文完全相同的变体重复出现）
    // - 风格变体：仅按精确键去重（camelCase 与 PascalCase 仅大小写不同，均为有效候选）
    const push = (raw: string, description: string, exactMatch = false): void => {
        const text = raw.trim();
        if (!text) {
            return;
        }
        if (exactMatch) {
            if (seen.has(`=${text}`)) {
                return;
            }
            seen.add(`=${text}`);
        } else {
            if (seen.has(`@${text.toLowerCase()}`) || seen.has(`=${text}`)) {
                return;
            }
            seen.add(`@${text.toLowerCase()}`);
            seen.add(`=${text}`);
        }
        out.push({ label: text, description });
    };

    // 1) 主译文与其按分号/顿号/换行拆分的义项
    push(result.text, '译文');
    for (const part of result.text.split(/[;；、\n]/)) {
        push(part, '义项');
    }
    // 2) 词典释义（各词性的候选词）与每条释义的同义词组
    for (const def of result.definitions ?? []) {
        for (const term of def.terms) {
            push(term, def.pos ? `释义·${def.pos}` : '释义');
        }
        for (const entry of def.entries ?? []) {
            for (const syn of entry.synonyms) {
                push(syn, def.pos ? `同义词·${def.pos}` : '同义词');
            }
        }
    }
    // 3) 命名风格变体（中文等非拉丁译文会被去重自动跳过）
    push(formatTranslated(result.text, 'camelCase', ''), 'camelCase', true);
    push(formatTranslated(result.text, 'PascalCase', ''), 'PascalCase', true);
    push(formatTranslated(result.text, 'snake_case', ''), 'snake_case', true);
    push(formatTranslated(result.text, 'UPPER_SNAKE_CASE', ''), 'UPPER_SNAKE_CASE', true);
    push(formatTranslated(result.text, 'kebab-case', ''), 'kebab-case', true);
    push(formatTranslated(result.text, 'space', ' '), 'SPACE', true);
    push(formatTranslated(result.text, 'Title', ''), 'Title Case', true);
    push(formatTranslated(result.text, 'lower', ''), 'lower case', true);
    push(formatTranslated(result.text, 'UPPER', ''), 'UPPER CASE', true);
    return out;
}
