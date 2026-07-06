import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { chromium, type Browser } from 'playwright';
import * as esbuild from 'esbuild';
import { existsSync, readFileSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const distDir = resolve(here, '..', 'node_modules', 'onnxruntime-web', 'dist');
const modelPath = resolve(here, 'assets', 'tiny-add.onnx');

function execPath(): string | undefined {
  return [process.env.PW_CHROMIUM, '/opt/pw-browsers/chromium-1194/chrome-linux/chrome']
    .filter(Boolean)
    .find((p) => existsSync(p as string)) as string | undefined;
}

function contentType(name: string): string {
  if (name.endsWith('.wasm')) return 'application/wasm';
  if (name.endsWith('.mjs') || name.endsWith('.js')) return 'text/javascript';
  if (name.endsWith('.onnx')) return 'application/octet-stream';
  return 'text/html';
}

let browser: Browser;
let harnessJs: string;
let server: Server;
let baseUrl: string;

beforeAll(async () => {
  const built = await esbuild.build({
    entryPoints: [resolve(here, 'ort.harness.ts')],
    bundle: true,
    format: 'iife',
    platform: 'browser',
    write: false,
    target: ['chrome110'],
    logLevel: 'silent',
  });
  harnessJs = built.outputFiles[0]!.text;

  server = createServer((req, res) => {
    const url = (req.url ?? '/').split('?')[0]!;
    try {
      if (url === '/' || url === '') {
        res.writeHead(200, { 'Content-Type': 'text/html' });
        return res.end('<!doctype html><html><body></body></html>');
      }
      if (url === '/model.onnx') {
        res.writeHead(200, { 'Content-Type': 'application/octet-stream' });
        return res.end(readFileSync(modelPath));
      }
      if (url.startsWith('/dist/')) {
        const name = url.slice('/dist/'.length);
        const file = resolve(distDir, name);
        if (!file.startsWith(distDir) || !existsSync(file)) {
          res.writeHead(404);
          return res.end();
        }
        res.writeHead(200, { 'Content-Type': contentType(name) });
        return res.end(readFileSync(file));
      }
      res.writeHead(404);
      res.end();
    } catch (e) {
      res.writeHead(500);
      res.end(String(e));
    }
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()));
  const addr = server.address();
  baseUrl = `http://127.0.0.1:${typeof addr === 'object' && addr ? addr.port : 0}/`;

  const executablePath = execPath();
  browser = await chromium.launch({
    ...(executablePath ? { executablePath } : {}),
    args: ['--no-sandbox', '--enable-unsafe-webgpu', '--enable-features=Vulkan', '--use-angle=vulkan'],
  });
});

afterAll(async () => {
  await browser?.close();
  await new Promise<void>((r) => server?.close(() => r()));
});

describe('onnxruntime-web runtime spike (Phase 2)', () => {
  it('loads ORT-web and runs a real compute (webgpu, falling back to wasm)', async () => {
    const page = await browser.newPage();
    await page.goto(baseUrl);
    await page.addScriptTag({ content: harnessJs });
    const res = await page.evaluate(
      async ({ model, wasm }) => (globalThis as any).runOrt(model, wasm),
      { model: `${baseUrl}model.onnx`, wasm: `${baseUrl}dist/` },
    );
    await page.close();

    // eslint-disable-next-line no-console
    console.log('[ort] result =', JSON.stringify(res));
    // Add(X, X) on [1,2,3,4] => [2,4,6,8], proving the runtime executed correctly.
    expect(res.error, res.error).toBeUndefined();
    expect(['webgpu', 'wasm']).toContain(res.ep);
    expect(res.y).toEqual([2, 4, 6, 8]);
  }, 90000);
});
