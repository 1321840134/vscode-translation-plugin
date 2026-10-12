import * as config from './config';
import { FORM_CONTENT_TYPE, formPairsBody, request } from './net';
import { Definition } from './services/types';
import { parseMsDict } from './services/microsoft';

/**
 * Bing 网页版词典（对齐参考插件 BingTranslator 的免密钥方案）：
 * 翻译页 HTML 中带有 IG/IID 与防滥用 token，用它们调用 /tlookupv3
 * 获取词典数据（响应与 Azure dictionary/lookup 同构）。
 */

const BING_ORIGIN = 'https://www.bing.com';
const BING_TRANSLATOR_PAGE = `${BING_ORIGIN}/translator`;
const BING_TRANSLATE_URL = `${BING_ORIGIN}/ttranslatev3`;
const BING_DICT_URL = `${BING_ORIGIN}/tlookupv3`;

const BING_UA =
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) ' +
    'Chrome/143.0.0.0 Safari/537.36 Edg/143.0.0.0';

export interface BingAuth {
    ig: string;
    iid: string;
    token: string;
    key: string;
    /** 服务端给出的 token 有效期（毫秒） */
    ttlMs: number;
}

let authCache: { auth: BingAuth; expiresAt: number } | undefined;

/**
 * 从 Bing 翻译页 HTML 解析鉴权数据：
 * params_AbusePreventionHelper = [key,"token",ttl]、IG: "..."、data-iid="..."
 */
export function parseBingAuth(html: string): BingAuth {
    const abuse = html.match(
        /params_AbusePreventionHelper\s*=\s*\[\s*(\d+)\s*,\s*"([^"]+)"\s*,\s*(\d+)\s*]/
    );
    const ig = html.match(/IG\s*:\s*"([A-Fa-f0-9]+)"/)?.[1];
    const iid = html.match(/data-iid\s*=\s*"([^"]+)"/)?.[1];
    if (!abuse || !ig || !iid) {
        throw new Error('Bing 鉴权数据解析失败');
    }
    return { ig, iid, token: abuse[2], key: abuse[1], ttlMs: Number(abuse[3]) };
}

/** 获取 Bing 鉴权数据（带 TTL 缓存，参考插件同款 1 分钟安全边距） */
async function getBingAuth(signal?: AbortSignal): Promise<BingAuth> {
    if (authCache && Date.now() < authCache.expiresAt) {
        return authCache.auth;
    }
    const res = await request(BING_TRANSLATOR_PAGE, {
        method: 'GET',
        headers: { 'User-Agent': BING_UA },
        signal,
        proxy: config.httpProxy()
    });
    if (res.status !== 200) {
        throw new Error(`Bing 翻译页获取失败 (HTTP ${res.status})`);
    }
    const auth = parseBingAuth(res.buffer.toString('utf8'));
    const ttl = Math.max(auth.ttlMs - 60_000, 60_000);
    authCache = { auth, expiresAt: Date.now() + ttl };
    // 运行日志（扩展宿主日志可见），用于排查静默降级问题
    console.log(`[translation] bing auth ok (iid=${auth.iid}, ttl=${Math.round(ttl / 1000)}s)`);
    return auth;
}

/** 清空鉴权缓存（token 失效后强制重新抓取） */
export function clearBingAuthCache(): void {
    authCache = undefined;
}

/** 常见语言代码前缀（插件支持的语言集合） */
const COMMON_LANG_BASES = new Set([
    'en', 'zh', 'ja', 'ko', 'fr', 'de', 'ru', 'es', 'pt', 'it',
    'ar', 'th', 'vi', 'id', 'ms', 'tr', 'nl', 'pl', 'sv'
]);

/**
 * 判定 auto-detect 是否误判：检测结果不在支持语言集合内、且文本为纯拉丁
 * （cn.bing.com 的 LLM 检测会把短英文词误判为冷门语言，如 put → sr-Latn）。
 */
export function isUncommonDetection(detected: string, text: string): boolean {
    if (!detected) {
        return false;
    }
    const base = detected.split('-')[0].toLowerCase();
    if (COMMON_LANG_BASES.has(base)) {
        return false;
    }
    return /^[A-Za-z\s'-]+$/.test(text.trim());
}

export interface BingTranslation {
    /** 译文 */
    text: string;
    /** 检测到的源语言（Bing 代码，如 en / zh-Hans） */
    detected: string;
}

/** 解析 ttranslatev3 响应（与 Edge translatetext 响应同构） */
export function parseBingTranslation(items: unknown): BingTranslation {
    const item = Array.isArray(items) ? (items[0] as {
        detectedLanguage?: { language?: string };
        translations?: { text?: string }[];
    } | undefined) : undefined;
    const text = item?.translations?.[0]?.text;
    if (!text) {
        throw new Error('Bing 翻译未返回译文');
    }
    return { text, detected: item?.detectedLanguage?.language ?? '' };
}

/**
 * Bing 网页版翻译（对齐参考插件 BingTranslator 的主路径，免密钥）：
 * fromMs 传空字符串表示 auto-detect。
 */
export async function bingTranslate(
    text: string,
    fromMs: string,
    toMs: string,
    signal?: AbortSignal
): Promise<BingTranslation> {
    const auth = await getBingAuth(signal);
    const body = formPairsBody([
        ['text', text],
        ['fromLang', fromMs || 'auto-detect'],
        ['to', toMs],
        ['token', auth.token],
        ['key', auth.key]
    ]);
    const url = `${BING_TRANSLATE_URL}?isVertical=1&IG=${auth.ig}&IID=${encodeURIComponent(auth.iid)}`;
    const res = await request(url, {
        method: 'POST',
        headers: { 'Content-Type': FORM_CONTENT_TYPE, 'User-Agent': BING_UA },
        body,
        signal,
        proxy: config.httpProxy()
    });
    if (res.status !== 200) {
        throw new Error(`Bing 翻译请求失败 (HTTP ${res.status})`);
    }
    return parseBingTranslation(JSON.parse(res.buffer.toString('utf8')));
}

/**
 * Bing 词典查询（免密钥）。需要在翻译完成后调用（接口要求传入译文）。
 * 任何失败由调用方降级为纯翻译。
 */
export async function bingLookupDictionary(
    text: string,
    translated: string,
    fromMs: string,
    toMs: string,
    signal?: AbortSignal
): Promise<Definition[] | undefined> {
    if (!fromMs || !toMs) {
        return undefined;
    }
    const auth = await getBingAuth(signal);
    const body = formPairsBody([
        ['from', fromMs],
        ['to', toMs],
        ['text', text],
        ['translatedtext', translated],
        ['token', auth.token],
        ['key', auth.key]
    ]);
    const url = `${BING_DICT_URL}?isVertical=1&IG=${auth.ig}&IID=${encodeURIComponent(auth.iid)}`;
    const res = await request(url, {
        method: 'POST',
        headers: { 'Content-Type': FORM_CONTENT_TYPE, 'User-Agent': BING_UA },
        body,
        signal,
        proxy: config.httpProxy()
    });
    if (res.status !== 200) {
        throw new Error(`Bing 词典查询失败 (HTTP ${res.status})`);
    }
    return parseMsDict(JSON.parse(res.buffer.toString('utf8')));
}
