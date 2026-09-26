const test = require('node:test');
const assert = require('node:assert');
require('./helpers/stub.js').install();
const { buildReplaceCandidates } = require('../out/candidates.js');

function result(overrides = {}) {
    return {
        query: 'hello',
        from: 'en',
        to: 'zh-CN',
        text: '你好',
        engineId: 't',
        engineName: '测试',
        ...overrides
    };
}

test('candidates：主译文与义项拆分', () => {
    const cs = buildReplaceCandidates(result({ text: '获取；检索' }));
    assert.deepStrictEqual(
        cs.map(c => [c.label, c.description]),
        [['获取；检索', '译文'], ['获取', '义项'], ['检索', '义项']]
    );
});

test('candidates：词典释义进入候选', () => {
    const cs = buildReplaceCandidates(result({
        text: '你好',
        definitions: [{ pos: 'interjection', terms: ['你好', '哈喽', '喂'] }]
    }));
    const labels = cs.map(c => c.label);
    assert.ok(labels.includes('你好'));
    assert.ok(labels.includes('哈喽'));
    assert.ok(labels.includes('喂'));
    assert.ok(cs.find(c => c.label === '哈喽').description.includes('interjection'));
});

test('candidates：英文译文生成命名风格变体', () => {
    const cs = buildReplaceCandidates(result({ text: 'get user info', to: 'en' }));
    const byDesc = Object.fromEntries(cs.map(c => [c.description, c.label]));
    assert.strictEqual(byDesc['camelCase'], 'getUserInfo');
    assert.strictEqual(byDesc['PascalCase'], 'GetUserInfo');
    assert.strictEqual(byDesc['SNAKE_CASE'], 'get_user_info');
    assert.strictEqual(byDesc['kebab-case'], 'get-user-info');
    // SPACE 变体与主译文相同时不重复出现
    assert.strictEqual(cs.filter(c => c.label === 'get user info').length, 1);
});

test('candidates：中文译文不产生风格变体（去重）', () => {
    const cs = buildReplaceCandidates(result({ text: '获取用户信息' }));
    assert.strictEqual(cs.length, 1);
    assert.strictEqual(cs[0].label, '获取用户信息');
});

test('candidates：候选去重（大小写不敏感）', () => {
    const cs = buildReplaceCandidates(result({
        text: 'User Info',
        definitions: [{ pos: '', terms: ['user info'] }]
    }));
    assert.strictEqual(cs.filter(c => c.label.toLowerCase() === 'user info').length, 1);
});
