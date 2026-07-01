import type { Raster } from '../types';
import { rgbaToLuma } from '../color';
import { resizeArea } from '../resample';
import { haar2d } from './haar';
import type { Hash } from './hamming';

/**
 * Wavelet hash (wHash): downscale luma to `side`x`side`, apply a multi-level
 * Haar DWT, keep the low-frequency LL approximation block and threshold each
 * coefficient against its median. Similar robustness profile to pHash (survives
 * scale/JPEG/photometry) with a different, wavelet-domain basis — a distinct
 * member of the "DNA"/perceptual-hash family to validate evasion against.
 */
export function wHash(img: Raster, side = 32, levels = 2): Hash {
  const luma = rgbaToLuma(img);
  const small = resizeArea(luma, img.width, img.height, side, side);
  const coeffs = haar2d(small, side, levels);
  const ll = side >> levels;

  const block: number[] = [];
  for (let y = 0; y < ll; y++) {
    for (let x = 0; x < ll; x++) block.push(coeffs[y * side + x]!);
  }
  const median = medianOf(block);
  const out = new Uint8Array(ll * ll);
  for (let i = 0; i < block.length; i++) out[i] = block[i]! > median ? 1 : 0;
  return out;
}

function medianOf(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}
