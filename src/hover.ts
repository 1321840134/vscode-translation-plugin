import * as vscode from 'vscode';
import { AsyncLocalStorage } from 'async_hooks';
import * as config from './config';
import { AUTO, langName } from './languages';
import { TranslationResult, translateQuery } from './services';
import { wordAtPosition } from './word';

/**
 * 悬浮翻译（对应参考插件的"文档翻译/悬浮提示翻译"高级特性）：
 * - 悬浮在单词上：显示词典翻译（含音标/释义）
 * - 悬停处有文档注释（内置 Hover 内容）：追加整段文档的翻译
 */

/** 防止 executeHoverProvider 递归触发自身（异步上下文隔离，并发 hover 互不影响） */
const hoverContext = new AsyncLocalStorage<{ merging: boolean }>();

export class TranslationHoverProvider implements vscode.HoverProvider {
    async provideHover(
        document: vscode.TextDocument,
        position: vscode.Position,
        token: vscode.CancellationToken
    ): Promise<vscode.Hover | undefined> {
        if (hoverContext.getStore()?.merging || !config.hoverEnabled()) {
            return undefined;
        }
        const word = wordAtPosition(document, position);
        if (!word) {
            return undefined;
        }
        const to = config.targetLanguage();
        // 悬浮被取消（鼠标移走）时中止底层网络请求，避免划词时堆积请求
        const controller = new AbortController();
        const disposableView = token.onCancellationRequested(() => controller.abort());
        let wordResult: TranslationResult;
        try {
            wordResult = await translateQuery(word.query, AUTO, to, undefined, controller.signal);
        } catch {
            return undefined;
        } finally {
            disposableView.dispose();
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

        // 文档翻译：合并并翻译内置悬浮内容（IDEA 插件的"文档翻译"对应能力）
        if (config.hoverTranslateDocs()) {
            const hovers = await hoverContext.run({ merging: true }, () =>
                vscode.commands.executeCommand<vscode.Hover[]>(
                    'vscode.executeHoverProvider',
                    document.uri,
                    position
                )
            );
            try {
                const docText = extractPlainText(hovers);
                if (
                    docText &&
                    docText.length >= 2 &&
                    docText.length <= 800 &&
                    docText.trim() !== word.query
                ) {
                    const docResult = await translateQuery(docText, AUTO, to);
                    if (!token.isCancellationRequested && docResult.text.trim() !== docText.trim()) {
                        md.appendMarkdown('\n\n---\n');
                        md.appendMarkdown('**文档翻译**');
                        md.appendMarkdown('\n\n');
                        md.appendText(docResult.text);
                    }
                }
            } catch {
                // 忽略文档合并失败
            }
        }

        return new vscode.Hover(md, word.range);
    }
}

/** 从内置 Hover 结果中提取纯文本（去 Markdown 符号/代码块） */
function extractPlainText(hovers: vscode.Hover[] | undefined): string {
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
            // 跳过本插件自己产生的悬浮内容，避免并发 hover 时被当作文档二次翻译
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
