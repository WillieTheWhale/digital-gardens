// Packs the site into one self-contained HTML file (fonts, CSS and scripts inlined)
// for sending around or previewing without a server:  node tools/bundle.mjs
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(root, p), 'utf8');

let css = read('css/style.css').replace(/url\("\.\.\/(assets\/fonts\/[^"]+)"\)/g, (_, p) =>
  `url("data:font/woff2;base64,${readFileSync(join(root, p)).toString('base64')}")`);

let html = read('index.html')
  .replace(/<link rel="stylesheet" href="css\/style\.css">/, () => `<style>\n${css}\n</style>`)
  .replace(/<script src="(js\/[^"]+)"><\/script>/g, (_, p) => `<script>\n${read(p)}\n</script>`);

mkdirSync(join(root, 'dist'), { recursive: true });
writeFileSync(join(root, 'dist/digital-gardens.html'), html);
console.log('dist/digital-gardens.html', (html.length / 1024).toFixed(0) + ' KB');
