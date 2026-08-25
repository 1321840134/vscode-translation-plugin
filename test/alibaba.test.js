const test = require('node:test');
const assert = require('node:assert');
const { createHmac } = require('node:crypto');
require('./helpers/stub.js').install();
const { popEncode, popSign } = require('../out/services/alibaba.js');

test('popEncode：RFC3986 特殊字符', () => {
    assert.strictEqual(popEncode(' '), '%20');
    assert.strictEqual(popEncode('+'), '%2B');
    assert.strictEqual(popEncode('*'), '%2B');
    assert.strictEqual(popEncode('~'), '~');
    assert.strictEqual(popEncode('/'), '%2F');
    assert.strictEqual(popEncode('='), '%3D');
    assert.strictEqual(popEncode('&'), '%26');
    assert.strictEqual(popEncode('你好'), encodeURIComponent('你好'));
});

test('popSign：与文档算法独立重算一致（键排序 + GET&%2F& 前缀 + HMAC-SHA1）', () => {
    const params = {
        Action: 'TranslateGeneral',
        SourceText: 'hello + world/你&好',
        AccessKeyId: 'testKeyId',
        SignatureNonce: 'abc123'
    };
    const secret = 'testSecret';
    // 按阿里云文档独立重算（不依赖被测实现的内部顺序）
    const canonical = Object.keys(params)
        .sort()
        .map(k => `${popEncode(k)}=${popEncode(params[k])}`)
        .join('&');
    const stringToSign = `GET&${popEncode('/')}&${popEncode(canonical)}`;
    const expected = createHmac('sha1', `${secret}&`).update(stringToSign, 'utf8').digest('base64');
    assert.strictEqual(popSign(params, secret), expected);
});

test('popSign：参数顺序不影响签名（内部排序）', () => {
    const a = { x: '1', a: '2', m: '3' };
    const b = { m: '3', x: '1', a: '2' };
    assert.strictEqual(popSign(a, 's'), popSign(b, 's'));
});
