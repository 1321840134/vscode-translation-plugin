// 真实扩展宿主集成测试（@vscode/test-electron）：
// 在本机 Microsoft VS Code 安装中启动扩展宿主，加载本项目扩展并执行
// 真实网络翻译链路——覆盖 stub 环境无法复现的宿主层差异（如 http.proxySupport
// 对 http/https 模块的代理注入）。
const { runTests } = require('@vscode/test-electron');

async function main() {
    try {
        await runTests({
            vscodeExecutablePath: 'C:\\SoftwareInstall\\Microsoft VS Code\\Code.exe',
            extensionDevelopmentPath: __dirname + '/..',
            extensionTestsPath: __dirname + '/../test/suite/index.js',
            launchArgs: ['--disable-extensions', '--user-data-dir', require('node:os').tmpdir() + '\\vsc-tr-test']
        });
    } catch (e) {
        console.error('HOST TEST FAILED:', e && e.message ? e.message : e);
        process.exit(1);
    }
}
main();
