import * as http from 'http';
import * as https from 'https';

export interface HttpResponse {
    status: number;
    buffer: Buffer;
}

export interface RequestOptions {
    method?: string;
    headers?: Record<string, string>;
    body?: string;
    timeout?: number;
}

/** 发起 HTTP(S) 请求，自动跟随重定向（最多 4 次），返回原始字节 */
export function request(url: string, options: RequestOptions = {}): Promise<HttpResponse> {
    const timeout = options.timeout ?? 15000;
    return new Promise<HttpResponse>((resolve, reject) => {
        const run = (target: string, depth: number): void => {
            let u: URL;
            try {
                u = new URL(target);
            } catch (e) {
                reject(new Error(`无效的 URL: ${target}`));
                return;
            }
            const mod = u.protocol === 'http:' ? http : https;
            const req = mod.request(
                {
                    hostname: u.hostname,
                    port: u.port || (u.protocol === 'http:' ? 80 : 443),
                    path: `${u.pathname}${u.search}`,
                    method: options.method ?? 'GET',
                    headers: options.headers
                },
                res => {
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
                }
            );
            req.on('error', err => reject(err));
            req.setTimeout(timeout, () => {
                req.destroy(new Error('网络请求超时'));
            });
            if (options.body !== undefined) {
                req.write(options.body);
            }
            req.end();
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
    } catch (e) {
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
