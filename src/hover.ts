import * as vscode from 'vscode';
import * as config from './config';
import { AUTO, langName } from './languages';
import { TranslationResult, translateQuery } from './services';
import { wordAtPosition } from './word';

/**
 * 词典悬浮卡片（对应参考插件的词典查询悬浮）：
 * 只做单词级翻译（含音标/释义），单次请求即出结果；
 * 文档注释翻译是独立命令（translation.translateDocComment），不在此串行执行。
 */

export class TranslationHoverProvider implements vscode.HoverProvider {
    async provideHover(
        document: vscode.TextDocument,
        position: vscode.Position,
        token: vscode.CancellationToken
    ): Promise<vscode.Hover | undefined> {
        if (!config.hoverEnabled()) {
            // 自动悬浮已关闭：仅当选中了文本（右键"翻译"命令触发的词典查询）时工作
            const sel = vscode.window.activeTextEditor?.selection;
            if (!sel || sel.isEmpty || !sel.contains(position)) {
                return undefined;
            }
        }
        const word = wordAtPosition(document, position);
        if (!word) {
            return undefined;
        }
        const to = config.targetLanguage();

        let wordResult: TranslationResult;
        try {
            wordResult = await translateQuery(word.query, AUTO, to);
        } catch {
            return undefined;
        }
        if (token.isCancellationRequested) {
            return undefined;
        }

        const md = new vscode.MarkdownString();
        md.supportThemeIcons = true;
        md.isTrusted = false;
        md.appendMarkdown('$(translations) **');
        md.appendText(word.query);
        md.appendMarkdown('**');
        if (wordResult.phonetic) {
            md.appendMarkdown('  ');
            md.appendText(`/${wordResult.phonetic}/`);
        }
        md.appendMarkdown('\n\n');
        md.appendText(wordResult.text);
        if (wordResult.definitions && wordResult.definitions.length > 0) {
            for (const def of wordResult.definitions.slice(0, 3)) {
                md.appendMarkdown('\n\n');
                md.appendText((def.pos ? `${def.pos}  ` : '') + def.terms.slice(0, 5).join('；'));
            }
        }
        md.appendMarkdown(
            `\n\n---\n*${wordResult.engineName} · ${langName(wordResult.from)} → ${langName(wordResult.to)}*`
        );
        return new vscode.Hover(md, word.range);
    }
}

/** 从内置 Hover 结果中提取纯文本（去 Markdown 符号/代码块，过滤本插件自身输出） */
export function extractPlainText(hovers: vscode.Hover[] | undefined): string {
    if (!Array.isArray(hovers)) {
        return '';
    }
    const parts: string[] = [];
    for (const hover of hovers) {
        const contents = (hover as { contents?: unknown }).contents;
        if (!Array.isArray(contents)) {
            continue;
        }
        for (const c of contents) {
            const text =
                typeof c === 'string'
                    ? c
                    : c && typeof (c as vscode.MarkdownString).value === 'string'
                        ? (c as vscode.MarkdownString).value
                        : '';
            if (!text || text.includes('$(translations)')) {
                continue;
            }
            parts.push(text);
        }
    }
    return parts
        .join('\n')
        .replace(/```[\s\S]*?```/g, ' ')
        .replace(/`([^`]*)`/g, '$1')
        .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
        .replace(/[#>*_~|]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 800);
}
