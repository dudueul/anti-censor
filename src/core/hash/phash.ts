import type { Raster } from '../types';
import { rgbaToLuma } from '../color';
import { resizeArea } from '../resample';
import { dct2d } from './dct';
import type { Hash } from './hamming';

/**
 * Perceptual hash (pHash): downscale luma to 32x32, take the 2D DCT, keep the
 * top-left `hashSide`x`hashSide` low-frequency block, and set each bit to
 * whether the coefficient exceeds the block median. This is the most robust of
 * the classic hashes (survives heavy compression, scaling and small edits), so
 * it is the hardest target for the evasion transforms.
 */
export function pHash(img: Raster, side = 32, hashSide = 8): Hash {
  const luma = rgbaToLuma(img);
  const small = resizeArea(luma, img.width, img.height, side, side);
  const coeffs = dct2d(small, side);

  const low: number[] = [];
  for (let y = 0; y < hashSide; y++) {
    for (let x = 0; x < hashSide; x++) low.push(coeffs[y * side + x]!);
  }
  const median = medianOf(low);
  const out = new Uint8Array(hashSide * hashSide);
  for (let i = 0; i < low.length; i++) out[i] = low[i]! > median ? 1 : 0;
  return out;
}

function medianOf(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2
    ? sorted[mid]!
    : (sorted[mid - 1]! + sorted[mid]!) / 2;
}
