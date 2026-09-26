import * as vscode from 'vscode';
import * as config from './config';
import { AUTO, langName } from './languages';
import { protectInlineTokens } from './protect';
import { TranslationResult, translateQuery } from './services';
import { wordAtPosition } from './word';

/**
 * 悬浮翻译（对应参考插件的"文档翻译/悬浮提示翻译"高级特性）：
 * - 悬浮在单词上：显示词典翻译（含音标/释义）
 * - 悬停处有文档注释（内置 Hover 内容）：追加整段文档的翻译
 */

/**
 * 防止 executeHoverProvider 递归触发自身。
 * 注意：不能依赖 AsyncLocalStorage——其上下文无法跨过 vscode 命令
 * 执行边界传播，会导致防护失效、无限递归（悬浮永久加载中）。
 * 并发 hover 时本标志可能互相干扰（最坏情况为跳过一次文档翻译），
 * 由 extractPlainText 的自身内容过滤兜底。
 */
let mergingDocs = false;

export class TranslationHoverProvider implements vscode.HoverProvider {
    async provideHover(
        document: vscode.TextDocument,
        position: vscode.Position,
        token: vscode.CancellationToken
    ): Promise<vscode.Hover | undefined> {
        if (mergingDocs) {
            return undefined;
        }
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

        // 文档翻译：合并并翻译内置悬浮内容（IDEA 插件的"文档翻译"对应能力）
        if (config.hoverTranslateDocs()) {
            mergingDocs = true;
            try {
                const hovers = await vscode.commands.executeCommand<vscode.Hover[]>(
                    'vscode.executeHoverProvider',
                    document.uri,
                    position
                );
                const docText = extractPlainText(hovers);
                if (
                    docText &&
                    docText.length >= 2 &&
                    docText.length <= 800 &&
                    docText.trim() !== word.query
                ) {
                    // 受保护内联标签：{var}/<tag>/`code` 占位后再翻译（v3.9.1 对齐）
                    const guarded = protectInlineTokens(docText);
                    const docResult = await translateQuery(guarded.text, AUTO, to);
                    const docTranslated = guarded.restore(docResult.text);
                    if (!token.isCancellationRequested && docTranslated.trim() !== docText.trim()) {
                        md.appendMarkdown('\n\n---\n');
                        md.appendMarkdown('**文档翻译**');
                        md.appendMarkdown('\n\n');
                        md.appendText(docTranslated);
                    }
                }
            } catch {
                // 忽略文档合并失败
            } finally {
                mergingDocs = false;
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
