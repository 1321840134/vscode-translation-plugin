/**
 * 翻译并替换：目标语言为英文时，将译文格式化为指定命名风格。
 * 非英文文本原样返回。
 */
export function formatTranslated(text: string, style: string, separator: string): string {
    if (style === 'original') {
        return text;
    }
    // 仅当译文以英文字母为主时才格式化（避免中文等其他语言的译文被破坏）
    const nonSpace = text.replace(/\s/g, '');
    if (!nonSpace) {
        return text;
    }
    const letters = text.replace(/[^A-Za-z]/g, '');
    if (!letters || letters.length < nonSpace.length / 2) {
        return text;
    }
    const words = text.match(/[A-Za-z]+/g);
    if (!words || words.length === 0) {
        return text;
    }
    const norm = words.map(w => w.toLowerCase());
    const cap = (w: string): string => (w ? w[0].toUpperCase() + w.slice(1) : w);
    switch (style) {
        case 'camelCase':
            return norm.map((w, i) => (i === 0 ? w : cap(w))).join('');
        case 'PascalCase':
            return norm.map(cap).join('');
        case 'snake_case':
            return norm.join('_');
        case 'kebab-case':
            return norm.join('-');
        case 'space':
            // 空分隔符 = 直接连接（config 层已保证未配置时使用默认空格）
            return norm.join(separator);
        default:
            return text;
    }
}
