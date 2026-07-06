import type { Raster } from '../types';
import { idct2d } from '../hash/dct';
import { mulberry32 } from '../prng';
import { addLumaPlane } from './common';
import { forEachBlockOrigin } from './blocks';

/**
 * DCT mid-band coefficient jitter.
 *
 * Classical blind watermarks (Cox-style spread spectrum, invisible-watermark
 * dwtDct/dwtDctSvd, QIM) embed their payload in the mid-frequency DCT band of
 * 8x8 (or larger) blocks. Randomizing exactly that band drops the watermark
 * correlation below its detection threshold while leaving the DC/low band (image
 * structure, brightness) and the very-high band (sharpness) largely intact, so
 * the change is low and the per-coefficient spatial delta is clamped to
 * `maxSpatial`. The disrupting noise is reproducible from `seed`.
 */
export interface FrequencyJitterOptions {
  /** Inclusive radial band [min,max] (in coefficient indices) to perturb. */
  bandMin?: number;
  bandMax?: number;
  /** Magnitude of the signed coefficient noise. */
  coeffJitter?: number;
  /** Clamp on the resulting per-pixel spatial delta. */
  maxSpatial?: number;
  blockSize?: number;
  seed?: number;
}

export function dctBandJitter(img: Raster, opts: FrequencyJitterOptions = {}): Raster {
  const {
    bandMin = 2,
    bandMax = 6,
    coeffJitter = 6,
    maxSpatial = 10,
    blockSize = 8,
    seed = 1,
  } = opts;
  const w = img.width;
  const h = img.height;
  const delta = new Float64Array(w * h);
  const rng = mulberry32(seed);
  const n = blockSize * blockSize;

  forEachBlockOrigin(w, h, blockSize, (bx, by) => {
    // Inject band-limited random energy into the carrier band. The disruption is
    // content-independent (additive over the existing coefficients), so we build
    // the delta spectrum directly and inverse-transform it.
    const noisy = new Float64Array(n);
    let touched = false;
    for (let i = 1; i < n; i++) {
      const u = i % blockSize;
      const v = (i / blockSize) | 0;
      const r = Math.hypot(u, v);
      if (r >= bandMin && r <= bandMax) {
        noisy[i] = (rng() * 2 - 1) * coeffJitter;
        touched = true;
      }
    }
    if (!touched) return;
    const spatial = idct2d(noisy, blockSize); // delta only (DC=0, out-of-band=0)
    for (let y = 0; y < blockSize; y++) {
      const sy = by + y;
      if (sy >= h) break;
      for (let x = 0; x < blockSize; x++) {
        const sx = bx + x;
        if (sx >= w) continue;
        let d = spatial[y * blockSize + x]!;
        if (d > maxSpatial) d = maxSpatial;
        if (d < -maxSpatial) d = -maxSpatial;
        delta[sy * w + sx] = d;
      }
    }
  });

  return addLumaPlane(img, delta);
}
