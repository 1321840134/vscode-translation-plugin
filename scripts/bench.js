// 延迟基准：测量微软(Edge)引擎真实请求耗时分布
const Module = require('module');
const path = require('path');
const origResolve = Module._resolveFilename;
Module._resolveFilename = function (request, ...args) {
    if (request === 'vscode') {
        return path.join(__dirname, 'vscode-stub.js');
    }
    return origResolve.call(this, request, ...args);
};
const { microsoftEngine } = require('../out/services/microsoft.js');

function stats(times) {
    const sorted = [...times].sort((a, b) => a - b);
    const sum = times.reduce((a, b) => a + b, 0);
    return {
        count: times.length,
        min: sorted[0],
        p50: sorted[Math.floor(times.length / 2)],
        p95: sorted[Math.floor(times.length * 0.95) - 1] ?? sorted[times.length - 1],
        max: sorted[sorted.length - 1],
        avg: Math.round(sum / times.length)
    };
}

async function run(label, text, from, to, n) {
    const times = [];
    for (let i = 0; i < n; i++) {
        const t0 = Date.now();
        await microsoftEngine.translate(text, from, to);
        times.push(Date.now() - t0);
    }
    const s = stats(times);
    console.log(`${label}: n=${s.count} min=${s.min}ms p50=${s.p50}ms p95=${s.p95}ms max=${s.max}ms avg=${s.avg}ms`);
    return s;
}

(async () => {
    const a = await run('en→zh hello world', 'hello world', 'auto', 'zh-CN', 10);
    const b = await run('zh→en 你好世界  ', '你好，世界', 'auto', 'en', 10);
    // 首次 vs 后续（连接复用观察）
    console.log(`首次请求 vs 其余: 首次=${a.min === undefined ? '' : ''}见上，若首次显著大于 p50 说明存在连接建立开销`);
    const pass = a.p50 < 2000 && b.p50 < 2000;
    console.log(pass ? 'BENCH DONE' : 'BENCH SLOW: p50 超过 2 秒');
    process.exit(pass ? 0 : 1);
})().catch(e => {
    console.error('BENCH FAILED:', e.message);
    process.exit(1);
});
