// 冒烟测试：Edge TTS（speech.platform.bing.com WebSocket + Sec-MS-GEC 签名）
// edge-tts.ts 不依赖 vscode 模块，可直接加载编译产物
const os = require('os');
const path = require('path');
const fs = require('fs');
const { edgeSpeak } = require('../out/edge-tts.js');

async function main() {
    const zh = await edgeSpeak('你好，世界。欢迎使用翻译插件。', 'zh-CN');
    console.log('zh-CN mp3 字节数 =', zh.length, ', 前 8 字节 =', zh.subarray(0, 8).toString('hex'));
    if (zh.length < 1000) {
        throw new Error('中文语音音频过小: ' + zh.length);
    }
    // mp3 帧头 0xFF Ex 或 ID3
    const headOk = zh[0] === 0xff || zh.subarray(0, 3).toString('ascii') === 'ID3';
    if (!headOk) {
        throw new Error('不是合法的 MP3 数据');
    }

    const en = await edgeSpeak('Hello world, this is the translation plugin speaking.', 'en');
    console.log('en mp3 字节数 =', en.length);
    if (en.length < 1000) {
        throw new Error('英文语音音频过小: ' + en.length);
    }

    const outFile = path.join(os.tmpdir(), 'edge-tts-test.mp3');
    fs.writeFileSync(outFile, zh);
    console.log('试听文件:', outFile);
    console.log('SMOKE OK: Edge TTS 真实合成通过');
}

main().catch(e => {
    console.error('SMOKE FAILED:', e.message);
    process.exit(1);
});
