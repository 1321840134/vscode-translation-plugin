const test = require('node:test');
const assert = require('node:assert');
require('./helpers/stub.js').install();
const { translateLong, chunkText } = require('../out/services/index.js');
const { buildSystemPrompt } = require('../out/services/openai.js');

// 注入假翻译实现，验证 translateLong 的合并/对照逻辑（不发网络）
function fakeImpl(sourceText) {
    return Promise.resolve({
        query: sourceText,
        from: 'en',
        to: 'zh-CN',
        text: `译[${sourceText}]`,
        engineId: 'test',
        engineName: '测试引擎'
    });
}

test('translateLong：默认输出纯译文', async () => {
    const r = await translateLong('hello world', 'auto', 'zh-CN', undefined, {
        translateImpl: fakeImpl
    });
    assert.strictEqual(r.text, '译[hello world]');
    assert.strictEqual(r.from, 'en');
    assert.strictEqual(r.engineName, '测试引擎');
});

test('translateLong：preserveSource 单块原文/译文对照（v3.9.0 对齐）', async () => {
    const r = await translateLong('hello world', 'auto', 'zh-CN', undefined, {
        preserveSource: true,
        translateImpl: fakeImpl
    });
    assert.strictEqual(r.text, 'hello world\n译[hello world]');
});

test('translateLong：preserveSource 多块对照，块间空行分隔', async () => {
    const p1 = 'A'.repeat(1000);
    const p2 = 'B'.repeat(1000);
    const src = `${p1}\n${p2}`;
    assert.strictEqual(chunkText(src).length, 2, '前置：应分为两块');
    const r = await translateLong(src, 'auto', 'zh-CN', undefined, {
        preserveSource: true,
        translateImpl: fakeImpl
    });
    assert.strictEqual(r.text, `${p1}\n译[${p1}]\n\n${p2}\n译[${p2}]`);
});

test('buildSystemPrompt：默认提示', () => {
    const p = buildSystemPrompt('', 'auto', 'zh-CN');
    assert.ok(p.includes('自动检测的源语言'));
    assert.ok(p.includes('中文（简体）'));
    assert.ok(p.includes('只输出译文'));
});

test('buildSystemPrompt：自定义提示 + 占位符替换（v3.9.0 OpenAI 高级配置）', () => {
    const p = buildSystemPrompt('将{sourceLang}改为{targetLang}，输出 JSON', 'en', 'ja');
    assert.strictEqual(p, '将英语改为日语，输出 JSON');
});
