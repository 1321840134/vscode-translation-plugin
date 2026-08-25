import * as config from './config';
import { request } from './net';

/**
 * OpenAI TTS（与参考插件对齐的第三种语音引擎）：
 * POST {base}/audio/speech {model, voice, input} → mp3 二进制
 * 复用 translation.openai.apiKey / apiBase 配置。
 */

export function openaiTtsConfigured(): boolean {
    return !!config.openaiApiKey();
}

export async function openaiSpeak(text: string): Promise<Buffer> {
    const apiKey = config.openaiApiKey();
    if (!apiKey) {
        return Promise.reject(new Error('请先在设置 translation.openai.apiKey 中配置 API Key'));
    }
    const clipped = text.replace(/\s+/g, ' ').trim().slice(0, 4000);
    if (!clipped) {
        return Promise.reject(new Error('没有可朗读的文本'));
    }
    const base = config.openaiApiBase().replace(/\/+$/, '');
    const res = await request(`${base}/audio/speech`, {
        method: 'POST',
        proxy: config.httpProxy(),
        timeout: 60000,
        headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            model: config.openaiTtsModel(),
            voice: config.openaiTtsVoice(),
            input: clipped,
            response_format: 'mp3'
        })
    });
    if (res.status !== 200) {
        const detail = res.buffer.toString('utf8').slice(0, 200);
        return Promise.reject(new Error(`OpenAI TTS 失败 (HTTP ${res.status}): ${detail}`));
    }
    if (res.buffer.length === 0) {
        return Promise.reject(new Error('OpenAI TTS 未返回音频'));
    }
    return res.buffer;
}
