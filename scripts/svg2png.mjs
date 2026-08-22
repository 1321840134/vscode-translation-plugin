// 将用户提供的 SVG 图标渲染为 VSCode 扩展图标 media/icon.png
// 用法: node scripts/svg2png.mjs <input.svg>
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Resvg } from '@resvg/resvg-js';

const input = process.argv[2];
if (!input) {
    console.error('用法: node scripts/svg2png.mjs <input.svg>');
    process.exit(1);
}

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const resvg = new Resvg(readFileSync(input, 'utf8'), {
    fitTo: { mode: 'width', value: 256 },
    background: 'rgba(0,0,0,0)'
});
const png = resvg.render().asPng();
const out = join(root, 'media', 'icon.png');
writeFileSync(out, png);
console.log(`已生成 ${out} (${png.length} 字节, 256x256)`);
