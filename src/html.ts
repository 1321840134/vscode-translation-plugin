/**
 * 翻译面板 Webview HTML。
 * 注意：内嵌脚本一律不用模板字符串/反引号，避免与外层 TS 模板字符串冲突。
 */
export function buildHtml(cspSource: string, nonce: string): string {
    return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy"
      content="default-src 'none'; style-src ${cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}'; img-src ${cspSource} data:; media-src data:; font-src ${cspSource};">
<style>
* { box-sizing: border-box; margin: 0; padding: 0; }
body {
  font-family: var(--vscode-font-family);
  font-size: 13px;
  color: var(--vscode-foreground);
  background: var(--vscode-sideBar-background);
  padding: 10px 12px 24px;
}
.tabs { display: flex; gap: 4px; margin-bottom: 10px; }
.tab {
  padding: 3px 14px; border: none; border-radius: 3px; cursor: pointer;
  background: transparent; color: var(--vscode-descriptionForeground);
  font-family: inherit; font-size: 13px;
}
.tab:hover { color: var(--vscode-foreground); }
.tab.active { background: var(--vscode-list-activeSelectionBackground); color: var(--vscode-list-activeSelectionForeground); }
.langbar { display: flex; gap: 6px; align-items: center; margin-bottom: 6px; }
.langbar select { flex: 1; min-width: 0; }
select, textarea, input {
  background: var(--vscode-input-background); color: var(--vscode-input-foreground);
  border: 1px solid var(--vscode-input-border, #3c3c3c); border-radius: 2px;
  padding: 4px 6px; font-family: inherit; font-size: 13px; outline: none;
}
select:focus, textarea:focus { border-color: var(--vscode-focusBorder, #007fd4); }
textarea { width: 100%; resize: vertical; min-height: 60px; }
.queryrow { display: flex; gap: 8px; align-items: flex-start; margin-bottom: 10px; }
.queryrow textarea { flex: 1; }
.btn {
  background: var(--vscode-button-background); color: var(--vscode-button-foreground);
  border: none; border-radius: 2px; padding: 5px 16px; cursor: pointer;
  font-family: inherit; font-size: 13px; white-space: nowrap;
}
.btn:hover { background: var(--vscode-button-hoverBackground); }
.btn.secondary { background: var(--vscode-button-secondaryBackground, #3a3d41); color: var(--vscode-button-secondaryForeground, #fff); }
.btn.secondary:hover { opacity: 0.9; }
.iconbtn {
  background: transparent; border: none; cursor: pointer; padding: 1px 5px;
  color: var(--vscode-descriptionForeground); font-size: 13px; line-height: 1.4;
}
.iconbtn:hover { color: var(--vscode-foreground); }
.card {
  border: 1px solid var(--vscode-panel-border, #333);
  background: var(--vscode-editor-background);
  border-radius: 4px; padding: 8px 12px; margin-bottom: 8px;
}
.qline { display: flex; align-items: baseline; gap: 8px; flex-wrap: wrap; }
.qtext { font-weight: 600; word-break: break-all; }
.phon { color: var(--vscode-descriptionForeground); font-size: 12px; }
.actions { display: inline-flex; gap: 2px; }
.langpair { color: var(--vscode-descriptionForeground); font-size: 11px; margin-left: auto; }
.main { margin-top: 6px; font-size: 14px; white-space: pre-wrap; word-break: break-word; }
.defs { margin-top: 8px; border-top: 1px dashed var(--vscode-panel-border, #333); padding-top: 6px; }
.def-line { margin: 3px 0; }
.def-pos { color: var(--vscode-charts-blue, #4fc1ff); font-style: italic; margin-right: 6px; }
.def-terms { word-break: break-all; }
.list-item {
  padding: 6px 6px; border-bottom: 1px solid var(--vscode-panel-border, #333);
  display: flex; gap: 6px; align-items: center; cursor: pointer;
}
.list-item:hover { background: var(--vscode-list-hoverBackground, #2a2d2e); }
.li-main { flex: 1; min-width: 0; }
.li-q { font-weight: 600; word-break: break-all; }
.li-q .phon { margin-left: 6px; }
.li-a { color: var(--vscode-descriptionForeground); word-break: break-all; }
.li-time { color: var(--vscode-descriptionForeground); font-size: 11px; margin-top: 2px; }
.toolbar { display: flex; gap: 8px; margin-top: 10px; }
.error { color: var(--vscode-errorForeground, #f48771); margin: 8px 0; white-space: pre-wrap; word-break: break-all; }
.hint { color: var(--vscode-descriptionForeground); font-size: 12px; margin: 8px 2px; }
kbd {
  display: inline-block; padding: 0 4px; border: 1px solid var(--vscode-panel-border, #333);
  border-radius: 3px; font-size: 11px; font-family: inherit;
}
</style>
</head>
<body>
<div class="tabs">
  <button class="tab" id="tabbtn-translate">翻译</button>
  <button class="tab" id="tabbtn-history">历史</button>
  <button class="tab" id="tabbtn-wordbook">单词本</button>
</div>

<section id="tab-translate">
  <div class="langbar">
    <select id="fromLang" title="源语言"></select>
    <button class="iconbtn" id="swap" title="交换语言">⇄</button>
    <select id="toLang" title="目标语言"></select>
  </div>
  <div class="queryrow">
    <textarea id="query" placeholder="输入要翻译的文本，Enter 翻译（Shift+Enter 换行）"></textarea>
    <button class="btn" id="btnTranslate">翻译</button>
  </div>
  <div id="errorBox" class="error"></div>
  <div id="results">
    <div class="hint">选中文本后按 <kbd>Ctrl+Shift+Y</kbd> 翻译；无选区时自动翻译光标处的单词。</div>
  </div>
</section>

<section id="tab-history" hidden>
  <div class="langbar">
    <input id="historySearch" placeholder="搜索历史（支持正则）" spellcheck="false">
  </div>
  <div id="historyList"></div>
  <div class="toolbar">
    <button class="btn secondary" id="clearHistory">清空历史</button>
  </div>
</section>

<section id="tab-wordbook" hidden>
  <div class="langbar">
    <input id="wordSearch" placeholder="搜索单词本（支持正则）" spellcheck="false">
  </div>
  <div id="wordList"></div>
  <div class="toolbar">
    <button class="btn secondary" id="exportWordBook">导出 JSON</button>
    <button class="btn secondary" id="clearWordBook">清空单词本</button>
  </div>
</section>

<script nonce="${nonce}">
(function () {
  var vscode = acquireVsCodeApi();
  var state = vscode.getState() || { query: '', from: 'auto', tab: 'translate' };
  var languages = [];
  var lastResults = [];
  var autoPlay = false;
  var historyData = [];
  var wordData = [];

  function matchesQuery(haystack, q) {
    q = (q || '').trim();
    if (!q) { return true; }
    try {
      var regex = new RegExp(q, 'i');
      return regex.test(haystack);
    } catch (e) {
      return haystack.toLowerCase().indexOf(q.toLowerCase()) >= 0;
    }
  }

  function $(id) { return document.getElementById(id); }
  function send(type, data) { var m = data || {}; m.type = type; vscode.postMessage(m); }
  function saveState() { vscode.setState(state); }
  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) { e.className = cls; }
    if (text !== undefined && text !== null) { e.textContent = text; }
    return e;
  }
  function actionBtn(label, title) {
    var b = el('button', 'iconbtn', label);
    b.title = title || '';
    return b;
  }

  function populateLangs() {
    var from = $('fromLang');
    var to = $('toLang');
    from.innerHTML = '';
    to.innerHTML = '';
    var autoOpt = el('option', null, '自动检测');
    autoOpt.value = 'auto';
    if (state.from === 'auto') { autoOpt.selected = true; }
    from.appendChild(autoOpt);
    for (var i = 0; i < languages.length; i++) {
      var l = languages[i];
      var o1 = el('option', null, l.name);
      o1.value = l.code;
      if (state.from === l.code) { o1.selected = true; }
      from.appendChild(o1);
      var o2 = el('option', null, l.name);
      o2.value = l.code;
      if (state.to === l.code) { o2.selected = true; }
      to.appendChild(o2);
    }
    if (!to.options.length || to.value !== state.to) {
      // 目标语言不在列表中时回退到第一项
      if (to.options.length) { state.to = to.options[0].value; }
    }
  }

  function setTab(tab) {
    state.tab = tab;
    saveState();
    var tabs = ['translate', 'history', 'wordbook'];
    for (var i = 0; i < tabs.length; i++) {
      var t = tabs[i];
      var sec = $('tab-' + t);
      var btn = $('tabbtn-' + t);
      if (t === tab) { sec.hidden = false; btn.classList.add('active'); }
      else { sec.hidden = true; btn.classList.remove('active'); }
    }
    if (tab === 'history') { send('loadHistory'); }
    if (tab === 'wordbook') { send('loadWords'); }
    if (tab === 'translate') { $('query').focus(); }
  }

  function setLoading(on) {
    $('btnTranslate').disabled = !!on;
    $('btnTranslate').textContent = on ? '翻译中…' : '翻译';
  }

  function renderResults(results) {
    lastResults = results || [];
    var box = $('results');
    box.innerHTML = '';
    $('errorBox').textContent = '';
    for (var i = 0; i < lastResults.length; i++) {
      (function (r) {
        var card = el('div', 'card');
        var qline = el('div', 'qline');
        qline.appendChild(el('span', 'qtext', r.query));
        if (r.phonetic) { qline.appendChild(el('span', 'phon', '/' + r.phonetic + '/')); }
        var actions = el('div', 'actions');
        var bSrc = actionBtn('\\uD83D\\uDD0A', '朗读原文');
        bSrc.onclick = function () { send('speak', { text: r.query, lang: r.from }); };
        var bTgt = actionBtn('\\uD83D\\uDD0A', '朗读译文');
        bTgt.onclick = function () { send('speak', { text: r.text, lang: r.to }); };
        var bStar = actionBtn(r.starred ? '\\u2605' : '\\u2606', r.starred ? '从单词本移除' : '加入单词本');
        bStar.onclick = function () { send('star', { text: r.query, to: r.to }); };
        var bCopy = actionBtn('\\u29C9', '复制译文');
        bCopy.onclick = function () { send('copy', { text: r.text }); };
        actions.appendChild(bSrc);
        actions.appendChild(bTgt);
        actions.appendChild(bStar);
        actions.appendChild(bCopy);
        qline.appendChild(actions);
        qline.appendChild(el('span', 'langpair', r.fromName + ' → ' + r.toName + ' · ' + r.engineName));
        card.appendChild(qline);
        card.appendChild(el('div', 'main', r.text));
        if (r.definitions && r.definitions.length) {
          var defs = el('div', 'defs');
          for (var d = 0; d < r.definitions.length; d++) {
            var def = r.definitions[d];
            var line = el('div', 'def-line');
            if (def.pos) { line.appendChild(el('span', 'def-pos', def.pos)); }
            line.appendChild(el('span', 'def-terms', def.terms.join('；')));
            defs.appendChild(line);
          }
          card.appendChild(defs);
        }
        box.appendChild(card);
      })(lastResults[i]);
    }
    if (!lastResults.length) {
      box.appendChild(el('div', 'hint', '输入文本或选中代码后翻译，结果将显示在这里。'));
    }
  }

  function fmtTime(ts) {
    try {
      var d = new Date(ts);
      var p = function (n) { return n < 10 ? '0' + n : '' + n; };
      return d.getMonth() + 1 + '-' + d.getDate() + ' ' + p(d.getHours()) + ':' + p(d.getMinutes());
    } catch (e) { return ''; }
  }

  function renderHistory(items) {
    historyData = items || [];
    var box = $('historyList');
    box.innerHTML = '';
    var q = $('historySearch') ? $('historySearch').value : '';
    var shown = historyData.filter(function (item) {
      return matchesQuery(item.query + '\\n' + item.translation, q);
    });
    if (!shown.length) {
      box.appendChild(el('div', 'hint', historyData.length ? '没有匹配的记录' : '暂无翻译历史'));
      return;
    }
    for (var i = 0; i < shown.length; i++) {
      (function (item) {
        var row = el('div', 'list-item');
        var main = el('div', 'li-main');
        main.appendChild(el('div', 'li-q', item.query));
        main.appendChild(el('div', 'li-a', item.translation));
        main.appendChild(el('div', 'li-time', fmtTime(item.time) + ' · ' + item.engineName));
        row.appendChild(main);
        var del = actionBtn('\\u2715', '删除该记录');
        del.onclick = function (ev) {
          ev.stopPropagation();
          send('removeHistory', { id: item.id });
        };
        row.appendChild(del);
        row.onclick = function () {
          $('query').value = item.query;
          state.query = item.query;
          saveState();
          send('translate', { text: item.query, from: item.from, to: item.to });
        };
        box.appendChild(row);
      })(shown[i]);
    }
  }

  function renderWords(items) {
    wordData = items || [];
    var box = $('wordList');
    box.innerHTML = '';
    var q = $('wordSearch') ? $('wordSearch').value : '';
    var shown = wordData.filter(function (item) {
      return matchesQuery(item.text + '\\n' + item.translation, q);
    });
    if (!shown.length) {
      box.appendChild(el('div', 'hint', wordData.length ? '没有匹配的单词' : '单词本为空。翻译结果卡片中点击 ☆ 即可收藏单词。'));
      return;
    }
    for (var i = 0; i < shown.length; i++) {
      (function (item) {
        var row = el('div', 'list-item');
        var main = el('div', 'li-main');
        var q = el('div', 'li-q', item.text);
        if (item.phonetic) { q.appendChild(el('span', 'phon', '/' + item.phonetic + '/')); }
        main.appendChild(q);
        main.appendChild(el('div', 'li-a', item.translation));
        main.appendChild(el('div', 'li-time', fmtTime(item.addTime)));
        row.appendChild(main);
        var bSpeak = actionBtn('\\uD83D\\uDD0A', '朗读');
        bSpeak.onclick = function (ev) {
          ev.stopPropagation();
          send('speak', { text: item.text, lang: item.from });
        };
        var del = actionBtn('\\u2715', '移除');
        del.onclick = function (ev) {
          ev.stopPropagation();
          send('removeWord', { id: item.id });
        };
        row.appendChild(bSpeak);
        row.appendChild(del);
        box.appendChild(row);
      })(shown[i]);
    }
  }

  function doTranslate() {
    var text = $('query').value.trim();
    if (!text) { return; }
    state.query = text;
    saveState();
    setTab('translate');
    setLoading(true);
    send('translate', { text: text, from: $('fromLang').value, to: $('toLang').value });
  }

  function langsChanged() {
    state.from = $('fromLang').value;
    state.to = $('toLang').value;
    saveState();
    send('langsChanged', { from: state.from, to: state.to });
  }

  $('btnTranslate').onclick = doTranslate;
  $('query').addEventListener('keydown', function (e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      doTranslate();
    }
  });
  $('fromLang').onchange = langsChanged;
  $('toLang').onchange = langsChanged;
  $('swap').onclick = function () {
    var f = $('fromLang');
    var t = $('toLang');
    var fv = f.value;
    f.value = t.value;
    var tv = fv;
    if (tv === 'auto') {
      tv = (lastResults.length && lastResults[0].from && lastResults[0].from !== 'auto') ? lastResults[0].from : 'en';
    }
    var has = false;
    for (var i = 0; i < t.options.length; i++) { if (t.options[i].value === tv) { has = true; break; } }
    t.value = has ? tv : t.options[0].value;
    langsChanged();
  };
  $('tabbtn-translate').onclick = function () { setTab('translate'); };
  $('tabbtn-history').onclick = function () { setTab('history'); };
  $('tabbtn-wordbook').onclick = function () { setTab('wordbook'); };
  $('clearHistory').onclick = function () { send('clearHistory'); };
  $('exportWordBook').onclick = function () { send('exportWordBook'); };
  $('clearWordBook').onclick = function () { send('clearWordBook'); };
  $('historySearch').oninput = function () { renderHistory(historyData); };
  $('wordSearch').oninput = function () { renderWords(wordData); };

  window.addEventListener('message', function (ev) {
    var m = ev.data;
    if (!m || !m.type) { return; }
    switch (m.type) {
      case 'init':
        languages = m.languages || [];
        autoPlay = !!m.autoPlay;
        populateLangs();
        if (m.query) { $('query').value = m.query; state.query = m.query; }
        if (m.results) { renderResults(m.results); }
        setTab(m.tab || state.tab || 'translate');
        break;
      case 'results':
        setLoading(false);
        renderResults(m.results);
        if (autoPlay && m.results && m.results.length && m.results[0].query) {
          send('speak', { text: m.results[0].query, lang: m.results[0].from });
        }
        break;
      case 'error':
        setLoading(false);
        $('errorBox').textContent = m.message || '翻译失败';
        break;
      case 'loading':
        setLoading(true);
        break;
      case 'history':
        renderHistory(m.items);
        break;
      case 'wordbook':
        renderWords(m.items);
        break;
      case 'tts':
        try {
          var audio = new Audio(m.uri);
          audio.play();
        } catch (e) { /* 忽略播放失败 */ }
        break;
      case 'setTab':
        setTab(m.tab);
        break;
      case 'focus':
        setTab('translate');
        $('query').focus();
        break;
      case 'toast':
        var t = el('div', 'hint', m.message || '');
        t.id = 'toastBox';
        document.body.appendChild(t);
        setTimeout(function () {
          var b = $('toastBox');
          if (b && b.parentNode) { b.parentNode.removeChild(b); }
        }, 2500);
        break;
    }
  });

  if (state.query) { $('query').value = state.query; }
  send('init-request');
})();
</script>
</body>
</html>`;
}
