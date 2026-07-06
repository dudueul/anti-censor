import { describe, it, expect } from 'vitest';
import { geometricJitter } from '../../src/core/transforms/geometry';
import { aHash } from '../../src/core/hash/ahash';
import { dHash } from '../../src/core/hash/dhash';
import { pHash } from '../../src/core/hash/phash';
import { hamming } from '../../src/core/hash/hamming';
import { ssim } from '../../src/core/metrics/ssim';
import { photoLike } from '../fixtures';

describe('geometricJitter', () => {
  const img = photoLike(128, 128, 12);

  it('keeps the output dimensions', () => {
    const out = geometricJitter(img, { rotateDeg: 1.5, scale: 1.03 });
    expect(out.width).toBe(img.width);
    expect(out.height).toBe(img.height);
  });

  it('is the identity for neutral parameters', () => {
    const out = geometricJitter(img, { rotateDeg: 0, scale: 1, translateX: 0, translateY: 0 });
    expect(Array.from(out.data)).toEqual(Array.from(img.data));
  });

  it('moves perceptual hashes with a subtle rotate+zoom', () => {
    const out = geometricJitter(img, { rotateDeg: 1.5, scale: 1.04, translateX: 1 });
    const moved = hamming(aHash(img), aHash(out)) + hamming(pHash(img), pHash(out));
    expect(moved).toBeGreaterThan(4);
    // still recognisably the same picture
    expect(ssim(img, out)).toBeGreaterThan(0.6);
  });

  it('does not mutate the input', () => {
    const copy = Array.from(img.data);
    geometricJitter(img, { rotateDeg: 2, scale: 1.05 });
    expect(Array.from(img.data)).toEqual(copy);
  });

  it('horizontal flip near-complements dHash', () => {
    const out = geometricJitter(img, { flip: true });
    expect(out.width).toBe(img.width);
    expect(hamming(dHash(img), dHash(out))).toBeGreaterThan(45);
  });

  it('asymmetric crop+rescale moves hashes at fixed dimensions', () => {
    const out = geometricJitter(img, { cropLeft: 0.05, cropTop: 0.03, cropRight: 0.02 });
    expect(out.width).toBe(img.width);
    expect(out.height).toBe(img.height);
    const moved = hamming(aHash(img), aHash(out)) + hamming(pHash(img), pHash(out));
    expect(moved).toBeGreaterThan(4);
    expect(ssim(img, out)).toBeGreaterThan(0.6);
  });

  it('anamorphic (per-axis) scale differs from uniform scale', () => {
    const uniform = geometricJitter(img, { scale: 1.05 });
    const anam = geometricJitter(img, { scaleX: 1.05, scaleY: 1.0 });
    expect(Array.from(anam.data)).not.toEqual(Array.from(uniform.data));
  });
});
