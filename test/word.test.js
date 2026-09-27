const test = require('node:test');
const assert = require('node:assert');
require('./helpers/stub.js').install();
const { wordAtPosition } = require('../out/word.js');
const { normalizeWordQuery } = require('../out/word.js');
const { vscodeStub } = require('./helpers/stub.js');

function doc(lines) {
    return { lineAt: line => ({ text: lines[line] }) };
}

test('wordAtPosition：提取英文单词', () => {
    const w = wordAtPosition(doc(['const hello = 1;']), { line: 0, character: 7 });
    assert.strictEqual(w.query, 'hello');
    assert.strictEqual(w.raw, 'hello');
    assert.deepStrictEqual({ s: w.range.start.character, e: w.range.end.character }, { s: 6, e: 11 });
});

test('wordAtPosition：驼峰拆分（智能取词）', () => {
    const w = wordAtPosition(doc(['getUserInfo();']), { line: 0, character: 6 });
    assert.strictEqual(w.query, 'get user info');
    assert.strictEqual(w.raw, 'getUserInfo');
});

test('wordAtPosition：snake_case 拆分', () => {
    const w = wordAtPosition(doc(['my_var_name = 1']), { line: 0, character: 4 });
    assert.strictEqual(w.query, 'my var name');
});

test('wordAtPosition：中文取词', () => {
    const w = wordAtPosition(doc(['// 获取用户信息']), { line: 0, character: 6 });
    assert.strictEqual(w.query, '获取用户信息');
});

test('wordAtPosition：超长中文段不作为单词（词典用整句无意义）', () => {
    const long = '// 此方法用于从远程服务器上获取指定用户的详细档案信息并缓存';
    const w = wordAtPosition(doc([long]), { line: 0, character: 6 });
    assert.strictEqual(w, undefined);
});

test('wordAtPosition：中英混合词', () => {
    const w = wordAtPosition(doc(['用户userID']), { line: 0, character: 4 });
    assert.strictEqual(w.raw, '用户userID');
});

test('wordAtPosition：边界情况', () => {
    assert.strictEqual(wordAtPosition(doc(['   ']), { line: 0, character: 1 }), undefined); // 空白
    assert.strictEqual(wordAtPosition(doc(['123 + 456']), { line: 0, character: 1 }), undefined); // 纯数字
    assert.strictEqual(wordAtPosition(doc(['=== ===']), { line: 0, character: 1 }), undefined); // 符号
    // 行尾/行首边界不越界且命中
    assert.strictEqual(wordAtPosition(doc(['word']), { line: 0, character: 5 }).query, 'word');
    assert.strictEqual(wordAtPosition(doc(['word']), { line: 0, character: 0 }).query, 'word');
});

test('wordAtPosition：行首行尾不越界', () => {
    const line = 'hello';
    for (let i = 0; i <= line.length; i++) {
        const w = wordAtPosition(doc([line]), { line: 0, character: i });
        assert.strictEqual(w.query, 'hello', `位置 ${i} 应命中 hello`);
    }
});

test('normalizeWordQuery：驼峰/下划线拆分与小写（划选路径共用）', () => {
    assert.strictEqual(normalizeWordQuery('getUserInfo'), 'get user info');
    assert.strictEqual(normalizeWordQuery('HTTPServer'), 'http server'); // 连续大写结尾拆分
    assert.strictEqual(normalizeWordQuery('my_var_name'), 'my var name');
    assert.strictEqual(normalizeWordQuery('hello'), 'hello');
    assert.strictEqual(normalizeWordQuery('获取用户'), '获取用户'); // 中文不受影响
    assert.strictEqual(normalizeWordQuery('userID42'), 'user id42');
});
