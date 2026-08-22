const test = require('node:test');
const assert = require('node:assert');
require('./helpers/stub.js').install();
const {
    guessCjkLanguage,
    sameLanguage,
    oppositeTargetLang,
    looksZhToZh,
    hanCount,
    langName
} = require('../out/languages.js');

test('guessCjkLanguage 基本判定', () => {
    assert.strictEqual(guessCjkLanguage(''), undefined);
    assert.strictEqual(guessCjkLanguage('   '), undefined);
    assert.strictEqual(guessCjkLanguage('hello world'), undefined);
    assert.strictEqual(guessCjkLanguage('你好'), 'zh-CN');
    assert.strictEqual(guessCjkLanguage('使用VSCode开发插件'), 'zh-CN');
    assert.strictEqual(guessCjkLanguage('こんにちは'), 'ja');
    assert.strictEqual(guessCjkLanguage('東京都は日本の首都'), 'ja'); // 含假名优先判日
    assert.strictEqual(guessCjkLanguage('안녕하세요'), 'ko');
    assert.strictEqual(guessCjkLanguage('a你b'), undefined); // 汉字不足 2 个
});

test('guessCjkLanguage 混合文本阈值（悬浮文档场景）', () => {
    // 标识符稀释汉字占比，仍应判为中文（>=10% 且 >=2 个汉字）
    const mixed = 'getUserInfo(): UserInfo 获取用户信息 Parameters userId';
    assert.strictEqual(guessCjkLanguage(mixed), 'zh-CN');
    // 长文本只采样前 500 字符
    const long = 'x'.repeat(600) + '你好世界';
    assert.strictEqual(guessCjkLanguage(long), undefined);
});

test('guessCjkLanguage 已知局限：纯汉字日文词判为中文', () => {
    // 无假名时无法区分，判定为中文（与参考插件行为一致），断言以固行为防回归
    assert.strictEqual(guessCjkLanguage('東京'), 'zh-CN');
});

test('sameLanguage 简繁同族', () => {
    assert.strictEqual(sameLanguage('zh-CN', 'zh-CN'), true);
    assert.strictEqual(sameLanguage('zh-CN', 'zh-TW'), true);
    assert.strictEqual(sameLanguage('zh-Hans', 'zh-CN'), true); // 前缀判断，微软规范代码也视为同族
    assert.strictEqual(sameLanguage('en', 'zh-CN'), false);
    assert.strictEqual(sameLanguage('ja', 'ja'), true);
});

test('oppositeTargetLang 中文↔英文', () => {
    assert.strictEqual(oppositeTargetLang('zh-CN'), 'en');
    assert.strictEqual(oppositeTargetLang('zh-TW'), 'en');
    assert.strictEqual(oppositeTargetLang('en'), 'zh-CN');
    assert.strictEqual(oppositeTargetLang('ja'), 'zh-CN');
});

test('looksZhToZh 判定中译中', () => {
    assert.strictEqual(looksZhToZh('你好世界', '你好，世界'), true); // 保留原文汉字
    assert.strictEqual(looksZhToZh('你好世界', 'Hello World'), false); // 译文无汉字
    assert.strictEqual(looksZhToZh('hello', '你好'), false); // 原文汉字不足
    assert.strictEqual(looksZhToZh('東京都は日本の首都です', '东京都是日本的首都'), false); // 含假名日文除外
    assert.strictEqual(looksZhToZh('안녕하세요', '你好'), false); // 韩文谚文非汉字
});

test('hanCount 计数', () => {
    assert.strictEqual(hanCount(''), 0);
    assert.strictEqual(hanCount('abc'), 0);
    assert.strictEqual(hanCount('你好abc'), 2);
});

test('langName', () => {
    assert.strictEqual(langName('auto'), '自动检测');
    assert.strictEqual(langName(''), '自动检测');
    assert.strictEqual(langName('zh-CN'), '中文（简体）');
    assert.strictEqual(langName('unknown-code'), 'unknown-code');
});
