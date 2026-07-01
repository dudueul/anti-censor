import { cloneRaster, type Raster } from '../types';

/**
 * PRNU (photo-response non-uniformity) suppression.
 *
 * A camera's sensor leaves a faint, high-frequency multiplicative noise pattern
 * unique to the device; forensic "camera identification" correlates that pattern
 * against a reference. Attenuating the high-frequency residual (image minus a
 * blurred version) degrades that correlation. We keep the low/mid frequencies
 * (structure, most detail) and scale down only the finest residual by
 * `strength`, so at mild settings the image stays visually faithful.
 * Deterministic; input never mutated.
 */
export interface PrnuOptions {
  /** 0..1 fraction of the high-frequency residual to remove. */
  strength?: number;
  /** Box-blur radius defining the "high frequency" band. */
  radius?: number;
}

export function suppressPrnu(img: Raster, opts: PrnuOptions = {}): Raster {
  const { strength = 0.4, radius = 1 } = opts;
  const keep = 1 - Math.min(1, Math.max(0, strength));
  const out = cloneRaster(img);
  const n = img.width * img.height;
  for (let ch = 0; ch < 3; ch++) {
    const blur = boxBlurChannel(img, ch, radius);
    for (let i = 0; i < n; i++) {
      const o = i * 4 + ch;
      const orig = img.data[o]!;
      const residual = orig - blur[i]!;
      out.data[o] = blur[i]! + residual * keep;
    }
  }
  return out;
}

/** Sum of squared high-frequency residual across RGB (a PRNU-energy proxy). */
export function highFrequencyEnergy(img: Raster, radius = 1): number {
  const n = img.width * img.height;
  let e = 0;
  for (let ch = 0; ch < 3; ch++) {
    const blur = boxBlurChannel(img, ch, radius);
    for (let i = 0; i < n; i++) {
      const d = img.data[i * 4 + ch]! - blur[i]!;
      e += d * d;
    }
  }
  return e;
}

function boxBlurChannel(img: Raster, ch: number, radius: number): Float64Array {
  const w = img.width;
  const h = img.height;
  const src = new Float64Array(w * h);
  for (let i = 0; i < w * h; i++) src[i] = img.data[i * 4 + ch]!;
  const tmp = new Float64Array(w * h);
  const out = new Float64Array(w * h);
  const win = 2 * radius + 1;
  const clamp = (v: number, n: number): number => (v < 0 ? 0 : v >= n ? n - 1 : v);

  // horizontal
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let sum = 0;
      for (let t = -radius; t <= radius; t++) sum += src[y * w + clamp(x + t, w)]!;
      tmp[y * w + x] = sum / win;
    }
  }
  // vertical
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let sum = 0;
      for (let t = -radius; t <= radius; t++) sum += tmp[clamp(y + t, h) * w + x]!;
      out[y * w + x] = sum / win;
    }
  }
  return out;
}
