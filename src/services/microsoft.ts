import * as config from '../config';
import { request } from '../net';
import { EngineError, TranslationEngine, TranslationResult, makeResult } from './types';

/**
 * Edge 浏览器公开的免费翻译端点（与参考插件使用的方案一致，无需令牌/密钥）。
 * POST https://edge.microsoft.com/translate/translatetext?from=&to=zh-Hans&isEnterpriseClient=false
 * body 为 JSON 字符串数组，from 留空表示自动检测；响应含 detectedLanguage。
 */
const EDGE_TRANSLATE_URL = 'https://edge.microsoft.com/translate/translatetext';
const AZURE_TRANSLATE_URL = 'https://api.cognitive.microsofttranslator.com/translate';

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

    async translate(text: string, from: string, to: string): Promise<TranslationResult> {
        const toMs = TO_MS[to] ?? to;
        const fromMs = from === 'auto' ? '' : TO_MS[from] ?? from;
        const body = JSON.stringify([text]);
        const headers: Record<string, string> = {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(body).toString(),
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        };

        const apiKey = config.microsoftKey();
        if (apiKey) {
            const url =
                `${AZURE_TRANSLATE_URL}?api-version=3.0` +
                `&from=${encodeURIComponent(fromMs)}&to=${encodeURIComponent(toMs)}`;
            const region = config.microsoftRegion();
            if (region) {
                headers['Ocp-Apim-Subscription-Region'] = region;
            }
            headers['Ocp-Apim-Subscription-Key'] = apiKey;
            const raw = await request(url, { method: 'POST', headers, body });
            return parseTranslateResponse(raw, text, from, to);
        }

        // Edge 免费端点：批量入参为字符串数组，from 留空即自动检测
        const url =
            `${EDGE_TRANSLATE_URL}?from=${encodeURIComponent(fromMs)}` +
            `&to=${encodeURIComponent(toMs)}&isEnterpriseClient=false`;
        const raw = await request(url, { method: 'POST', headers, body });
        return parseTranslateResponse(raw, text, from, to);
    }
};
