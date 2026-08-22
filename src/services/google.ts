import * as config from '../config';
import { FORM_CONTENT_TYPE, formPairsBody, request } from '../net';
import { EngineError, TranslationEngine, TranslationResult, makeResult } from './types';

interface GoogleSentence {
    trans?: string;
    orig?: string;
    src_translit?: string;
}

interface GoogleDict {
    pos?: string;
    terms?: string[];
    entry?: unknown;
}

interface GoogleResponse {
    sentences?: GoogleSentence[];
    dict?: GoogleDict[];
    src?: string;
}

/** Google 翻译（免费 gtx 接口，无需密钥），附词典释义与音标 */
export const googleEngine: TranslationEngine = {
    id: 'google',
    name: 'Google 翻译',

    async translate(text: string, from: string, to: string, signal?: AbortSignal): Promise<TranslationResult> {
        const host = config.googleHost();
        const res = await request(`https://${host}/translate_a/single`, {
            method: 'POST',
            proxy: config.httpProxy(),
            signal,
            headers: {
                'Content-Type': FORM_CONTENT_TYPE,
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'
            },
            body: formPairsBody([
                ['client', 'gtx'],
                ['sl', from],
                ['tl', to],
                ['hl', 'zh-CN'],
                ['dt', 't'],
                ['dt', 'bd'],
                ['dt', 'rm'],
                ['dj', '1'],
                ['q', text]
            ])
        });
        if (res.status !== 200) {
            throw new EngineError(
                `Google 翻译请求失败 (HTTP ${res.status})，可在设置 translation.google.host 中更换域名`,
                'google'
            );
        }
        let data: GoogleResponse;
        try {
            data = JSON.parse(res.buffer.toString('utf8'));
        } catch (e) {
            throw new EngineError('Google 翻译响应解析失败，建议更换翻译域名或引擎', 'google');
        }
        const sentences = data.sentences ?? [];
        const translated = sentences.map(s => s.trans ?? '').join('');
        if (!translated) {
            throw new EngineError('Google 翻译未返回译文', 'google');
        }
        const phonetic = sentences.find(s => s.src_translit)?.src_translit;
        const definitions = (data.dict ?? []).slice(0, 5).map(d => ({
            pos: d.pos ?? '',
            terms: (d.terms ?? []).slice(0, 8)
        }));
        return makeResult(googleEngine, text, data.src ?? from, to, translated, phonetic, definitions);
    }
};
