import type { Raster, Plane } from './types';

/** Rec. 601 luma coefficients (the convention used by pHash/aHash/dHash). */
export const LUMA_R = 0.299;
export const LUMA_G = 0.587;
export const LUMA_B = 0.114;

/** Convert an RGBA raster to a single-channel luma array (0..255 float). */
export function rgbaToLuma(img: Raster): Float64Array {
  const n = img.width * img.height;
  const out = new Float64Array(n);
  const d = img.data;
  for (let i = 0; i < n; i++) {
    const o = i * 4;
    out[i] = LUMA_R * d[o]! + LUMA_G * d[o + 1]! + LUMA_B * d[o + 2]!;
  }
  return out;
}

/** Convert an RGBA raster to a luma {@link Plane}. */
export function rgbaToLumaPlane(img: Raster): Plane {
  return { width: img.width, height: img.height, data: rgbaToLuma(img) };
}
