import { describe, it, expect } from 'vitest';
import { transformImage } from '../../src/core/pipeline';
import { pHash } from '../../src/core/hash/phash';
import { wHash } from '../../src/core/hash/whash';
import { blockHash } from '../../src/core/hash/blockhash';
import { pdqHash } from '../../src/core/hash/pdq';
import { hamming } from '../../src/core/hash/hamming';
import { ssim } from '../../src/core/metrics/ssim';
import { photoLike } from '../fixtures';

describe('transformImage pipeline', () => {
  it('moves aHash, dHash AND pHash past a match threshold while staying faithful', () => {
    for (const seed of [21, 5, 99]) {
      const img = photoLike(160, 160, seed);
      const r = transformImage(img, { seed: 1 });
      expect(r.passed).toBe(true);
      // all three classic hashes beaten well past typical match thresholds (~10)
      expect(r.metrics.aHashDistance).toBeGreaterThanOrEqual(12);
      expect(r.metrics.dHashDistance).toBeGreaterThanOrEqual(12);
      expect(r.metrics.pHashDistance).toBeGreaterThanOrEqual(12);
      expect(r.metrics.ssim).toBeGreaterThanOrEqual(0.75);
      // the reported metrics match an independent recomputation
      expect(hamming(pHash(img), pHash(r.image))).toBe(r.metrics.pHashDistance);
      expect(ssim(img, r.image)).toBeCloseTo(r.metrics.ssim, 6);
      // ...and it also defeats the rest of the deployed hash family (wHash,
      // blockhash, PDQ) past their match thresholds (~7/64, ~26/256, 31/256).
      expect(hamming(wHash(img), wHash(r.image))).toBeGreaterThanOrEqual(8);
      expect(hamming(blockHash(img), blockHash(r.image))).toBeGreaterThanOrEqual(20);
      expect(hamming(pdqHash(img), pdqHash(r.image))).toBeGreaterThan(31);
    }
  });

  it('opt-in elastic+carve mode passes and hammers PDQ while staying faithful', () => {
    for (const seed of [21, 5, 99]) {
      const img = photoLike(160, 160, seed);
      const r = transformImage(img, { seed: 1, elastic: true, carve: true });
      expect(r.passed).toBe(true);
      expect(hamming(pdqHash(img), pdqHash(r.image))).toBeGreaterThan(50);
      expect(r.metrics.ssim).toBeGreaterThanOrEqual(0.75);
    }
  });

  it('keeps output dimensions', () => {
    const img = photoLike(128, 96, 3);
    const r = transformImage(img, { seed: 2 });
    expect(r.image.width).toBe(128);
    expect(r.image.height).toBe(96);
  });

  it('is deterministic for the same input and options', () => {
    const img = photoLike(128, 128, 7);
    const a = transformImage(img, { seed: 5 });
    const b = transformImage(img, { seed: 5 });
    expect(Array.from(a.image.data)).toEqual(Array.from(b.image.data));
  });

  it('does not mutate the input', () => {
    const img = photoLike(96, 96, 4);
    const copy = Array.from(img.data);
    transformImage(img, { seed: 1 });
    expect(Array.from(img.data)).toEqual(copy);
  });

  it('trades fidelity for strength (higher strength => lower SSIM)', () => {
    const img = photoLike(160, 160, 21);
    const low = transformImage(img, { strength: 0.2, seed: 1, minSsim: 0.5 });
    const high = transformImage(img, { strength: 0.85, seed: 1, minSsim: 0.5 });
    expect(high.metrics.ssim).toBeLessThan(low.metrics.ssim);
  });

  it('different seeds produce different outputs', () => {
    const img = photoLike(128, 128, 8);
    const a = transformImage(img, { seed: 1 });
    const b = transformImage(img, { seed: 2 });
    expect(Array.from(a.image.data)).not.toEqual(Array.from(b.image.data));
  });
});
