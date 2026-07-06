import { describe, it, expect } from 'vitest';
import { seamCarve, energyMap } from '../../src/core/transforms/seam';
import { pHash } from '../../src/core/hash/phash';
import { pdqHash } from '../../src/core/hash/pdq';
import { hamming } from '../../src/core/hash/hamming';
import { ssim } from '../../src/core/metrics/ssim';
import { photoLike, solid } from '../fixtures';

describe('energyMap', () => {
  it('is ~zero on a flat image and positive on edges', () => {
    const flat = energyMap(solid(16, 16, [120, 120, 120]));
    let sum = 0;
    for (const v of flat) sum += v;
    expect(sum).toBeCloseTo(0, 4);
  });
});

describe('seamCarve', () => {
  const img = photoLike(128, 128, 15);

  it('restores the original dimensions', () => {
    const out = seamCarve(img, { seams: 4, both: true });
    expect(out.width).toBe(img.width);
    expect(out.height).toBe(img.height);
  });

  it('strongly desyncs PDQ/PhotoDNA-class hashes and moves pHash, at high fidelity', () => {
    const out = seamCarve(img, { seams: 8, both: true });
    // Seam carving's headline strength is the larger grid/block hashes.
    expect(hamming(pdqHash(img), pdqHash(out))).toBeGreaterThan(40); // thr 31/256
    expect(hamming(pHash(img), pHash(out))).toBeGreaterThan(4);
    expect(ssim(img, out)).toBeGreaterThan(0.6);
  });

  it('is deterministic and does not mutate the input', () => {
    const copy = Array.from(img.data);
    const a = seamCarve(img, { seams: 4 });
    const b = seamCarve(img, { seams: 4 });
    expect(Array.from(a.data)).toEqual(Array.from(b.data));
    expect(Array.from(img.data)).toEqual(copy);
  });
});
