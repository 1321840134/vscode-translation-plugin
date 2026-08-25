import { createHmac } from 'crypto';
import * as config from '../config';
import { requestJson } from '../net';
import { EngineError, TranslationEngine, TranslationResult, makeResult } from './types';

/**
 * 阿里翻译（阿里云机器翻译通用版，需配置 AccessKeyId/Secret）
 * 文档: https://help.aliyun.com/document_detail/158266.html
 */

const ENDPOINT = 'https://mt.aliyuncs.com/';

/** 阿里语言代码（通用版支持集，未映射的透传由服务端报错） */
const TO_ALI: Record<string, string> = {
    'zh-CN': 'zh',
    'zh-TW': 'zh-tw',
    en: 'en',
    ja: 'ja',
    ko: 'ko',
    fr: 'fr',
    de: 'de',
    ru: 'ru',
    es: 'es',
    pt: 'pt',
    it: 'it',
    ar: 'ar',
    th: 'th',
    vi: 'vi',
    id: 'id',
    ms: 'ms',
    tr: 'tr'
};

/** 阿里云 POP 风格 RFC3986 编码 */
export function popEncode(s: string): string {
    return encodeURIComponent(s)
        .replace(/\+/g, '%20')
        .replace(/\*/g, '%2B')
        .replace(/%7E/g, '~');
}

/** POP V1 签名：HMAC-SHA1(AccessKeySecret + "&", "GET&%2F&" + 编码后的规范查询串) */
export function popSign(params: Record<string, string>, accessKeySecret: string): string {
    const canonical = Object.keys(params)
        .sort()
        .map(k => `${popEncode(k)}=${popEncode(params[k])}`)
        .join('&');
    const stringToSign = `GET&${popEncode('/')}&${popEncode(canonical)}`;
    return createHmac('sha1', `${accessKeySecret}&`).update(stringToSign, 'utf8').digest('base64');
}

interface AliResponse {
    Code?: string | number;
    Message?: string;
    RequestId?: string;
    Data?: { Translated?: string };
}

export const alibabaEngine: TranslationEngine = {
    id: 'alibaba',
    name: '阿里翻译',
    get configHint(): string | undefined {
        return config.alibabaAccessKeyId() ? undefined : '需在设置 translation.alibaba.* 中配置 AccessKeyId 与 Secret';
    },

    async translate(text: string, from: string, to: string, signal?: AbortSignal): Promise<TranslationResult> {
        const keyId = config.alibabaAccessKeyId();
        const keySecret = config.alibabaAccessKeySecret();
        if (!keyId || !keySecret) {
            throw new EngineError('请先在设置中配置阿里云 AccessKeyId 与 Secret (translation.alibaba.*)', 'alibaba');
        }
        const toAli = TO_ALI[to] ?? to;
        const params: Record<string, string> = {
            Action: 'TranslateGeneral',
            Version: '2018-10-12',
            FormatType: 'text',
            Scene: 'general',
            SourceLanguage: from === 'auto' ? 'auto' : TO_ALI[from] ?? from,
            TargetLanguage: toAli,
            SourceText: text,
            AccessKeyId: keyId,
            SignatureMethod: 'HMAC-SHA1',
            SignatureVersion: '1.0',
            SignatureNonce: Math.random().toString(36).slice(2) + Date.now(),
            Timestamp: new Date().toISOString().replace(/\.\d{3}Z$/, 'Z'),
            Format: 'JSON'
        };
        params.Signature = popSign(params, keySecret);
        const query = Object.entries(params)
            .map(([k, v]) => `${popEncode(k)}=${popEncode(v)}`)
            .join('&');
        const data = await requestJson<AliResponse>(`${ENDPOINT}?${query}`, { signal, proxy: config.httpProxy() });
        const code = String(data.Code ?? '200');
        if (code !== '200') {
            throw new EngineError(`阿里翻译出错（${code}: ${data.Message ?? ''}）`, 'alibaba');
        }
        const translated = data.Data?.Translated ?? '';
        if (!translated) {
            throw new EngineError('阿里翻译未返回译文', 'alibaba');
        }
        let fromCanonical = from;
        if (from === 'auto') {
            // 响应不含检测语言，保持 auto
            fromCanonical = 'auto';
        }
        return makeResult(alibabaEngine, text, fromCanonical, to, translated);
    }
};
