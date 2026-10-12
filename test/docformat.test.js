const test = require('node:test');
const assert = require('node:assert');
require('./helpers/stub.js').install();
const { translateLong } = require('../out/services/index.js');

function makeResult(text) {
    return { query: text, from: 'en', to: 'zh-CN', text, engineId: 't', engineName: '测试' };
}

test('文档格式：引擎保留行数时单请求直出', async () => {
    let calls = 0;
    const impl = async t => {
        calls++;
        return makeResult(t.replace(/line/g, '行')); // 行数与原文一致
    };
    const r = await translateLong('line one\nline two', 'auto', 'zh-CN', undefined, { translateImpl: impl });
    assert.strictEqual(calls, 1, '不应触发逐行补救');
    assert.strictEqual(r.text, '行 one\n行 two');
});

test('文档格式：引擎丢行时逐行补救，空行原样保留（v3.9.2 对齐）', async () => {
    const requests = [];
    const impl = async t => {
        requests.push(t);
        // 整段请求返回单行（丢失行结构），单行请求正常
        if (t.includes('\n')) {
            return makeResult('全部合并成一行');
        }
        return makeResult(`译[${t}]`);
    };
    const src = 'para one\n\npara two';
    const r = await translateLong(src, 'auto', 'zh-CN', undefined, { translateImpl: impl });
    assert.strictEqual(r.text, '译[para one]\n\n译[para two]', '空行保留、行数与原文一致');
    // 先整段一次，失败后逐两行（空行不发请求）
    assert.deepStrictEqual(requests, [src, 'para one', 'para two']);
});

test('文档格式：单行文本不受影响', async () => {
    let calls = 0;
    const impl = async t => {
        calls++;
        return makeResult(`译[${t}]`);
    };
    const r = await translateLong('single line', 'auto', 'zh-CN', undefined, { translateImpl: impl });
    assert.strictEqual(r.text, '译[single line]');
    assert.strictEqual(calls, 1);
});

test('文档格式：preserveSource 对照模式下同样保留行结构', async () => {
    const impl = async t => {
        if (t.includes('\n')) {
            return makeResult('merged'); // 丢行
        }
        return makeResult(`译[${t}]`);
    };
    const r = await translateLong('a\n\nb', 'auto', 'zh-CN', undefined, {
        preserveSource: true,
        translateImpl: impl
    });
    // 块级对照：原文块（含空行结构完整）+ 译文块（逐行补救后行数一致）
    assert.strictEqual(r.text, 'a\n\nb\n译[a]\n\n译[b]');
});
