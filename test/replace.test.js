const test = require('node:test');
const assert = require('node:assert');
const { install, setConfig, vscodeStub } = require('./helpers/stub.js');
install();

// ---- 可编程的编辑器 stub ----
function makeEditor(lines, selections) {
    const edits = [];
    const editor = {
        document: {
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
        selections,
        selection: selections[0],
        edit: async build => {
            if (editor.editResult === false) {
                return false; // 不可编辑：不应用任何编辑（与真实 API 语义一致）
            }
            build({ replace: (range, text) => edits.push({ range, text }) });
            return true;
        },
        edits
    };
    return editor;
}

function sel(anchorLine, anchorChar, activeLine, activeChar) {
    const start = { line: Math.min(anchorLine, activeLine), character: anchorLine === activeLine ? Math.min(anchorChar, activeChar) : (anchorLine < activeLine ? anchorChar : activeChar) };
    const end = { line: Math.max(anchorLine, activeLine), character: anchorLine === activeLine ? Math.max(anchorChar, activeChar) : (anchorLine < activeLine ? activeChar : anchorChar) };
    return { anchor: { line: anchorLine, character: anchorChar }, active: { line: activeLine, character: activeChar }, start, end };
}

// ---- stub 增强：记录命令处理器 / withProgress 直通 / selection 事件 ----
const handlers = {};
vscodeStub.commands.registerCommand = (id, cb) => {
    handlers[id] = cb;
    return { dispose: () => undefined };
};
vscodeStub.window.withProgress = (_opts, task) => task({ report: () => undefined });
vscodeStub.window.onDidChangeTextEditorSelection = () => ({ dispose: () => undefined });
let statusMessages = [];
vscodeStub.window.setStatusBarMessage = msg => statusMessages.push(msg);
let errorMessages = [];
vscodeStub.window.showErrorMessage = (msg) => { errorMessages.push(msg); return Promise.resolve(undefined); };
let warningMessages = [];
vscodeStub.window.showWarningMessage = (msg) => { warningMessages.push(msg); return Promise.resolve(undefined); };

// ---- mock 翻译门面 ----
const services = require('../out/services/index.js');
let translateCalls = [];
let translateBehavior = async text => ({ query: text, from: 'en', to: 'zh-CN', text: `译(${text})`, engineId: 't', engineName: '测试' });
services.translateQuery = async (text, from, to) => {
    translateCalls.push(text);
    return translateBehavior(text, from, to);
};

// 面板与命令执行的 stub（右键翻译分流测试需要）
vscodeStub.window.createWebviewPanel = () => ({
    reveal: () => undefined,
    webview: {
        html: '',
        cspSource: 'http://localhost',
        postMessage: () => Promise.resolve(),
        onDidReceiveMessage: () => ({ dispose: () => undefined })
    },
    onDidDispose: () => ({ dispose: () => undefined })
});
let executedCommands = [];
vscodeStub.commands.executeCommand = async (cmd, ...args) => {
    executedCommands.push(cmd);
    return [];
};

// 激活扩展（注册命令）
const { storage } = require('../out/storage.js');
const storageDir = require('node:fs').mkdtempSync(require('node:path').join(require('node:os').tmpdir(), 'rep-'));
storage.init({ globalStorageUri: { fsPath: storageDir } });
require('../out/extension.js').activate({
    subscriptions: [],
    globalState: { get: () => true, update: async () => undefined },
    globalStorageUri: { fsPath: storageDir }
});

const replaceCmd = () => handlers['translation.translateAndReplace']();

function reset() {
    errorMessages = [];
    warningMessages = [];
    statusMessages = [];
    translateCalls = [];
    executedCommands = [];
    translateBehavior = async text => ({ query: text, from: 'en', to: 'zh-CN', text: `译(${text})`, engineId: 't', engineName: '测试' });
}

test('替换：单选区正常替换', async () => {
    reset();
    // const s = "hello world";  → "hello world" 位于 [11, 22)
    vscodeStub.window.activeTextEditor = makeEditor(['const s = "hello world";'], [sel(0, 11, 0, 22)]);
    await replaceCmd();
    const editor = vscodeStub.window.activeTextEditor;
    assert.strictEqual(editor.edits.length, 1);
    assert.strictEqual(editor.edits[0].text, '译(hello world)');
    assert.deepStrictEqual(
        { s: editor.edits[0].range.start.character, e: editor.edits[0].range.end.character },
        { s: 11, e: 22 },
        '替换范围应为原选区'
    );
});

test('替换：多选区各自替换且范围不串位', async () => {
    reset();
    // const a = "aa"; const b = "bb";  → "aa"=[11,13)  "bb"=[27,29)
    vscodeStub.window.activeTextEditor = makeEditor(['const a = "aa"; const b = "bb";'], [sel(0, 11, 0, 13), sel(0, 27, 0, 29)]);
    await replaceCmd();
    const editor = vscodeStub.window.activeTextEditor;
    assert.strictEqual(editor.edits.length, 2);
    assert.deepStrictEqual(
        editor.edits.map(x => [x.range.start.character, x.range.end.character, x.text]),
        [[11, 13, '译(aa)'], [27, 29, '译(bb)']]
    );
});

test('替换：无选区时取词替换（含驼峰拆分后的原位替换）', async () => {
    reset();
    vscodeStub.window.activeTextEditor = makeEditor(['getUserInfo();'], [sel(0, 6, 0, 6)]);
    await replaceCmd();
    const editor = vscodeStub.window.activeTextEditor;
    assert.strictEqual(editor.edits.length, 1);
    assert.deepStrictEqual(
        { s: editor.edits[0].range.start.character, e: editor.edits[0].range.end.character },
        { s: 0, e: 11 },
        '应替换整个标识符'
    );
    assert.strictEqual(editor.edits[0].text, '译(get user info)');
});

test('替换：翻译失败时跳过该选区并提示，不影响其他选区', async () => {
    reset();
    const line = 'const a = "bad"; const b = "ok";';
    const badSel = sel(0, line.indexOf('"bad"') + 1, 0, line.indexOf('"bad"') + 4);
    const okSel = sel(0, line.indexOf('"ok"') + 1, 0, line.indexOf('"ok"') + 3);
    translateBehavior = async text => {
        if (text.includes('bad')) {
            throw new Error('引擎临时错误');
        }
        return { query: text, from: 'en', to: 'zh-CN', text: `译(${text})`, engineId: 't', engineName: '测试' };
    };
    vscodeStub.window.activeTextEditor = makeEditor([line], [badSel, okSel]);
    await replaceCmd();
    const editor = vscodeStub.window.activeTextEditor;
    assert.strictEqual(editor.edits.length, 1, '失败的选区不应替换');
    assert.strictEqual(editor.edits[0].text, '译(ok)');
    assert.ok(errorMessages.some(m => m.includes('引擎临时错误')));
});

test('替换：空选区且关闭自动取词时提示', async () => {
    reset();
    setConfig({ 'translation.autoSelectWord': false });
    try {
        vscodeStub.window.activeTextEditor = makeEditor(['plain text'], [sel(0, 3, 0, 3)]);
        await replaceCmd();
        assert.ok(warningMessages.some(m => m.includes('请先选中')));
        assert.strictEqual(vscodeStub.window.activeTextEditor.edits.length, 0);
    } finally {
        setConfig({ 'translation.autoSelectWord': true });
    }
});

test('替换：edit 不可用时友好报错而非崩溃（加固验证）', async () => {
    reset();
    const editor = makeEditor(['const s = "hello";'], [sel(0, 11, 0, 16)]);
    editor.editResult = false; // 只读/不可编辑文档
    vscodeStub.window.activeTextEditor = editor;
    await replaceCmd();
    assert.ok(
        warningMessages.some(m => m.includes('不可编辑')) || errorMessages.some(m => m.includes('不可编辑')),
        '应给出"不可编辑"提示'
    );
    assert.strictEqual(editor.edits.length, 0);
});

test('替换：多行选区按整段翻译替换', async () => {
    reset();
    vscodeStub.window.activeTextEditor = makeEditor(['line one', 'line two'], [sel(0, 0, 1, 8)]);
    await replaceCmd();
    const editor = vscodeStub.window.activeTextEditor;
    assert.strictEqual(editor.edits.length, 1);
    assert.deepStrictEqual(
        { sl: editor.edits[0].range.start.line, el: editor.edits[0].range.end.line },
        { sl: 0, el: 1 }
    );
    assert.strictEqual(editor.edits[0].text, '译(line one\nline two)');
});

test('右键翻译：光标处单词 → 选中并弹出词典悬浮（不进面板）', async () => {
    reset();
    const editor = makeEditor(['getUserInfo();'], [sel(0, 6, 0, 6)]);
    vscodeStub.window.activeTextEditor = editor;
    await handlers['translation.translate']();
    assert.ok(executedCommands.includes('editor.action.showHover'), '应触发词典悬浮');
    assert.deepStrictEqual(
        { s: editor.selection.start.character, e: editor.selection.end.character },
        { s: 0, e: 11 },
        '应选中整个标识符'
    );
    assert.strictEqual(editor.edits.length, 0, '不产生编辑');
    assert.strictEqual(translateCalls.length, 0, '词典由悬浮提供器按需翻译，命令本身不请求');
});

test('右键翻译：选中的单个单词 → 词典悬浮', async () => {
    reset();
    const line = 'const greeting = "hello";';
    const editor = makeEditor([line], [sel(0, line.indexOf('"hello"') + 1, 0, line.indexOf('"hello"') + 6)]);
    vscodeStub.window.activeTextEditor = editor;
    await handlers['translation.translate']();
    assert.ok(executedCommands.includes('editor.action.showHover'));
    assert.strictEqual(translateCalls.length, 0);
});

test('右键翻译：选区为句子 → 面板翻译', async () => {
    reset();
    const editor = makeEditor(['hello world and more'], [sel(0, 0, 0, 16)]);
    vscodeStub.window.activeTextEditor = editor;
    await handlers['translation.translate']();
    assert.ok(!executedCommands.includes('editor.action.showHover'), '句子不应触发词典悬浮');
    assert.deepStrictEqual(translateCalls, ['hello world and'], '应翻译整句进面板');
});
