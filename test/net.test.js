const test = require('node:test');
const assert = require('node:assert');
const http = require('node:http');
const net = require('node:net');
const { request, requestJson, formBody, formPairsBody } = require('../out/net.js');

async function withServer(handler, fn) {
    const server = http.createServer(handler);
    await new Promise(r => server.listen(0, '127.0.0.1', r));
    try {
        return await fn(server.address().port);
    } finally {
        server.close();
    }
}

test('net：GET 与 JSON 解析', async () => {
    await withServer((req, res) => {
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ ok: true, echo: req.url }));
    }, async port => {
        const data = await requestJson(`http://127.0.0.1:${port}/x?y=1`);
        assert.deepStrictEqual(data, { ok: true, echo: '/x?y=1' });
    });
});

test('net：POST 表单体透传', async () => {
    await withServer((req, res) => {
        let body = '';
        req.on('data', c => (body += c));
        req.on('end', () => res.end(body));
    }, async port => {
        const body = formPairsBody([['client', 'gtx'], ['dt', 't'], ['dt', 'bd'], ['q', '你好']]);
        const res = await request(`http://127.0.0.1:${port}/`, { method: 'POST', body });
        assert.strictEqual(res.status, 200);
        // 服务端按 UTF-8 原样收到（含重复键）
        const decoded = decodeURIComponent(body);
        assert.ok(res.buffer.toString('utf8').includes('client=gtx'));
        assert.ok(decoded.includes('你好'));
    });
});

test('net：302 重定向自动跟随', async () => {
    await withServer((req, res) => {
        if (req.url === '/redirect') {
            res.writeHead(302, { Location: '/final' });
            res.end();
        } else if (req.url === '/final') {
            res.end('arrived');
        } else {
            res.writeHead(404);
            res.end();
        }
    }, async port => {
        const res = await request(`http://127.0.0.1:${port}/redirect`);
        assert.strictEqual(res.status, 200);
        assert.strictEqual(res.buffer.toString('utf8'), 'arrived');
    });
});

test('net：非 200 抛出含状态码的错误', async () => {
    await withServer((req, res) => {
        res.writeHead(404);
        res.end('not found');
    }, async port => {
        await assert.rejects(
            () => requestJson(`http://127.0.0.1:${port}/`),
            /HTTP 404/
        );
    });
});

test('net：请求超时', async () => {
    await withServer((req, res) => {
        // 故意不响应
    }, async port => {
        await assert.rejects(
            () => request(`http://127.0.0.1:${port}/`, { timeout: 300 }),
            /超时/
        );
    });
});

test('net：AbortSignal 取消', async () => {
    await withServer((req, res) => {
        // 故意不响应
    }, async port => {
        const controller = new AbortController();
        setTimeout(() => controller.abort(), 100);
        await assert.rejects(
            () => request(`http://127.0.0.1:${port}/`, { signal: controller.signal, timeout: 5000 }),
            /取消/
        );
    });
});

test('net：代理 CONNECT 被拒绝时报代理错误', async () => {
    const proxy = http.createServer();
    proxy.on('connect', (req, socket) => {
        socket.end('HTTP/1.1 403 Forbidden\r\n\r\n');
    });
    await new Promise(r => proxy.listen(0, '127.0.0.1', r));
    try {
        await assert.rejects(
            () => request('https://example.com/', { proxy: `http://127.0.0.1:${proxy.address().port}` }),
            /代理 CONNECT 失败 \(HTTP 403\)/
        );
    } finally {
        proxy.close();
    }
});

test('net：代理 CONNECT 成功后建立隧道（客户端发 TLS ClientHello）', async () => {
    let sawClientHello = false;
    const proxy = http.createServer();
    proxy.on('connect', (req, socket) => {
        socket.write('HTTP/1.1 200 Connection Established\r\n\r\n');
        socket.once('data', chunk => {
            // 客户端在隧道上发起 TLS：首字节 0x16 = Handshake
            if (chunk[0] === 0x16) {
                sawClientHello = true;
            }
            socket.destroy(); // 不完成握手即可
        });
    });
    await new Promise(r => proxy.listen(0, '127.0.0.1', r));
    try {
        await assert.rejects(
            () => request('https://example.com/', { proxy: `http://127.0.0.1:${proxy.address().port}`, timeout: 4000 }),
            err => {
                // 关键断言：不是"代理 CONNECT 失败"，而是 TLS/连接层错误 → 隧道已建立
                assert.ok(!/代理 CONNECT 失败/.test(err.message), `不应是 CONNECT 失败: ${err.message}`);
                return true;
            }
        );
        assert.strictEqual(sawClientHello, true, '代理应收到 TLS ClientHello');
    } finally {
        proxy.close();
    }
});

test('formBody：重复键支持', () => {
    assert.strictEqual(formBody({ a: '1', b: 'x y' }), 'a=1&b=x%20y');
    assert.strictEqual(formPairsBody([['dt', 't'], ['dt', 'bd']]), 'dt=t&dt=bd');
});
