import * as config from '../config';
import { bingLookupDictionary, bingTranslate, isUncommonDetection } from '../bing';
import { request } from '../net';
import { Definition, EngineError, TranslationEngine, TranslationResult, makeResult } from './types';

/**
 * Edge 浏览器公开的免费翻译端点（与参考插件使用的方案一致，无需令牌/密钥）。
 * POST https://edge.microsoft.com/translate/translatetext?from=&to=zh-Hans&isEnterpriseClient=false
 * body 为 JSON 字符串数组，from 留空表示自动检测；响应含 detectedLanguage。
 */
const EDGE_TRANSLATE_URL = 'https://edge.microsoft.com/translate/translatetext';
const AZURE_TRANSLATE_URL = 'https://api.cognitive.microsofttranslator.com/translate';
const AZURE_DICT_URL = 'https://api.cognitive.microsofttranslator.com/dictionary/lookup';

const TO_MS: Record<string, string> = {
    'zh-CN': 'zh-Hans',
    'zh-TW': 'zh-Hant'
};
const FROM_MS: Record<string, string> = {
    'zh-Hans': 'zh-CN',
    'zh-Hant': 'zh-TW'
};

interface MsItem {
    detectedLanguage?: { language: string; score?: number };
    translations: { text: string; to: string }[];
}

interface RawResponse {
    status: number;
    buffer: Buffer;
}

function parseTranslateResponse(
    raw: RawResponse,
    text: string,
    from: string,
    to: string
): TranslationResult {
    if (raw.status !== 200) {
        if (raw.status === 401) {
            throw new EngineError('微软翻译未授权，请检查 translation.microsoft.subscriptionKey', 'microsoft');
        }
        if (raw.status === 403) {
            throw new EngineError('微软翻译拒绝访问，请检查密钥与 translation.microsoft.region 设置', 'microsoft');
        }
        if (raw.status === 429) {
            throw new EngineError('微软翻译请求过于频繁，请稍后再试', 'microsoft');
        }
        throw new EngineError(
            `微软翻译请求失败 (HTTP ${raw.status}): ${raw.buffer.toString('utf8').slice(0, 200)}`,
            'microsoft'
        );
    }
    let items: MsItem[];
    try {
        items = JSON.parse(raw.buffer.toString('utf8'));
    } catch {
        throw new EngineError('微软翻译响应解析失败', 'microsoft');
    }
    const item = items?.[0];
    const translated = item?.translations?.[0]?.text;
    if (!translated) {
        throw new EngineError('微软翻译未返回译文', 'microsoft');
    }
    const detected = item.detectedLanguage?.language;
    const fromCanonical = detected ? FROM_MS[detected] ?? detected : from;
    return makeResult(microsoftEngine, text, fromCanonical, to, translated);
}

/**
 * 微软翻译：默认走 Edge 公开端点（免费、无需密钥）；
 * 若配置了 Azure 订阅密钥则优先使用密钥（适合有正式订阅的用户）。
 */
export const microsoftEngine: TranslationEngine = {
    id: 'microsoft',
    name: '微软翻译',

    async translate(text: string, from: string, to: string, signal?: AbortSignal): Promise<TranslationResult> {
        const toMs = TO_MS[to] ?? to;
        const fromMs = from === 'auto' ? '' : TO_MS[from] ?? from;
        const apiKey = config.microsoftKey();

        // 注意两个端点请求体格式不同：Azure 为 [{Text}] 对象数组，Edge 为纯字符串数组
        const body = apiKey
            ? JSON.stringify([{ Text: text }])
            : JSON.stringify([text]);
        const headers: Record<string, string> = {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(body).toString(),
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        };
        const requestOptions = { method: 'POST', headers, body, signal, proxy: config.httpProxy() };

        if (apiKey) {
            const region = config.microsoftRegion();
            if (region) {
                headers['Ocp-Apim-Subscription-Region'] = region;
            }
            headers['Ocp-Apim-Subscription-Key'] = apiKey;
            const url =
                `${AZURE_TRANSLATE_URL}?api-version=3.0` +
                `&from=${encodeURIComponent(fromMs)}&to=${encodeURIComponent(toMs)}`;
            const raw = await request(url, requestOptions);
            const result = parseTranslateResponse(raw, text, from, to);
            // 单词查询时用 Azure 词典接口增强（对齐参考插件的微软词典呈现：
            // 分词性释义 + 每条释义的同义词/回译词），失败静默降级为纯翻译
            const detectedMs = TO_MS[result.from] ?? result.from;
            if (isWordQuery(text)) {
                const definitions = await lookupDictionary(
                    text,
                    detectedMs,
                    toMs,
                    apiKey,
                    config.microsoftRegion(),
                    signal
                );
                if (definitions && definitions.length > 0) {
                    result.definitions = definitions;
                }
            }
            return result;
        }

        // 免费路径（对齐参考插件 BingTranslator）：主走 Bing 网页版翻译+词典
        // （与 IDEA 中"微软翻译"同源，译文与词典数据一致），失败回退 Edge 免费端点
        try {
            let translated = await bingTranslate(text, fromMs, toMs, signal);
            let effectiveFromMs = fromMs;
            // auto-detect 误判兜底：短英文词被 cn.bing.com 判为冷门语言（如 put → sr-Latn）
            // 时按 en 重试；显式语言的结果不采信 detected，按实际查询语言标注
            if (fromMs === '' && isUncommonDetection(translated.detected, text)) {
                console.log(`[translation] ms bing uncommon detection: ${translated.detected}, retry as en`);
                const retry = await bingTranslate(text, 'en', toMs, signal).catch(() => undefined);
                if (retry) {
                    translated = retry;
                    effectiveFromMs = 'en';
                }
            }
            const fromCanonical = effectiveFromMs
                ? FROM_MS[effectiveFromMs] ?? effectiveFromMs
                : FROM_MS[translated.detected] ?? (translated.detected || from);
            const result = makeResult(microsoftEngine, text, fromCanonical, to, translated.text);
            if (isWordQuery(text)) {
                const dictFromMs = effectiveFromMs || (TO_MS[result.from] ?? result.from);
                const defs = await bingLookupDictionary(
                    text,
                    result.text,
                    dictFromMs,
                    toMs,
                    signal
                ).catch(e => {
                    console.log(`[translation] ms bing dict failed: ${e instanceof Error ? e.message : String(e)}`);
                    return undefined;
                });
                console.log(
                    `[translation] ms bing path: "${text.slice(0, 20)}" → "${translated.text.slice(0, 20)}" (detected=${translated.detected}, dict=${defs?.length ?? 0})`
                );
                if (defs && defs.length > 0) {
                    result.definitions = defs;
                }
            }
            return result;
        } catch (e) {
            // Bing 不可用时回退 Edge 免费端点（译文可能略有差异，词典尽力而为）
            console.log(`[translation] ms bing translate failed, fallback to edge: ${e instanceof Error ? e.message : String(e)}`);
        }

        const url =
            `${EDGE_TRANSLATE_URL}?from=${encodeURIComponent(fromMs)}` +
            `&to=${encodeURIComponent(toMs)}&isEnterpriseClient=false`;
        const raw = await request(url, requestOptions);
        const result = parseTranslateResponse(raw, text, from, to);
        // 回退路径的词典增强：单词查询用 Bing 词典接口，失败静默降级为纯翻译
        if (isWordQuery(text)) {
            const detectedMs = TO_MS[result.from] ?? result.from;
            const defs = await bingLookupDictionary(
                text,
                result.text,
                detectedMs,
                toMs,
                signal
            ).catch(() => undefined);
            if (defs && defs.length > 0) {
                result.definitions = defs;
            }
        }
        return result;
    }
};

/**
 * 词典查询适用的文本判定（对齐参考插件：长度 ≤50、含字母即可，允许短语——
 * 右键翻译的驼峰词经拆分后为多词串，同样应查询词典）。
 */
export function isWordQuery(text: string): boolean {
    return text.length <= 50 && /\p{L}/u.test(text);
}

/** Bing/Azure 词典 posTag → 中文词性（对齐参考插件的词典显示） */
const POS_ZH: Record<string, string> = {
    VERB: '动词',
    NOUN: '名词',
    ADJECTIVE: '形容词',
    ADVERB: '副词',
    ADPOSITION: '介词',
    CONJUNCTION: '连词',
    DETERMINER: '限定词',
    INTERJECTION: '感叹词',
    NUMERAL: '数词',
    PRONOUN: '代词',
    PROPER_NOUN: '专有名词',
    PARTICLE: '助词',
    MODAL: '情态动词',
    PREPOSITION: '介词',
    OTHER: '其他'
};

function posToZh(posTag: string): string {
    return POS_ZH[posTag.toUpperCase()] ?? posTag.toLowerCase();
}

interface MsDictTranslation {
    displayTarget?: string;
    posTag?: string;
    confidence?: number;
    backTranslations?: { displayText?: string; frequencyCount?: number }[];
}

/**
 * 解析 Azure dictionary/lookup 响应：按 confidence 取前若干条，
 * 同词性聚合，backTranslations（按词频降序）作为每条释义的同义词组。
 */
export function parseMsDict(items: unknown): Definition[] {
    if (!Array.isArray(items)) {
        return [];
    }
    const translations = (items[0] as { translations?: MsDictTranslation[] } | undefined)?.translations ?? [];
    const sorted = [...translations]
        .sort((a, b) => (b.confidence ?? 0) - (a.confidence ?? 0))
        .slice(0, 6);
    const byPos = new Map<string, Definition>();
    for (const t of sorted) {
        const term = String(t.displayTarget ?? '').trim();
        if (!term) {
            continue;
        }
        const pos = posToZh(String(t.posTag ?? ''));
        const synonyms = (t.backTranslations ?? [])
            .slice()
            .sort((a, b) => (b.frequencyCount ?? 0) - (a.frequencyCount ?? 0))
            .map(bt => String(bt.displayText ?? '').trim())
            .filter(Boolean)
            .slice(0, 8);
        const def = byPos.get(pos) ?? { pos, terms: [], entries: [] };
        def.terms.push(term);
        def.entries?.push({ term, synonyms });
        byPos.set(pos, def);
    }
    return [...byPos.values()].slice(0, 5);
}

/** 调用 Azure 词典接口；任何失败均静默返回 undefined（词典增强不阻塞翻译） */
async function lookupDictionary(
    text: string,
    fromMs: string,
    toMs: string,
    apiKey: string,
    region: string,
    signal?: AbortSignal
): Promise<Definition[] | undefined> {
    if (!fromMs || !toMs) {
        return undefined;
    }
    const body = JSON.stringify([{ Text: text }]);
    const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body).toString(),
        'Ocp-Apim-Subscription-Key': apiKey
    };
    if (region) {
        headers['Ocp-Apim-Subscription-Region'] = region;
    }
    try {
        const url =
            `${AZURE_DICT_URL}?api-version=3.0` +
            `&from=${encodeURIComponent(fromMs)}&to=${encodeURIComponent(toMs)}`;
        const raw = await request(url, { method: 'POST', headers, body, signal, proxy: config.httpProxy() });
        if (raw.status !== 200) {
            return undefined;
        }
        return parseMsDict(JSON.parse(raw.buffer.toString('utf8')));
    } catch {
        return undefined;
    }
}
