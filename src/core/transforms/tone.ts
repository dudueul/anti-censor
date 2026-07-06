import { cloneRaster, type Raster } from '../types';

/**
 * Global tone adjustment (brightness, contrast, gamma, per-channel gain).
 * Shifts the histogram and colour balance, which moves mean-based hashes and
 * colour-statistic features, while mild settings stay visually faithful. A pure
 * LUT mapping; the input is never mutated.
 */
export interface ToneOptions {
  /** Added after contrast, in luma units. */
  brightness?: number;
  /** Multiplier around mid-gray (128). 1 = unchanged. */
  contrast?: number;
  /** Gamma; output = 255*(in/255)^(1/gamma). 1 = unchanged. */
  gamma?: number;
  /** Per-channel multiplicative gain [r, g, b]. */
  gain?: [number, number, number];
}

export function adjustTone(img: Raster, opts: ToneOptions = {}): Raster {
  const { brightness = 0, contrast = 1, gamma = 1, gain = [1, 1, 1] } = opts;
  const inv = 1 / gamma;
  const applyGamma = gamma !== 1;

  // Channel-independent base LUT.
  const base = new Float64Array(256);
  for (let v = 0; v < 256; v++) {
    let x = (v - 128) * contrast + 128 + brightness;
    if (applyGamma) {
      const norm = Math.min(1, Math.max(0, x / 255));
      x = 255 * Math.pow(norm, inv);
    }
    base[v] = x;
  }

  const out = cloneRaster(img);
  const n = img.width * img.height;
  for (let i = 0; i < n; i++) {
    const o = i * 4;
    out.data[o] = base[img.data[o]!]! * gain[0];
    out.data[o + 1] = base[img.data[o + 1]!]! * gain[1];
    out.data[o + 2] = base[img.data[o + 2]!]! * gain[2];
  }
  return out;
}
