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
    return auth;
}

/** 清空鉴权缓存（token 失效后强制重新抓取） */
export function clearBingAuthCache(): void {
    authCache = undefined;
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
