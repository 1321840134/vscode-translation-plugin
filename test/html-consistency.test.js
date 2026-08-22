const test = require('node:test');
const assert = require('node:assert');
const { buildHtml } = require('../out/html.js');

const html = buildHtml('http://localhost:8080', 'testnonce');

function extractScript(source) {
    const m = source.match(/<script nonce="testnonce">([\s\S]*?)<\/script>/);
    assert.ok(m, '应包含带 nonce 的 script 标签');
    return m[1];
}

test('webview：内嵌 JS 语法合法（防白屏）', () => {
    const src = extractScript(html);
    assert.doesNotThrow(() => new Function(src), '内嵌脚本必须无语法错误');
});

test('webview：JS 引用的元素 ID 与 HTML 一致', () => {
    const src = extractScript(html);
    const htmlIds = new Set([...html.matchAll(/id="([a-zA-Z0-9_-]+)"/g)].map(m => m[1]));
    // JS 动态创建并赋 id 的元素（如 toastBox）同样合法
    for (const m of src.matchAll(/\.id = '([a-zA-Z0-9_-]+)'/g)) {
        htmlIds.add(m[1]);
    }
    const jsIds = new Set([...src.matchAll(/\$\('([a-zA-Z0-9_-]+)'\)/g)].map(m => m[1]));
    assert.ok(jsIds.size > 10, 'JS 应引用多个元素');
    for (const id of jsIds) {
        assert.ok(htmlIds.has(id), `JS 引用的 #${id} 在 HTML 中不存在`);
    }
});

test('webview：宿主消息全部有处理分支', () => {
    const src = extractScript(html);
    for (const type of ['init', 'results', 'error', 'loading', 'history', 'wordbook', 'tts', 'setTab', 'focus', 'toast']) {
        assert.ok(src.includes(`case '${type}'`), `缺少 ${type} 消息处理`);
    }
});

test('webview：面板骨架完整（标签页/语言栏/输入区/列表/工具栏）', () => {
    for (const id of ['tabbtn-translate', 'tabbtn-history', 'tabbtn-wordbook', 'fromLang', 'toLang', 'swap',
        'query', 'btnTranslate', 'results', 'errorBox', 'historyList', 'wordList',
        'historySearch', 'wordSearch', 'clearHistory', 'exportWordBook', 'clearWordBook']) {
        assert.ok(html.includes(`id="${id}"`), `缺少元素 #${id}`);
    }
});

test('webview：CSP 允许 data: 音频播放（TTS 依赖）', () => {
    assert.ok(html.includes('media-src data:'), 'CSP 必须允许 media-src data:');
    assert.ok(html.includes(`script-src 'nonce-testnonce'`), 'CSP 必须限制 script nonce');
});
