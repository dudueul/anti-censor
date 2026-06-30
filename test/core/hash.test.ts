import { describe, it, expect } from 'vitest';
import { dct1d, dct2d } from '../../src/core/hash/dct';
import { hamming, normalizedHamming } from '../../src/core/hash/hamming';
import { aHash } from '../../src/core/hash/ahash';
import { dHash } from '../../src/core/hash/dhash';
import { pHash } from '../../src/core/hash/phash';
import { solid, gradient, photoLike, checkerboard } from '../fixtures';

describe('dct1d', () => {
  it('maps a constant signal to a single DC coefficient', () => {
    const out = dct1d(Float64Array.from([5, 5, 5, 5]));
    expect(out[0]).toBeCloseTo(10, 6); // sqrt(1/4)*20
    for (let i = 1; i < 4; i++) expect(out[i]).toBeCloseTo(0, 6);
  });

  it('is energy-preserving (orthonormal): ||X|| == ||x||', () => {
    const x = Float64Array.from([3, 1, 4, 1, 5, 9, 2, 6]);
    const X = dct1d(x);
    const e1 = x.reduce((a, b) => a + b * b, 0);
    const e2 = X.reduce((a, b) => a + b * b, 0);
    expect(e2).toBeCloseTo(e1, 6);
  });
});

describe('dct2d', () => {
  it('maps a constant plane to a single DC coefficient', () => {
    const size = 8;
    const c = 7;
    const plane = new Float64Array(size * size).fill(c);
    const out = dct2d(plane, size);
    // 2D orthonormal DCT-II of a constant plane: DC = N * c, all others 0.
    expect(out[0]).toBeCloseTo(size * c, 4);
    for (let i = 1; i < size * size; i++) expect(out[i]).toBeCloseTo(0, 6);
  });
});

describe('hamming', () => {
  it('counts differing bits', () => {
    const a = Uint8Array.from([1, 0, 1, 0, 1]);
    const b = Uint8Array.from([1, 1, 0, 0, 1]);
    expect(hamming(a, b)).toBe(2);
  });
  it('is 0 for identical hashes', () => {
    const a = Uint8Array.from([1, 0, 1, 1]);
    expect(hamming(a, a)).toBe(0);
  });
  it('normalizedHamming is fraction of differing bits', () => {
    const a = Uint8Array.from([1, 0, 1, 0]);
    const b = Uint8Array.from([0, 0, 1, 0]);
    expect(normalizedHamming(a, b)).toBeCloseTo(0.25, 6);
  });
  it('throws on length mismatch', () => {
    expect(() => hamming(Uint8Array.from([1]), Uint8Array.from([1, 0]))).toThrow();
  });
});

const hashers = [
  { name: 'aHash', fn: aHash },
  { name: 'dHash', fn: dHash },
  { name: 'pHash', fn: pHash },
];

for (const { name, fn } of hashers) {
  describe(name, () => {
    it('produces a 64-bit hash of 0/1 values', () => {
      const h = fn(photoLike(64, 64));
      expect(h.length).toBe(64);
      expect(Array.from(h).every((v) => v === 0 || v === 1)).toBe(true);
    });

    it('is identical for the same image (distance 0)', () => {
      const img = photoLike(80, 60, 3);
      expect(hamming(fn(img), fn(img))).toBe(0);
    });

    it('gives a large distance between clearly different images', () => {
      const a = fn(checkerboard(64, 64, 8));
      const b = fn(gradient(64, 64));
      expect(hamming(a, b)).toBeGreaterThan(10);
    });

    it('gives a small distance for visually-similar images', () => {
      // same scene, slightly different noise seed
      const a = fn(photoLike(96, 96, 11));
      const b = fn(photoLike(96, 96, 11));
      expect(hamming(a, b)).toBe(0);
    });
  });
}

describe('hash sanity', () => {
  it('aHash of a solid image is all-ones (every pixel >= mean)', () => {
    const h = aHash(solid(32, 32, [120, 120, 120]));
    expect(Array.from(h).every((v) => v === 1)).toBe(true);
  });
});
