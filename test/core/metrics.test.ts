import { describe, it, expect } from 'vitest';
import { psnr, mse } from '../../src/core/metrics/psnr';
import { ssim } from '../../src/core/metrics/ssim';
import { cloneRaster } from '../../src/core/types';
import { photoLike, solid } from '../fixtures';
import { mulberry32 } from '../../src/core/prng';

function addNoise(img = photoLike(64, 64, 5), amp = 8, seed = 1) {
  const out = cloneRaster(img);
  const rng = mulberry32(seed);
  for (let i = 0; i < out.data.length; i++) {
    if (i % 4 === 3) continue; // skip alpha
    out.data[i] = out.data[i]! + (rng() - 0.5) * 2 * amp;
  }
  return out;
}

describe('mse / psnr', () => {
  it('mse is 0 and psnr is Infinity for identical images', () => {
    const img = photoLike(48, 48, 2);
    expect(mse(img, img)).toBe(0);
    expect(psnr(img, img)).toBe(Infinity);
  });

  it('psnr decreases as noise increases', () => {
    const base = photoLike(64, 64, 7);
    const low = psnr(base, addNoise(base, 4, 1));
    const high = psnr(base, addNoise(base, 30, 1));
    expect(low).toBeGreaterThan(high);
    expect(low).toBeLessThan(Infinity);
  });

  it('matches the closed-form value for a known MSE', () => {
    const a = solid(8, 8, [100, 100, 100]);
    const b = solid(8, 8, [110, 100, 100]); // R differs by 10 on every pixel
    // MSE over RGB = (10^2 + 0 + 0)/3 = 33.333...
    expect(mse(a, b)).toBeCloseTo(100 / 3, 6);
    expect(psnr(a, b)).toBeCloseTo(10 * Math.log10(255 * 255 / (100 / 3)), 4);
  });
});

describe('ssim', () => {
  it('is 1 for identical images', () => {
    const img = photoLike(64, 64, 9);
    expect(ssim(img, img)).toBeCloseTo(1, 6);
  });

  it('is symmetric', () => {
    const a = photoLike(64, 64, 1);
    const b = addNoise(a, 12, 3);
    expect(ssim(a, b)).toBeCloseTo(ssim(b, a), 10);
  });

  it('is high (>0.9) for a mildly noised image but below 1', () => {
    const a = photoLike(96, 96, 4);
    const b = addNoise(a, 6, 2);
    const s = ssim(a, b);
    expect(s).toBeGreaterThan(0.9);
    expect(s).toBeLessThan(1);
  });

  it('is low for completely different images', () => {
    const s = ssim(solid(64, 64, [255, 255, 255]), solid(64, 64, [0, 0, 0]));
    expect(s).toBeLessThan(0.2);
  });

  it('decreases monotonically with noise amplitude', () => {
    const base = photoLike(80, 80, 6);
    const s1 = ssim(base, addNoise(base, 5, 1));
    const s2 = ssim(base, addNoise(base, 20, 1));
    expect(s1).toBeGreaterThan(s2);
  });
});
