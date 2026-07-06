import { cloneRaster, type Raster } from '../src/core/types';
import { rgbaToLuma } from '../src/core/color';
import { dct2d, idct2d } from '../src/core/hash/dct';

/** Write `bits` into the least-significant bit of channel `ch` of the first pixels. */
export function embedLsb(img: Raster, bits: number[], ch = 0): Raster {
  const out = cloneRaster(img);
  for (let i = 0; i < bits.length; i++) {
    const o = i * 4 + ch;
    out.data[o] = (out.data[o]! & 0xfe) | (bits[i]! & 1);
  }
  return out;
}

export function readLsb(img: Raster, count: number, ch = 0): number[] {
  const bits: number[] = [];
  for (let i = 0; i < count; i++) bits.push(img.data[i * 4 + ch]! & 1);
  return bits;
}

/**
 * Embed one bit per 8x8 luma block by forcing the SIGN of a fixed mid-band DCT
 * coefficient (a stand-in for classical spread-spectrum / dwtDct watermarks).
 * The bit is added equally to R/G/B (luma carrier).
 */
export function embedDctSign(
  img: Raster,
  bit: number,
  u: number,
  v: number,
  strength = 24,
  size = 8,
): Raster {
  const w = img.width;
  const h = img.height;
  const luma = rgbaToLuma(img);
  const out = cloneRaster(img);
  const idx = v * size + u;
  for (let by = 0; by + size <= h; by += size) {
    for (let bx = 0; bx + size <= w; bx += size) {
      const block = new Float64Array(size * size);
      for (let y = 0; y < size; y++)
        for (let x = 0; x < size; x++)
          block[y * size + x] = luma[(by + y) * w + (bx + x)]!;
      const coeffs = dct2d(block, size);
      coeffs[idx] = bit ? strength : -strength;
      const back = idct2d(coeffs, size);
      for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
          const d = back[y * size + x]! - block[y * size + x]!;
          const o = ((by + y) * w + (bx + x)) * 4;
          out.data[o] = out.data[o]! + d;
          out.data[o + 1] = out.data[o + 1]! + d;
          out.data[o + 2] = out.data[o + 2]! + d;
        }
      }
    }
  }
  return out;
}

/** Recover the per-block sign bits embedded by {@link embedDctSign}. */
export function readDctSign(img: Raster, u: number, v: number, size = 8): number[] {
  const w = img.width;
  const h = img.height;
  const luma = rgbaToLuma(img);
  const idx = v * size + u;
  const bits: number[] = [];
  for (let by = 0; by + size <= h; by += size) {
    for (let bx = 0; bx + size <= w; bx += size) {
      const block = new Float64Array(size * size);
      for (let y = 0; y < size; y++)
        for (let x = 0; x < size; x++)
          block[y * size + x] = luma[(by + y) * w + (bx + x)]!;
      const coeffs = dct2d(block, size);
      bits.push(coeffs[idx]! >= 0 ? 1 : 0);
    }
  }
  return bits;
}

/** Bit-error rate between two equal-length bit arrays. */
export function bitError(a: number[], b: number[]): number {
  const n = Math.min(a.length, b.length);
  let e = 0;
  for (let i = 0; i < n; i++) if (a[i] !== b[i]) e++;
  return n === 0 ? 0 : e / n;
}
