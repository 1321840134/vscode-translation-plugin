import * as config from '../config';
import { FORM_CONTENT_TYPE, formBody, requestJson } from '../net';
import { langName } from '../languages';
import { EngineError, TranslationEngine, TranslationResult, makeResult } from './types';

const TO_DEEPL: Record<string, string> = {
    en: 'EN',
    ja: 'JA',
    ko: 'KO',
    fr: 'FR',
    de: 'DE',
    ru: 'RU',
    es: 'ES',
    pt: 'PT',
    it: 'IT',
    nl: 'NL',
    pl: 'PL',
    sv: 'SV',
    'zh-CN': 'ZH',
    'zh-TW': 'ZH'
};
const FROM_DEEPL: Record<string, string> = Object.fromEntries(
    Object.entries(TO_DEEPL).map(([k, v]) => [v, k])
);

interface DeeplResponse {
    translations: { detected_source_language?: string; text: string }[];
}

/** DeepL 翻译（密钥以 :fx 结尾自动使用免费版接口） */
export const deeplEngine: TranslationEngine = {
    id: 'deepl',
    name: 'DeepL',
    get configHint(): string | undefined {
        return config.deeplAuthKey() ? undefined : '需在设置 translation.deepl.authKey 中配置密钥';
    },

    async translate(text: string, from: string, to: string): Promise<TranslationResult> {
        const key = config.deeplAuthKey();
        if (!key) {
            throw new EngineError('请先在设置 translation.deepl.authKey 中配置 DeepL 密钥', 'deepl');
        }
        const target = TO_DEEPL[to];
        if (!target) {
            throw new EngineError(`DeepL 不支持目标语言「${langName(to)}」`, 'deepl');
        }
        const host = key.trim().endsWith(':fx') ? 'api-free.deepl.com' : 'api.deepl.com';
        const params: Record<string, string> = { text, target_lang: target };
        if (from !== 'auto') {
            const source = TO_DEEPL[from];
            if (!source) {
                throw new EngineError(`DeepL 不支持源语言「${langName(from)}」`, 'deepl');
            }
            params.source_lang = source;
        }
        const data = await requestJson<DeeplResponse>(`https://${host}/v2/translate`, {
            method: 'POST',
            headers: {
                Authorization: `DeepL-Auth-Key ${key}`,
                'Content-Type': FORM_CONTENT_TYPE,
                Accept: 'application/json'
            },
            body: formBody(params)
        });
        const t = data.translations?.[0];
        if (!t?.text) {
            throw new EngineError('DeepL 未返回译文', 'deepl');
        }
        const detected = t.detected_source_language ? FROM_DEEPL[t.detected_source_language] ?? from : from;
        return makeResult(deeplEngine, text, detected, to, t.text);
    }
};
