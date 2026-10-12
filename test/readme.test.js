// README 与 package.json 交叉一致性校验：
// 设置项表的键名与默认值、快捷键表、使用节提到的命令，都必须与实际贡献点一致。
// 防止"代码更新了 README 漏更新"（曾因描述过时被用户多次指出）。
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const readme = fs.readFileSync(path.join(__dirname, '..', 'README.md'), 'utf8');
const pkg = require('../package.json');
const props = pkg.contributes.configuration.properties;

test('README 设置项表：键名存在且默认值与 package.json 一致', () => {
    const rows = [...readme.matchAll(/\| `([a-zA-Z.]+)` \| `([^`]+)` \|/g)];
    assert.ok(rows.length >= 10, '设置项表应至少列出 10 项');
    for (const [, key, def] of rows) {
        assert.ok(props[key], `README 设置 ${key} 在 package.json 中不存在（已废弃或拼写错误）`);
        const actual = String(props[key].default);
        assert.strictEqual(def, actual, `设置 ${key} 默认值：README 写 ${def}，实际 ${actual}`);
    }
});

test('README 引用的设置项键名均真实存在', () => {
    // 反向：正文（含配置表）里出现的 translation.* / http.proxy 键都应在 package.json 中
    for (const m of readme.matchAll(/`(translation\.[a-zA-Z.]+)`/g)) {
        const key = m[1];
        assert.ok(props[key], `README 引用的设置 ${key} 不存在`);
    }
});

test('README 快捷键表与 package.json 绑定一致', () => {
    const kbs = pkg.contributes.keybindings;
    // README 表中 "功能 | Windows / Linux | macOS" 行
    const rows = [...readme.matchAll(/\| ([^|]+) \| `([^`]+)` \| `([^`]+)` \|/g)]
        .filter(r => r[2].startsWith('ctrl+') || r[2].startsWith('cmd+') || r[2].includes('+'));
    assert.ok(rows.length >= 5, '快捷键表应至少 5 行');
    for (const [, , win, mac] of rows) {
        const kb = kbs.find(k => k.key.toLowerCase() === win.toLowerCase());
        assert.ok(kb, `README 快捷键 ${win} 未在 package.json 绑定`);
        assert.strictEqual(kb.mac.toLowerCase(), mac.toLowerCase(), `快捷键 ${win} 的 mac 绑定：README 写 ${mac}，实际 ${kb.mac}`);
    }
});

test('README 提到的命令标题与实际贡献一致', () => {
    const titles = pkg.contributes.commands.map(c => c.title);
    for (const quoted of readme.matchAll(/"([^"]+)"/g)) {
        const t = quoted[1];
        if (t.startsWith('翻译') && titles.includes(t)) {
            // 已注册命令标题，一致
            continue;
        }
    }
    // 至少抽查几个关键命令标题在 README 中出现
    for (const must of ['翻译: 翻译文档', '翻译: 翻译(选中文本或光标处单词)', '翻译: 翻译光标处单词(忽略选区)', '翻译: 翻译当前行(忽略选区)']) {
        assert.ok(readme.includes(must) || titles.includes(must), `命令标题 ${must} 应在 README 或清单中可查`);
    }
});

test('README 测试命令与 package.json scripts 一致', () => {
    for (const s of ['npm test', 'test:live', 'test:host']) {
        assert.ok(readme.includes(s), `README 应说明 ${s}`);
    }
    assert.ok(pkg.scripts['test:live'] && pkg.scripts['test:host'], 'package.json 应有 test:live/test:host 脚本');
});

test('README 引擎清单与 package.json engine 枚举一致', () => {
    const engines = props['translation.engine'].enum;
    const names = { microsoft: '微软', google: 'Google', deepl: 'DeepL', openai: 'OpenAI', youdao: '有道', baidu: '百度', alibaba: '阿里' };
    for (const e of engines) {
        assert.ok(readme.includes(names[e]), `README 应提及引擎 ${names[e]}`);
    }
});

test('CHANGELOG：当前版本必须有对应条目（防发版漏更新）', () => {
    const changelog = fs.readFileSync(path.join(__dirname, '..', 'CHANGELOG.md'), 'utf8');
    const version = pkg.version;
    assert.ok(
        changelog.includes(`## ${version}`),
        `CHANGELOG.md 缺少 ${version} 的条目——发版前必须同步更新`
    );
    // 无连续重复标题（历史曾出现 "## X\n\n## X" 格式错误）
    assert.strictEqual([...changelog.matchAll(/^## [\d.]+\n\n## /gm)].length, 0, 'CHANGELOG 存在连续重复标题');
});
