import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { chromium, type Browser } from 'playwright';
import * as esbuild from 'esbuild';
import { existsSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));

function resolveExecutable(): string | undefined {
  return [process.env.PW_CHROMIUM, '/opt/pw-browsers/chromium-1194/chrome-linux/chrome']
    .filter(Boolean)
    .find((p) => existsSync(p as string)) as string | undefined;
}

let browser: Browser;
let harnessJs: string;
let server: Server;
let baseUrl: string;

beforeAll(async () => {
  const built = await esbuild.build({
    entryPoints: [resolve(here, 'harness.entry.ts')],
    bundle: true,
    format: 'iife',
    globalName: 'AC',
    write: false,
    target: ['chrome110'],
  });
  harnessJs = built.outputFiles[0]!.text;

  server = createServer((_req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end('<!doctype html><html><body></body></html>');
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()));
  const addr = server.address();
  baseUrl = `http://127.0.0.1:${typeof addr === 'object' && addr ? addr.port : 0}/`;

  const executablePath = resolveExecutable();
  browser = await chromium.launch({
    ...(executablePath ? { executablePath } : {}),
    // Enable the WebGPU adapter (software/SwiftShader in a headless sandbox).
    args: ['--no-sandbox', '--enable-unsafe-webgpu', '--enable-features=Vulkan', '--use-angle=vulkan'],
  });
});

afterAll(async () => {
  await browser?.close();
  await new Promise<void>((r) => server?.close(() => r()));
});

describe('WebGPU capability gate in real Chromium', () => {
  it('detects an adapter and withholds regeneration on a software backend', async () => {
    const page = await browser.newPage();
    await page.goto(baseUrl);
    await page.addScriptTag({ content: harnessJs });
    const status = await page.evaluate(async () => (window as any).AC.detectWebGpu());
    await page.close();

    // eslint-disable-next-line no-console
    console.log('[webgpu] status =', JSON.stringify(status));
    expect(typeof status.available).toBe('boolean');
    if (status.available) {
      // headless/CI backends are software => the gate must NOT offer regeneration
      expect(status.adapter.software).toBe(true);
      expect(status.adapter.suitable).toBe(false);
      expect(typeof status.adapter.fp16).toBe('boolean');
    }
  });
});
