// 冒烟测试：微软翻译引擎（Edge 公开端点，无需密钥）
// 通过 vscode 桩加载编译后的真实引擎代码，执行真实翻译并断言结果
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

function assert(cond, msg) {
    if (!cond) {
        throw new Error(msg);
    }
}

async function main() {
    console.log('引擎:', microsoftEngine.name);

    const t0 = Date.now();
    const en2zh = await microsoftEngine.translate('hello world', 'auto', 'zh-CN');
    console.log(`en→zh: "${en2zh.text}" (检测语言=${en2zh.from}, 耗时 ${Date.now() - t0}ms)`);
    assert(en2zh.text.includes('你好') || en2zh.text.includes('世界'), '英译汉结果不符合预期: ' + en2zh.text);
    assert(en2zh.from === 'en', '语言检测应为 en，实际 ' + en2zh.from);

    const zh2en = await microsoftEngine.translate('你好，世界', 'auto', 'en');
    console.log(`zh→en: "${zh2en.text}" (检测语言=${zh2en.from})`);
    assert(/hello|hi|world/i.test(zh2en.text), '汉译英结果不符合预期: ' + zh2en.text);
    assert(zh2en.from === 'zh-CN', '语言检测应为 zh-CN，实际 ' + zh2en.from);

    const long = await microsoftEngine.translate(
        'The quick brown fox jumps over the lazy dog. '.repeat(5),
        'en',
        'zh-CN'
    );
    console.log(`长文本: "${long.text.slice(0, 40)}..."`);
    assert(long.text.length > 20, '长文本翻译结果为空');

    // 第二轮重复请求（新端点无需令牌，验证连接复用下的常规耗时）
    const t1 = Date.now();
    await microsoftEngine.translate('goodbye', 'auto', 'zh-CN');
    const cached = Date.now() - t1;
    console.log(`重复请求: 第二次翻译耗时 ${cached}ms`);
    console.log('SMOKE OK: 微软翻译(Edge 端点)真实翻译通过');
}

main().catch(e => {
    console.error('SMOKE FAILED:', e.message);
    process.exit(1);
});
