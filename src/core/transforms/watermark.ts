import type { Raster } from '../types';
import { mulberry32 } from '../prng';
import { geometricJitter } from './geometry';
import { dctBandJitter } from './frequency';
import { addGaussianNoise } from './noise';
import { simulateJpeg } from './quantize';

/**
 * Watermark-disruptor orchestrator.
 *
 * The reliable client-side defeat of a *blind, block-aligned* classical
 * watermark (LSB, Cox-style DCT/DWT spread spectrum, dwtDct, QIM) is to
 * de-synchronise the embedding grid (geometry) and overwrite the carrier band
 * (frequency jitter + noise), then re-encode. This composes those pure stages at
 * an `aggression` level. Crucially it also returns an HONEST per-scheme efficacy
 * report: learned/robust marks (SynthID, Tree-Ring, StegaStamp, Digimarc) are
 * NOT defeatable in a pure client-side extension (they need diffusion
 * regeneration) and are reported as such rather than silently "handled".
 */
export type SchemeStatus = 'defeated' | 'partial' | 'not-defeated';

export interface SchemeVerdict {
  scheme: string;
  status: SchemeStatus;
  reason: string;
}

export interface WatermarkProfile {
  /** Which family of marks to optimise the composition for. */
  profile?: 'classical' | 'learned' | 'unknown';
  /** 0..1 strength/quality tradeoff. */
  aggression?: number;
  seed?: number;
}

export interface WatermarkResult {
  image: Raster;
  report: SchemeVerdict[];
}

export function watermarkEfficacyReport(): SchemeVerdict[] {
  return [
    { scheme: 'LSB steganography', status: 'defeated', reason: 'destroyed by any lossy re-encode' },
    { scheme: 'DCT/DWT spread-spectrum (dwtDct/dwtDctSvd)', status: 'defeated', reason: 'grid desync + carrier-band randomization drops correlation below threshold' },
    { scheme: 'QIM / dither modulation', status: 'defeated', reason: 're-quantization crosses lattice boundaries' },
    { scheme: 'Exact file / byte hash', status: 'defeated', reason: 'fresh bitstream after re-encode' },
    { scheme: 'RivaGAN', status: 'partial', reason: 'learned; needs aggressive geometry, not guaranteed' },
    { scheme: 'Meta Stable Signature', status: 'partial', reason: 'learned decoder; survives mild edits, broken only by strong distortion' },
    { scheme: 'Google SynthID-Image', status: 'not-defeated', reason: 'adversarially trained; ~99.9% detection survives JPEG/crop/noise. Only diffusion regeneration removes it (not client-side)' },
    { scheme: 'Tree-Ring', status: 'not-defeated', reason: 'Fourier-domain, geometry-invariant; needs diffusion regeneration' },
    { scheme: 'StegaStamp', status: 'not-defeated', reason: 'learned, robust to signal-processing attacks; needs regeneration' },
    { scheme: 'Digimarc', status: 'not-defeated', reason: 'commercial robust watermark; not reliably removable client-side' },
  ];
}

export function disruptWatermark(img: Raster, opts: WatermarkProfile = {}): WatermarkResult {
  const { aggression = 0.5, seed = 1 } = opts;
  const a = Math.min(1, Math.max(0, aggression));
  const rng = mulberry32(seed);

  // Geometry desync is the primary lever; randomise edges/sign deterministically.
  const cropBase = 0.02 + 0.06 * a;
  const rot = (1 + 4 * a) * (rng() < 0.5 ? -1 : 1);
  let out = geometricJitter(img, {
    rotateDeg: rot,
    cropLeft: cropBase * rng(),
    cropRight: cropBase * rng(),
    cropTop: cropBase * rng(),
    cropBottom: cropBase * rng(),
    scaleX: 1 + 0.02 * a,
  });

  out = dctBandJitter(out, {
    coeffJitter: 6 + 10 * a,
    maxSpatial: 10 + 6 * a,
    seed: (seed ^ 0x9e3779b9) >>> 0,
  });
  out = addGaussianNoise(out, { amplitude: 2 + 3 * a, seed: (seed ^ 0x12345) >>> 0 });
  out = simulateJpeg(out, { quality: Math.round(90 - 12 * a), seed: (seed ^ 0xabcdef) >>> 0 });

  return { image: out, report: watermarkEfficacyReport() };
}
