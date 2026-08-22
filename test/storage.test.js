const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { install, setConfig } = require('./helpers/stub.js');
install();
// storage 是单例，通过 fresh require + 缓存清理实现隔离
function freshStorage() {
    delete require.cache[require.resolve('../out/storage.js')];
    delete require.cache[require.resolve('../out/config.js')];
    return require('../out/storage.js');
}

function tmpContext() {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'translation-test-'));
    return { globalStorageUri: { fsPath: dir }, dir };
}

test('Storage：单词本增删查与去重覆盖', () => {
    const { storage } = freshStorage();
    const ctx = tmpContext();
    storage.init(ctx);
    storage.addWord({ text: 'hello', translation: '你好', from: 'en', to: 'zh-CN' });
    storage.addWord({ text: 'world', translation: '世界', from: 'en', to: 'zh-CN' });
    assert.strictEqual(storage.hasWord('hello', 'zh-CN'), true);
    assert.strictEqual(storage.hasWord('hello', 'en'), false); // 不同目标语言不冲突
    // 重新收藏同一词：覆盖而非重复
    storage.addWord({ text: 'hello', translation: '你好（更新）', from: 'en', to: 'zh-CN' });
    assert.strictEqual(storage.listWords().filter(w => w.text === 'hello').length, 1);
    // 移除
    storage.removeWordByText('hello', 'zh-CN');
    assert.strictEqual(storage.hasWord('hello', 'zh-CN'), false);
    // 列表按收藏时间倒序
    const words = storage.listWords();
    assert.strictEqual(words[0].text, 'world');
});

test('Storage：翻译历史去重置顶与上限裁剪', () => {
    const { storage } = freshStorage();
    setConfig({ 'translation.history.enabled': true, 'translation.history.limit': 3 });
    try {
        const ctx = tmpContext();
        storage.init(ctx);
        storage.pushHistory({ query: 'a', translation: '1', from: 'en', to: 'zh-CN', engineName: 't' });
        storage.pushHistory({ query: 'b', translation: '2', from: 'en', to: 'zh-CN', engineName: 't' });
        storage.pushHistory({ query: 'c', translation: '3', from: 'en', to: 'zh-CN', engineName: 't' });
        // 重复查询去重并移到最前
        storage.pushHistory({ query: 'a', translation: '1', from: 'en', to: 'zh-CN', engineName: 't' });
        let history = storage.listHistory();
        assert.strictEqual(history.length, 3);
        assert.strictEqual(history[0].query, 'a');
        assert.strictEqual(history[1].query, 'c');
        // 超上限裁剪
        storage.pushHistory({ query: 'd', translation: '4', from: 'en', to: 'zh-CN', engineName: 't' });
        history = storage.listHistory();
        assert.strictEqual(history.length, 3);
        assert.strictEqual(history[0].query, 'd');
        // 删除与清空
        storage.removeHistory(history[0].id);
        assert.strictEqual(storage.listHistory().length, 2);
        storage.clearHistory();
        assert.strictEqual(storage.listHistory().length, 0);
    } finally {
        setConfig({ 'translation.history.enabled': true, 'translation.history.limit': 200 });
    }
});

test('Storage：history.enabled=false 时不记录', () => {
    const { storage } = freshStorage();
    setConfig({ 'translation.history.enabled': false });
    try {
        storage.init(tmpContext());
        storage.pushHistory({ query: 'a', translation: '1', from: 'en', to: 'zh-CN', engineName: 't' });
        assert.strictEqual(storage.listHistory().length, 0);
    } finally {
        setConfig({ 'translation.history.enabled': true });
    }
});

test('Storage：flush 持久化并可重新加载', async () => {
    const { storage } = freshStorage();
    const ctx = tmpContext();
    storage.init(ctx);
    storage.addWord({ text: 'persist', translation: '持久', from: 'en', to: 'zh-CN' });
    storage.flush();
    // 模拟重启：重新加载同一目录
    const { storage: storage2 } = freshStorage();
    storage2.init({ globalStorageUri: { fsPath: ctx.dir } });
    assert.strictEqual(storage2.hasWord('persist', 'zh-CN'), true);
    fs.rmSync(ctx.dir, { recursive: true, force: true });
});

test('Storage：损坏文件容错（回退空数据）', () => {
    const { storage } = freshStorage();
    const ctx = tmpContext();
    fs.mkdirSync(ctx.dir, { recursive: true });
    fs.writeFileSync(path.join(ctx.dir, 'storage.json'), '{broken json!!', 'utf8');
    storage.init(ctx);
    assert.strictEqual(storage.listWords().length, 0);
    assert.strictEqual(storage.listHistory().length, 0);
    fs.rmSync(ctx.dir, { recursive: true, force: true });
});
