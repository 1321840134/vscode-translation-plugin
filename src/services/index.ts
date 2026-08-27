import * as config from '../config';
import {
    AUTO,
    guessCjkLanguage,
    looksZhToZh,
    oppositeTargetLang,
    sameLanguage
} from '../languages';
import { protectInlineTokens } from '../protect';
import { alibabaEngine } from './alibaba';
import { baiduEngine } from './baidu';
import { deeplEngine } from './deepl';
import { googleEngine } from './google';
import { microsoftEngine } from './microsoft';
import { openaiEngine } from './openai';
import { TranslationEngine, TranslationResult } from './types';
import { youdaoEngine } from './youdao';

export { EngineError } from './types';
export type { TranslationEngine, TranslationResult, Definition } from './types';

export const ENGINES: TranslationEngine[] = [
    microsoftEngine,
    googleEngine,
    deeplEngine,
    openaiEngine,
    youdaoEngine,
    baiduEngine,
    alibabaEngine
];

export function getEngineById(id: string): TranslationEngine | undefined {
    return ENGINES.find(e => e.id === id);
}

export function currentEngine(): TranslationEngine {
    return getEngineById(config.engine()) ?? googleEngine;
}

// ---------------------------------------------------------------------------
// LRU 缓存：TTL 过期 + 引擎配置指纹入键
// （对齐参考插件 v3.9.1：修复配置变更/文档翻译场景下的缓存冲突）
// ---------------------------------------------------------------------------
const CACHE_LIMIT = 200;
const CACHE_TTL_MS = 10 * 60 * 1000;
const cache = new Map<string, { result: TranslationResult; ts: number }>();

/** 构造缓存键（导出供测试）：引擎+方向+文本+配置指纹 */
export function buildCacheKey(
    engineId: string,
    from: string,
    to: string,
    text: string,
    fingerprint: string
): string {
    return `${engineId}|${from}|${to}|${text}|${fingerprint}`;
}

/** 清空翻译缓存（配置变更后可手动调用） */
export function clearCache(): void {
    cache.clear();
}

/** 进行中的请求（相同查询共享同一个 Promise，避免并发重复请求） */
const inflight = new Map<string, Promise<TranslationResult>>();

/** 可重试的网络类错误（"请求已取消"不重试） */
const RETRYABLE = /网络请求超时|代理连接超时|ECONNRESET|ECONNREFUSED|EPIPE|EAI_AGAIN|socket hang up|HTTP 5\d\d/;

async function withRetry<T>(fn: () => Promise<T>): Promise<T> {
    try {
        return await fn();
    } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        if (!RETRYABLE.test(msg)) {
            throw e;
        }
        await new Promise(r => setTimeout(r, 600));
        return await fn();
    }
}

export interface ResolvedDirection {
    effFrom: string;
    effTo: string;
}

/**
 * 翻译方向决策（纯函数，供测试）：
 * 自动换向开启时，源语言与目标语言相同则切换目标语言（中文↔英文），
 * 先本地预判（可靠区分中/日/韩），避免一次无效请求。
 */
export function resolveDirection(text: string, from: string, to: string): ResolvedDirection {
    let effFrom = from;
    let effTo = to;
    if (config.autoSwapTarget()) {
        if (from !== AUTO && sameLanguage(from, to)) {
            effTo = oppositeTargetLang(to);
        } else if (from === AUTO) {
            const guess = guessCjkLanguage(text);
            if (guess && sameLanguage(guess, to)) {
                effTo = oppositeTargetLang(to);
            }
        }
    }
    return { effFrom, effTo };
}

/**
 * 响应后判断是否需要换向重试（纯函数，供测试）：
 * 服务端检测语言=目标语言（本地未预判到的语种），
 * 或目标为中文但译文原样保留了原文汉字（混合文本被误判为其他语言的中译中）。
 */
export function needsRetrySwap(
    source: string,
    result: Pick<TranslationResult, 'from' | 'to' | 'text'>
): boolean {
    if (!config.autoSwapTarget()) {
        return false;
    }
    const sameDetected = result.from !== AUTO && sameLanguage(result.from, result.to);
    const zhToZh = result.to.startsWith('zh') && looksZhToZh(source, result.text);
    return sameDetected || zhToZh;
}

export async function translateQuery(
    text: string,
    from: string,
    to: string,
    engineId?: string,
    signal?: AbortSignal
): Promise<TranslationResult> {
    const engine = engineId ? getEngineById(engineId) ?? currentEngine() : currentEngine();

    const { effFrom, effTo } = resolveDirection(text, from, to);

    const key = buildCacheKey(engine.id, effFrom, effTo, text, config.engineFingerprint());
    const hit = cache.get(key);
    if (hit && Date.now() - hit.ts < CACHE_TTL_MS) {
        cache.delete(key);
        cache.set(key, hit);
        return { ...hit.result };
    }
    if (hit) {
        cache.delete(key); // 过期条目直接淘汰
    }
    const pending = inflight.get(key);
    if (pending) {
        return { ...(await pending) };
    }
    const task = (async (): Promise<TranslationResult> => {
        let result = await withRetry(() => engine.translate(text, effFrom, effTo, signal));
        if (needsRetrySwap(text, result)) {
            const retryFrom = result.from !== AUTO ? result.from : AUTO;
            result = await withRetry(() =>
                engine.translate(text, retryFrom, oppositeTargetLang(result.to), signal)
            );
        }
        cache.set(key, { result, ts: Date.now() });
        if (cache.size > CACHE_LIMIT) {
            const oldest = cache.keys().next();
            if (!oldest.done && oldest.value !== undefined) {
                cache.delete(oldest.value);
            }
        }
        return result;
    })();
    inflight.set(key, task);
    try {
        return { ...(await task) };
    } finally {
        inflight.delete(key);
    }
}

/** 按行边界将长文本切分为不超过 max 长度的块 */
export function chunkText(text: string, max = 1600): string[] {
    const chunks: string[] = [];
    let cur = '';
    for (let line of text.split('\n')) {
        while (line.length > max) {
            if (cur) {
                chunks.push(cur);
                cur = '';
            }
            chunks.push(line.slice(0, max));
            line = line.slice(max);
        }
        if (cur.length + line.length + 1 > max) {
            chunks.push(cur);
            cur = line;
        } else {
            cur = cur ? `${cur}\n${line}` : line;
        }
    }
    if (cur) {
        chunks.push(cur);
    }
    return chunks.length > 0 ? chunks : [''];
}

/** 长文本翻译选项 */
export interface TranslateLongOptions {
    /** 保留原文：输出"原文\n译文"对照块（对应参考插件文档翻译保留原文） */
    preserveSource?: boolean;
    /** 翻译实现（默认门面，供测试注入） */
    translateImpl?: typeof translateQuery;
}

/** 长文本翻译：分块请求后合并（用于整篇文档翻译） */
export async function translateLong(
    text: string,
    from: string,
    to: string,
    onProgress?: (done: number, total: number) => void,
    options: TranslateLongOptions = {}
): Promise<TranslationResult> {
    const impl = options.translateImpl ?? translateQuery;
    const chunks = chunkText(text);
    const parts: string[] = [];
    const pairs: [string, string][] = [];
    let head: TranslationResult | undefined;
    let phonetic: string | undefined;
    const definitions: { pos: string; terms: string[] }[] = [];
    for (let i = 0; i < chunks.length; i++) {
        const chunk = chunks[i];
        // 受保护内联标签：{var}/<tag>/`code`/%s 翻译前占位、翻译后还原（v3.9.1 对齐）
        const guarded = protectInlineTokens(chunk);
        const r = await impl(guarded.text, from, to);
        const restoredText = guarded.restore(r.text);
        if (!head) {
            head = r;
            phonetic = r.phonetic;
        }
        if (r.definitions) {
            for (const d of r.definitions) {
                definitions.push(d);
            }
        }
        parts.push(restoredText);
        pairs.push([chunk, restoredText]);
        if (onProgress) {
            onProgress(i + 1, chunks.length);
        }
    }
    const merged: TranslationResult = {
        query: text,
        from: head?.from ?? from,
        to: head?.to ?? to,
        text: options.preserveSource
            ? pairs.map(([src, dst]) => `${src}\n${dst}`).join('\n\n')
            : parts.join('\n'),
        engineId: head?.engineId ?? currentEngine().id,
        engineName: head?.engineName ?? currentEngine().name
    };
    if (phonetic) {
        merged.phonetic = phonetic;
    }
    if (definitions.length > 0) {
        merged.definitions = definitions.slice(0, 5);
    }
    return merged;
}
