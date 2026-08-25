import * as config from '../config';
import { requestJson } from '../net';
import { AUTO, langName } from '../languages';
import { EngineError, TranslationEngine, TranslationResult, makeResult } from './types';

interface ChatResponse {
    choices?: { message?: { content?: string } }[];
}

/**
 * 构造系统提示词（导出供测试）：
 * 自定义提示词支持 {sourceLang}/{targetLang} 占位符，留空使用默认提示。
 */
export function buildSystemPrompt(custom: string, from: string, to: string): string {
    const src = from === AUTO ? '自动检测的源语言' : langName(from);
    const tgt = langName(to);
    const trimmed = (custom ?? '').trim();
    if (!trimmed) {
        return `你是专业翻译引擎。把用户输入从${src}翻译成${tgt}。只输出译文本身，不要解释、不要引号、不要添加任何多余内容。`;
    }
    return trimmed.replace(/\{sourceLang\}/g, src).replace(/\{targetLang\}/g, tgt);
}

/** OpenAI 翻译（兼容任意 OpenAI 风格接口，需配置 API Key） */
export const openaiEngine: TranslationEngine = {
    id: 'openai',
    name: 'OpenAI',
    get configHint(): string | undefined {
        return config.openaiApiKey() ? undefined : '需在设置 translation.openai.apiKey 中配置 API Key';
    },

    async translate(text: string, from: string, to: string, signal?: AbortSignal): Promise<TranslationResult> {
        const apiKey = config.openaiApiKey();
        if (!apiKey) {
            throw new EngineError('请先在设置 translation.openai.apiKey 中配置 API Key', 'openai');
        }
        const base = config.openaiApiBase().replace(/\/+$/, '');
        const system = buildSystemPrompt(config.openaiSystemPrompt(), from, to);
        const data = await requestJson<ChatResponse>(`${base}/chat/completions`, {
            method: 'POST',
            proxy: config.httpProxy(),
            signal,
            headers: {
                Authorization: `Bearer ${apiKey}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                model: config.openaiModel(),
                temperature: config.openaiTemperature(),
                messages: [
                    { role: 'system', content: system },
                    { role: 'user', content: text }
                ]
            }),
            timeout: 60000
        });
        let content = data.choices?.[0]?.message?.content ?? '';
        content = content.trim();
        // 去掉模型偶尔包裹的引号
        if (content.length > 1 && /^["'“”‘’](.*)["'“”‘’]$/s.test(content)) {
            content = content.slice(1, -1).trim();
        }
        if (!content) {
            throw new EngineError('OpenAI 未返回译文（请检查模型名称与 API 地址）', 'openai');
        }
        return makeResult(openaiEngine, text, from, to, content);
    }
};
