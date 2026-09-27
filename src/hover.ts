import * as vscode from 'vscode';
import * as config from './config';
import { AUTO, langName } from './languages';
import { TranslationResult, translateQuery } from './services';
import { wordAtPosition, normalizeWordQuery } from './word';

/**
 * 词典悬浮卡片（对应参考插件的词典查询悬浮）：
 * 只做单词级翻译（含音标/释义），单次请求即出结果；
 * 文档注释翻译是独立命令（translation.translateDocComment），不在此串行执行。
 *
 * 自动悬浮关闭时的触发控制：右键"翻译"命令通过 grantHoverAccess()
 * 授予短时授权（精确到命令触发时刻），普通"选中文本 + 鼠标悬停"不触发——
 * 否则用户日常选中代码时鼠标划过即翻译，等于关不掉。
 */

let grantedUntil = 0;

/** 授予词典悬浮访问权（右键"翻译"命令调用，短时有效） */
export function grantHoverAccess(ms = 2500): void {
    grantedUntil = Date.now() + ms;
}

export function isHoverAccessActive(): boolean {
    return Date.now() < grantedUntil;
}

export class TranslationHoverProvider implements vscode.HoverProvider {
    async provideHover(
        document: vscode.TextDocument,
        position: vscode.Position,
        token: vscode.CancellationToken
    ): Promise<vscode.Hover | undefined> {
        if (!config.hoverEnabled() && !isHoverAccessActive()) {
            return undefined;
        }
        // 以划选文本为准（右键"翻译"划选单词时使用选区本身）：
        // 不能依赖 wordAtPosition 重新取词——中文无空格分隔，取词会扩展为整个连续汉字段
        let query: string;
        let range: vscode.Range;
        const sel = vscode.window.activeTextEditor?.selection;
        if (sel && !sel.isEmpty && typeof sel.contains === 'function' && sel.contains(position)) {
            query = normalizeWordQuery(document.getText(sel).trim());
            range = sel;
            if (!query || query.length > 40) {
                return undefined; // 过长选区不适合词典卡片
            }
        } else {
            const word = wordAtPosition(document, position);
            if (!word) {
                return undefined;
            }
            query = word.query;
            range = word.range;
        }
        const to = config.targetLanguage();

        let wordResult: TranslationResult;
        try {
            wordResult = await translateQuery(query, AUTO, to);
        } catch (e) {
            // 不静默：给出错误提示卡片，用户可感知失败并重试
            if (token.isCancellationRequested) {
                return undefined;
            }
            const errMd = new vscode.MarkdownString();
            errMd.supportThemeIcons = true;
            errMd.isTrusted = false;
            errMd.appendMarkdown('$(translations) **');
            errMd.appendText(query);
            errMd.appendMarkdown('**\n\n$(error) ');
            errMd.appendText(`翻译失败: ${e instanceof Error ? e.message : String(e)}`);
            return new vscode.Hover(errMd, range);
        }
        if (token.isCancellationRequested) {
            return undefined;
        }

        const md = new vscode.MarkdownString();
        md.supportThemeIcons = true;
        md.isTrusted = false;
        md.appendMarkdown('$(translations) **');
        md.appendText(query);
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
        return new vscode.Hover(md, range);
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
