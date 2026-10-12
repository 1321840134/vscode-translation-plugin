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
    assert.strictEqual(byDesc['snake_case'], 'get_user_info');
    assert.strictEqual(byDesc['UPPER_SNAKE_CASE'], 'GET_USER_INFO');
    assert.strictEqual(byDesc['kebab-case'], 'get-user-info');
    assert.strictEqual(byDesc['Title Case'], 'Get User Info');
    assert.strictEqual(byDesc['UPPER CASE'], 'GET USER INFO');
    // lower / SPACE 变体与主译文相同时不重复出现
    assert.strictEqual(cs.filter(c => c.label === 'get user info').length, 1);
    assert.strictEqual(byDesc['lower case'], undefined);
});

test('candidates：已是 Title 形态的译文不与 Title/SPACE 变体重复', () => {
    const cs = buildReplaceCandidates(result({ text: 'User Info', to: 'en' }));
    assert.strictEqual(cs.filter(c => c.label === 'User Info').length, 1, 'Title 变体撞译文时去重');
    const byDesc = Object.fromEntries(cs.map(c => [c.description, c.label]));
    assert.strictEqual(byDesc['camelCase'], 'userInfo');
    // 小写空格形态由 SPACE 变体承载，lower 与其同串被去重
    assert.strictEqual(byDesc['SPACE'], 'user info');
    assert.strictEqual(cs.filter(c => c.label === 'user info').length, 1);
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
    // 语义层面（译文/义项/释义）同词只保留一条；变体形态另计
    const semantic = cs.filter(c => ['译文', '义项', '释义'].includes(c.description));
    assert.strictEqual(semantic.length, 1);
    assert.strictEqual(semantic[0].label, 'User Info');
});
