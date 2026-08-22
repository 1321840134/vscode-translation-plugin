// 冒烟测试：自动换向（源语言=目标语言时自动切换，中文↔英文）
// 通过 vscode 桩加载编译后的真实门面 translateQuery
const Module = require('module');
const path = require('path');
const origResolve = Module._resolveFilename;
Module._resolveFilename = function (request, ...args) {
    if (request === 'vscode') {
        return path.join(__dirname, 'vscode-stub.js');
    }
    return origResolve.call(this, request, ...args);
};

const { translateQuery } = require('../out/services/index.js');

function assert(cond, msg) {
    if (!cond) {
        throw new Error(msg);
    }
}

async function main() {
    // 1. 中文文本 + 目标中文 → 应自动换向译为英文（本地 CJK 预判，单次请求）
    const r1 = await translateQuery('你好，世界', 'auto', 'zh-CN');
    console.log(`1. zh文本→目标zh : "${r1.text}" (${r1.from} → ${r1.to})`);
    assert(!/[\u4e00-\u9fff]/.test(r1.text), '换向失败，仍输出中文: ' + r1.text);
    assert(r1.to === 'en', '目标语言应为 en，实际 ' + r1.to);

    // 2. 显式 zh-CN → zh-CN → 应换向译为英文
    const r2 = await translateQuery('今天天气不错', 'zh-CN', 'zh-CN');
    console.log(`2. 显式zh→zh     : "${r2.text}" (${r2.from} → ${r2.to})`);
    assert(!/[\u4e00-\u9fff]/.test(r2.text), '显式同语言未换向: ' + r2.text);

    // 3. 日文文本 + 目标中文 → 必须保持日译中（CJK 预判不能误伤）
    const r3 = await translateQuery('こんにちは世界', 'auto', 'zh-CN');
    console.log(`3. ja文本→目标zh : "${r3.text}" (${r3.from} → ${r3.to})`);
    assert(/[\u4e00-\u9fff]/.test(r3.text) && r3.to === 'zh-CN', '日译中被误换向: ' + r3.text);

    // 4. 韩文文本 + 目标中文 → 保持韩译中
    const r4 = await translateQuery('안녕하세요 세계', 'auto', 'zh-CN');
    console.log(`4. ko文本→目标zh : "${r4.text}" (${r4.from} → ${r4.to})`);
    assert(/[\u4e00-\u9fff]/.test(r4.text) && r4.to === 'zh-CN', '韩译中被误换向: ' + r4.text);

    // 5. 英文文本 + 目标英文 → 服务端检测后兜底换向为中文（双请求场景）
    const r5 = await translateQuery('Good morning', 'auto', 'en');
    console.log(`5. en文本→目标en : "${r5.text}" (${r5.from} → ${r5.to})`);
    assert(/[\u4e00-\u9fff]/.test(r5.text) && r5.to === 'zh-CN', '英译英未兜底换向: ' + r5.text);

    // 6. 中文文本 + 目标日文 → 正常中译日（不换向）
    const r6 = await translateQuery('你好', 'auto', 'ja');
    console.log(`6. zh文本→目标ja : "${r6.text}" (${r6.from} → ${r6.to})`);
    assert(r6.to === 'ja', '中译日不应换向，实际目标 ' + r6.to);

    // 7. 中英混合文档文本 + 目标中文 → 不得中译中（悬浮文档翻译的真实场景）
    const mixed = 'getUserInfo(): UserInfo 获取用户信息 Parameters userId: string';
    const r7 = await translateQuery(mixed, 'auto', 'zh-CN');
    console.log(`7. 混合文本→目标zh: "${r7.text}" (${r7.from} → ${r7.to})`);
    assert(r7.to !== 'zh-CN' || !looksZh(mixed, r7.text), '混合文本出现中译中: ' + r7.text);

    // 8. 混合文本（中文为主）+ 目标中文 → 同样不得中译中
    const mixed2 = '此方法用于获取用户信息 userInfo 参数 userId';
    const r8 = await translateQuery(mixed2, 'auto', 'zh-CN');
    console.log(`8. 中文为主混合  : "${r8.text}" (${r8.from} → ${r8.to})`);
    assert(!/[\u4e00-\u9fff]{4,}/.test(r8.text) || r8.to !== 'zh-CN', '中文为主混合文本中译中: ' + r8.text);

    // 9. 含假名的日文 → 中文：汉字大量保留属正常日译中，不得触发换向
    const r9 = await translateQuery('東京都は日本の首都です', 'auto', 'zh-CN');
    console.log(`9. 日文→目标zh   : "${r9.text}" (${r9.from} → ${r9.to})`);
    assert(r9.to === 'zh-CN' && /[\u4e00-\u9fff]/.test(r9.text), '日译中被误换向: ' + r9.text);

    function looksZh(src, dst) {
        if (/[\u3040-\u30ff]/.test(src)) return false;
        const h = s => (s.match(/[\u4e00-\u9fff]/g) || []).length;
        return h(dst) > 0 && h(dst) >= h(src) * 0.7;
    }

    console.log('SMOKE OK: 自动换向全部通过');
}

main().catch(e => {
    console.error('SMOKE FAILED:', e.message);
    process.exit(1);
});
