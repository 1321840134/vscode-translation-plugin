const test = require('node:test');
const assert = require('node:assert');
const { install, setConfig } = require('./helpers/stub.js');
install();

// mock 两个 TTS 后端，验证调度分支
const edgeTts = require('../out/edge-tts.js');
const openaiTts = require('../out/openai-tts.js');
let calls = { edge: 0, openai: 0 };
let edgeFails = false;
const fakeMp3 = Buffer.from([0xff, 0xfb, 1, 2, 3]);
edgeTts.edgeSpeak = async () => {
    calls.edge++;
    if (edgeFails) {
        throw new Error('Edge 语音连接出错');
    }
    return fakeMp3;
};
openaiTts.openaiSpeak = async () => {
    calls.openai++;
    return fakeMp3;
};

const { synthesize } = require('../out/tts.js');

function reset(fails = false) {
    calls = { edge: 0, openai: 0 };
    edgeFails = fails;
}

test('tts 调度：auto 且 Edge 可用 → 走 Edge，不触 OpenAI', async () => {
    reset();
    setConfig({ 'translation.tts.service': 'auto' });
    const uri = await synthesize('你好', 'zh-CN');
    assert.ok(uri.startsWith('data:audio/mpeg;base64,'));
    assert.strictEqual(calls.edge, 1);
    assert.strictEqual(calls.openai, 0);
});

test('tts 调度：强制 openai → 只走 OpenAI', async () => {
    reset();
    setConfig({ 'translation.tts.service': 'openai' });
    const uri = await synthesize('你好', 'zh-CN');
    assert.ok(uri.startsWith('data:audio/mpeg;base64,'));
    assert.strictEqual(calls.openai, 1);
    assert.strictEqual(calls.edge, 0);
    setConfig({ 'translation.tts.service': 'auto' });
});

test('tts 调度：auto 且 Edge 失败 → 回退 OpenAI', async () => {
    reset(true);
    setConfig({ 'translation.tts.service': 'auto', 'translation.openai.apiKey': 'test-key' });
    const uri = await synthesize('你好', 'zh-CN');
    assert.ok(uri.startsWith('data:audio/mpeg;base64,'));
    assert.strictEqual(calls.edge, 1);
    assert.strictEqual(calls.openai, 1);
    setConfig({ 'translation.openai.apiKey': '' });
});

test('tts 调度：强制 edge 且失败 → 直接抛错不回退', async () => {
    reset(true);
    setConfig({ 'translation.tts.service': 'edge' });
    await assert.rejects(() => synthesize('你好', 'zh-CN'), /Edge/);
    assert.strictEqual(calls.openai, 0);
    setConfig({ 'translation.tts.service': 'auto' });
});

test('tts 调度：禁用时抛错', async () => {
    setConfig({ 'translation.tts.enabled': false });
    try {
        await assert.rejects(() => synthesize('你好', 'zh-CN'), /禁用/);
    } finally {
        setConfig({ 'translation.tts.enabled': true });
    }
});
