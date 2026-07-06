import type { Raster } from '../types';
import { rgbaToLuma } from '../color';
import { resizeArea } from '../resample';
import { dct2d } from './dct';
import type { Hash } from './hamming';

/**
 * PDQ-style 256-bit hash (a reference approximation of Meta's PDQ).
 *
 * Real PDQ luminance-downsamples with a Jarosz box blur to 64x64, takes a 16x16
 * DCT and median-thresholds to 256 bits (match threshold <=31/256). We reproduce
 * the DCT-median structure (area downscale stands in for the box blur) — close
 * enough to serve as an additional evasion oracle for the PDQ/PhotoDNA class of
 * detectors, which Meta and GIFCT deploy widely.
 */
export function pdqHash(img: Raster, side = 64, hashSide = 16): Hash {
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
  return sorted.length % 2 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}
