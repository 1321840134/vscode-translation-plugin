// 0.7.0 对齐测试：强制取词 / 整行翻译 / 剪贴板翻译 / TTS 引擎切换 / 文档注释原文切换
const test = require('node:test');
const assert = require('node:assert');
const { install, DEFAULTS, vscodeStub } = require('./helpers/stub.js');
install();

// ---- 编辑器 stub（与 replace.test.js 同构） ----
function makeEditor(lines, selection) {
    return {
        document: {
            uri: { toString: () => 'file:///t.js' },
            lineAt: l => ({ text: lines[l] ?? '' }),
            getText: sel => {
                const s = sel.start, e = sel.end;
                if (s.line === e.line) {
                    return (lines[s.line] ?? '').slice(s.character, e.character);
                }
                let out = (lines[s.line] ?? '').slice(s.character) + '\n';
                for (let l = s.line + 1; l < e.line; l++) {
                    out += (lines[l] ?? '') + '\n';
                }
                return out + (lines[e.line] ?? '').slice(0, e.character);
            }
        },
        selection,
        selections: [selection]
    };
}

function sel(anchorLine, anchorChar, activeLine, activeChar) {
    const start = { line: Math.min(anchorLine, activeLine), character: anchorLine === activeLine ? Math.min(anchorChar, activeChar) : (anchorLine < activeLine ? anchorChar : activeChar) };
    const end = { line: Math.max(anchorLine, activeLine), character: anchorLine === activeLine ? Math.max(anchorChar, activeChar) : (anchorLine < activeLine ? anchorChar : activeChar) };
    const s = { anchor: { line: anchorLine, character: anchorChar }, active: { line: activeLine, character: activeChar }, start, end, isEmpty: anchorLine === activeLine && anchorChar === activeChar };
    s.isEqual = other =>
        !!other && other.start.line === start.line && other.start.character === start.character &&
        other.end.line === end.line && other.end.character === end.character;
    return s;
}

// ---- stub 增强 ----
const handlers = {};
vscodeStub.commands.registerCommand = (id, cb) => {
    handlers[id] = cb;
    return { dispose: () => undefined };
};
vscodeStub.window.withProgress = (_opts, task) => task({ report: () => undefined });
let warnings = [];
vscodeStub.window.showWarningMessage = msg => { warnings.push(msg); return Promise.resolve(undefined); };
vscodeStub.window.showErrorMessage = msg => { warnings.push(msg); return Promise.resolve(undefined); };
vscodeStub.window.showInformationMessage = () => Promise.resolve(undefined);
let panelMessages = [];
vscodeStub.window.createWebviewPanel = () => ({
    reveal: () => undefined,
    webview: {
        html: '',
        cspSource: 'http://localhost',
        postMessage: m => { panelMessages.push(m); return Promise.resolve(); },
        onDidReceiveMessage: () => ({ dispose: () => undefined })
    },
    onDidDispose: () => ({ dispose: () => undefined })
});
vscodeStub.commands.executeCommand = async () => [];
let quickPickItems = null;
let quickPickResolver = null;
vscodeStub.window.showQuickPick = async items => {
    quickPickItems = items;
    return quickPickResolver ? quickPickResolver(items) : items[0];
};
// 配置 update 写回（switchEngine 切换后可断言）
vscodeStub.workspace.getConfiguration = name => ({
    get: key => DEFAULTS[`${name}.${key}`],
    update: (key, value) => { DEFAULTS[`${name}.${key}`] = value; return Promise.resolve(); }
});
let clipboardText = '';
vscodeStub.env.clipboard.readText = async () => clipboardText;

// ---- mock 翻译门面 ----
const services = require('../out/services/index.js');
let translateCalls = [];
services.translateQuery = async (text, from, to) => {
    translateCalls.push({ text, from, to });
    return { query: text, from: 'en', to: 'zh-CN', text: `译(${text})`, engineId: 't', engineName: '测试' };
};

// ---- 激活扩展 ----
const { storage } = require('../out/storage.js');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const storageDir = fs.mkdtempSync(path.join(os.tmpdir(), 'al70-'));
storage.init({ globalStorageUri: { fsPath: storageDir } });
require('../out/extension.js').activate({
    subscriptions: [],
    globalState: { get: () => true, update: async () => undefined },
    globalStorageUri: { fsPath: storageDir }
});

function reset() {
    warnings = [];
    translateCalls = [];
    panelMessages = [];
    clipboardText = '';
    quickPickItems = null;
    quickPickResolver = null;
    DEFAULTS['translation.tts.service'] = 'auto';
    DEFAULTS['translation.engine'] = 'microsoft';
    DEFAULTS['translation.targetLanguage'] = 'zh-CN';
}

// ---- 命令行为 ----

test('translateWord：忽略选区，仅翻译光标处单词并选中该词', async () => {
    reset();
    // "hello world fooBar"，选区覆盖 "world fooBar"，光标(18)落在 fooBar 末尾
    vscodeStub.window.activeTextEditor = makeEditor(['hello world fooBar'], sel(0, 6, 0, 18));
    await handlers['translation.translateWord']();
    assert.deepStrictEqual(translateCalls.map(c => c.text), ['foo bar'], '应翻译光标处单词（驼峰拆分）');
    const ed = vscodeStub.window.activeTextEditor;
    assert.strictEqual(ed.selection.start.character, 12, '选区应收窄到单词起点');
    assert.strictEqual(ed.selection.end.character, 18, '选区应收窄到单词终点');
    assert.ok(panelMessages.some(m => m.type === 'results' && m.results[0].query === 'foo bar'), '面板应收到词典结果');
});

test('translateWord：光标处无可识别单词时提示', async () => {
    reset();
    vscodeStub.window.activeTextEditor = makeEditor(['   '], sel(0, 1, 0, 1));
    await handlers['translation.translateWord']();
    assert.strictEqual(translateCalls.length, 0);
    assert.ok(warnings.some(w => w.includes('单词')), '应给出警告提示');
});

test('translateLine：忽略选区，翻译光标所在整行', async () => {
    reset();
    vscodeStub.window.activeTextEditor = makeEditor(['const x = 1; // TODO fix', 'next line'], sel(0, 0, 0, 5));
    await handlers['translation.translateLine']();
    assert.deepStrictEqual(translateCalls.map(c => c.text), ['const x = 1; // TODO fix']);
    assert.strictEqual(translateCalls[0].from, 'auto', '整行翻译应自动检测源语言');
});

test('translateLine：空行时提示', async () => {
    reset();
    vscodeStub.window.activeTextEditor = makeEditor([''], sel(0, 0, 0, 0));
    await handlers['translation.translateLine']();
    assert.strictEqual(translateCalls.length, 0);
    assert.ok(warnings.some(w => w.includes('行')));
});

test('translateClipboard：单词走词典、句子走整段、空内容提示', async () => {
    reset();
    vscodeStub.window.activeTextEditor = undefined;
    clipboardText = 'serendipity';
    await handlers['translation.translateClipboard']();
    assert.deepStrictEqual(translateCalls.map(c => c.text), ['serendipity']);
    assert.strictEqual(translateCalls[0].from, 'auto');

    reset();
    clipboardText = 'hello world, copied from anywhere';
    await handlers['translation.translateClipboard']();
    assert.deepStrictEqual(translateCalls.map(c => c.text), ['hello world, copied from anywhere']);

    reset();
    clipboardText = '   ';
    await handlers['translation.translateClipboard']();
    assert.strictEqual(translateCalls.length, 0);
    assert.ok(warnings.some(w => w.includes('剪贴板')));
});

test('switchEngine：同一入口可切换语音引擎与翻译引擎', async () => {
    reset();
    vscodeStub.window.activeTextEditor = undefined;
    await handlers['translation.switchEngine']();
    assert.ok(quickPickItems, '应弹出引擎选择');
    const ttsItem = quickPickItems.find(i => i.label.includes('Edge 神经语音'));
    const trItem = quickPickItems.find(i => i.label.includes('DeepL'));
    assert.ok(ttsItem, '列表应包含语音引擎段');
    assert.ok(ttsItem.id.startsWith('tts:'), 'TTS 项 id 应带 tts: 前缀');
    assert.ok(trItem, '列表应包含翻译引擎段');

    reset();
    quickPickResolver = () => ttsItem;
    await handlers['translation.switchEngine']();
    assert.strictEqual(DEFAULTS['translation.tts.service'], 'edge', '应写回 tts.service 配置');
    assert.strictEqual(DEFAULTS['translation.engine'], 'microsoft', '翻译引擎不受影响');

    reset();
    quickPickResolver = () => trItem;
    await handlers['translation.switchEngine']();
    assert.strictEqual(DEFAULTS['translation.engine'], 'deepl', '应写回 engine 配置');
});

test('translateDocComment：面板结果携带完整原文 docSource（供原文/译文切换）', async () => {
    reset();
    vscodeStub.commands.executeCommand = async () => []; // 无 hover 文档 → 退回取词
    vscodeStub.window.activeTextEditor = makeEditor(['const userName = getUserByName(id);'], sel(0, 20, 0, 20));
    await handlers['translation.translateDocComment']();
    const msg = panelMessages.find(m => m.type === 'results');
    assert.ok(msg, '面板应收到结果');
    assert.strictEqual(msg.results[0].docSource, 'get user by name', 'docSource 应携带完整原文');
    assert.strictEqual(msg.results[0].query, 'get user by name');
});

test('toResultView：docSource 字段透传（有则带、无不带）', () => {
    const { toResultView } = require('../out/panel.js');
    const v = toResultView({ query: '预览', from: 'en', to: 'zh-CN', text: '译文', engineId: 't', engineName: '测试', docSource: '完整原文内容' });
    assert.strictEqual(v.docSource, '完整原文内容');
    const v2 = toResultView({ query: 'q', from: 'en', to: 'zh-CN', text: 't', engineId: 't', engineName: 'n' });
    assert.strictEqual(v2.docSource, undefined);
});

// ---- 贡献点与前端渲染一致性 ----

const pkg = require('../package.json');

test('package.json：新命令已贡献且快捷键/菜单引用一致', () => {
    const ids = new Set(pkg.contributes.commands.map(c => c.command));
    for (const id of ['translation.translateWord', 'translation.translateLine', 'translation.translateClipboard']) {
        assert.ok(ids.has(id), `缺少命令 ${id}`);
    }
    const groups = pkg.contributes.menus['editor/context'].map(m => Number(m.group.split('@')[1]));
    for (let i = 1; i < groups.length; i++) {
        assert.ok(groups[i] > groups[i - 1], '右键菜单分组顺序应严格递增');
    }
    const keys = pkg.contributes.keybindings.map(k => k.key);
    assert.ok(keys.includes('ctrl+alt+v'), '剪贴板翻译应绑定 Ctrl+Alt+V');
    assert.strictEqual(new Set(keys).size, keys.length, '快捷键不应重复');
    for (const kb of pkg.contributes.keybindings) {
        assert.ok(ids.has(kb.command), `快捷键命令 ${kb.command} 应在命令清单中`);
    }
    for (const m of pkg.contributes.menus['editor/context']) {
        assert.ok(ids.has(m.command), `菜单命令 ${m.command} 应在命令清单中`);
    }
});

test('webview：文档注释卡片支持原文/译文切换', () => {
    const { buildHtml } = require('../out/html.js');
    const html = buildHtml('http://localhost', 'n0');
    const src = html.match(/<script nonce="n0">([\s\S]*?)<\/script>/)[1];
    assert.ok(src.includes('r.docSource'), '渲染应读取 docSource');
    assert.ok(src.includes('查看完整原文') && src.includes('查看译文'), '应提供切换提示文案');
    // 朗读原文优先完整原文
    assert.ok(src.includes('r.docSource || r.query'), '朗读原文应优先 docSource');
});
