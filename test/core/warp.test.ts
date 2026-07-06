import { describe, it, expect } from 'vitest';
import { elasticWarp } from '../../src/core/transforms/warp';
import { aHash } from '../../src/core/hash/ahash';
import { pHash } from '../../src/core/hash/phash';
import { hamming } from '../../src/core/hash/hamming';
import { ssim } from '../../src/core/metrics/ssim';
import { photoLike } from '../fixtures';

describe('elasticWarp', () => {
  const img = photoLike(128, 128, 14);

  it('keeps output dimensions', () => {
    const out = elasticWarp(img, { amplitude: 2, grid: 8, seed: 1 });
    expect(out.width).toBe(img.width);
    expect(out.height).toBe(img.height);
  });

  it('is (near) identity at zero amplitude', () => {
    const out = elasticWarp(img, { amplitude: 0, grid: 8, seed: 1 });
    expect(ssim(img, out)).toBeGreaterThan(0.999);
  });

  it('moves perceptual hashes with a small smooth displacement', () => {
    const out = elasticWarp(img, { amplitude: 2.5, grid: 10, seed: 3 });
    const moved = hamming(aHash(img), aHash(out)) + hamming(pHash(img), pHash(out));
    expect(moved).toBeGreaterThan(4);
    expect(ssim(img, out)).toBeGreaterThan(0.6);
  });

  it('is deterministic per seed, varies across seeds, does not mutate input', () => {
    const copy = Array.from(img.data);
    const a = elasticWarp(img, { amplitude: 2, grid: 8, seed: 5 });
    const b = elasticWarp(img, { amplitude: 2, grid: 8, seed: 5 });
    const c = elasticWarp(img, { amplitude: 2, grid: 8, seed: 6 });
    expect(Array.from(a.data)).toEqual(Array.from(b.data));
    expect(Array.from(a.data)).not.toEqual(Array.from(c.data));
    expect(Array.from(img.data)).toEqual(copy);
  });
});
