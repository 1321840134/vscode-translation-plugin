const test = require('node:test');
const assert = require('node:assert');
const http = require('node:http');
const crypto = require('node:crypto');
const { connectWs } = require('../out/mini-ws.js');

const WS_GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';

// 服务端帧编码（不掩码）
function serverFrame(opcode, payload) {
    const len = payload.length;
    if (len < 126) {
        return Buffer.from([0x80 | opcode, len, ...payload]);
    }
    const header = Buffer.alloc(4);
    header[0] = 0x80 | opcode;
    header[1] = 126;
    header.writeUInt16BE(len, 2);
    return Buffer.concat([header, payload]);
}

// 解析客户端帧（必带掩码），返回 {opcode, payload}
function parseClientFrame(buf) {
    const opcode = buf[0] & 0x0f;
    let len = buf[1] & 0x7f;
    let offset = 2;
    if (len === 126) {
        len = buf.readUInt16BE(2);
        offset = 4;
    }
    const mask = buf.subarray(offset, offset + 4);
    offset += 4;
    const payload = Buffer.from(buf.subarray(offset, offset + len));
    for (let i = 0; i < payload.length; i++) {
        payload[i] ^= mask[i & 3];
    }
    return { opcode, payload, end: offset + len };
}

/** 启动测试用 WebSocket 服务端：回显文本；指令 BIN/PING/CLOSE */
function startWsServer() {
    const events = { pings: 0, pongs: 0 };
    const server = http.createServer();
    server.on('upgrade', (req, socket) => {
        const key = req.headers['sec-websocket-key'];
        const accept = crypto.createHash('sha1').update(key + WS_GUID).digest('base64');
        socket.write(
            'HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n' +
            `Sec-WebSocket-Accept: ${accept}\r\n\r\n`
        );
        let buffer = Buffer.alloc(0);
        socket.on('data', chunk => {
            buffer = Buffer.concat([buffer, chunk]);
            while (buffer.length >= 2) {
                const frame = parseClientFrame(buffer);
                if (!frame) {
                    break;
                }
                buffer = buffer.subarray(frame.end);
                if (frame.opcode === 0x8) {
                    socket.end();
                } else if (frame.opcode === 0xA) {
                    events.pongs++;
                } else if (frame.opcode === 0x1) {
                    const text = frame.payload.toString('utf8');
                    if (text === 'BIN') {
                        socket.write(serverFrame(0x2, Buffer.from('binary-payload')));
                    } else if (text === 'PING') {
                        socket.write(serverFrame(0x9, Buffer.from('hb')));
                    } else if (text === 'CLOSE') {
                        socket.write(serverFrame(0x8, Buffer.from([0x03, 0xe8]))); // 1000
                        socket.end();
                    } else {
                        socket.write(serverFrame(0x1, Buffer.from(`echo:${text}`)));
                    }
                }
            }
        });
    });
    return { server, events };
}

async function withWsServer(fn) {
    const { server, events } = startWsServer();
    await new Promise(r => server.listen(0, '127.0.0.1', r));
    try {
        return await fn(`ws://127.0.0.1:${server.address().port}`, events);
    } finally {
        server.close();
    }
}

test('mini-ws：握手、掩码发送与文本回显', async () => {
    await withWsServer(async url => {
        const ws = await connectWs(url, {}, 5000);
        const got = new Promise(r => (ws.onText = d => r(d)));
        ws.sendText('hello 世界');
        assert.strictEqual(await got, 'echo:hello 世界');
        ws.close();
    });
});

test('mini-ws：二进制帧接收', async () => {
    await withWsServer(async url => {
        const ws = await connectWs(url, {}, 5000);
        const got = new Promise(r => (ws.onBinary = b => r(b.toString('utf8'))));
        ws.sendText('BIN');
        assert.strictEqual(await got, 'binary-payload');
        ws.close();
    });
});

test('mini-ws：服务端 ping 自动回 pong', async () => {
    await withWsServer(async (url, events) => {
        const ws = await connectWs(url, {}, 5000);
        ws.onText = () => undefined;
        ws.sendText('PING');
        await new Promise(r => setTimeout(r, 300));
        assert.strictEqual(events.pongs, 1, '客户端应自动回复 pong');
        ws.close();
    });
});

test('mini-ws：服务端正常关闭码', async () => {
    await withWsServer(async url => {
        const ws = await connectWs(url, {}, 5000);
        const closed = new Promise(r => (ws.onClose = code => r(code)));
        ws.onText = () => undefined;
        ws.sendText('CLOSE');
        assert.strictEqual(await closed, 1000);
    });
});

test('mini-ws：握手拒绝时报 HTTP 状态', async () => {
    const server = http.createServer((req, res) => {
        res.writeHead(403);
        res.end();
    });
    await new Promise(r => server.listen(0, '127.0.0.1', r));
    try {
        await assert.rejects(
            () => connectWs(`ws://127.0.0.1:${server.address().port}`, {}, 3000),
            /WebSocket 握手失败 \(HTTP 403\)/
        );
    } finally {
        server.close();
    }
});
