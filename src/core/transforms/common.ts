import { cloneRaster, type Raster } from '../types';

/**
 * Add a per-pixel luma delta (a single-channel plane the size of the image) to
 * the R, G and B channels equally, leaving alpha untouched. Writes into a clone;
 * the input is never mutated. The Uint8ClampedArray target rounds and clamps to
 * 0..255 automatically.
 */
export function addLumaPlane(img: Raster, delta: Float64Array): Raster {
  const out = cloneRaster(img);
  const n = img.width * img.height;
  for (let i = 0; i < n; i++) {
    const d = delta[i]!;
    const o = i * 4;
    out.data[o] = img.data[o]! + d;
    out.data[o + 1] = img.data[o + 1]! + d;
    out.data[o + 2] = img.data[o + 2]! + d;
  }
  return out;
}

/** Per-pixel signed delta added to each RGB channel independently. */
export function addRgbDelta(
  img: Raster,
  dr: Float64Array,
  dg: Float64Array,
  db: Float64Array,
): Raster {
  const out = cloneRaster(img);
  const n = img.width * img.height;
  for (let i = 0; i < n; i++) {
    const o = i * 4;
    out.data[o] = img.data[o]! + dr[i]!;
    out.data[o + 1] = img.data[o + 1]! + dg[i]!;
    out.data[o + 2] = img.data[o + 2]! + db[i]!;
  }
  return out;
}
