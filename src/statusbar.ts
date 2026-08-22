import * as vscode from 'vscode';
import * as config from './config';
import { langName } from './languages';
import { currentEngine } from './services';

let langItem: vscode.StatusBarItem | undefined;
let engineItem: vscode.StatusBarItem | undefined;

export function initStatusBar(context: vscode.ExtensionContext): void {
    langItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 201);
    langItem.name = '翻译: 目标语言';
    langItem.command = 'translation.selectTargetLanguage';
    engineItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 200);
    engineItem.name = '翻译: 引擎';
    engineItem.command = 'translation.switchEngine';
    context.subscriptions.push(langItem, engineItem);
    updateStatusBar();
}

export function updateStatusBar(): void {
    if (!langItem || !engineItem) {
        return;
    }
    const src = config.sourceLanguage();
    const tgt = config.targetLanguage();
    langItem.text = `$(globe) ${src === 'auto' ? '自动' : langName(src)} → ${langName(tgt)}`;
    langItem.tooltip = '翻译: 点击选择目标语言';
    const engine = currentEngine();
    engineItem.text = `$(exchange) ${engine.name}`;
    engineItem.tooltip = engine.configHint
        ? `翻译引擎: ${engine.name}（${engine.configHint}）`
        : `翻译引擎: ${engine.name}（点击切换）`;
    langItem.show();
    engineItem.show();
}
