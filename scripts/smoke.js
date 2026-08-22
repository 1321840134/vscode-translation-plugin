// 冒烟测试：验证 Google 翻译免费接口与 TTS（无需 VSCode，直接用编译后的 net.js）
const { request, formPairsBody } = require('../out/net.js');

async function main() {
    const host = 'translate.googleapis.com';
    const body = formPairsBody([
        ['client', 'gtx'],
        ['sl', 'auto'],
        ['tl', 'zh-CN'],
        ['hl', 'zh-CN'],
        ['dt', 't'],
        ['dt', 'bd'],
        ['dt', 'rm'],
        ['dj', '1'],
        ['q', 'hello world']
    ]);
    const res = await request(`https://${host}/translate_a/single`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'
        },
        body
    });
    console.log('translate status =', res.status);
    const data = JSON.parse(res.buffer.toString('utf8'));
    const text = (data.sentences || []).map(s => s.trans || '').join('');
    console.log('translated     =', text);
    console.log('detected(src)  =', data.src);
    console.log('dict entries   =', (data.dict || []).map(d => d.pos).join(','));
    if (!text.includes('你好') && !text.includes('世界')) {
        throw new Error('译文不符合预期: ' + text);
    }

    const tts = await request(
        `https://${host}/translate_tts?ie=UTF-8&client=gtx&tl=en&total=1&idx=0&textlen=11&q=${encodeURIComponent('hello world')}`,
        { headers: { 'User-Agent': 'Mozilla/5.0', Referer: 'https://translate.google.com/' } }
    );
    console.log('tts status =', tts.status, ', mp3 bytes =', tts.buffer.length);
    if (tts.status !== 200 || tts.buffer.length === 0) {
        throw new Error('TTS 不可用');
    }
    console.log('SMOKE OK');
}

main().catch(e => {
    console.error('SMOKE FAILED:', e.message);
    process.exit(1);
});
