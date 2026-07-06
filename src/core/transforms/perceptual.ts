import type { Raster } from '../types';
import { rgbaToLuma } from '../color';
import { resizeArea, resizeBilinear } from '../resample';
import { dct2d, idct2d } from '../hash/dct';
import { mulberry32 } from '../prng';
import { addLumaPlane } from './common';

function clampPlane(plane: Float64Array, amp: number): Float64Array {
  for (let i = 0; i < plane.length; i++) {
    const v = plane[i]!;
    plane[i] = v > amp ? amp : v < -amp ? -amp : v;
  }
  return plane;
}

/**
 * Targeted average-hash maximizer.
 *
 * aHash sets each of its 8x8 bits from whether a downscaled cell is above the
 * grid mean. We flip those bits deliberately: for every cell that lies within
 * `amplitude` of the mean we compute the luma nudge that pushes it just past the
 * mean (by `margin`); cells too far from the mean to flip within budget are left
 * untouched so no visual budget is wasted. The 8x8 nudge grid is upscaled
 * bilinearly into a low-frequency, imperceptible bias field. The result
 * re-hashes to a very different aHash while SSIM stays high.
 */
export interface MaximizeAHashOptions {
  amplitude?: number;
  margin?: number;
  hashSide?: number;
}

export function maximizeAverageHash(
  img: Raster,
  opts: MaximizeAHashOptions = {},
): Raster {
  const { amplitude = 16, margin = 3, hashSide = 8 } = opts;
  const luma = rgbaToLuma(img);
  const small = resizeArea(luma, img.width, img.height, hashSide, hashSide);

  let sum = 0;
  for (const v of small) sum += v;
  const mean = sum / small.length;

  const bias = new Float64Array(hashSide * hashSide);
  for (let i = 0; i < small.length; i++) {
    const c = small[i]!;
    const target = c >= mean ? mean - margin : mean + margin;
    const d = target - c;
    bias[i] = Math.abs(d) <= amplitude ? d : 0; // skip cells we cannot flip
  }

  // Block-constant upscale (resizeArea acts as nearest when upscaling): each
  // 8x8 cell maps to a constant offset over its block, so the cell's area-mean
  // shifts by exactly the intended nudge. Bilinear would smear adjacent
  // opposite-sign nudges together and cancel the flips.
  const biasFull = resizeArea(bias, hashSide, hashSide, img.width, img.height);
  return addLumaPlane(img, biasFull);
}

/**
 * Targeted perceptual-hash (pHash) maximizer.
 *
 * pHash sets each bit from whether a low-frequency DCT coefficient exceeds the
 * block median. We work directly in that space: downscale to `side`x`side`, take
 * the DCT, and for every low-frequency coefficient (excluding DC, to avoid a
 * brightness shift) that is within `coeffAmplitude` of the median, push it just
 * across the median. We inverse-DCT only that sparse coefficient delta to get a
 * smooth spatial perturbation, clamp it to `amplitude`, upscale and add it. This
 * flips pHash bits — the most robust classic hash — with a tiny, low-frequency
 * change.
 */
export interface MaximizePHashOptions {
  /** Spatial luma clamp on the added perturbation. */
  amplitude?: number;
  /** How far (in coefficient units) to push a coefficient past the median. */
  margin?: number;
  /** Max coefficient delta applied to any single coefficient. */
  coeffAmplitude?: number;
  /** DCT plane side (matches pHash; default 32). */
  side?: number;
  /** Low-frequency block side compared in the hash (default 8). */
  hashSide?: number;
}

export function maximizePerceptualHash(
  img: Raster,
  opts: MaximizePHashOptions = {},
): Raster {
  const {
    amplitude = 20,
    margin = 2,
    coeffAmplitude = 60,
    side = 32,
    hashSide = 8,
  } = opts;

  const luma = rgbaToLuma(img);
  const small = resizeArea(luma, img.width, img.height, side, side);
  const coeffs = dct2d(small, side);

  // Median over the low-frequency block (DC included, matching pHash).
  const low: number[] = [];
  for (let y = 0; y < hashSide; y++) {
    for (let x = 0; x < hashSide; x++) low.push(coeffs[y * side + x]!);
  }
  const median = medianOf(low);

  const deltaCoeffs = new Float64Array(side * side);
  for (let y = 0; y < hashSide; y++) {
    for (let x = 0; x < hashSide; x++) {
      if (x === 0 && y === 0) continue; // never touch DC (brightness)
      const idx = y * side + x;
      const c = coeffs[idx]!;
      const target = c > median ? median - margin : median + margin;
      const d = target - c;
      if (Math.abs(d) <= coeffAmplitude) deltaCoeffs[idx] = d; // else skip
    }
  }

  const spatialSmall = idct2d(deltaCoeffs, side);
  const spatialFull = resizeBilinear(spatialSmall, side, side, img.width, img.height);
  clampPlane(spatialFull, amplitude);
  return addLumaPlane(img, spatialFull);
}

/**
 * Targeted difference-hash (dHash) maximizer.
 *
 * dHash emits, on a (hashSide+1)x hashSide grid, one bit per adjacent horizontal
 * pair (left < right). Each cell is shared by two pairs, so bits cannot be
 * flipped independently; we sweep each row left-to-right, adjusting only the
 * *right* cell of the current pair to invert its gradient sign (by `margin`),
 * carrying the adjusted value forward as the next pair's left. Adjustments are
 * clamped to `amplitude`, so pairs we cannot flip within budget are left as-is.
 * The resulting nudge grid is upscaled block-constant and added as luma.
 */
export interface MaximizeDHashOptions {
  amplitude?: number;
  margin?: number;
  hashSide?: number;
}

export function maximizeDifferenceHash(
  img: Raster,
  opts: MaximizeDHashOptions = {},
): Raster {
  const { amplitude = 20, margin = 3, hashSide = 8 } = opts;
  const gw = hashSide + 1;
  const luma = rgbaToLuma(img);
  const small = resizeArea(luma, img.width, img.height, gw, hashSide);
  const bias = new Float64Array(gw * hashSide);

  for (let y = 0; y < hashSide; y++) {
    const row = y * gw;
    // running adjusted value of the current left cell
    let left = small[row]!;
    for (let x = 0; x < hashSide; x++) {
      const rightOrig = small[row + x + 1]!;
      let right = rightOrig + bias[row + x + 1]!;
      const wasLeftLess = left < right;
      // desired: invert the sign
      let target: number;
      if (wasLeftLess) target = left - margin; // make right < left
      else target = left + margin; // make right > left
      let d = target - rightOrig;
      if (d > amplitude) d = amplitude;
      if (d < -amplitude) d = -amplitude;
      // only commit if it actually flips the sign within budget
      const newRight = rightOrig + d;
      const flips = wasLeftLess ? newRight < left : newRight > left;
      if (flips) {
        bias[row + x + 1] = d;
        right = newRight;
      }
      left = right;
    }
  }

  const biasFull = resizeArea(bias, gw, hashSide, img.width, img.height);
  return addLumaPlane(img, biasFull);
}

/**
 * Broad low-frequency disruptor.
 *
 * A random, zero-mean signed field at `grid`x`grid` resolution, upscaled
 * smoothly across the image. At small amplitude it is invisible but it nudges
 * many detectors (dHash gradients, embedding features, spread-spectrum
 * watermarks) off their exact values. Reproducible from `seed`.
 */
export interface LowFrequencyFieldOptions {
  grid?: number;
  amplitude?: number;
  seed?: number;
}

export function addLowFrequencyField(
  img: Raster,
  opts: LowFrequencyFieldOptions = {},
): Raster {
  const { grid = 12, amplitude = 8, seed = 1 } = opts;
  const rng = mulberry32(seed);
  const field = new Float64Array(grid * grid);
  for (let i = 0; i < field.length; i++) field[i] = (rng() * 2 - 1) * amplitude;

  let s = 0;
  for (const v of field) s += v;
  const m = s / field.length;
  for (let i = 0; i < field.length; i++) field[i] = field[i]! - m;

  const full = resizeBilinear(field, grid, grid, img.width, img.height);
  return addLumaPlane(img, full);
}

function medianOf(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2
    ? sorted[mid]!
    : (sorted[mid - 1]! + sorted[mid]!) / 2;
}
