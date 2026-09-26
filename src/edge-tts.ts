import { createHash } from 'crypto';
import { connectWs } from './mini-ws';

/**
 * Edge 神经网络语音（与参考插件同源方案）：走 Edge 浏览器公开的
 * speech.platform.bing.com WebSocket 接口，免费、无需密钥。
 * 消息格式与 Sec-MS-GEC 签名对齐 edge-tts 项目的实现。
 */

const TRUSTED_CLIENT_TOKEN = '6A5AA1D4EAFF4E9FB37E23D68491D6F4';
/** 签名所用的 Chromium 版本需与 Sec-MS-GEC-Version 一致 */
const CHROMIUM_FULL_VERSION = '143.0.3650.75';
const SEC_MS_GEC_VERSION = `1-${CHROMIUM_FULL_VERSION}`;
const ORIGIN = 'chrome-extension://jdiccldimpdaibmpdkjnbmckianbfold';
const WSS_URL =
    'wss://speech.platform.bing.com/consumer/speech/synthesize/readaloud/edge/v1' +
    `?TrustedClientToken=${TRUSTED_CLIENT_TOKEN}`;

/** 各语言默认音色（Neural 女声为主） */
const VOICES: Record<string, string> = {
    'zh-CN': 'zh-CN-XiaoxiaoNeural',
    'zh-TW': 'zh-TW-HsiaoChenNeural',
    en: 'en-US-AriaNeural',
    ja: 'ja-JP-NanamiNeural',
    ko: 'ko-KR-SunHiNeural',
    fr: 'fr-FR-DeniseNeural',
    de: 'de-DE-KatjaNeural',
    ru: 'ru-RU-SvetlanaNeural',
    es: 'es-ES-ElviraNeural',
    pt: 'pt-PT-FernandaNeural',
    it: 'it-IT-ElsaNeural',
    ar: 'ar-EG-SalmaNeural',
    th: 'th-TH-PremwadeeNeural',
    vi: 'vi-VN-HoaiMyNeural',
    id: 'id-ID-GadisNeural',
    ms: 'ms-MY-YasminNeural',
    tr: 'tr-TR-EmelNeural',
    nl: 'nl-NL-ColetteNeural',
    pl: 'pl-PL-ZofiaNeural',
    sv: 'sv-SE-SofieNeural'
};

function pickVoice(lang: string): string {
    if (VOICES[lang]) {
        return VOICES[lang];
    }
    const base = lang.split('-')[0];
    if (VOICES[base]) {
        return VOICES[base];
    }
    return VOICES.en;
}

/**
 * Sec-MS-GEC 签名：SHA256( ticks + TrustedClientToken ).toUpperCase()
 * ticks = (unix秒 + Windows纪元偏移) 向下取整到 5 分钟，换算为 100 纳秒单位（×1e7）
 */
function secMsGec(): string {
    let ticks = Math.floor(Date.now() / 1000) + 11644473600;
    ticks -= ticks % 300;
    const ticks100ns = BigInt(ticks) * 10_000_000n;
    return createHash('sha256')
        .update(ticks100ns.toString() + TRUSTED_CLIENT_TOKEN, 'ascii')
        .digest('hex')
        .toUpperCase();
}

/** 会话/请求 ID（32 位十六进制） */
function connectId(): string {
    let hex = '';
    while (hex.length < 32) {
        hex += Math.floor(Math.random() * 16).toString(16);
    }
    return hex;
}

/** 服务端要求的时间戳格式（无逗号的 JS Date 字符串） */
function jsDate(): string {
    const d = new Date();
    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const p = (n: number): string => (n < 10 ? `0${n}` : `${n}`);
    return (
        `${days[d.getUTCDay()]} ${months[d.getUTCMonth()]} ${p(d.getUTCDate())} ${d.getUTCFullYear()} ` +
        `${p(d.getUTCHours())}:${p(d.getUTCMinutes())}:${p(d.getUTCSeconds())}` +
        ' GMT+0000 (Coordinated Universal Time)'
    );
}

function escapeXml(text: string): string {
    return text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;');
}

/** 合成语音，返回 mp3 字节 */
export function edgeSpeak(text: string, lang: string): Promise<Buffer> {
    const clipped = text.replace(/\s+/g, ' ').trim().slice(0, 400);
    if (!clipped) {
        return Promise.reject(new Error('没有可朗读的文本'));
    }
    const voice = pickVoice(lang);
    const locale = voice.split('-').slice(0, 2).join('-');
    const cid = connectId();
    const url =
        `${WSS_URL}&ConnectionId=${cid}&Sec-MS-GEC=${secMsGec()}` +
        `&Sec-MS-GEC-Version=${encodeURIComponent(SEC_MS_GEC_VERSION)}`;
    const ts = jsDate();

    return new Promise<Buffer>((resolve, reject) => {
        let settled = false;
        const finish = (err: Error | undefined, mp3?: Buffer): void => {
            if (settled) {
                return;
            }
            settled = true;
            clearTimeout(guard);
            try {
                ws?.close();
            } catch {
                // 忽略
            }
            if (err) {
                reject(err);
            } else {
                resolve(mp3 ?? Buffer.concat(chunks));
            }
        };
        const guard = setTimeout(() => {
            finish(new Error('Edge 语音合成超时'));
        }, 20000);

        let ws: import('./mini-ws').MiniWs | undefined;
        const chunks: Buffer[] = [];
        connectWs(
            url,
            {
                Origin: ORIGIN,
                'User-Agent': `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${CHROMIUM_FULL_VERSION.split('.')[0]}.0.0.0 Safari/537.36 Edg/${CHROMIUM_FULL_VERSION.split('.')[0]}.0.0.0`,
                Pragma: 'no-cache',
                'Cache-Control': 'no-cache',
                Cookie: `muid=${connectId().toUpperCase()};`
            },
            15000
        )
            .then(connection => {
                ws = connection;
                ws.onText = data => {
                    if (data.includes('Path:turn.end')) {
                        finish(undefined, Buffer.concat(chunks));
                    }
                };
                ws.onBinary = data => {
                    // 二进制帧：前 2 字节为大端头部长度，头部含 Path:audio 时其后为音频数据
                    if (data.length >= 2) {
                        const headerLen = data.readUInt16BE(0);
                        if (headerLen + 2 <= data.length) {
                            const header = data.subarray(2, 2 + headerLen).toString('utf8');
                            if (header.includes('Path:audio')) {
                                chunks.push(data.subarray(2 + headerLen));
                            }
                        }
                    }
                };
                ws.onClose = code => {
                    // 1000 正常关闭；1006 为服务端发完音频后直接断开，同样视为完成
                    if (code === 1000 || code === 1006) {
                        finish(undefined, Buffer.concat(chunks));
                    } else {
                        finish(new Error(`Edge 语音连接被关闭 (${code})`));
                    }
                };
                ws.onError = () => {
                    // 网络错误时若已收到音频则按完成处理
                    if (chunks.length > 0) {
                        finish(undefined, Buffer.concat(chunks));
                    } else {
                        finish(new Error('Edge 语音连接出错'));
                    }
                };
                ws.sendText(
                    `X-Timestamp:${ts}\r\nContent-Type:application/json; charset=utf-8\r\nPath:speech.config\r\n\r\n` +
                        '{"context":{"synthesis":{"audio":{"metadataoptions":' +
                        '{"sentenceBoundaryEnabled":"false","wordBoundaryEnabled":"false"},' +
                        '"outputFormat":"audio-24khz-48kbitrate-mono-mp3"}}}}\r\n'
                );
                ws.sendText(
                    `X-RequestId:${cid}\r\nContent-Type:application/ssml+xml\r\nX-Timestamp:${ts}Z\r\nPath:ssml\r\n\r\n` +
                        `<speak version='1.0' xmlns='http://www.w3.org/2001/10/synthesis' xml:lang='${locale}'>` +
                        `<voice name='${voice}'>` +
                        `<prosody pitch='+0Hz' rate='+0%' volume='+0%'>${escapeXml(clipped)}</prosody>` +
                        `</voice></speak>`
                );
            })
            .catch(err => finish(err));
    });
}
