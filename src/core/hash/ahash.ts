import type { Raster } from '../types';
import { rgbaToLuma } from '../color';
import { resizeArea } from '../resample';
import type { Hash } from './hamming';

/**
 * Average hash (aHash): downscale luma to 8x8, set each bit to whether the pixel
 * is >= the mean. Robust to scaling and mild blur; this is one of the simplest
 * perceptual fingerprints a blocklist filter uses.
 */
export function aHash(img: Raster, size = 8): Hash {
  const luma = rgbaToLuma(img);
  const small = resizeArea(luma, img.width, img.height, size, size);
  let sum = 0;
  for (const v of small) sum += v;
  const mean = sum / small.length;
  const out = new Uint8Array(size * size);
  for (let i = 0; i < small.length; i++) out[i] = small[i]! >= mean ? 1 : 0;
  return out;
}
