import { describe, it, expect } from 'vitest';
import { suppressPrnu, highFrequencyEnergy } from '../../src/core/transforms/prnu';
import { ssim } from '../../src/core/metrics/ssim';
import { addGaussianNoise } from '../../src/core/transforms/noise';
import { photoLike } from '../fixtures';

describe('suppressPrnu', () => {
  // Simulate a sensor fingerprint as fine high-frequency noise on a base image.
  const base = photoLike(128, 128, 17);
  const noisy = addGaussianNoise(base, { amplitude: 6, seed: 42 });

  it('reduces high-frequency (PRNU-band) energy', () => {
    const before = highFrequencyEnergy(noisy);
    const after = highFrequencyEnergy(suppressPrnu(noisy, { strength: 0.5 }));
    expect(after).toBeLessThan(before);
  });

  it('stays visually faithful at mild strength', () => {
    const out = suppressPrnu(noisy, { strength: 0.35 });
    expect(ssim(noisy, out)).toBeGreaterThan(0.9);
  });

  it('is (near) identity at zero strength', () => {
    const out = suppressPrnu(noisy, { strength: 0 });
    expect(ssim(noisy, out)).toBeGreaterThan(0.999);
  });

  it('is deterministic and does not mutate input', () => {
    const copy = Array.from(noisy.data);
    const a = suppressPrnu(noisy, { strength: 0.4 });
    const b = suppressPrnu(noisy, { strength: 0.4 });
    expect(Array.from(a.data)).toEqual(Array.from(b.data));
    expect(Array.from(noisy.data)).toEqual(copy);
  });
});
