import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { chromium, type Browser } from 'playwright';
import * as esbuild from 'esbuild';
import { existsSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));

function resolveExecutable(): string | undefined {
  const candidates = [
    process.env.PW_CHROMIUM,
    '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  ].filter(Boolean) as string[];
  return candidates.find((p) => existsSync(p));
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

  // WebCodecs (VideoEncoder) requires a secure context; http://127.0.0.1 is
  // treated as trustworthy, unlike about:blank from setContent.
  server = createServer((_req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end('<!doctype html><html><body></body></html>');
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()));
  const addr = server.address();
  const port = typeof addr === 'object' && addr ? addr.port : 0;
  baseUrl = `http://127.0.0.1:${port}/`;

  const executablePath = resolveExecutable();
  browser = await chromium.launch({
    ...(executablePath ? { executablePath } : {}),
    args: ['--no-sandbox'],
  });
});

afterAll(async () => {
  await browser?.close();
  await new Promise<void>((r) => server?.close(() => r()));
});

async function securePage() {
  const page = await browser.newPage();
  await page.goto(baseUrl);
  await page.addScriptTag({ content: harnessJs });
  return page;
}

// In-page helpers: build a small structured, animated frame set.
const HELPERS = `
  globalThis.makeFrames = function (w, h, n) {
    const frames = [];
    for (let i = 0; i < n; i++) {
      const c = document.createElement('canvas'); c.width = w; c.height = h;
      const ctx = c.getContext('2d');
      const g = ctx.createLinearGradient(0, 0, w, h);
      g.addColorStop(0, '#204080'); g.addColorStop(1, '#c8d0a0');
      ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = '#e02040';
      const x = (i / n) * (w - 24);
      ctx.fillRect(x, h * 0.4, 24, 24); // moving block => frames differ
      const id = ctx.getImageData(0, 0, w, h);
      frames.push({ width: w, height: h, data: id.data });
    }
    return frames;
  };
  globalThis.magic4 = async function (blob) {
    const b = new Uint8Array(await blob.arrayBuffer());
    return [b[0], b[1], b[2], b[3]];
  };
`;

describe('video adapter in real Chromium', () => {
  it('encodes frames to a valid WebM (EBML magic, non-empty)', async () => {
    const page = await securePage();
    const res = await page.evaluate(async (helpers) => {
      // eslint-disable-next-line no-eval
      eval(helpers);
      const AC = (window as any).AC;
      const frames = (globalThis as any).makeFrames(96, 96, 10);
      const blob: Blob = await AC.encodeFramesToWebm(frames, { fps: 15 });
      return { size: blob.size, type: blob.type, magic: await (globalThis as any).magic4(blob) };
    }, HELPERS);
    await page.close();
    expect(res.size).toBeGreaterThan(0);
    expect(res.type).toContain('webm');
    // EBML / Matroska magic: 0x1A 0x45 0xDF 0xA3
    expect(res.magic).toEqual([0x1a, 0x45, 0xdf, 0xa3]);
  });

  it('encodes obfuscated audio to a valid, loadable Opus/WebM', async () => {
    const page = await securePage();
    const res = await page.evaluate(async () => {
      const AC = (window as any).AC;
      const sr = 48000;
      const secs = 0.5;
      const n = sr * secs;
      const ch = new Float32Array(n);
      for (let i = 0; i < n; i++) ch[i] = Math.sin((2 * Math.PI * 330 * i) / sr) * 0.3;
      const { channels, sampleRate } = AC.obfuscateAudio([ch], sr, { pitch: 1.03, seed: 1 });
      const blob: Blob = await AC.encodeAudioOnlyWebm(channels, sampleRate);
      const magic = Array.from(new Uint8Array(await blob.arrayBuffer()).slice(0, 4));

      const url = URL.createObjectURL(blob);
      const a = document.createElement('audio');
      a.src = url;
      const dur = await new Promise<number>((r) => {
        a.onloadedmetadata = () => r(a.duration);
        a.onerror = () => r(-1);
      });
      URL.revokeObjectURL(url);
      return { size: blob.size, type: blob.type, magic, dur };
    });
    await page.close();
    expect(res.size).toBeGreaterThan(0);
    expect(res.type).toContain('webm');
    expect(res.magic).toEqual([0x1a, 0x45, 0xdf, 0xa3]);
    expect(res.dur).toBeGreaterThan(0); // decodes/plays
  });

  it('processVideo produces a playable WebM whose frames are transformed', async () => {
    const page = await securePage();
    const res = await page.evaluate(async (helpers) => {
      // eslint-disable-next-line no-eval
      eval(helpers);
      const AC = (window as any).AC;
      const src = (globalThis as any).makeFrames(96, 96, 10);
      const sourceWebm: Blob = await AC.encodeFramesToWebm(src, { fps: 15 });

      const out: Blob = await AC.processVideo(sourceWebm, { strength: 0.4, seed: 1, fps: 15 });

      // Confirm the output loads and plays in a <video>.
      const url = URL.createObjectURL(out);
      const v = document.createElement('video');
      v.muted = true;
      v.src = url;
      const meta = await new Promise<{ w: number; h: number; dur: number } | null>((r) => {
        v.onloadeddata = () => r({ w: v.videoWidth, h: v.videoHeight, dur: v.duration });
        v.onerror = () => r(null);
      });

      // Decode the output back to frames and compare against the source rasters.
      const outFrames = await AC.extractFrames(out, 15);
      let moved = 0;
      if (outFrames.length > 0) {
        moved = AC.hamming(AC.pHash(src[0]), AC.pHash(outFrames[0]));
      }
      URL.revokeObjectURL(url);
      return { size: out.size, type: out.type, meta, outCount: outFrames.length, moved };
    }, HELPERS);
    await page.close();

    expect(res.size).toBeGreaterThan(0);
    expect(res.type).toContain('webm');
    expect(res.meta).not.toBeNull();
    expect(res.meta!.w).toBe(96);
    expect(res.meta!.h).toBe(96);
    expect(res.outCount).toBeGreaterThan(0);
    // a re-decoded output frame differs from the original (transform survived encode)
    expect(res.moved).toBeGreaterThan(4);
  });
});
