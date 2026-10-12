// 冒烟测试：Bing 网页版免密钥词典（对齐参考插件 BingTranslator 的 tlookupv3 方案）
const Module = require('module');
const path = require('path');
const origResolve = Module._resolveFilename;
Module._resolveFilename = function (request, ...args) {
    if (request === 'vscode') {
        return path.join(__dirname, 'vscode-stub.js');
    }
    return origResolve.call(this, request, ...args);
};

const { parseBingAuth, bingLookupDictionary } = require('../out/bing.js');

(async () => {
    const res = await fetch('https://www.bing.com/translator', {
        headers: {
            'User-Agent':
                'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) ' +
                'Chrome/143.0.0.0 Safari/537.36 Edg/143.0.0.0'
        }
    });
    if (res.status !== 200) {
        throw new Error(`Bing 翻译页 HTTP ${res.status}`);
    }
    const auth = parseBingAuth(await res.text());
    console.log(`auth ok: IG=${auth.ig.slice(0, 6)}… IID=${auth.iid} ttl=${Math.round(auth.ttlMs / 1000)}s`);

    // put → 放（微软翻译的译文），词典应返回分词性释义+同义词
    const defs = await bingLookupDictionary('put', '放', 'en', 'zh-Hans');
    if (!defs || defs.length === 0) {
        throw new Error('未获取到词典数据');
    }
    const withSynonyms = defs.flatMap(d => d.entries ?? []).filter(e => e.synonyms.length > 0);
    if (withSynonyms.length === 0) {
        throw new Error('未获取到释义同义词组');
    }
    for (const d of defs) {
        console.log(`[${d.pos}] ${d.terms.join('；')}`);
        for (const e of d.entries ?? []) {
            console.log(`  ${e.term} → ${e.synonyms.join(', ')}`);
        }
    }
    console.log('SMOKE OK: Bing 免密钥词典(释义+同义词)通过');
    process.exit(0);
})().catch(e => {
    console.error('SMOKE FAIL:', e.message);
    process.exit(1);
});
