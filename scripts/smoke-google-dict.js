// 冒烟测试：Google 词典增强（dt=bd 的 entry.reverse_translation 同义词组）
// 网络顺序：直连 → HTTPS_PROXY 环境变量 → 本机代理兜底
const Module = require('module');
const path = require('path');
const origResolve = Module._resolveFilename;
Module._resolveFilename = function (request, ...args) {
    if (request === 'vscode') {
        return path.join(__dirname, 'vscode-stub.js');
    }
    return origResolve.call(this, request, ...args);
};

const { parseGoogleDict } = require('../out/services/google.js');
const { formPairsBody, FORM_CONTENT_TYPE, request } = require('../out/net.js');

async function fetchDict(word) {
    const body = formPairsBody([
        ['client', 'gtx'], ['sl', 'en'], ['tl', 'zh-CN'], ['hl', 'zh-CN'],
        ['dt', 't'], ['dt', 'bd'], ['dt', 'rm'], ['dj', '1'], ['q', word]
    ]);
    const headers = { 'Content-Type': FORM_CONTENT_TYPE, 'User-Agent': 'Mozilla/5.0' };
    const url = 'https://translate.googleapis.com/translate_a/single';
    const proxies = [undefined, process.env.HTTPS_PROXY, 'http://127.0.0.1:10808'];
    let lastErr;
    for (const proxy of proxies) {
        if (proxy === '') {
            continue;
        }
        try {
            const res = await request(url, { method: 'POST', headers, body, proxy });
            if (res.status !== 200) {
                throw new Error(`HTTP ${res.status}`);
            }
            return JSON.parse(res.buffer.toString('utf8'));
        } catch (e) {
            lastErr = e;
        }
    }
    throw lastErr ?? new Error('Google 词典请求全部失败');
}

(async () => {
    const data = await fetchDict('put');
    const defs = parseGoogleDict(data.dict);
    if (defs.length === 0) {
        throw new Error('未解析到词典释义');
    }
    const withSynonyms = defs.flatMap(d => d.entries ?? []);
    if (withSynonyms.length === 0) {
        throw new Error('未解析到释义同义词组');
    }
    const sample = withSynonyms[0];
    if (!sample.synonyms.length) {
        throw new Error('同义词组为空');
    }
    for (const d of defs) {
        console.log(`[${d.pos}] ${d.terms.join('；')}`);
        for (const e of d.entries ?? []) {
            console.log(`  ${e.term} → ${e.synonyms.join(', ')}`);
        }
    }
    console.log('SMOKE OK: Google 词典释义+同义词解析通过');
    process.exit(0);
})().catch(e => {
    console.error('SMOKE FAIL:', e.message);
    process.exit(1);
});
