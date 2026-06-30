import * as esbuild from 'esbuild';
import { mkdirSync, copyFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PNG } from 'pngjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const out = resolve(root, 'dist');
const ext = resolve(root, 'src/extension');
const watch = process.argv.includes('--watch');

mkdirSync(resolve(out, 'icons'), { recursive: true });

const common = {
  bundle: true,
  sourcemap: true,
  target: ['chrome110'],
  logLevel: 'info',
};

// Background is an ESM service worker; content/popup are IIFE (content scripts
// and classic page scripts cannot use ESM import).
const builds = [
  { entryPoints: [resolve(ext, 'background.ts')], outfile: resolve(out, 'background.js'), format: 'esm' },
  { entryPoints: [resolve(ext, 'content.ts')], outfile: resolve(out, 'content.js'), format: 'iife' },
  { entryPoints: [resolve(ext, 'popup.ts')], outfile: resolve(out, 'popup.js'), format: 'iife' },
];

function copyStatic() {
  copyFileSync(resolve(ext, 'manifest.json'), resolve(out, 'manifest.json'));
  copyFileSync(resolve(ext, 'popup.html'), resolve(out, 'popup.html'));
}

function makeIcon(size) {
  const png = new PNG({ width: size, height: size });
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      const t = (x + y) / (2 * size);
      png.data[i] = Math.round(20 + t * 40);
      png.data[i + 1] = Math.round(120 - t * 40);
      png.data[i + 2] = Math.round(150 + t * 80);
      png.data[i + 3] = 255;
      if (Math.abs(x - y) < size * 0.1) {
        png.data[i] = 240;
        png.data[i + 1] = 240;
        png.data[i + 2] = 245;
      }
    }
  }
  writeFileSync(resolve(out, `icons/${size}.png`), PNG.sync.write(png));
}

function makeIcons() {
  for (const s of [16, 48, 128]) makeIcon(s);
}

if (watch) {
  const ctxs = await Promise.all(builds.map((b) => esbuild.context({ ...common, ...b })));
  await Promise.all(ctxs.map((c) => c.watch()));
  copyStatic();
  makeIcons();
  console.log('anti-censor: watching for changes…');
} else {
  await Promise.all(builds.map((b) => esbuild.build({ ...common, ...b })));
  copyStatic();
  makeIcons();
  console.log('anti-censor: built dist/');
}
