// 测试共享：注入可动态配置的 vscode 模块桩
const Module = require('module');
const path = require('path');
const origResolve = Module._resolveFilename;

const DEFAULTS = {
    'translation.engine': 'microsoft',
    'translation.sourceLanguage': 'auto',
    'translation.targetLanguage': 'zh-CN',
    'translation.autoSelectWord': true,
    'translation.autoSwapTarget': true,
    'translation.autoTranslateSelection': false,
    'translation.hover.enabled': true,
    'translation.hover.translateDocumentation': true,
    'translation.history.enabled': true,
    'translation.history.limit': 200,
    'translation.tts.enabled': true,
    'translation.tts.autoPlay': false,
    'translation.tts.service': 'auto',
    'translation.replace.style': 'original',
    'translation.replace.separator': ' ',
    'translation.panel.position': 'beside',
    'translation.google.host': 'translate.googleapis.com',
    'translation.deepl.authKey': '',
    'translation.microsoft.subscriptionKey': '',
    'translation.microsoft.region': '',
    'translation.openai.apiKey': '',
    'translation.openai.model': 'gpt-4o-mini',
    'translation.openai.apiBase': 'https://api.openai.com/v1',
    'translation.youdao.appKey': '',
    'translation.youdao.appSecret': '',
    'translation.baidu.appId': '',
    'translation.baidu.appSecret': '',
    'http.proxy': ''
};

class FakeConfiguration {
    constructor(prefix) {
        this.prefix = prefix;
    }
    get(key) {
        return DEFAULTS[`${this.prefix}.${key}`];
    }
    update() {
        return Promise.resolve();
    }
}

class FakeRange {
    constructor(a, b, c, d) {
        this.startLine = a;
        this.startChar = b;
        this.endLine = c;
        this.endChar = d;
    }
}

const vscodeStub = {
    workspace: {
        getConfiguration(name) {
            return new FakeConfiguration(name);
        },
        onDidChangeConfiguration: () => ({ dispose: () => undefined })
    },
    window: {
        createWebviewPanel: () => {
            throw new Error('window API 不应在单元测试中使用');
        },
        createStatusBarItem: () => ({ text: '', tooltip: '', show: () => undefined, dispose: () => undefined }),
        showErrorMessage: () => undefined,
        showInformationMessage: () => undefined
    },
    commands: {
        registerCommand: () => ({ dispose: () => undefined }),
        executeCommand: async () => []
    },
    languages: {
        registerHoverProvider: () => ({ dispose: () => undefined })
    },
    Uri: {
        file: f => ({ fsPath: f }),
        parse: u => ({ toString: () => u })
    },
    ViewColumn: { Active: 1, Beside: 2, One: 1, Two: 2 },
    StatusBarAlignment: { Left: 1, Right: 2 },
    ConfigurationTarget: { Global: 1 },
    ProgressLocation: { Window: 10, Notification: 15 },
    MarkdownString: class {
        constructor() {
            this.value = '';
        }
        appendMarkdown(s) {
            this.value += s;
            return this;
        }
        appendText(s) {
            this.value += s;
            return this;
        }
    },
    Hover: class {
        constructor(contents) {
            this.contents = contents;
        }
    },
    Position: class {
        constructor(line, character) {
            this.line = line;
            this.character = character;
        }
    },
    Range: FakeRange,
    CancellationTokenSource: class {
        constructor() {
            this.token = { isCancellationRequested: false, onCancellationRequested: () => ({ dispose: () => undefined }) };
        }
        dispose() { }
    }
};

let installed = false;
function install() {
    if (installed) {
        return;
    }
    installed = true;
    Module._resolveFilename = function (request, ...args) {
        if (request === 'vscode') {
            return path.join(__dirname, 'vscode-stub-entry.js');
        }
        return origResolve.call(this, request, ...args);
    };
}

/** 临时覆盖配置项（测试后自动还原） */
function setConfig(overrides) {
    Object.assign(DEFAULTS, overrides);
}

module.exports = { install, setConfig, DEFAULTS, vscodeStub };
