import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { chromium, type Browser } from 'playwright';
import * as esbuild from 'esbuild';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const CHROMIUM =
  process.env.PW_CHROMIUM || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';

let browser: Browser;
let harnessJs: string;

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
  browser = await chromium.launch({ executablePath: CHROMIUM, args: ['--no-sandbox'] });
});

afterAll(async () => {
  await browser?.close();
});

async function pageWithHarness() {
  const page = await browser.newPage();
  await page.setContent('<!doctype html><html><body></body></html>');
  await page.addScriptTag({ content: harnessJs });
  return page;
}

// In-page helper source (stringified into evaluate): draw a structured image.
const DRAW = `
  globalThis.drawImage = function (w, h) {
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const ctx = c.getContext('2d');
    const g = ctx.createLinearGradient(0, 0, w, h);
    g.addColorStop(0, '#204080'); g.addColorStop(1, '#c8d0a0');
    ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#e02040'; ctx.beginPath(); ctx.arc(w*0.4, h*0.45, w*0.22, 0, 7); ctx.fill();
    ctx.fillStyle = '#101820'; ctx.fillRect(w*0.6, h*0.2, w*0.2, h*0.18);
    return c;
  }
`;

describe('adapter in real Chromium', () => {
  it('processBlob decodes, transforms and re-encodes: pHash moves, fidelity holds', async () => {
    const page = await pageWithHarness();
    const res = await page.evaluate(async (draw) => {
      // eslint-disable-next-line no-eval
      eval(draw);
      const AC = (window as any).AC;
      const w = 192, h = 192;
      const c = (globalThis as any).drawImage(w, h) as HTMLCanvasElement;
      const blob: Blob = await new Promise((r) => c.toBlob((b) => r(b!), 'image/png'));
      const before = await AC.blobToRaster(blob);
      const out: Blob = await AC.processBlob(blob, { strength: 0.4, seed: 1 });
      const after = await AC.blobToRaster(out);
      return {
        type: out.type,
        size: out.size,
        w: after.width,
        h: after.height,
        dP: AC.hamming(AC.pHash(before), AC.pHash(after)),
        ssim: AC.ssim(before, after),
      };
    }, DRAW);
    await page.close();

    expect(res.w).toBe(192);
    expect(res.h).toBe(192);
    expect(res.type).toContain('jpeg'); // default re-encode
    expect(res.size).toBeGreaterThan(0);
    expect(res.dP).toBeGreaterThan(8); // pHash moved past a match threshold
    expect(res.ssim).toBeGreaterThan(0.6);
  });

  it('honours output format and dimensions (png passthrough)', async () => {
    const page = await pageWithHarness();
    const res = await page.evaluate(async (draw) => {
      // eslint-disable-next-line no-eval
      eval(draw);
      const AC = (window as any).AC;
      const c = (globalThis as any).drawImage(160, 120) as HTMLCanvasElement;
      const blob: Blob = await new Promise((r) => c.toBlob((b) => r(b!), 'image/png'));
      const out: Blob = await AC.processBlob(blob, {
        strength: 0.3,
        seed: 2,
        outputType: 'image/png',
      });
      const after = await AC.blobToRaster(out);
      return { type: out.type, w: after.width, h: after.height };
    }, DRAW);
    await page.close();
    expect(res.type).toContain('png');
    expect(res.w).toBe(160);
    expect(res.h).toBe(120);
  });

  it('auto-intercept file swap works with the real File/DataTransfer/input.files APIs', async () => {
    const page = await pageWithHarness();
    const res = await page.evaluate(async (draw) => {
      // eslint-disable-next-line no-eval
      eval(draw);
      const AC = (window as any).AC;
      const input = document.createElement('input');
      input.type = 'file';
      document.body.appendChild(input);

      const c = (globalThis as any).drawImage(128, 128) as HTMLCanvasElement;
      const blob: Blob = await new Promise((r) => c.toBlob((b) => r(b!), 'image/png'));
      const orig = new File([blob], 'photo.png', { type: 'image/png' });

      const outBlob: Blob = await AC.processBlob(orig, { strength: 0.4, seed: 3 });
      const swapped = new File([outBlob], AC.outputName('photo.png', 'image/jpeg'), {
        type: outBlob.type,
      });
      const dt = new DataTransfer();
      dt.items.add(swapped);
      input.files = dt.files;

      return {
        count: input.files.length,
        name: input.files[0]!.name,
        type: input.files[0]!.type,
        size: input.files[0]!.size,
        differs: input.files[0]!.size !== orig.size,
      };
    }, DRAW);
    await page.close();

    expect(res.count).toBe(1);
    expect(res.name).toContain('anti-censor');
    expect(res.type).toContain('jpeg');
    expect(res.size).toBeGreaterThan(0);
    expect(res.differs).toBe(true);
  });
});
