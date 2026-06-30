import type { Raster } from './types';
import { mulberry32 } from './prng';
import { aHash } from './hash/ahash';
import { dHash } from './hash/dhash';
import { pHash } from './hash/phash';
import { hamming } from './hash/hamming';
import { ssim } from './metrics/ssim';
import { psnr } from './metrics/psnr';
import { geometricJitter } from './transforms/geometry';
import { dctBandJitter } from './transforms/frequency';
import { addLowFrequencyField } from './transforms/perceptual';
import { addGaussianNoise } from './transforms/noise';
import { adjustTone } from './transforms/tone';
import {
  maximizeAverageHash,
  maximizeDifferenceHash,
  maximizePerceptualHash,
} from './transforms/perceptual';
import { simulateJpeg } from './transforms/quantize';

/**
 * The ordered, deterministic anti-fingerprinting pipeline (pure core; the
 * metadata-strip and real re-encode happen in the browser adapter around this).
 * It applies geometry early (the strongest hash defeat), then frequency/pixel
 * perturbation, then the LATE surgical hash maximizers (so they target the final
 * pixels), then a recompress simulation — and a verification gate that re-runs at
 * higher strength if the hashes did not move far enough, or lower strength if
 * fidelity dropped too far.
 */
export interface PipelineOptions {
  /** Overall 0..1 strength. */
  strength?: number;
  seed?: number;
  /** Allow a horizontal flip (changes orientation; gate off for text). */
  flipAllowed?: boolean;
  /** Per-hash Hamming distance the result must beat. */
  targetHashDistance?: number;
  /** Minimum acceptable SSIM vs the original. */
  minSsim?: number;
  /** Max verification re-runs. */
  maxIterations?: number;
}

export interface PipelineMetrics {
  aHashDistance: number;
  dHashDistance: number;
  pHashDistance: number;
  ssim: number;
  psnr: number;
}

export interface PipelineResult {
  image: Raster;
  metrics: PipelineMetrics;
  passed: boolean;
  iterations: number;
  strengthUsed: number;
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

function runOnce(
  img: Raster,
  strength: number,
  seed: number,
  flipAllowed: boolean,
): Raster {
  const s = clamp01(strength);
  const rng = mulberry32(seed);
  const sub = (salt: number): number => (seed ^ salt) >>> 0;
  // Geometry is kept GENTLE: enough to desync grid hashes, small enough that the
  // low-cost surgical maximizers (not geometry) dominate and SSIM stays high.
  const cropBase = 0.005 + 0.012 * s;

  // 1. gentle geometry (desync grid hashes, esp. dHash)
  let out = geometricJitter(img, {
    rotateDeg: (0.3 + 0.9 * s) * (rng() < 0.5 ? -1 : 1),
    cropLeft: cropBase * rng(),
    cropRight: cropBase * rng(),
    cropTop: cropBase * rng(),
    cropBottom: cropBase * rng(),
    scaleX: 1 + 0.008 * s,
    scaleY: 1 + 0.005 * s,
    flip: flipAllowed,
  });

  // 2. frequency-domain carrier-band disruption
  out = dctBandJitter(out, {
    coeffJitter: 3 + 4 * s,
    maxSpatial: 4 + 4 * s,
    seed: sub(0x9e3779b9),
  });

  // 3. light pixel perturbation (low-freq field + grain + mild tone)
  out = addLowFrequencyField(out, { grid: 12, amplitude: 1 + 1.5 * s, seed: sub(0x85ebca6b) });
  out = addGaussianNoise(out, { amplitude: 0.8 + 1 * s, seed: sub(0xc2b2ae35) });
  out = adjustTone(out, { brightness: 0.8 * s, contrast: 1 + 0.012 * s, gamma: 1 - 0.012 * s });

  // 4. LATE surgical hash maximizers, applied so each later one disturbs the
  // earlier ones least: pHash (low-freq DCT, near-invisible) first, then the
  // lighter dHash block field, then aHash LAST so its mean-threshold flips are
  // not perturbed by a subsequent stage. dHash already has large margin from its
  // maximizer + geometry, so it is kept light to save fidelity.
  out = maximizePerceptualHash(out, { amplitude: 16 + 8 * s, margin: 2 });
  out = maximizeDifferenceHash(out, { amplitude: 8 + 4 * s, margin: 3 });
  out = maximizeAverageHash(out, { amplitude: 14 + 6 * s, margin: 3 });

  // 5. recompress (fresh bitstream; destroys fragile marks). Gentle quality.
  out = simulateJpeg(out, { quality: Math.round(94 - 6 * s), seed: sub(0x27d4eb2f) });

  return out;
}

function measure(orig: Raster, out: Raster): PipelineMetrics {
  return {
    aHashDistance: hamming(aHash(orig), aHash(out)),
    dHashDistance: hamming(dHash(orig), dHash(out)),
    pHashDistance: hamming(pHash(orig), pHash(out)),
    ssim: ssim(orig, out),
    psnr: psnr(orig, out),
  };
}

export function transformImage(img: Raster, opts: PipelineOptions = {}): PipelineResult {
  const {
    strength = 0.4,
    seed = 1,
    flipAllowed = false,
    targetHashDistance = 12,
    minSsim = 0.75,
    maxIterations = 3,
  } = opts;

  let s = clamp01(strength);
  let best: { image: Raster; metrics: PipelineMetrics; s: number } | null = null;

  let iterations = 0;
  for (let i = 0; i < Math.max(1, maxIterations); i++) {
    iterations++;
    const image = runOnce(img, s, (seed + i * 0x1000193) >>> 0, flipAllowed);
    const metrics = measure(img, image);
    const hashesOk =
      metrics.aHashDistance >= targetHashDistance &&
      metrics.dHashDistance >= targetHashDistance &&
      metrics.pHashDistance >= targetHashDistance;
    const fidelityOk = metrics.ssim >= minSsim;

    if (!best || score(metrics, targetHashDistance, minSsim) > score(best.metrics, targetHashDistance, minSsim)) {
      best = { image, metrics, s };
    }
    if (hashesOk && fidelityOk) {
      return { image, metrics, passed: true, iterations, strengthUsed: s };
    }
    // Adjust for the next attempt.
    if (!fidelityOk) s = clamp01(s - 0.15);
    else if (!hashesOk) s = clamp01(s + 0.2);
  }

  const b = best!;
  const passed =
    b.metrics.aHashDistance >= targetHashDistance &&
    b.metrics.dHashDistance >= targetHashDistance &&
    b.metrics.pHashDistance >= targetHashDistance &&
    b.metrics.ssim >= minSsim;
  return { image: b.image, metrics: b.metrics, passed, iterations, strengthUsed: b.s };
}

/** Prefer results that clear both gates; otherwise reward distance and fidelity. */
function score(m: PipelineMetrics, target: number, minSsim: number): number {
  const hashOk = Math.min(m.aHashDistance, m.dHashDistance, m.pHashDistance) >= target;
  const fidOk = m.ssim >= minSsim;
  const base = (hashOk ? 1000 : 0) + (fidOk ? 1000 : 0);
  return base + Math.min(m.aHashDistance, m.dHashDistance, m.pHashDistance) + m.ssim * 10;
}
