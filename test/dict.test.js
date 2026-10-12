// 词典增强测试（对齐参考插件的词典呈现：释义 + 每条释义的同义词组）
const test = require('node:test');
const assert = require('node:assert');
const { install } = require('./helpers/stub.js');
install();

const { parseGoogleDict } = require('../out/services/google.js');
const { parseMsDict } = require('../out/services/microsoft.js');
const { buildReplaceCandidates } = require('../out/candidates.js');

// ---- Google gtx dt=bd 词典数据（put 的真实结构样例） ----
const googleDict = [
    {
        pos: 'verb',
        terms: ['放', '把', '搁', '装入'],
        entry: [
            { word: '把', score: 123456, reverse_translation: ['put', 'take', 'get', 'bring', 'give', 'turn', 'took'] },
            { word: '放', score: 100000, reverse_translation: ['put', 'let', 'placed', 'lay', 'set', 'deposit'] },
            { word: '搁', score: 50000, reverse_translation: ['put', 'shelve'] }
        ]
    },
    {
        pos: 'noun',
        terms: ['掷', '投'],
        entry: [{ word: '掷', score: 3000, reverse_translation: ['throw', 'cast', 'pitch', 'put'] }]
    }
];

test('parseGoogleDict：解析词性/释义/每条释义的同义词组', () => {
    const defs = parseGoogleDict(googleDict);
    assert.strictEqual(defs.length, 2);
    assert.strictEqual(defs[0].pos, 'verb');
    assert.deepStrictEqual(defs[0].terms, ['放', '把', '搁', '装入']);
    assert.strictEqual(defs[0].entries.length, 3);
    assert.strictEqual(defs[0].entries[0].term, '把');
    assert.deepStrictEqual(defs[0].entries[0].synonyms, ['put', 'take', 'get', 'bring', 'give', 'turn', 'took']);
    assert.strictEqual(defs[1].pos, 'noun');
    assert.deepStrictEqual(defs[1].entries[0].synonyms, ['throw', 'cast', 'pitch', 'put']);
});

test('parseGoogleDict：无 entry / 畸形输入容错', () => {
    assert.deepStrictEqual(parseGoogleDict([{ pos: 'verb', terms: ['放'] }]), [{ pos: 'verb', terms: ['放'] }]);
    assert.deepStrictEqual(parseGoogleDict(null), []);
    assert.deepStrictEqual(parseGoogleDict('x'), []);
    // 空 word 的 entry 被过滤
    const defs = parseGoogleDict([{ pos: 'verb', terms: ['a'], entry: [{ reverse_translation: ['x'] }, { word: '好', reverse_translation: [] }] }]);
    assert.strictEqual(defs[0].entries.length, 1);
    assert.strictEqual(defs[0].entries[0].term, '好');
});

// ---- Azure dictionary/lookup 响应（put 的真实结构样例） ----
const msDict = [
    {
        normalizedSource: 'put',
        displaySource: 'put',
        translations: [
            {
                normalizedTarget: '放置',
                displayTarget: '放置',
                posTag: 'VERB',
                confidence: 0.8007,
                prefixWord: '',
                backTranslations: [
                    { normalizedText: 'put', displayText: 'put', numExamples: 15, frequencyCount: 53349 },
                    { normalizedText: 'place', displayText: 'place', numExamples: 5, frequencyCount: 90000 },
                    { normalizedText: 'lay', displayText: 'lay', numExamples: 1, frequencyCount: 300 }
                ]
            },
            {
                normalizedTarget: '放',
                displayTarget: '放',
                posTag: 'VERB',
                confidence: 0.5,
                prefixWord: '',
                backTranslations: [
                    { normalizedText: 'put', displayText: 'put', numExamples: 9, frequencyCount: 1000 }
                ]
            },
            {
                normalizedTarget: '推',
                displayTarget: '推',
                posTag: 'NOUN',
                confidence: 0.2,
                prefixWord: '',
                backTranslations: [
                    { normalizedText: 'throw', displayText: 'throw', numExamples: 2, frequencyCount: 50 }
                ]
            }
        ]
    }
];

test('parseMsDict：confidence 排序、同词性聚合、同义词按词频降序', () => {
    const defs = parseMsDict(msDict);
    assert.strictEqual(defs.length, 2);
    const verb = defs.find(d => d.pos === 'verb');
    assert.ok(verb, '应含 verb 词性组');
    // confidence 排序：放置(0.8) 在 放(0.5) 前
    assert.deepStrictEqual(verb.terms, ['放置', '放']);
    assert.strictEqual(verb.entries.length, 2);
    // 同义词按 frequencyCount 降序：place(90000) > put(53349) > lay(300)
    assert.deepStrictEqual(verb.entries[0].synonyms, ['place', 'put', 'lay']);
    const noun = defs.find(d => d.pos === 'noun');
    assert.deepStrictEqual(noun.terms, ['推']);
});

test('parseMsDict：畸形输入容错', () => {
    assert.deepStrictEqual(parseMsDict(null), []);
    assert.deepStrictEqual(parseMsDict([]), []);
    assert.deepStrictEqual(parseMsDict([{}]), []);
    // 超过 6 条时截断
    const many = {
        translations: Array.from({ length: 9 }, (_, i) => ({
            displayTarget: `词${i}`, posTag: 'VERB', confidence: i / 10, backTranslations: []
        }))
    };
    assert.strictEqual(parseMsDict([many])[0].terms.length, 6);
});

// ---- 替换候选吸收同义词 ----

test('buildReplaceCandidates：词典同义词进入候选且去重', () => {
    const result = {
        query: 'put', from: 'en', to: 'zh-CN', text: '放', engineId: 'google', engineName: 'Google 翻译',
        definitions: [{
            pos: 'verb',
            terms: ['放', '把'],
            entries: [
                { term: '放', synonyms: ['place', 'lay'] },
                { term: '把', synonyms: ['put', 'take', 'place'] }
            ]
        }]
    };
    const cands = buildReplaceCandidates(result);
    const labels = cands.map(c => c.label);
    assert.ok(labels.includes('place'), '同义词 place 应为候选');
    assert.ok(labels.includes('lay'), '同义词 lay 应为候选');
    assert.ok(labels.includes('take'), '同义词 take 应为候选');
    // 跨释义重复的同义词（place 出现两次）只保留一个
    assert.strictEqual(labels.filter(l => l === 'place').length, 1);
    // 描述标注来源
    assert.ok(cands.some(c => c.label === 'place' && c.description === '同义词·verb'));
});

// ---- webview 渲染分支 ----

test('webview：词典释义渲染支持逐条释义 + 同义词子行', () => {
    const { buildHtml } = require('../out/html.js');
    const html = buildHtml('http://localhost', 'n0');
    const src = html.match(/<script nonce="n0">([\s\S]*?)<\/script>/)[1];
    assert.ok(src.includes('def.entries'), '应读取 entries');
    assert.ok(src.includes('en.synonyms.join'), '同义词应拼接展示');
    assert.ok(html.includes('.def-syn'), '应有同义词子行样式');
    assert.ok(html.includes('.def-list'), '应有释义列表样式');
});
