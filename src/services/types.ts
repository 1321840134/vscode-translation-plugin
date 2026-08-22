import { langName } from '../languages';

export interface Definition {
    /** 词性，如 noun / interjection，可能为空 */
    pos: string;
    terms: string[];
}

export interface TranslationResult {
    query: string;
    /** 检测到的源语言（规范代码；无法检测时为 auto） */
    from: string;
    to: string;
    /** 主译文 */
    text: string;
    /** 原文音标/罗马音（仅词典类结果） */
    phonetic?: string;
    /** 分词性释义（仅词典类结果） */
    definitions?: Definition[];
    engineId: string;
    engineName: string;
}

export interface TranslationEngine {
    readonly id: string;
    readonly name: string;
    /** 引擎是否已配置好（密钥等），未配置时给出设置项提示 */
    readonly configHint?: string;
    /** from/to 为插件规范语言代码；from 可为 auto */
    translate(text: string, from: string, to: string): Promise<TranslationResult>;
}

export class EngineError extends Error {
    constructor(message: string, readonly engineId: string) {
        super(message);
    }
}

export function makeResult(
    engine: TranslationEngine,
    query: string,
    from: string,
    to: string,
    text: string,
    phonetic?: string,
    definitions?: Definition[]
): TranslationResult {
    const r: TranslationResult = {
        query,
        from,
        to,
        text,
        engineId: engine.id,
        engineName: engine.name
    };
    if (phonetic) {
        r.phonetic = phonetic;
    }
    if (definitions && definitions.length > 0) {
        r.definitions = definitions;
    }
    return r;
}

/** 源/目标语言名，供提示语拼接 */
export function describeDirection(from: string, to: string): string {
    const src = from === 'auto' ? '自动检测语言' : langName(from);
    return `${src} → ${langName(to)}`;
}
