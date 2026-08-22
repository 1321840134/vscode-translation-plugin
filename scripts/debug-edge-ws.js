// 调试 Edge TTS WebSocket 会话（对齐 edge-tts 官方实现的细节）
const { connectWs } = require('../out/mini-ws.js');
const { createHash } = require('crypto');

const TOKEN = '6A5AA1D4EAFF4E9FB37E23D68491D6F4';
const VERSION = '143.0.3650.75';

function secMsGec() {
    let ticks = Math.floor(Date.now() / 1000) + 11644473600;
    ticks -= ticks % 300;
    const t = BigInt(ticks) * 10000000n;
    return createHash('sha256').update(t.toString() + TOKEN, 'ascii').digest('hex').toUpperCase();
}

function connectId() {
    let hex = '';
    while (hex.length < 32) {
        hex += Math.floor(Math.random() * 16).toString(16);
    }
    return hex;
}

// 与 python time.strftime('%a %b %d %Y %H:%M:%S GMT+0000 (Coordinated Universal Time)') 一致
function pyDate() {
    const d = new Date();
    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const p = n => (n < 10 ? '0' + n : '' + n);
    return (
        days[d.getUTCDay()] + ' ' + months[d.getUTCMonth()] + ' ' + p(d.getUTCDate()) + ' ' +
        d.getUTCFullYear() + ' ' + p(d.getUTCHours()) + ':' + p(d.getUTCMinutes()) + ':' + p(d.getUTCSeconds()) +
        ' GMT+0000 (Coordinated Universal Time)'
    );
}

const cid = connectId();
const url =
    'wss://speech.platform.bing.com/consumer/speech/synthesize/readaloud/edge/v1' +
    `?TrustedClientToken=${TOKEN}&ConnectionId=${cid}` +
    `&Sec-MS-GEC=${secMsGec()}&Sec-MS-GEC-Version=${encodeURIComponent('1-' + VERSION)}`;

(async () => {
    const ws = await connectWs(url, {
        Origin: 'chrome-extension://jdiccldimpdaibmpdkjnbmckianbfold',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36 Edg/143.0.0.0',
        Cookie: 'muid=' + 'A'.repeat(32) + ';'
    });
    console.log('握手成功, ConnectionId =', cid);
    let audio = 0;
    ws.onText = d => console.log('[TEXT]', JSON.stringify(d.slice(0, 160)));
    ws.onBinary = d => {
        if (d.length >= 2) {
            const hl = d.readUInt16BE(0);
            if (hl <= d.length) {
                const header = d.subarray(2, 2 + hl).toString('utf8');
                if (header.includes('Path:audio')) {
                    audio += d.length - 2 - hl;
                } else {
                    console.log('[BIN ] 头部:', JSON.stringify(header.slice(0, 120)));
                }
            }
        }
    };
    ws.onClose = code => {
        console.log('[CLOSE]', code, ', 累计音频', audio, '字节');
        process.exit(audio > 1000 ? 0 : 1);
    };
    ws.onError = e => console.log('[ERROR]', e.message);

    const config =
        `X-Timestamp:${pyDate()}\r\nContent-Type:application/json; charset=utf-8\r\nPath:speech.config\r\n\r\n` +
        '{"context":{"synthesis":{"audio":{"metadataoptions":' +
        '{"sentenceBoundaryEnabled":"false","wordBoundaryEnabled":"false"},' +
        '"outputFormat":"audio-24khz-48kbitrate-mono-mp3"}}}}\r\n';
    console.log('发送 speech.config');
    ws.sendText(config);

    const ssml =
        "<speak version='1.0' xmlns='http://www.w3.org/2001/10/synthesis' xml:lang='en-US'>" +
        "<voice name='en-US-AriaNeural'><prosody pitch='+0Hz' rate='+0%' volume='+0%'>Hello world.</prosody></voice></speak>";
    console.log('发送 ssml');
    ws.sendText(
        `X-RequestId:${cid}\r\nContent-Type:application/ssml+xml\r\nX-Timestamp:${pyDate()}Z\r\nPath:ssml\r\n\r\n${ssml}`
    );
})().catch(e => {
    console.error('连接失败:', e.message);
    process.exit(1);
});
