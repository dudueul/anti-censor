import { createRaster, type Raster } from '../types';

/**
 * Subtle geometric jitter — the single highest-leverage defeat against grid-based
 * perceptual hashes (aHash/dHash/pHash/wHash/blockhash/PDQ/PhotoDNA/NeuralHash),
 * which are robust to photometry but fragile to content moving off their sampling
 * lattice. Composes, in ONE inverse-warp resample pass: optional horizontal flip,
 * asymmetric crop-and-rescale, anamorphic (per-axis) scale, rotation about the
 * center, and translation. Output keeps the input dimensions so it composes in
 * the pipeline. Sampling is inverse-mapped bilinear with edge replication; the
 * input is never mutated.
 */
export interface GeometryOptions {
  rotateDeg?: number;
  /** Uniform zoom (used for an axis when scaleX/scaleY are omitted). */
  scale?: number;
  /** Anamorphic per-axis zoom about the center. */
  scaleX?: number;
  scaleY?: number;
  /** Fraction (0..1) cropped off each edge, then rescaled back to full size. */
  cropLeft?: number;
  cropRight?: number;
  cropTop?: number;
  cropBottom?: number;
  translateX?: number;
  translateY?: number;
  /** Mirror horizontally (near-complements dHash; breaks text — gate by caller). */
  flip?: boolean;
}

export function geometricJitter(img: Raster, opts: GeometryOptions = {}): Raster {
  const {
    rotateDeg = 0,
    scale = 1,
    scaleX = scale,
    scaleY = scale,
    cropLeft = 0,
    cropRight = 0,
    cropTop = 0,
    cropBottom = 0,
    translateX = 0,
    translateY = 0,
    flip = false,
  } = opts;

  const w = img.width;
  const h = img.height;
  const out = createRaster(w, h);

  const cx = (w - 1) / 2;
  const cy = (h - 1) / 2;
  const rad = (rotateDeg * Math.PI) / 180;
  const c = Math.cos(rad);
  const s = Math.sin(rad);

  // Crop rectangle in source pixels.
  const cropOx = cropLeft * w;
  const cropOy = cropTop * h;
  const cropW = w * (1 - cropLeft - cropRight);
  const cropH = h * (1 - cropTop - cropBottom);

  for (let oy = 0; oy < h; oy++) {
    for (let ox = 0; ox < w; ox++) {
      // 1. undo translation
      let px = ox - translateX;
      let py = oy - translateY;
      // 2. undo rotation (R(-rad)) about center
      const dx = px - cx;
      const dy = py - cy;
      px = cx + (dx * c + dy * s);
      py = cy + (-dx * s + dy * c);
      // 3. undo anamorphic zoom about center
      px = cx + (px - cx) / scaleX;
      py = cy + (py - cy) / scaleY;
      // 4. undo crop-and-rescale (full -> crop rect)
      let sx = cropOx + (px / w) * cropW;
      const sy = cropOy + (py / h) * cropH;
      // 5. undo flip
      if (flip) sx = w - 1 - sx;
      sampleBilinear(img, sx, sy, out, (oy * w + ox) * 4);
    }
  }
  return out;
}

function sampleBilinear(
  img: Raster,
  fx: number,
  fy: number,
  out: Raster,
  outOff: number,
): void {
  const w = img.width;
  const h = img.height;
  let x = fx;
  let y = fy;
  if (x < 0) x = 0;
  if (y < 0) y = 0;
  if (x > w - 1) x = w - 1;
  if (y > h - 1) y = h - 1;
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const x1 = Math.min(x0 + 1, w - 1);
  const y1 = Math.min(y0 + 1, h - 1);
  const wx = x - x0;
  const wy = y - y0;
  const d = img.data;
  const o00 = (y0 * w + x0) * 4;
  const o01 = (y0 * w + x1) * 4;
  const o10 = (y1 * w + x0) * 4;
  const o11 = (y1 * w + x1) * 4;
  for (let ch = 0; ch < 4; ch++) {
    const top = d[o00 + ch]! * (1 - wx) + d[o01 + ch]! * wx;
    const bot = d[o10 + ch]! * (1 - wx) + d[o11 + ch]! * wx;
    out.data[outOff + ch] = top * (1 - wy) + bot * wy;
  }
}
