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

/** auto: Edge 优先、Google 兜底；edge/google 强制指定 */
export function ttsService(): string {
    return cfg().get<string>('tts.service') ?? 'auto';
}

export function hoverEnabled(): boolean {
    return cfg().get<boolean>('hover.enabled') ?? true;
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
