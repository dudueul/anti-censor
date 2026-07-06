import { describe, it, expect } from 'vitest';
import { haar2d, ihaar2d } from '../../src/core/hash/haar';
import { wHash } from '../../src/core/hash/whash';
import { blockHash } from '../../src/core/hash/blockhash';
import { pdqHash } from '../../src/core/hash/pdq';
import { hamming } from '../../src/core/hash/hamming';
import { photoLike, gradient, checkerboard } from '../fixtures';

describe('haar2d / ihaar2d', () => {
  it('round-trips within float epsilon', () => {
    const size = 8;
    const p = new Float64Array(size * size);
    for (let i = 0; i < p.length; i++) p[i] = (i * 13) % 61;
    const back = ihaar2d(haar2d(p, size, 3), size, 3);
    for (let i = 0; i < p.length; i++) expect(back[i]).toBeCloseTo(p[i]!, 6);
  });

  it('concentrates a constant plane into the LL coefficient', () => {
    const size = 8;
    const p = new Float64Array(size * size).fill(5);
    const c = haar2d(p, size, 3);
    // all detail coefficients ~0; LL (index 0) carries the energy
    for (let i = 1; i < c.length; i++) expect(c[i]).toBeCloseTo(0, 6);
    expect(Math.abs(c[0]!)).toBeGreaterThan(0);
  });
});

const family = [
  { name: 'wHash', fn: wHash, bits: 64 },
  { name: 'blockHash', fn: blockHash, bits: 256 },
  { name: 'pdqHash', fn: pdqHash, bits: 256 },
];

for (const { name, fn, bits } of family) {
  describe(name, () => {
    it(`produces a ${bits}-bit hash of 0/1 values`, () => {
      const h = fn(photoLike(96, 96, 3));
      expect(h.length).toBe(bits);
      expect(Array.from(h).every((v) => v === 0 || v === 1)).toBe(true);
    });

    it('is identical for the same image', () => {
      const img = photoLike(96, 96, 4);
      expect(hamming(fn(img), fn(img))).toBe(0);
    });

    it('gives a large distance between clearly different images', () => {
      const d = hamming(fn(checkerboard(64, 64, 8)), fn(gradient(64, 64)));
      expect(d).toBeGreaterThan(bits * 0.15);
    });
  });
}
