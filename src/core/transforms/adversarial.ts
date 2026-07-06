import { cloneRaster, type Raster } from '../types';
import { rgbaToLuma } from '../color';
import { mulberry32 } from '../prng';

/**
 * Heuristic adversarial texture (OPT-IN, honestly weak).
 *
 * Adds budget-clamped, luma-masked high-frequency noise intended to perturb the
 * features of CNN/ViT content classifiers and CLIP embeddings. This is the
 * weakest module by design: without the target model's gradients only transfer/
 * heuristic perturbation is possible, and the literature (Radiya-Dixit & Tramer
 * 2022; Honig et al. 2024) shows one-shot client cloaks give a FALSE sense of
 * security against adaptive black-box systems. It adds cost/friction, not durable
 * protection. Masked to textured regions (hides in detail), clamped to an
 * L-infinity `budget`, per-channel, deterministic, input never mutated.
 */
export interface AdversarialTextureOptions {
  /** Noise amplitude before masking. */
  amplitude?: number;
  /** Hard per-channel L-infinity clamp on the added delta. */
  budget?: number;
  seed?: number;
}

export function adversarialTexture(img: Raster, opts: AdversarialTextureOptions = {}): Raster {
  const { amplitude = 6, budget = 8, seed = 1 } = opts;
  const w = img.width;
  const h = img.height;
  const mask = detailMask(img);
  const rng = mulberry32(seed);
  const out = cloneRaster(img);
  const n = w * h;
  for (let i = 0; i < n; i++) {
    const o = i * 4;
    const m = mask[i]!;
    for (let ch = 0; ch < 3; ch++) {
      let d = (rng() * 2 - 1) * amplitude * m;
      if (d > budget) d = budget;
      if (d < -budget) d = -budget;
      out.data[o + ch] = img.data[o + ch]! + d;
    }
  }
  return out;
}

/** Normalised local gradient magnitude of luma (0 flat .. 1 most textured). */
function detailMask(img: Raster): Float64Array {
  const w = img.width;
  const h = img.height;
  const l = rgbaToLuma(img);
  const m = new Float64Array(w * h);
  const at = (x: number, y: number): number =>
    l[Math.min(h - 1, Math.max(0, y)) * w + Math.min(w - 1, Math.max(0, x))]!;
  let max = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const g = Math.abs(at(x + 1, y) - at(x - 1, y)) + Math.abs(at(x, y + 1) - at(x, y - 1));
      m[y * w + x] = g;
      if (g > max) max = g;
    }
  }
  if (max > 0) for (let i = 0; i < m.length; i++) m[i] = m[i]! / max;
  return m;
}
