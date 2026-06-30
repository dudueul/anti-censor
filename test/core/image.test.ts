import { describe, it, expect } from 'vitest';
import { createRaster, cloneRaster, type Raster } from '../../src/core/types';
import { rgbaToLuma } from '../../src/core/color';
import { resizeArea } from '../../src/core/resample';

describe('Raster helpers', () => {
  it('createRaster allocates RGBA buffer of the right size, zeroed', () => {
    const r = createRaster(4, 3);
    expect(r.width).toBe(4);
    expect(r.height).toBe(3);
    expect(r.data.length).toBe(4 * 3 * 4);
    expect(Array.from(r.data).every((v) => v === 0)).toBe(true);
  });

  it('cloneRaster makes an independent copy', () => {
    const r = createRaster(2, 2);
    r.data[0] = 100;
    const c = cloneRaster(r);
    expect(c.data[0]).toBe(100);
    c.data[0] = 5;
    expect(r.data[0]).toBe(100); // original unaffected
    expect(c.width).toBe(r.width);
  });
});

function solid(w: number, h: number, rgb: [number, number, number]): Raster {
  const r = createRaster(w, h);
  for (let i = 0; i < w * h; i++) {
    r.data[i * 4] = rgb[0];
    r.data[i * 4 + 1] = rgb[1];
    r.data[i * 4 + 2] = rgb[2];
    r.data[i * 4 + 3] = 255;
  }
  return r;
}

describe('rgbaToLuma', () => {
  it('returns one value per pixel', () => {
    const luma = rgbaToLuma(solid(5, 4, [10, 20, 30]));
    expect(luma.length).toBe(20);
  });

  it('maps white to ~255 and black to 0', () => {
    expect(rgbaToLuma(solid(1, 1, [255, 255, 255]))[0]).toBeCloseTo(255, 5);
    expect(rgbaToLuma(solid(1, 1, [0, 0, 0]))[0]).toBe(0);
  });

  it('uses Rec.601 luma weights', () => {
    // 0.299*R + 0.587*G + 0.114*B
    const v = rgbaToLuma(solid(1, 1, [100, 150, 200]))[0]!;
    expect(v).toBeCloseTo(0.299 * 100 + 0.587 * 150 + 0.114 * 200, 4);
  });
});

describe('resizeArea', () => {
  it('keeps a uniform plane uniform', () => {
    const src = new Float64Array(16).fill(42);
    const out = resizeArea(src, 4, 4, 2, 2);
    expect(out.length).toBe(4);
    for (const v of out) expect(v).toBeCloseTo(42, 6);
  });

  it('downscales 2x2 -> 1x1 to the average', () => {
    const src = Float64Array.from([0, 100, 200, 60]);
    const out = resizeArea(src, 2, 2, 1, 1);
    expect(out.length).toBe(1);
    expect(out[0]).toBeCloseTo((0 + 100 + 200 + 60) / 4, 6);
  });

  it('returns identical values when size is unchanged', () => {
    const src = Float64Array.from([1, 2, 3, 4, 5, 6]);
    const out = resizeArea(src, 3, 2, 3, 2);
    for (let i = 0; i < src.length; i++) expect(out[i]).toBeCloseTo(src[i]!, 6);
  });

  it('preserves overall mean under downscaling', () => {
    const src = new Float64Array(64);
    for (let i = 0; i < 64; i++) src[i] = (i * 37) % 256;
    const mean = src.reduce((a, b) => a + b, 0) / src.length;
    const out = resizeArea(src, 8, 8, 4, 4);
    const outMean = out.reduce((a, b) => a + b, 0) / out.length;
    expect(outMean).toBeCloseTo(mean, 4);
  });
});
