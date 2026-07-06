import { describe, it, expect } from 'vitest';
import { resizeBilinear } from '../../src/core/resample';

describe('resizeBilinear', () => {
  it('keeps a uniform plane uniform', () => {
    const out = resizeBilinear(new Float64Array(4).fill(9), 2, 2, 8, 8);
    for (const v of out) expect(v).toBeCloseTo(9, 6);
  });

  it('is identity at the same size (half-pixel mapping)', () => {
    const src = Float64Array.from([1, 2, 3, 4, 5, 6]);
    const out = resizeBilinear(src, 3, 2, 3, 2);
    for (let i = 0; i < src.length; i++) expect(out[i]).toBeCloseTo(src[i]!, 6);
  });

  it('interpolates a 1D ramp correctly', () => {
    // [0,100] upscaled to width 4 with half-pixel centers
    const out = resizeBilinear(Float64Array.from([0, 100]), 2, 1, 4, 1);
    expect(out[0]).toBeCloseTo(0, 6);
    expect(out[1]).toBeCloseTo(25, 6);
    expect(out[2]).toBeCloseTo(75, 6);
    expect(out[3]).toBeCloseTo(100, 6);
  });

  it('produces smooth (monotonic) interpolation upscaling a gradient', () => {
    const out = resizeBilinear(Float64Array.from([0, 50, 100]), 3, 1, 9, 1);
    for (let i = 1; i < out.length; i++) {
      expect(out[i]!).toBeGreaterThanOrEqual(out[i - 1]! - 1e-9);
    }
  });
});
