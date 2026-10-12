// 扩展宿主内运行的集成测试入口（由 scripts/integration.js 通过
// @vscode/test-electron 加载）。跑真实网络（Bing/Edge 端点），
// 断言微软引擎译文与词典数据与参考插件一致。
const assert = require('node:assert');

exports.run = async function run() {
    // 激活被测扩展（确保 activate 路径无异常）
    const ext = require('../../out/extension.js');
    const vscode = require('vscode');
    ext.activate({
        subscriptions: [],
        globalState: { get: () => true, update: async () => undefined },
        globalStorageUri: { fsPath: require('node:os').tmpdir() + '\\vsc-tr-storage' }
    });

    const { translateQuery } = require('../../out/services/index.js');

    // 1) 标准词 put：译文与词典（对齐参考插件 IDEA 中的呈现）
    const put = await translateQuery('put', 'auto', 'zh-CN');
    assert.strictEqual(put.text, '放', `put 译文应为"放"（实际: ${put.text}，可能回退了 Edge 端点）`);
    assert.ok((put.definitions ?? []).length > 0, 'put 应有词典释义');
    const verb = put.definitions.find(d => d.pos === '动词');
    assert.ok(verb, `词性应映射为中文"动词"（实际: ${put.definitions.map(d => d.pos).join(',')}）`);
    assert.ok(verb.terms.includes('把') || verb.terms.includes('放'), '词典应包含核心释义');
    const withSyn = verb.entries.filter(e => e.synonyms.length > 0);
    assert.ok(withSyn.length > 0, '释义应带同义词组');

    // 2) 句子翻译（Bing 主路径 + auto-detect）
    const sentence = await translateQuery('hello world', 'auto', 'zh-CN');
    assert.ok(sentence.text.length > 0, '句子翻译应返回非空译文');

    // 3) 中文换向（zh-CN 目标自动切 en）
    const swapped = await translateQuery('获取用户信息', 'auto', 'zh-CN');
    assert.strictEqual(swapped.to, 'en', '中文源应自动换向到英文');
    assert.ok(swapped.text.length > 0);

    console.log('[host-test] 微软引擎链路（Bing 主路径/词典/词性/换向）全部通过');
};
