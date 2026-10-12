
export interface DictEntry {
    /** 释义（目标语言的词/短语） */
    term: string;
    /** 该释义对应的同义词/回译词（源语言，按词频降序） */
    synonyms: string[];
}

export interface Definition {
    /** 词性，如 noun / interjection，可能为空 */
    pos: string;
    terms: string[];
    /** 分释义的同义词组（对齐参考插件的词典呈现） */
    entries?: DictEntry[];
}

export interface TranslationResult {
    query: string;
    /** 检测到的源语言（规范代码；无法检测时为 auto） */
    from: string;
    to: string;
    /** 主译文 */
    text: string;
    /** 完整原文（文档注释翻译时携带，供面板"原文/译文"切换；query 为截断预览） */
    docSource?: string;
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
    /** from/to 为插件规范语言代码；from 可为 auto；signal 可取消底层请求 */
    translate(text: string, from: string, to: string, signal?: AbortSignal): Promise<TranslationResult>;
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

