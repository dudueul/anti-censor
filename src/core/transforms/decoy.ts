import type { Raster } from '../types';
import { rgbaToLuma } from '../color';
import { dct2d, idct2d } from '../hash/dct';
import { mulberry32 } from '../prng';
import { addLumaPlane } from './common';

/**
 * Decoy watermark injection (OPT-IN, misdirection only).
 *
 * Stamps a keyed pseudo-random spread-spectrum pattern into a mid-band DCT
 * coefficient of each 8x8 block. A naive blind reader that assumes a single mark
 * will read this decoy; stamping several overlapping decoys (different seeds)
 * drives such a reader's confidence toward noise. HONESTY: this does NOT remove
 * or fool a keyed deep detector (SynthID/Stable-Signature/RivaGAN read their own
 * key regardless of unrelated energy) — it only confuses unkeyed/heuristic
 * scrapers. Deterministic; input never mutated.
 */
export interface DecoyOptions {
  seed?: number;
  /** Embedding strength (coefficient magnitude). */
  strength?: number;
  /** Mid-band coefficient position. */
  u?: number;
  v?: number;
  size?: number;
}

export function injectDecoyWatermark(img: Raster, opts: DecoyOptions = {}): Raster {
  const { seed = 1, strength = 20, u = 3, v = 2, size = 8 } = opts;
  const w = img.width;
  const h = img.height;
  const luma = rgbaToLuma(img);
  const rng = mulberry32(seed);
  const idx = v * size + u;
  const delta = new Float64Array(w * h);

  for (let by = 0; by + size <= h; by += size) {
    for (let bx = 0; bx + size <= w; bx += size) {
      const sign = rng() < 0.5 ? -1 : 1;
      const block = new Float64Array(size * size);
      for (let y = 0; y < size; y++)
        for (let x = 0; x < size; x++)
          block[y * size + x] = luma[(by + y) * w + (bx + x)]!;
      const coeffs = dct2d(block, size);
      coeffs[idx] = sign * strength;
      const back = idct2d(coeffs, size);
      for (let y = 0; y < size; y++)
        for (let x = 0; x < size; x++)
          delta[(by + y) * w + (bx + x)] = back[y * size + x]! - block[y * size + x]!;
    }
  }
  return addLumaPlane(img, delta);
}

/** Blind correlation detector for a decoy pattern (returns [-1, 1] confidence). */
export function detectDecoy(img: Raster, opts: DecoyOptions = {}): number {
  const { seed = 1, u = 3, v = 2, size = 8 } = opts;
  const w = img.width;
  const h = img.height;
  const luma = rgbaToLuma(img);
  const rng = mulberry32(seed);
  const idx = v * size + u;
  let acc = 0;
  let count = 0;
  for (let by = 0; by + size <= h; by += size) {
    for (let bx = 0; bx + size <= w; bx += size) {
      const expected = rng() < 0.5 ? -1 : 1;
      const block = new Float64Array(size * size);
      for (let y = 0; y < size; y++)
        for (let x = 0; x < size; x++)
          block[y * size + x] = luma[(by + y) * w + (bx + x)]!;
      const coeffs = dct2d(block, size);
      acc += Math.sign(coeffs[idx]!) * expected;
      count++;
    }
  }
  return count === 0 ? 0 : acc / count;
}
