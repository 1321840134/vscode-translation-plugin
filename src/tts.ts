import * as config from './config';
import { edgeSpeak } from './edge-tts';
import { request } from './net';

/**
 * 文本转语音调度：
 * - auto（默认）：优先 Edge 神经网络语音（音质好、地区可达性好），失败时回退 Google TTS
 * - edge / google：强制指定
 */
export async function synthesize(text: string, lang: string): Promise<string> {
    if (!config.ttsEnabled()) {
        throw new Error('语音朗读已在设置中禁用 (translation.tts.enabled)');
    }
    const service = config.ttsService();
    if (service !== 'google') {
        try {
            const mp3 = await edgeSpeak(text, lang === 'auto' ? 'en' : lang);
            if (mp3.length > 0) {
                return 'data:audio/mpeg;base64,' + mp3.toString('base64');
            }
            if (service === 'edge') {
                throw new Error('Edge 语音未返回音频');
            }
        } catch (e) {
            if (service === 'edge') {
                throw e;
            }
            // auto：回退 Google TTS
        }
    }
    return googleTts(text, lang);
}

/** Google TTS 朗读（免费接口） */
async function googleTts(text: string, lang: string): Promise<string> {
    const trimmed = text.replace(/\s+/g, ' ').trim().slice(0, 200);
    if (!trimmed) {
        throw new Error('没有可朗读的文本');
    }
    const host = config.googleHost();
    const tl = !lang || lang === 'auto' ? 'en' : lang;
    const url =
        `https://${host}/translate_tts?ie=UTF-8&client=gtx` +
        `&tl=${encodeURIComponent(tl)}&total=1&idx=0&textlen=${trimmed.length}` +
        `&q=${encodeURIComponent(trimmed)}`;
    const res = await request(url, {
        proxy: config.httpProxy(),
        headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
            Referer: 'https://translate.google.com/'
        }
    });
    if (res.status !== 200 || res.buffer.length === 0) {
        throw new Error(`语音合成失败 (HTTP ${res.status})`);
    }
    return 'data:audio/mpeg;base64,' + res.buffer.toString('base64');
}
