/**
 * 文档翻译中的受保护内联标签处理（对齐参考插件 v3.9.1）：
 * 翻译前将内联技术 token 替换为不可翻译占位符 ⟦N⟧，翻译后还原，
 * 避免引擎改动 <tag>、`code`、{var}、%s 等内容。
 */

export interface ProtectedText {
    /** 替换后的文本（送入引擎） */
    text: string;
    /** 还原译文中的占位符；找不到占位符的项保持译文原样（容错） */
    restore: (translated: string) => string;
}

/** 需要保护的内联 token 模式（顺序即优先级） */
const TOKEN_PATTERNS: RegExp[] = [
    /`[^`\n]+`/g, // 行内代码 `code`
    /<[^<>\n]{1,120}>/g, // HTML/XML 标签 <tag attr="x"> / </tag>
    /\{[${}?@/#\w][^{}\n]{0,80}\}/g, // {var} ${expr} {@link} {#anchor}
    /%(?:\d+\$)?[sdf]|%%/g // printf 占位符
];

// ⟦ ⟧（U+27E6/U+27E7）：数学白方括号，各翻译引擎普遍原样保留
const PLACEHOLDER_RE = /⟦(\d+)⟧/g;

export function protectInlineTokens(text: string): ProtectedText {
    const tokens: string[] = [];
    let masked = text;
    for (const pattern of TOKEN_PATTERNS) {
        masked = masked.replace(pattern, m => {
            tokens.push(m);
            return `⟦${tokens.length - 1}⟧`;
        });
    }
    if (tokens.length === 0) {
        return { text, restore: t => t };
    }
    return {
        text: masked,
        restore: (translated: string) =>
            translated.replace(PLACEHOLDER_RE, (m, idx) => {
                const i = Number(idx);
                return i >= 0 && i < tokens.length ? tokens[i] : m;
            })
    };
}
