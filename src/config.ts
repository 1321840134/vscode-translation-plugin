import * as vscode from 'vscode';

function cfg(): vscode.WorkspaceConfiguration {
    return vscode.workspace.getConfiguration('translation');
}

export function engine(): string {
    return cfg().get<string>('engine') ?? 'google';
}

export async function setEngine(id: string): Promise<void> {
    await cfg().update('engine', id, vscode.ConfigurationTarget.Global);
}

export function sourceLanguage(): string {
    return cfg().get<string>('sourceLanguage') ?? 'auto';
}

export async function setSourceLanguage(code: string): Promise<void> {
    await cfg().update('sourceLanguage', code, vscode.ConfigurationTarget.Global);
}

export function targetLanguage(): string {
    return cfg().get<string>('targetLanguage') ?? 'zh-CN';
}

export async function setTargetLanguage(code: string): Promise<void> {
    await cfg().update('targetLanguage', code, vscode.ConfigurationTarget.Global);
}

export function autoSelectWord(): boolean {
    return cfg().get<boolean>('autoSelectWord') ?? true;
}

export function historyEnabled(): boolean {
    return cfg().get<boolean>('history.enabled') ?? true;
}

export function historyLimit(): number {
    const n = cfg().get<number>('history.limit') ?? 200;
    return n > 0 ? n : 200;
}

export function ttsEnabled(): boolean {
    return cfg().get<boolean>('tts.enabled') ?? true;
}

export function ttsAutoPlay(): boolean {
    return ttsEnabled() && (cfg().get<boolean>('tts.autoPlay') ?? false);
}

/** auto: Edge 优先、Google 兜底；edge/google/openai = 强制指定 */
export function ttsService(): string {
    return cfg().get<string>('tts.service') ?? 'auto';
}

export function openaiTtsModel(): string {
    return cfg().get<string>('tts.openaiModel') || 'gpt-4o-mini-tts';
}

export function openaiTtsVoice(): string {
    return cfg().get<string>('tts.openaiVoice') || 'alloy';
}

export function alibabaAccessKeyId(): string {
    return cfg().get<string>('alibaba.accessKeyId') ?? '';
}

export function alibabaAccessKeySecret(): string {
    return cfg().get<string>('alibaba.accessKeySecret') ?? '';
}

export function hoverEnabled(): boolean {
    return cfg().get<boolean>('hover.enabled') ?? false;
}

export function hoverTranslateDocs(): boolean {
    return hoverEnabled() && (cfg().get<boolean>('hover.translateDocumentation') ?? true);
}

export function autoTranslateSelection(): boolean {
    return cfg().get<boolean>('autoTranslateSelection') ?? false;
}

/** 源语言与目标语言相同时自动切换目标语言（中文↔英文） */
export function autoSwapTarget(): boolean {
    return cfg().get<boolean>('autoSwapTarget') ?? true;
}

export function replaceStyle(): string {
    return cfg().get<string>('replace.style') ?? 'original';
}

export function replaceSeparator(): string {
    return cfg().get<string>('replace.separator') ?? ' ';
}

export function panelPosition(): vscode.ViewColumn {
    switch (cfg().get<string>('panel.position')) {
        case 'active':
            return vscode.ViewColumn.Active;
        case 'one':
            return vscode.ViewColumn.One;
        case 'two':
            return vscode.ViewColumn.Two;
        default:
            return vscode.ViewColumn.Beside;
    }
}

export function googleHost(): string {
    return cfg().get<string>('google.host') || 'translate.googleapis.com';
}

export function deeplAuthKey(): string {
    return cfg().get<string>('deepl.authKey') ?? '';
}

export function microsoftKey(): string {
    return cfg().get<string>('microsoft.subscriptionKey') ?? '';
}

export function microsoftRegion(): string {
    return cfg().get<string>('microsoft.region') ?? '';
}

export function openaiApiKey(): string {
    return cfg().get<string>('openai.apiKey') ?? '';
}

export function openaiModel(): string {
    return cfg().get<string>('openai.model') || 'gpt-4o-mini';
}

export function openaiApiBase(): string {
    return cfg().get<string>('openai.apiBase') || 'https://api.openai.com/v1';
}

/** OpenAI 高级配置：自定义系统提示词（支持 {sourceLang}/{targetLang} 占位符，留空用默认） */
export function openaiSystemPrompt(): string {
    return cfg().get<string>('openai.systemPrompt') ?? '';
}

/** OpenAI 高级配置：采样温度（0-2） */
export function openaiTemperature(): number {
    const t = cfg().get<number>('openai.temperature');
    if (t === undefined || t < 0 || t > 2) {
        return 0.2;
    }
    return t;
}

/** 文档翻译时保留原文（Google/微软支持对照输出） */
export function docPreserveSource(): boolean {
    return cfg().get<boolean>('document.preserveSource') ?? false;
}

/**
 * 影响翻译产出的引擎配置指纹（进入缓存键）：
 * 更换镜像/模型/提示词/端点后旧缓存自动失效，避免命中与当前配置不符的结果
 * （对应参考插件 v3.9.1 修复的文档翻译缓存冲突）。不含密钥明文。
 */
export function engineFingerprint(): string {
    const msKey = microsoftKey();
    const deeplHost = deeplAuthKey().trim().endsWith(':fx') ? 'free' : 'pro';
    return [
        googleHost(),
        openaiApiBase(),
        openaiModel(),
        openaiSystemPrompt(),
        openaiTemperature(),
        msKey ? `azure:${microsoftRegion() || 'global'}` : 'edge',
        deeplAuthKey() ? `deepl:${deeplHost}` : ''
    ].join('|');
}

export function youdaoAppKey(): string {
    return cfg().get<string>('youdao.appKey') ?? '';
}

export function youdaoAppSecret(): string {
    return cfg().get<string>('youdao.appSecret') ?? '';
}

export function baiduAppId(): string {
    return cfg().get<string>('baidu.appId') ?? '';
}

export function baiduAppSecret(): string {
    return cfg().get<string>('baidu.appSecret') ?? '';
}

/** VSCode 的 http.proxy 设置（企业代理环境下访问 Google/DeepL/OpenAI 等必需） */
export function httpProxy(): string | undefined {
    const proxy = vscode.workspace.getConfiguration('http').get<string>('proxy');
    return proxy && proxy.trim() ? proxy.trim() : undefined;
}
