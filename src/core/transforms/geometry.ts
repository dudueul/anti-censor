import { createRaster, type Raster } from '../types';

/**
 * Subtle geometric jitter: rotate, zoom and translate the image by tiny amounts,
 * resampling back to the *same* dimensions so the transform composes in the
 * pipeline. Small geometric changes are nearly invisible to a human but move
 * perceptual hashes and de-synchronise alignment-dependent watermarks. Sampling
 * is inverse-mapped bilinear with edge replication; the input is never mutated.
 */
export interface GeometryOptions {
  /** Rotation in degrees (about the image center). */
  rotateDeg?: number;
  /** Uniform zoom factor (>1 zooms in, cropping the border). */
  scale?: number;
  /** Horizontal / vertical translation in pixels. */
  translateX?: number;
  translateY?: number;
}

export function geometricJitter(img: Raster, opts: GeometryOptions = {}): Raster {
  const { rotateDeg = 0, scale = 1, translateX = 0, translateY = 0 } = opts;
  const w = img.width;
  const h = img.height;
  const out = createRaster(w, h);

  const cx = (w - 1) / 2;
  const cy = (h - 1) / 2;
  const rad = (rotateDeg * Math.PI) / 180;
  const c = Math.cos(rad);
  const s = Math.sin(rad);
  const invScale = 1 / scale;

  for (let oy = 0; oy < h; oy++) {
    for (let ox = 0; ox < w; ox++) {
      let dx = ox - cx - translateX;
      let dy = oy - cy - translateY;
      dx *= invScale;
      dy *= invScale;
      // inverse rotation R(-rad)
      const sx = cx + (dx * c + dy * s);
      const sy = cy + (-dx * s + dy * c);
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
