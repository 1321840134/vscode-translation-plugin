import * as http from 'http';
import * as https from 'https';
import { randomBytes } from 'crypto';

export interface MiniWs {
    onText: (data: string) => void;
    onBinary: (data: Buffer) => void;
    onClose: (code: number) => void;
    onError: (err: Error) => void;
    sendText(text: string): void;
    close(): void;
}

/**
 * 极简 RFC6455 WebSocket 客户端（仅依赖 node https，供 Edge TTS 使用）。
 * 支持：文本/二进制帧收发、分片重组、ping/pong、掩码发送。
 */
export function connectWs(url: string, headers: Record<string, string> = {}, timeoutMs = 20000): Promise<MiniWs> {
    return new Promise((resolve, reject) => {
        let target: URL;
        try {
            target = new URL(url);
        } catch (e) {
            reject(new Error(`无效的 WebSocket URL: ${url}`));
            return;
        }
        const key = randomBytes(16).toString('base64');
        const mod = target.protocol === 'wss:' || target.protocol === 'https:' ? https : http;
        const req = mod.request({
            hostname: target.hostname,
            port: target.port || (target.protocol === 'ws:' || target.protocol === 'http:' ? 80 : 443),
            path: `${target.pathname}${target.search}`,
            method: 'GET',
            headers: {
                ...headers,
                Connection: 'Upgrade',
                Upgrade: 'websocket',
                'Sec-WebSocket-Key': key,
                'Sec-WebSocket-Version': '13'
            }
        });
        const timer = setTimeout(() => {
            req.destroy(new Error('WebSocket 连接超时'));
        }, timeoutMs);
        req.on('upgrade', (res, socket, head) => {
            clearTimeout(timer);
            setupSocket(socket, head, resolve, reject);
        });
        req.on('response', res => {
            clearTimeout(timer);
            req.destroy();
            reject(new Error(`WebSocket 握手失败 (HTTP ${res.statusCode})`));
        });
        req.on('error', err => {
            clearTimeout(timer);
            reject(err);
        });
        req.end();
    });
}

function setupSocket(socket: import('net').Socket, head: Buffer, resolve: (ws: MiniWs) => void, reject: (err: Error) => void): void {
    const ws: MiniWs = {
        onText: () => undefined,
        onBinary: () => undefined,
        onClose: () => undefined,
        onError: () => undefined,
        sendText(text: string): void {
            socket.write(encodeFrame(0x1, Buffer.from(text, 'utf8')));
        },
        close(): void {
            try {
                socket.write(encodeFrame(0x8, Buffer.alloc(0)));
            } catch {
                // 忽略
            }
            socket.end();
        }
    };
    let buffer = head.length > 0 ? Buffer.from(head) : Buffer.alloc(0);
    let fragments: Buffer[] = [];
    let fragmentOpcode = 0;
    let closed = false;

    const deliver = (opcode: number, payload: Buffer): void => {
        if (opcode === 0x1) {
            ws.onText(payload.toString('utf8'));
        } else if (opcode === 0x2) {
            ws.onBinary(payload);
        }
    };

    const parseFrame = (): boolean => {
        if (buffer.length < 2) {
            return false;
        }
        const b0 = buffer[0];
        const b1 = buffer[1];
        const fin = (b0 & 0x80) !== 0;
        const opcode = b0 & 0x0f;
        const masked = (b1 & 0x80) !== 0;
        let len = b1 & 0x7f;
        let offset = 2;
        if (len === 126) {
            if (buffer.length < 4) {
                return false;
            }
            len = buffer.readUInt16BE(2);
            offset = 4;
        } else if (len === 127) {
            if (buffer.length < 10) {
                return false;
            }
            len = Number(buffer.readBigUInt64BE(2));
            offset = 10;
        }
        let maskKey: Buffer | undefined;
        if (masked) {
            if (buffer.length < offset + 4) {
                return false;
            }
            maskKey = Buffer.from(buffer.subarray(offset, offset + 4));
            offset += 4;
        }
        if (buffer.length < offset + len) {
            return false;
        }
        const payload = Buffer.from(buffer.subarray(offset, offset + len));
        buffer = buffer.subarray(offset + len);
        if (maskKey) {
            for (let i = 0; i < payload.length; i++) {
                payload[i] ^= maskKey[i & 3];
            }
        }
        switch (opcode) {
            case 0x0:
                fragments.push(payload);
                if (fin) {
                    const merged = Buffer.concat(fragments);
                    const op = fragmentOpcode;
                    fragments = [];
                    deliver(op, merged);
                }
                break;
            case 0x1:
            case 0x2:
                if (fin) {
                    deliver(opcode, payload);
                } else {
                    fragmentOpcode = opcode;
                    fragments = [payload];
                }
                break;
            case 0x8: {
                const code = payload.length >= 2 ? payload.readUInt16BE(0) : 1005;
                closed = true;
                try {
                    socket.end();
                } catch {
                    // 忽略
                }
                ws.onClose(code);
                break;
            }
            case 0x9:
                try {
                    socket.write(encodeFrame(0xA, payload));
                } catch {
                    // 忽略
                }
                break;
            case 0xA:
            default:
                break;
        }
        return true;
    };

    socket.on('data', (chunk: Buffer) => {
        buffer = Buffer.concat([buffer, chunk]);
        while (!closed && parseFrame()) {
            // 循环解析
        }
    });
    socket.on('error', err => {
        ws.onError(err);
    });
    socket.on('close', () => {
        if (!closed) {
            closed = true;
            ws.onClose(1006);
        }
    });

    resolve(ws);
    // 握手后 socket 出错也应通知
    socket.on('error', err => reject(err));
}

function encodeFrame(opcode: number, payload: Buffer): Buffer {
    const mask = randomBytes(4);
    const len = payload.length;
    let header: Buffer;
    if (len < 126) {
        header = Buffer.from([0x80 | opcode, 0x80 | len]);
    } else if (len < 65536) {
        header = Buffer.alloc(4);
        header[0] = 0x80 | opcode;
        header[1] = 0x80 | 126;
        header.writeUInt16BE(len, 2);
    } else {
        header = Buffer.alloc(10);
        header[0] = 0x80 | opcode;
        header[1] = 0x80 | 127;
        header.writeBigUInt64BE(BigInt(len), 2);
    }
    const masked = Buffer.allocUnsafe(len);
    for (let i = 0; i < len; i++) {
        masked[i] = payload[i] ^ mask[i & 3];
    }
    return Buffer.concat([header, mask, masked]);
}
