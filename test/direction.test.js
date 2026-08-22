const test = require('node:test');
const assert = require('node:assert');
const { install, setConfig } = require('./helpers/stub.js');
install();
const { resolveDirection, needsRetrySwap, chunkText } = require('../out/services/index.js');

test('resolveDirection：中文文本+中文目标 → 换向英文', () => {
    assert.deepStrictEqual(resolveDirection('你好', 'auto', 'zh-CN'), { effFrom: 'auto', effTo: 'en' });
    assert.deepStrictEqual(resolveDirection('你好', 'zh-CN', 'zh-CN'), { effFrom: 'zh-CN', effTo: 'en' });
});

test('resolveDirection：日韩文本+中文目标 → 不换向（防误伤）', () => {
    assert.deepStrictEqual(resolveDirection('こんにちは', 'auto', 'zh-CN'), { effFrom: 'auto', effTo: 'zh-CN' });
    assert.deepStrictEqual(resolveDirection('안녕하세요', 'auto', 'zh-CN'), { effFrom: 'auto', effTo: 'zh-CN' });
});

test('resolveDirection：中文文本+非中文目标 → 不换向', () => {
    assert.deepStrictEqual(resolveDirection('你好', 'auto', 'ja'), { effFrom: 'auto', effTo: 'ja' });
    assert.deepStrictEqual(resolveDirection('你好', 'auto', 'en'), { effFrom: 'auto', effTo: 'en' });
});

test('resolveDirection：英文文本+英文目标 → 本地不预判（依赖服务端兜底）', () => {
    assert.deepStrictEqual(resolveDirection('hello', 'auto', 'en'), { effFrom: 'auto', effTo: 'en' });
});

test('resolveDirection：简繁同族视为相同语言', () => {
    assert.deepStrictEqual(resolveDirection('x', 'zh-CN', 'zh-TW'), { effFrom: 'zh-CN', effTo: 'en' });
});

test('resolveDirection：autoSwapTarget 关闭时不换向', () => {
    setConfig({ 'translation.autoSwapTarget': false });
    try {
        assert.deepStrictEqual(resolveDirection('你好', 'auto', 'zh-CN'), { effFrom: 'auto', effTo: 'zh-CN' });
    } finally {
        setConfig({ 'translation.autoSwapTarget': true });
    }
});

test('needsRetrySwap：检测语言=目标语言', () => {
    assert.strictEqual(needsRetrySwap('你好', { from: 'zh-CN', to: 'zh-CN', text: '你好' }), true);
    assert.strictEqual(needsRetrySwap('hello', { from: 'en', to: 'en', text: 'hello' }), true);
    assert.strictEqual(needsRetrySwap('hello', { from: 'en', to: 'zh-CN', text: '你好' }), false);
    assert.strictEqual(needsRetrySwap('x', { from: 'auto', to: 'zh-CN', text: 'x' }), false); // auto 不判
});

test('needsRetrySwap：混合文本被误判语种时的中译中兜底', () => {
    // 服务端误判为 et（爱沙尼亚语）但译文保留汉字 → 触发换向
    assert.strictEqual(
        needsRetrySwap('获取用户信息 userId', { from: 'et', to: 'zh-CN', text: '获取用户信息 userId' }),
        true
    );
    // 日文含假文除外
    assert.strictEqual(
        needsRetrySwap('東京都は日本の首都です', { from: 'ja', to: 'zh-CN', text: '东京都是日本的首都' }),
        false
    );
});

test('chunkText：按行边界分块且不超过上限', () => {
    assert.deepStrictEqual(chunkText(''), ['']);
    assert.deepStrictEqual(chunkText('hello'), ['hello']);
    const lines = Array.from({ length: 50 }, (_, i) => `line-${i}-${'x'.repeat(100)}`);
    const text = lines.join('\n');
    const chunks = chunkText(text, 1600);
    assert.ok(chunks.length > 1);
    for (const c of chunks) {
        assert.ok(c.length <= 1600, `块长度 ${c.length} 超限`);
    }
    assert.strictEqual(chunks.join('\n'), text); // 拼接无损
});

test('chunkText：超长单行强制切分', () => {
    const text = 'a'.repeat(3500);
    const chunks = chunkText(text, 1600);
    assert.strictEqual(chunks.join(''), text);
    for (const c of chunks) {
        assert.ok(c.length <= 1600);
    }
});
