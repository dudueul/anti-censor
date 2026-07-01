import { describe, it, expect } from 'vitest';
import { adversarialTexture } from '../../src/core/transforms/adversarial';
import { injectDecoyWatermark, detectDecoy } from '../../src/core/transforms/decoy';
import { ssim } from '../../src/core/metrics/ssim';
import { photoLike, solid } from '../fixtures';

describe('adversarialTexture', () => {
  const img = photoLike(96, 96, 22);

  it('stays within the L-infinity budget on every channel', () => {
    const budget = 8;
    const out = adversarialTexture(img, { amplitude: 20, budget, seed: 1 });
    for (let i = 0; i < out.data.length; i++) {
      if (i % 4 === 3) continue;
      expect(Math.abs(out.data[i]! - img.data[i]!)).toBeLessThanOrEqual(budget);
    }
  });

  it('is luma-masked: a flat image is left essentially unchanged', () => {
    const flat = solid(64, 64, [128, 128, 128]);
    expect(ssim(flat, adversarialTexture(flat, { amplitude: 8, seed: 1 }))).toBeGreaterThan(0.999);
  });

  it('perturbs a textured image while staying faithful', () => {
    const out = adversarialTexture(img, { amplitude: 6, budget: 8, seed: 2 });
    expect(Array.from(out.data)).not.toEqual(Array.from(img.data));
    expect(ssim(img, out)).toBeGreaterThan(0.9);
  });

  it('is deterministic and does not mutate input', () => {
    const copy = Array.from(img.data);
    const a = adversarialTexture(img, { seed: 3 });
    const b = adversarialTexture(img, { seed: 3 });
    expect(Array.from(a.data)).toEqual(Array.from(b.data));
    expect(Array.from(img.data)).toEqual(copy);
  });
});

describe('decoy watermark', () => {
  const img = photoLike(128, 128, 23);

  it('a blind reader detects the injected decoy (constructive) at high fidelity', () => {
    expect(Math.abs(detectDecoy(img, { seed: 1 }))).toBeLessThan(0.5); // clean: no decoy
    const marked = injectDecoyWatermark(img, { seed: 1, strength: 20 });
    expect(detectDecoy(marked, { seed: 1 })).toBeGreaterThan(0.8);
    expect(ssim(img, marked)).toBeGreaterThan(0.9);
  });

  it('overlapping decoys confuse a single-payload reader', () => {
    const first = injectDecoyWatermark(img, { seed: 1, strength: 20 });
    const both = injectDecoyWatermark(first, { seed: 2, strength: 20 });
    // the second mark overwrites the coefficient sign, collapsing detection of the first
    expect(detectDecoy(both, { seed: 1 })).toBeLessThan(detectDecoy(first, { seed: 1 }));
  });

  it('is deterministic and does not mutate input', () => {
    const copy = Array.from(img.data);
    const a = injectDecoyWatermark(img, { seed: 5 });
    const b = injectDecoyWatermark(img, { seed: 5 });
    expect(Array.from(a.data)).toEqual(Array.from(b.data));
    expect(Array.from(img.data)).toEqual(copy);
  });
});
