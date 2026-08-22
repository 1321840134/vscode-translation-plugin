import { createHash } from 'crypto';
import * as config from '../config';
import { requestJson } from '../net';
import { EngineError, TranslationEngine, TranslationResult, makeResult } from './types';

const TO_BAIDU: Record<string, string> = {
    'zh-CN': 'zh',
    'zh-TW': 'cht',
    ja: 'jp',
    ko: 'kor',
    fr: 'fra',
    es: 'spa',
    ar: 'ara',
    vi: 'vie',
    id: 'id',
    ms: 'may',
    tr: 'tr',
    nl: 'nl',
    pl: 'pl',
    sv: 'swe'
};
const FROM_BAIDU: Record<string, string> = Object.fromEntries(
    Object.entries(TO_BAIDU).map(([k, v]) => [v, k])
);

interface BaiduResponse {
    from?: string;
    to?: string;
    trans_result?: { src: string; dst: string }[];
    error_code?: string;
    error_msg?: string;
}

/** 百度翻译开放平台（需配置 APP ID 与密钥） */
export const baiduEngine: TranslationEngine = {
    id: 'baidu',
    name: '百度翻译',
    get configHint(): string | undefined {
        return config.baiduAppId() ? undefined : '需在设置 translation.baidu.* 中配置 APP ID 与密钥';
    },

    async translate(text: string, from: string, to: string): Promise<TranslationResult> {
        const appId = config.baiduAppId();
        const appSecret = config.baiduAppSecret();
        if (!appId || !appSecret) {
            throw new EngineError('请先在设置中配置百度翻译 APP ID 与密钥 (translation.baidu.*)', 'baidu');
        }
        const salt = Date.now() + '' + Math.floor(Math.random() * 10000);
        const sign = createHash('md5')
            .update(appId + text + salt + appSecret, 'utf8')
            .digest('hex');
        const fromCode = from === 'auto' ? 'auto' : TO_BAIDU[from] ?? from;
        const toCode = TO_BAIDU[to] ?? to;
        const url =
            'https://fanyi-api.baidu.com/api/trans/vip/translate' +
            `?q=${encodeURIComponent(text)}` +
            `&from=${encodeURIComponent(fromCode)}` +
            `&to=${encodeURIComponent(toCode)}` +
            `&appid=${encodeURIComponent(appId)}` +
            `&salt=${encodeURIComponent(salt)}` +
            `&sign=${sign}`;
        const data = await requestJson<BaiduResponse>(url);
        if (data.error_code) {
            throw new EngineError(`百度翻译出错（${data.error_code}: ${data.error_msg ?? ''}）`, 'baidu');
        }
        const translated = (data.trans_result ?? []).map(r => r.dst).join('\n');
        if (!translated) {
            throw new EngineError('百度翻译未返回译文', 'baidu');
        }
        let fromCanonical = from;
        if (from === 'auto' && data.from) {
            fromCanonical = FROM_BAIDU[data.from] ?? data.from;
        }
        return makeResult(baiduEngine, text, fromCanonical, to, translated);
    }
};
