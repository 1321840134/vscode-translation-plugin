const test = require('node:test');
const assert = require('node:assert');
const { formatTranslated } = require('../out/textFormat.js');

test('formatTranslated：original 原样返回', () => {
    assert.strictEqual(formatTranslated('Hello World', 'original', ' '), 'Hello World');
    assert.strictEqual(formatTranslated('你好世界', 'original', ' '), '你好世界');
});

test('formatTranslated：英文命名风格', () => {
    assert.strictEqual(formatTranslated('get user info', 'camelCase', ' '), 'getUserInfo');
    assert.strictEqual(formatTranslated('get user info', 'PascalCase', ' '), 'GetUserInfo');
    assert.strictEqual(formatTranslated('get user info', 'snake_case', ' '), 'get_user_info');
    assert.strictEqual(formatTranslated('get user info', 'kebab-case', ' '), 'get-user-info');
    assert.strictEqual(formatTranslated('get user info', 'space', '_'), 'get_user_info');
    assert.strictEqual(formatTranslated('get user info', 'space', ''), 'getuserinfo');
});

test('formatTranslated：中文译文不做格式化', () => {
    assert.strictEqual(formatTranslated('你好世界', 'camelCase', ' '), '你好世界');
    assert.strictEqual(formatTranslated('获取 用户 信息', 'camelCase', ' '), '获取 用户 信息'); // 字母占比过低
});

test('formatTranslated：空串与无字母文本', () => {
    assert.strictEqual(formatTranslated('', 'camelCase', ' '), '');
    assert.strictEqual(formatTranslated('123 456', 'camelCase', ' '), '123 456');
});
