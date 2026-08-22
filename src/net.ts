import * as http from 'http';
import * as https from 'https';
import * as net from 'net';
import * as tls from 'tls';

export interface HttpResponse {
    status: number;
    buffer: Buffer;
}

export interface RequestOptions {
    method?: string;
    headers?: Record<string, string>;
    body?: string;
    timeout?: number;
    /** HTTP 代理地址（http://host:port），仅对 https 目标生效（CONNECT 隧道） */
    proxy?: string;
    /** 取消信号：abort 时销毁底层请求 */
    signal?: AbortSignal;
}

/** 通过 HTTP 代理建立到目标主机的 CONNECT 隧道，返回可复用的裸 socket */
function tunnel(
    proxy: URL,
    host: string,
    port: number,
    timeoutMs: number
): Promise<net.Socket> {
    return new Promise((resolve, reject) => {
        const headers: Record<string, string> = { Host: `${host}:${port}` };
        if (proxy.username || proxy.password) {
            const auth = `${decodeURIComponent(proxy.username)}:${decodeURIComponent(proxy.password)}`;
            headers['Proxy-Authorization'] = 'Basic ' + Buffer.from(auth).toString('base64');
        }
        const req = http.request({
            hostname: proxy.hostname,
            port: Number(proxy.port) || 80,
            method: 'CONNECT',
            path: `${host}:${port}`,
            headers
        });
        req.once('connect', (res, socket) => {
            if (res.statusCode === 200) {
                resolve(socket);
            } else {
                socket.destroy();
                reject(new Error(`代理 CONNECT 失败 (HTTP ${res.statusCode})`));
            }
        });
        req.once('error', reject);
        req.setTimeout(timeoutMs, () => {
            req.destroy(new Error('代理连接超时'));
        });
        req.end();
    });
}

/** 发起 HTTP(S) 请求，自动跟随重定向（最多 4 次），支持代理与取消 */
export function request(url: string, options: RequestOptions = {}): Promise<HttpResponse> {
    const timeout = options.timeout ?? 15000;
    return new Promise<HttpResponse>((resolve, reject) => {
        const run = (target: string, depth: number): void => {
            let u: URL;
            try {
                u = new URL(target);
            } catch {
                reject(new Error(`无效的 URL: ${target}`));
                return;
            }
            const isHttps = u.protocol === 'https:';
            const mod = isHttps ? https : http;
            const defaultPort = u.port || (isHttps ? 443 : 80);
            const start = async (): Promise<void> => {
                const reqOpts: https.RequestOptions = {
                    hostname: u.hostname,
                    port: defaultPort,
                    path: `${u.pathname}${u.search}`,
                    method: options.method ?? 'GET',
                    headers: options.headers
                };
                if (options.signal) {
                    if (options.signal.aborted) {
                        throw new Error('请求已取消');
                    }
                }
                // https 目标 + 配置了代理 → CONNECT 隧道，并在隧道之上做 TLS 握手
                if (options.proxy && isHttps) {
                    let proxyUrl: URL;
                    try {
                        proxyUrl = new URL(options.proxy);
                    } catch {
                        reject(new Error(`无效的代理地址: ${options.proxy}`));
                        return;
                    }
                    const socket = await tunnel(proxyUrl, u.hostname, Number(defaultPort), timeout);
                    // 注意：自定义 createConnection 返回的 socket 会被视作已完成 TLS 的连接，
                    // 必须自行在隧道上发起 TLS 握手，否则发送的是明文 HTTP
                    (reqOpts as { createConnection?: unknown }).createConnection = () =>
                        tls.connect({ socket, servername: u.hostname });
                }
                const req = mod.request(reqOpts, res => {
                    const status = res.statusCode ?? 0;
                    const loc = res.headers.location;
                    const location = Array.isArray(loc) ? loc[0] : loc;
                    if (status >= 300 && status < 400 && location && depth < 4) {
                        res.resume();
                        run(new URL(location, target).toString(), depth + 1);
                        return;
                    }
                    const chunks: Buffer[] = [];
                    res.on('data', (c: Buffer) => chunks.push(c));
                    res.on('end', () => resolve({ status, buffer: Buffer.concat(chunks) }));
                });
                req.on('error', err => reject(err));
                req.setTimeout(timeout, () => {
                    req.destroy(new Error('网络请求超时'));
                });
                if (options.signal) {
                    const signal = options.signal;
                    const onAbort = (): void => {
                        req.destroy(new Error('请求已取消'));
                    };
                    if (signal.aborted) {
                        onAbort();
                        return;
                    }
                    signal.addEventListener('abort', onAbort, { once: true });
                }
                if (options.body !== undefined) {
                    req.write(options.body);
                }
                req.end();
            };
            start().catch(reject);
        };
        run(url, 0);
    });
}

export async function requestJson<T>(url: string, options: RequestOptions = {}): Promise<T> {
    const res = await request(url, options);
    if (res.status !== 200) {
        throw new Error(`HTTP ${res.status}: ${res.buffer.toString('utf8').slice(0, 300)}`);
    }
    try {
        return JSON.parse(res.buffer.toString('utf8')) as T;
    } catch {
        throw new Error(`响应不是合法的 JSON: ${res.buffer.toString('utf8').slice(0, 300)}`);
    }
}

export function formBody(params: Record<string, string>): string {
    return formPairsBody(Object.entries(params));
}

/** 支持重复键的表单编码（如 Google 接口的多个 dt 参数） */
export function formPairsBody(pairs: [string, string][]): string {
    return pairs
        .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
        .join('&');
}

export const FORM_CONTENT_TYPE = 'application/x-www-form-urlencoded;charset=UTF-8';
