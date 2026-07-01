import type { Raster } from '../types';
import { rgbaToLuma } from '../color';
import { resizeArea } from '../resample';
import type { Hash } from './hamming';

/**
 * Block-mean-value hash (blockhash): divide the image into a `side`x`side` grid
 * of blocks (via area downscaling), then threshold each block mean against the
 * median of all block means. Default 16x16 = 256-bit. Used by image-attribution
 * and moderation pipelines; a coarser, larger-bit member of the family.
 */
export function blockHash(img: Raster, side = 16): Hash {
  const luma = rgbaToLuma(img);
  const small = resizeArea(luma, img.width, img.height, side, side);
  const values = Array.from(small);
  const median = medianOf(values);
  const out = new Uint8Array(side * side);
  for (let i = 0; i < values.length; i++) out[i] = values[i]! > median ? 1 : 0;
  return out;
}

function medianOf(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}
