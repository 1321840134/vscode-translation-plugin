import { createHash } from 'crypto';
import * as config from '../config';
import { FORM_CONTENT_TYPE, formBody, requestJson } from '../net';
import { EngineError, TranslationEngine, TranslationResult, makeResult } from './types';

const TO_YOUDAO: Record<string, string> = {
    'zh-CN': 'zh-CHS',
    'zh-TW': 'zh-CHT',
    fr: 'fra',
    ar: 'ara',
    vi: 'vie',
    ms: 'may',
    sv: 'swe'
};
const FROM_YOUDAO: Record<string, string> = Object.fromEntries(
    Object.entries(TO_YOUDAO).map(([k, v]) => [v, k])
);

interface YoudaoResponse {
    errorCode?: string;
    translation?: string[];
    query?: string;
    basic?: { phonetic?: string; explains?: string[] };
    l?: string;
}

/** 有道智云翻译（需配置应用 ID 与密钥），单词查询附带音标与释义 */
export const youdaoEngine: TranslationEngine = {
    id: 'youdao',
    name: '有道翻译',
    get configHint(): string | undefined {
        return config.youdaoAppKey() ? undefined : '需在设置 translation.youdao.* 中配置应用 ID 与密钥';
    },

    async translate(text: string, from: string, to: string, signal?: AbortSignal): Promise<TranslationResult> {
        const appKey = config.youdaoAppKey();
        const appSecret = config.youdaoAppSecret();
        if (!appKey || !appSecret) {
            throw new EngineError('请先在设置中配置有道智云应用 ID 与密钥 (translation.youdao.*)', 'youdao');
        }
        const q = text;
        const salt = Date.now().toString(36) + Math.floor(Math.random() * 10000);
        const curtime = Math.floor(Date.now() / 1000).toString();
        // 有道 v3 签名规则：长度 <=20 取全文，否则 前10 + 长度 + 后10
        const input = q.length <= 20 ? q : q.slice(0, 10) + q.length + q.slice(-10);
        const sign = createHash('sha256')
            .update(appKey + input + salt + curtime + appSecret, 'utf8')
            .digest('hex');
        const fromCode = from === 'auto' ? 'auto' : TO_YOUDAO[from] ?? from;
        const toCode = TO_YOUDAO[to] ?? to;
        const data = await requestJson<YoudaoResponse>('https://openapi.youdao.com/api', {
            method: 'POST',
            proxy: config.httpProxy(),
            signal,
            headers: { 'Content-Type': FORM_CONTENT_TYPE },
            body: formBody({
                q,
                from: fromCode,
                to: toCode,
                appKey,
                salt,
                sign,
                sign_type: 'v3',
                curtime,
                ext: 'json'
            })
        });
        if (data.errorCode && data.errorCode !== '0') {
            throw new EngineError(`有道翻译出错（错误码 ${data.errorCode}）`, 'youdao');
        }
        const translated = (data.translation ?? []).join('\n');
        if (!translated) {
            throw new EngineError('有道翻译未返回译文', 'youdao');
        }
        let fromCanonical = from;
        if (from === 'auto' && data.l) {
            const detected = data.l.split('2')[0];
            if (detected && detected.toLowerCase() !== 'auto') {
                fromCanonical = FROM_YOUDAO[detected] ?? detected;
            }
        }
        const explains = data.basic?.explains ?? [];
        const definitions = explains.length > 0 ? [{ pos: '', terms: explains.slice(0, 10) }] : undefined;
        return makeResult(youdaoEngine, text, fromCanonical, to, translated, data.basic?.phonetic, definitions);
    }
};
