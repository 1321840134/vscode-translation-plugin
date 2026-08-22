// 供冒烟脚本使用的 vscode 模块桩：只实现 config.ts 用到的最小接口
const DEFAULTS = {
    engine: 'microsoft',
    sourceLanguage: 'auto',
    targetLanguage: 'zh-CN',
    autoSelectWord: true,
    autoSwapTarget: true,
    'history.enabled': true,
    'history.limit': 200,
    'tts.enabled': true,
    'tts.autoPlay': false,
    'replace.style': 'original',
    'replace.separator': ' ',
    'panel.position': 'beside',
    'google.host': 'translate.googleapis.com',
    'deepl.authKey': '',
    'microsoft.subscriptionKey': '',
    'microsoft.region': '',
    'openai.apiKey': '',
    'openai.model': 'gpt-4o-mini',
    'openai.apiBase': 'https://api.openai.com/v1',
    'youdao.appKey': '',
    'youdao.appSecret': '',
    'baidu.appId': '',
    'baidu.appSecret': ''
};

class FakeConfiguration {
    get(key) {
        return DEFAULTS[key];
    }
    update() {
        return Promise.resolve();
    }
}

module.exports = {
    workspace: {
        getConfiguration() {
            return new FakeConfiguration();
        }
    },
    window: {},
    commands: {},
    Uri: { file: f => ({ fsPath: f }) },
    ViewColumn: { Active: 1, Beside: 2, One: 1, Two: 2 },
    StatusBarAlignment: { Left: 1, Right: 2 },
    ConfigurationTarget: { Global: 1 },
    ProgressLocation: { Window: 10, Notification: 15 }
};
