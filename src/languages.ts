export const AUTO = 'auto';

export interface Lang {
    code: string;
    name: string;
}

/** 插件规范语言代码（以 Google 代码为基准） */
export const LANGUAGES: Lang[] = [
    { code: 'zh-CN', name: '中文（简体）' },
    { code: 'zh-TW', name: '中文（繁体）' },
    { code: 'en', name: '英语' },
    { code: 'ja', name: '日语' },
    { code: 'ko', name: '韩语' },
    { code: 'fr', name: '法语' },
    { code: 'de', name: '德语' },
    { code: 'ru', name: '俄语' },
    { code: 'es', name: '西班牙语' },
    { code: 'pt', name: '葡萄牙语' },
    { code: 'it', name: '意大利语' },
    { code: 'ar', name: '阿拉伯语' },
    { code: 'th', name: '泰语' },
    { code: 'vi', name: '越南语' },
    { code: 'id', name: '印尼语' },
    { code: 'ms', name: '马来语' },
    { code: 'tr', name: '土耳其语' },
    { code: 'nl', name: '荷兰语' },
    { code: 'pl', name: '波兰语' },
    { code: 'sv', name: '瑞典语' }
];

const NAME_MAP = new Map<string, string>(LANGUAGES.map(l => [l.code, l.name]));

export function langName(code: string): string {
    if (!code || code === AUTO) {
        return '自动检测';
    }
    return NAME_MAP.get(code) ?? code;
}

/**
 * 本地预判中日韩语言（用于源语言=目标语言时的快速换向，避免一次无效请求）：
 * 含假名判为日语，含谚文判为韩语，含足量汉字判为中文；无法判断返回 undefined。
 * 汉字阈值取 10%：代码文档常为中英混合（标识符/参数名稀释占比），只要汉字达 2 个
 * 且占比 >= 10% 即视为中文内容，避免混合文本漏判导致"中译中"。
 */
export function guessCjkLanguage(text: string): string | undefined {
    const sample = text.slice(0, 500);
    if (/[\u3040-\u30ff]/.test(sample)) {
        return 'ja';
    }
    if (/[\uac00-\ud7af\u1100-\u11ff]/.test(sample)) {
        return 'ko';
    }
    const han = sample.match(/[\u3400-\u9fff\uf900-\ufaff]/g)?.length ?? 0;
    const stripped = sample.replace(/\s+/g, '');
    if (han >= 2 && stripped.length > 0 && han / stripped.length >= 0.1) {
        return 'zh-CN';
    }
    return undefined;
}

export function hanCount(text: string): number {
    return text.match(/[\u4e00-\u9fff]/g)?.length ?? 0;
}

/**
 * 判断是否为"中译中"：目标为中文时，译文几乎原样保留了原文的汉字（>=70%），
 * 说明没有发生实质翻译。含假名的日文原文除外（汉字本就大量保留，属正常日译中）。
 */
export function looksZhToZh(source: string, translated: string): boolean {
    if (/[\u3040-\u30ff]/.test(source)) {
        return false;
    }
    const src = hanCount(source);
    if (src < 2) {
        return false;
    }
    const dst = hanCount(translated);
    return dst > 0 && dst >= src * 0.7;
}

/** 同语种互换时的目标语言：中文 ↔ 英文 */
export function oppositeTargetLang(to: string): string {
    return to.startsWith('zh') ? 'en' : 'zh-CN';
}

/** 判断两个语言代码是否为同一语言（简繁视为同族） */
export function sameLanguage(a: string, b: string): boolean {
    if (a === b) {
        return true;
    }
    return a.startsWith('zh') && b.startsWith('zh');
}
