import type { Raster } from '../types';

/** Iterate the origins of `size`x`size` blocks tiling a w x h image. */
export function forEachBlockOrigin(
  w: number,
  h: number,
  size: number,
  cb: (bx: number, by: number) => void,
): void {
  for (let by = 0; by < h; by += size) {
    for (let bx = 0; bx < w; bx += size) cb(bx, by);
  }
}

const clampIdx = (v: number, n: number): number => (v < 0 ? 0 : v >= n ? n - 1 : v);

/** Read a `size`x`size` block of one channel, replicating edges when out of bounds. */
export function readBlockChannel(
  img: Raster,
  ch: number,
  bx: number,
  by: number,
  size: number,
): Float64Array {
  const { width: w, height: h, data } = img;
  const out = new Float64Array(size * size);
  for (let y = 0; y < size; y++) {
    const sy = clampIdx(by + y, h);
    for (let x = 0; x < size; x++) {
      const sx = clampIdx(bx + x, w);
      out[y * size + x] = data[(sy * w + sx) * 4 + ch]!;
    }
  }
  return out;
}

/** Write a block back to one channel, only for in-bounds pixels. */
export function writeBlockChannel(
  img: Raster,
  ch: number,
  bx: number,
  by: number,
  size: number,
  block: Float64Array,
): void {
  const { width: w, height: h, data } = img;
  for (let y = 0; y < size; y++) {
    const sy = by + y;
    if (sy >= h) break;
    for (let x = 0; x < size; x++) {
      const sx = bx + x;
      if (sx >= w) continue;
      data[(sy * w + sx) * 4 + ch] = block[y * size + x]!;
    }
  }
}
