import { describe, it, expect } from 'vitest';
import { simulateJpeg } from '../../src/core/transforms/quantize';
import { dctBandJitter } from '../../src/core/transforms/frequency';
import {
  disruptWatermark,
  watermarkEfficacyReport,
} from '../../src/core/transforms/watermark';
import { ssim } from '../../src/core/metrics/ssim';
import { psnr } from '../../src/core/metrics/psnr';
import { photoLike } from '../fixtures';
import {
  embedLsb,
  readLsb,
  embedDctSign,
  readDctSign,
  bitError,
} from '../watermark';

describe('simulateJpeg', () => {
  const img = photoLike(128, 128, 4);

  it('stays faithful at default quality and keeps brightness (DC preserved)', () => {
    const out = simulateJpeg(img, { quality: 88, seed: 1 });
    expect(ssim(img, out)).toBeGreaterThan(0.9);
    expect(psnr(img, out)).toBeGreaterThan(34);
    const meanOf = (d: Uint8ClampedArray) => {
      let s = 0;
      let n = 0;
      for (let i = 0; i < d.length; i++) if (i % 4 !== 3) (s += d[i]!), n++;
      return s / n;
    };
    expect(Math.abs(meanOf(out.data) - meanOf(img.data))).toBeLessThan(1.5);
  });

  it('destroys an LSB payload (bit accuracy ~chance)', () => {
    const bits = Array.from({ length: 200 }, (_, i) => (i * 7) % 2);
    const after = simulateJpeg(embedLsb(img, bits), { quality: 88, seed: 1 });
    const recovered = readLsb(after, 200);
    expect(bitError(bits, recovered)).toBeGreaterThan(0.3);
  });

  it('loses more fidelity as quality drops', () => {
    expect(ssim(img, simulateJpeg(img, { quality: 90 }))).toBeGreaterThan(
      ssim(img, simulateJpeg(img, { quality: 60 })),
    );
  });

  it('is deterministic and does not mutate input', () => {
    const copy = Array.from(img.data);
    const a = simulateJpeg(img, { quality: 80, seed: 2 });
    const b = simulateJpeg(img, { quality: 80, seed: 2 });
    expect(Array.from(a.data)).toEqual(Array.from(b.data));
    expect(Array.from(img.data)).toEqual(copy);
  });
});

describe('dctBandJitter', () => {
  const img = photoLike(128, 128, 4);

  it('disrupts a weak mid-band spread watermark while staying faithful', () => {
    const wm = embedDctSign(img, 1, 3, 2, 6); // weak strength
    const clean = readDctSign(wm, 3, 2);
    const out = dctBandJitter(wm, { coeffJitter: 10, maxSpatial: 14, seed: 5 });
    expect(bitError(clean, readDctSign(out, 3, 2))).toBeGreaterThan(0.15);
    expect(ssim(wm, out)).toBeGreaterThan(0.85);
  });

  it('preserves brightness (DC untouched) and is deterministic', () => {
    const a = dctBandJitter(img, { seed: 3 });
    const b = dctBandJitter(img, { seed: 3 });
    expect(Array.from(a.data)).toEqual(Array.from(b.data));
    const meanOf = (d: Uint8ClampedArray) => {
      let s = 0;
      let n = 0;
      for (let i = 0; i < d.length; i++) if (i % 4 !== 3) (s += d[i]!), n++;
      return s / n;
    };
    expect(Math.abs(meanOf(a.data) - meanOf(img.data))).toBeLessThan(1.5);
  });
});

describe('disruptWatermark', () => {
  const img = photoLike(128, 128, 4);

  it('destroys a strong block-aligned DCT watermark via geometry desync', () => {
    const wm = embedDctSign(img, 1, 3, 2, 24);
    const clean = readDctSign(wm, 3, 2);
    const { image } = disruptWatermark(wm, { aggression: 0.5, seed: 7 });
    expect(bitError(clean, readDctSign(image, 3, 2))).toBeGreaterThan(0.4);
  });

  it('destroys an LSB payload', () => {
    const bits = Array.from({ length: 200 }, (_, i) => (i * 5) % 2);
    const { image } = disruptWatermark(embedLsb(img, bits), { aggression: 0.5, seed: 7 });
    expect(bitError(bits, readLsb(image, 200))).toBeGreaterThan(0.4);
  });

  it('reports learned-robust marks as NOT defeated (honesty contract)', () => {
    const { report } = disruptWatermark(img, { seed: 1 });
    const byName = (s: string) => report.find((r) => r.scheme.includes(s));
    expect(byName('SynthID')?.status).toBe('not-defeated');
    expect(byName('Tree-Ring')?.status).toBe('not-defeated');
    expect(byName('StegaStamp')?.status).toBe('not-defeated');
    expect(byName('SynthID')?.reason.length).toBeGreaterThan(10);
    // classical marks are defeated
    expect(byName('LSB')?.status).toBe('defeated');
  });

  it('efficacy report is independent of input and stable', () => {
    expect(watermarkEfficacyReport()).toEqual(watermarkEfficacyReport());
  });
});
