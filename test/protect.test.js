const test = require('node:test');
const assert = require('node:assert');
require('./helpers/stub.js').install();
const { protectInlineTokens } = require('../out/protect.js');

test('protect：占位符 {var} 保护并还原', () => {
    const p = protectInlineTokens('使用 {userId} 查询用户');
    assert.ok(p.text.includes('⟦0⟧'));
    assert.ok(!p.text.includes('{userId}'));
    assert.strictEqual(p.restore('使用 ⟦0⟧ 检索用户'), '使用 {userId} 检索用户');
});

test('protect：HTML 标签保护', () => {
    const p = protectInlineTokens('<p>Returns the <b>user</b> object</p>');
    assert.ok(!p.text.includes('<p>'));
    assert.ok(!p.text.includes('<b>'));
    const restored = p.restore(p.text.replace('user', '用户'));
    assert.ok(restored.includes('<b>用户</b>'), restored);
});

test('protect：行内代码与 printf 占位符', () => {
    const p = protectInlineTokens('调用 `getUser()` 并传入 %s，返回 %d');
    assert.strictEqual(p.restore(p.text), '调用 `getUser()` 并传入 %s，返回 %d');
});

test('protect：多个 token 按索引还原', () => {
    const p = protectInlineTokens('{a} 与 {b} 与 <c/>');
    assert.strictEqual(p.restore(p.text), '{a} 与 {b} 与 <c/>');
    assert.ok(p.text.includes('⟦0⟧') && p.text.includes('⟦1⟧') && p.text.includes('⟦2⟧'));
});

test('protect：无 token 时恒等透传', () => {
    const p = protectInlineTokens('普通的中文句子没有标签');
    assert.strictEqual(p.text, '普通的中文句子没有标签');
    assert.strictEqual(p.restore('任意译文'), '任意译文');
});

test('protect：译文丢失占位符时容错（保持译文原样）', () => {
    const p = protectInlineTokens('使用 {userId} 查询');
    assert.strictEqual(p.restore('使用用户编号查询'), '使用用户编号查询');
});

test('protect：${expr} 与 {@link} JetBrains 标签', () => {
    const p = protectInlineTokens('返回 ${data.name}，参见 {@link UserService}');
    assert.ok(!p.text.includes('${data.name}'));
    assert.ok(!p.text.includes('{@link'));
    assert.strictEqual(p.restore(p.text), '返回 ${data.name}，参见 {@link UserService}');
});
