import { describe, it, expect } from 'vitest';
import {
  maximizeAverageHash,
  maximizePerceptualHash,
  maximizeDifferenceHash,
  addLowFrequencyField,
} from '../../src/core/transforms/perceptual';
import { aHash } from '../../src/core/hash/ahash';
import { dHash } from '../../src/core/hash/dhash';
import { pHash } from '../../src/core/hash/phash';
import { hamming } from '../../src/core/hash/hamming';
import { ssim } from '../../src/core/metrics/ssim';
import { photoLike } from '../fixtures';

describe('maximizeAverageHash', () => {
  const img = photoLike(128, 128, 21);

  it('moves the average hash well past a match threshold while staying faithful', () => {
    const out = maximizeAverageHash(img, { amplitude: 18, margin: 3 });
    expect(out.width).toBe(img.width);
    expect(out.height).toBe(img.height);
    expect(hamming(aHash(img), aHash(out))).toBeGreaterThan(14); // match thr ~5-10
    expect(ssim(img, out)).toBeGreaterThan(0.9);
  });

  it('is deterministic', () => {
    const a = maximizeAverageHash(img, { amplitude: 18, margin: 3 });
    const b = maximizeAverageHash(img, { amplitude: 18, margin: 3 });
    expect(Array.from(a.data)).toEqual(Array.from(b.data));
  });

  it('does not mutate the input', () => {
    const copy = Array.from(img.data);
    maximizeAverageHash(img, { amplitude: 18 });
    expect(Array.from(img.data)).toEqual(copy);
  });

  it('flips more bits at higher amplitude', () => {
    const weak = hamming(aHash(img), aHash(maximizeAverageHash(img, { amplitude: 6 })));
    const strong = hamming(aHash(img), aHash(maximizeAverageHash(img, { amplitude: 28 })));
    expect(strong).toBeGreaterThan(weak);
  });
});

describe('maximizePerceptualHash', () => {
  it('moves pHash far on multiple images while staying faithful', () => {
    for (const seed of [21, 5, 99]) {
      const img = photoLike(128, 128, seed);
      const out = maximizePerceptualHash(img, { amplitude: 22, margin: 2 });
      expect(hamming(pHash(img), pHash(out))).toBeGreaterThan(14); // pHash match thr ~10
      expect(ssim(img, out)).toBeGreaterThan(0.92);
    }
  });

  it('never touches the DC coefficient (no brightness shift)', () => {
    const img = photoLike(96, 96, 3);
    const out = maximizePerceptualHash(img, { amplitude: 22 });
    const meanOf = (d: Uint8ClampedArray) => {
      let s = 0;
      let n = 0;
      for (let i = 0; i < d.length; i++) if (i % 4 !== 3) (s += d[i]!), n++;
      return s / n;
    };
    expect(Math.abs(meanOf(out.data) - meanOf(img.data))).toBeLessThan(1.5);
  });

  it('is deterministic and does not mutate the input', () => {
    const img = photoLike(96, 96, 8);
    const copy = Array.from(img.data);
    const a = maximizePerceptualHash(img, { amplitude: 22 });
    const b = maximizePerceptualHash(img, { amplitude: 22 });
    expect(Array.from(a.data)).toEqual(Array.from(b.data));
    expect(Array.from(img.data)).toEqual(copy);
  });
});

describe('maximizeDifferenceHash', () => {
  it('moves dHash past a match threshold while staying faithful', () => {
    for (const seed of [21, 5, 99]) {
      const img = photoLike(128, 128, seed);
      const out = maximizeDifferenceHash(img, { amplitude: 20, margin: 3 });
      expect(hamming(dHash(img), dHash(out))).toBeGreaterThan(12);
      expect(ssim(img, out)).toBeGreaterThan(0.88);
    }
  });

  it('is deterministic and does not mutate the input', () => {
    const img = photoLike(96, 96, 7);
    const copy = Array.from(img.data);
    const a = maximizeDifferenceHash(img, { amplitude: 20 });
    const b = maximizeDifferenceHash(img, { amplitude: 20 });
    expect(Array.from(a.data)).toEqual(Array.from(b.data));
    expect(Array.from(img.data)).toEqual(copy);
  });
});

describe('addLowFrequencyField', () => {
  const img = photoLike(128, 128, 5);

  it('perturbs the image while staying visually faithful', () => {
    const out = addLowFrequencyField(img, { grid: 16, amplitude: 10, seed: 7 });
    expect(Array.from(out.data)).not.toEqual(Array.from(img.data));
    expect(ssim(img, out)).toBeGreaterThan(0.9);
  });

  it('does not shift overall brightness (zero-mean field)', () => {
    const out = addLowFrequencyField(img, { grid: 16, amplitude: 12, seed: 7 });
    const meanOf = (d: Uint8ClampedArray) => {
      let s = 0;
      let n = 0;
      for (let i = 0; i < d.length; i++) if (i % 4 !== 3) (s += d[i]!), n++;
      return s / n;
    };
    expect(Math.abs(meanOf(out.data) - meanOf(img.data))).toBeLessThan(1.5);
  });

  it('is reproducible per seed and varies across seeds', () => {
    const a = addLowFrequencyField(img, { grid: 16, amplitude: 12, seed: 7 });
    const b = addLowFrequencyField(img, { grid: 16, amplitude: 12, seed: 7 });
    const c = addLowFrequencyField(img, { grid: 16, amplitude: 12, seed: 8 });
    expect(Array.from(a.data)).toEqual(Array.from(b.data));
    expect(Array.from(a.data)).not.toEqual(Array.from(c.data));
  });
});
