import { describe, it, expect } from 'vitest';
import { addGaussianNoise } from '../../src/core/transforms/noise';
import { adjustTone } from '../../src/core/transforms/tone';
import { ssim } from '../../src/core/metrics/ssim';
import { photoLike, solid } from '../fixtures';

describe('addGaussianNoise', () => {
  const img = photoLike(96, 96, 4);

  it('changes the image but stays faithful at low amplitude', () => {
    const out = addGaussianNoise(img, { amplitude: 3, seed: 1 });
    expect(Array.from(out.data)).not.toEqual(Array.from(img.data));
    expect(ssim(img, out)).toBeGreaterThan(0.9);
  });

  it('is reproducible per seed and varies across seeds', () => {
    const a = addGaussianNoise(img, { amplitude: 4, seed: 1 });
    const b = addGaussianNoise(img, { amplitude: 4, seed: 1 });
    const c = addGaussianNoise(img, { amplitude: 4, seed: 2 });
    expect(Array.from(a.data)).toEqual(Array.from(b.data));
    expect(Array.from(a.data)).not.toEqual(Array.from(c.data));
  });

  it('does not mutate the input or touch alpha', () => {
    const copy = Array.from(img.data);
    const out = addGaussianNoise(img, { amplitude: 5 });
    expect(Array.from(img.data)).toEqual(copy);
    for (let i = 3; i < out.data.length; i += 4) expect(out.data[i]).toBe(img.data[i]);
  });

  it('lowers SSIM as amplitude grows', () => {
    const s1 = ssim(img, addGaussianNoise(img, { amplitude: 3, seed: 9 }));
    const s2 = ssim(img, addGaussianNoise(img, { amplitude: 15, seed: 9 }));
    expect(s1).toBeGreaterThan(s2);
  });
});

describe('adjustTone', () => {
  const img = photoLike(64, 64, 6);

  it('is the identity for neutral parameters', () => {
    const out = adjustTone(img, { brightness: 0, contrast: 1, gamma: 1 });
    expect(Array.from(out.data)).toEqual(Array.from(img.data));
  });

  it('brightness raises the mean luma', () => {
    const meanOf = (d: Uint8ClampedArray) => {
      let s = 0;
      let n = 0;
      for (let i = 0; i < d.length; i++) if (i % 4 !== 3) (s += d[i]!), n++;
      return s / n;
    };
    const out = adjustTone(img, { brightness: 10 });
    expect(meanOf(out.data)).toBeGreaterThan(meanOf(img.data));
  });

  it('contrast expands the dynamic range around mid-gray', () => {
    const dark = solid(8, 8, [60, 60, 60]);
    const out = adjustTone(dark, { contrast: 1.5 });
    // 60 -> (60-128)*1.5+128 = 26
    expect(out.data[0]).toBe(26);
  });

  it('gamma < 1 darkens midtones', () => {
    const mid = solid(8, 8, [128, 128, 128]);
    const out = adjustTone(mid, { gamma: 0.5 });
    expect(out.data[0]!).toBeLessThan(128);
  });

  it('mild adjustment stays visually faithful', () => {
    const out = adjustTone(img, { brightness: 4, contrast: 1.05, gamma: 0.97 });
    expect(ssim(img, out)).toBeGreaterThan(0.9);
  });

  it('does not mutate the input', () => {
    const copy = Array.from(img.data);
    adjustTone(img, { brightness: 20, contrast: 1.3 });
    expect(Array.from(img.data)).toEqual(copy);
  });
});
