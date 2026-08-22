const test = require('node:test');
const assert = require('node:assert');
const { install, setConfig, vscodeStub } = require('./helpers/stub.js');
install();

// ---- 模拟 VSCode 的 hover 分派语义 ----
// executeHoverProvider 会调用所有已注册的 hover provider（包括我们自己），
// 且通过异步分派（切断同步栈与任何异步上下文）——若递归防护失效，此处会无限递归。
const registeredProviders = [];
let hoverDispatchCount = 0;
vscodeStub.languages.registerHoverProvider = (selector, provider) => {
    registeredProviders.push(provider);
    return { dispose: () => undefined };
};
vscodeStub.commands.executeCommand = async (cmd, uri, position) => {
    if (cmd !== 'vscode.executeHoverProvider') {
        return [];
    }
    hoverDispatchCount++;
    if (hoverDispatchCount > 5) {
        throw new Error(`疑似无限递归：executeHoverProvider 已分发 ${hoverDispatchCount} 次`);
    }
    // 异步分派（setTimeout 切断一切上下文传播，模拟最坏情况）
    await new Promise(r => setTimeout(r, 0));
    const results = await Promise.all(
        registeredProviders.map(p => p.provideHover(fakeDoc(), position, { isCancellationRequested: false }))
    );
    return results.filter(Boolean);
};

// 内置"文档" provider：模拟编辑器自带的悬浮内容（如签名/注释）
let builtinHoverText = 'UserInfo 用户信息类 Returns the user profile';
registeredProviders.push({
    async provideHover() {
        const md = new vscodeStub.MarkdownString();
        md.appendMarkdown('```ts\nUserInfo\n```\n\n');
        md.appendMarkdown(builtinHoverText);
        return new vscodeStub.Hover([md]);
    }
});

// ---- mock 翻译门面（悬浮测试不依赖网络） ----
const services = require('../out/services/index.js');
let translateCalls = [];
services.translateQuery = async (text, from, to) => {
    translateCalls.push({ text, from, to });
    return {
        query: text,
        from: 'zh-CN',
        to: 'en',
        text: `TRANSLATED(${text})`,
        engineId: 'microsoft',
        engineName: '微软翻译'
    };
};

const { TranslationHoverProvider } = require('../out/hover.js');

function fakeDoc() {
    return {
        uri: 'file:///c:/demo.ts',
        lineAt: () => ({ text: 'const userInfo = getUserInfo(); // 用户信息' })
    };
}
function pos(character) {
    return { line: 0, character };
}
function token(cancelled = false) {
    return { isCancellationRequested: cancelled, onCancellationRequested: () => ({ dispose: () => undefined }) };
}

function reset() {
    hoverDispatchCount = 0;
    translateCalls = [];
}

test('hover：单词翻译 + 文档翻译，且不无限递归', async () => {
    reset();
    const provider = new TranslationHoverProvider();
    const t = test.context;
    const hover = await Promise.race([
        provider.provideHover(fakeDoc(), pos(22), token()),
        new Promise((_, rej) => setTimeout(() => rej(new Error('悬浮 Promise 未在 3 秒内完成（疑似无限递归/挂起）')), 3000))
    ]);
    assert.ok(hover, '应返回 Hover');
    const value = hover.contents.value;
    assert.ok(value.includes('user info'), '应包含单词翻译');
    assert.ok(value.includes('TRANSLATED('), '应包含词典结果');
    assert.ok(value.includes('文档翻译'), '应包含文档翻译段落');
    assert.ok(value.includes('TRANSLATED(UserInfo'), '文档内容应被翻译');
    assert.strictEqual(hoverDispatchCount, 1, 'executeHoverProvider 只应分发一次');
    assert.ok(hover.contents.value.includes('英语'), '方向标注应使用换向后的目标语言');
});

test('hover：中文查询词触发换向目标显示（回归 0.2.4）', async () => {
    reset();
    const provider = new TranslationHoverProvider();
    const doc = { uri: 'file:///c:/demo.ts', lineAt: () => ({ text: '// 获取用户信息' }) };
    const hover = await provider.provideHover(doc, pos(4), token());
    assert.ok(hover.contents.value.includes('英语'), '标注应显示 英语（en）');
    assert.ok(!hover.contents.value.includes('→ 中文（简体）*'), '不应显示 中文简体→中文简体');
});

test('hover：过滤本插件自身产生的内容', async () => {
    reset();
    const self = new vscodeStub.MarkdownString();
    self.appendMarkdown('$(translations) **user info**\n\nTRANSLATED(user info)');
    registeredProviders.push({
        async provideHover() {
            return new vscodeStub.Hover([self]);
        }
    });
    try {
        const provider = new TranslationHoverProvider();
        const hover = await provider.provideHover(fakeDoc(), pos(22), token());
        // 自身内容不进入文档翻译（否则会把译文再翻译一遍）
        const docPart = hover.contents.value.split('文档翻译')[1] ?? '';
        assert.ok(!docPart.includes('TRANSLATED(TRANSLATED'), '不应二次翻译自身输出');
    } finally {
        registeredProviders.pop();
    }
});

test('hover：取消后不返回内容', async () => {
    reset();
    const provider = new TranslationHoverProvider();
    const hover = await provider.provideHover(fakeDoc(), pos(22), token(true));
    assert.strictEqual(hover, undefined);
});

test('hover：禁用后直接返回且不发起翻译', async () => {
    reset();
    setConfig({ 'translation.hover.enabled': false });
    try {
        const provider = new TranslationHoverProvider();
        const hover = await provider.provideHover(fakeDoc(), pos(22), token());
        assert.strictEqual(hover, undefined);
        assert.strictEqual(translateCalls.length, 0);
    } finally {
        setConfig({ 'translation.hover.enabled': true });
    }
});

test('hover：非单词位置返回 undefined', async () => {
    reset();
    const provider = new TranslationHoverProvider();
    const doc = { uri: 'x', lineAt: () => ({ text: '   ===   ' }) };
    assert.strictEqual(await provider.provideHover(doc, pos(4), token()), undefined);
    assert.strictEqual(translateCalls.length, 0);
});
