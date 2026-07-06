import type { Raster } from '../types';
import { rgbaToLuma } from '../color';
import { resizeArea } from '../resample';
import type { Hash } from './hamming';

/**
 * Difference hash (dHash): downscale luma to (size+1)x size, then for each row
 * emit a bit per adjacent horizontal pair (left < right). Encodes local
 * gradient direction; robust to brightness/contrast shifts.
 */
export function dHash(img: Raster, size = 8): Hash {
  const luma = rgbaToLuma(img);
  const w = size + 1;
  const small = resizeArea(luma, img.width, img.height, w, size);
  const out = new Uint8Array(size * size);
  let k = 0;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const left = small[y * w + x]!;
      const right = small[y * w + x + 1]!;
      out[k++] = left < right ? 1 : 0;
    }
  }
  return out;
}
