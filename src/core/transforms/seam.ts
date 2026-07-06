import { createRaster, type Raster } from '../types';
import { rgbaToLuma } from '../color';

/**
 * Seam carving (content-aware retargeting).
 *
 * Removes low-energy vertical (and optionally horizontal) seams, then rescales
 * back to the original dimensions. Because the removed seams thread through the
 * least-important pixels and displace content by spatially-varying amounts, this
 * is a non-global geometric change that (a) cannot be undone by any fixed
 * dihedral/affine normalisation a defender applies, and (b) keeps visual quality
 * high (the whole point of seam carving). Deterministic; input never mutated.
 */
export interface SeamCarveOptions {
  /** Number of seams to remove on each processed axis. */
  seams?: number;
  /** Also carve horizontal seams (via transpose). */
  both?: boolean;
}

/** Gradient-magnitude energy of the luma channel (edge-clamped). */
export function energyMap(img: Raster): Float64Array {
  const w = img.width;
  const h = img.height;
  const l = rgbaToLuma(img);
  const e = new Float64Array(w * h);
  const at = (x: number, y: number): number =>
    l[Math.min(h - 1, Math.max(0, y)) * w + Math.min(w - 1, Math.max(0, x))]!;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      e[y * w + x] = Math.abs(at(x + 1, y) - at(x - 1, y)) + Math.abs(at(x, y + 1) - at(x, y - 1));
    }
  }
  return e;
}

/** Find the min-energy top-to-bottom seam; returns one x per row. */
function findVerticalSeam(e: Float64Array, w: number, h: number): number[] {
  const M = Float64Array.from(e);
  for (let y = 1; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let best = M[(y - 1) * w + x]!;
      if (x > 0) best = Math.min(best, M[(y - 1) * w + x - 1]!);
      if (x < w - 1) best = Math.min(best, M[(y - 1) * w + x + 1]!);
      M[y * w + x] = e[y * w + x]! + best;
    }
  }
  let minX = 0;
  for (let x = 1; x < w; x++) if (M[(h - 1) * w + x]! < M[(h - 1) * w + minX]!) minX = x;

  const seam = new Array<number>(h);
  seam[h - 1] = minX;
  for (let y = h - 2; y >= 0; y--) {
    const px = seam[y + 1]!;
    let bx = px;
    let bv = M[y * w + px]!;
    if (px > 0 && M[y * w + px - 1]! < bv) {
      bv = M[y * w + px - 1]!;
      bx = px - 1;
    }
    if (px < w - 1 && M[y * w + px + 1]! < bv) {
      bx = px + 1;
    }
    seam[y] = bx;
  }
  return seam;
}

function removeVerticalSeam(img: Raster, seam: number[]): Raster {
  const w = img.width;
  const h = img.height;
  const out = createRaster(w - 1, h);
  for (let y = 0; y < h; y++) {
    let ox = 0;
    for (let x = 0; x < w; x++) {
      if (x === seam[y]) continue;
      const si = (y * w + x) * 4;
      const di = (y * (w - 1) + ox) * 4;
      out.data[di] = img.data[si]!;
      out.data[di + 1] = img.data[si + 1]!;
      out.data[di + 2] = img.data[si + 2]!;
      out.data[di + 3] = img.data[si + 3]!;
      ox++;
    }
  }
  return out;
}

function transpose(img: Raster): Raster {
  const w = img.width;
  const h = img.height;
  const out = createRaster(h, w);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const si = (y * w + x) * 4;
      const di = (x * h + y) * 4;
      out.data[di] = img.data[si]!;
      out.data[di + 1] = img.data[si + 1]!;
      out.data[di + 2] = img.data[si + 2]!;
      out.data[di + 3] = img.data[si + 3]!;
    }
  }
  return out;
}

function carveVertical(img: Raster, seams: number): Raster {
  let cur = img;
  const limit = Math.min(seams, cur.width - 2);
  for (let i = 0; i < limit; i++) {
    cur = removeVerticalSeam(cur, findVerticalSeam(energyMap(cur), cur.width, cur.height));
  }
  return cur;
}

/** Bilinear resize of an RGBA raster (used to restore original dimensions). */
function resizeRaster(img: Raster, dw: number, dh: number): Raster {
  const sw = img.width;
  const sh = img.height;
  const out = createRaster(dw, dh);
  const sxr = sw / dw;
  const syr = sh / dh;
  for (let oy = 0; oy < dh; oy++) {
    let fy = (oy + 0.5) * syr - 0.5;
    if (fy < 0) fy = 0;
    if (fy > sh - 1) fy = sh - 1;
    const y0 = Math.floor(fy);
    const y1 = Math.min(y0 + 1, sh - 1);
    const wy = fy - y0;
    for (let ox = 0; ox < dw; ox++) {
      let fx = (ox + 0.5) * sxr - 0.5;
      if (fx < 0) fx = 0;
      if (fx > sw - 1) fx = sw - 1;
      const x0 = Math.floor(fx);
      const x1 = Math.min(x0 + 1, sw - 1);
      const wx = fx - x0;
      const o00 = (y0 * sw + x0) * 4;
      const o01 = (y0 * sw + x1) * 4;
      const o10 = (y1 * sw + x0) * 4;
      const o11 = (y1 * sw + x1) * 4;
      const di = (oy * dw + ox) * 4;
      for (let ch = 0; ch < 4; ch++) {
        const top = img.data[o00 + ch]! * (1 - wx) + img.data[o01 + ch]! * wx;
        const bot = img.data[o10 + ch]! * (1 - wx) + img.data[o11 + ch]! * wx;
        out.data[di + ch] = top * (1 - wy) + bot * wy;
      }
    }
  }
  return out;
}

export function seamCarve(img: Raster, opts: SeamCarveOptions = {}): Raster {
  const { seams = 4, both = false } = opts;
  let cur = carveVertical(img, seams);
  if (both) {
    cur = transpose(carveVertical(transpose(cur), seams));
  }
  return resizeRaster(cur, img.width, img.height);
}
