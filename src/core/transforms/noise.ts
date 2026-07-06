import { cloneRaster, type Raster } from '../types';
import { mulberry32 } from '../prng';

/**
 * Add low-amplitude Gaussian noise to the RGB channels. Primarily this breaks
 * exact file/cryptographic hashes (any change does that) and slightly perturbs
 * embedding-based detectors and spread-spectrum watermarks; at low amplitude it
 * is imperceptible. Reproducible from `seed`, alpha untouched, input never
 * mutated.
 */
export interface NoiseOptions {
  /** Standard deviation of the noise in luma units. */
  amplitude?: number;
  seed?: number;
  /** If true, the same noise value is applied to R, G and B (luma-only grain). */
  monochrome?: boolean;
}

export function addGaussianNoise(img: Raster, opts: NoiseOptions = {}): Raster {
  const { amplitude = 3, seed = 1, monochrome = false } = opts;
  const out = cloneRaster(img);
  const rng = mulberry32(seed);
  const n = img.width * img.height;
  for (let i = 0; i < n; i++) {
    const o = i * 4;
    if (monochrome) {
      const g = rng.gaussian() * amplitude;
      out.data[o] = img.data[o]! + g;
      out.data[o + 1] = img.data[o + 1]! + g;
      out.data[o + 2] = img.data[o + 2]! + g;
    } else {
      out.data[o] = img.data[o]! + rng.gaussian() * amplitude;
      out.data[o + 1] = img.data[o + 1]! + rng.gaussian() * amplitude;
      out.data[o + 2] = img.data[o + 2]! + rng.gaussian() * amplitude;
    }
  }
  return out;
}
