import { mulberry32 } from '../prng';

/**
 * Pure audio DSP cores over Float32 PCM (mono), used to desynchronise audio
 * fingerprinting (Chromaprint/AcoustID chroma bins; Shazam constellation peaks)
 * on a video's soundtrack. WebAudio/WebCodecs decode/encode lives in an adapter;
 * these are deterministic and unit-testable in Node.
 */

/** Linear-interpolation resample by `ratio` (>1 shortens & raises pitch). */
export function resampleLinear(x: Float32Array, ratio: number): Float32Array {
  const r = ratio <= 0 ? 1 : ratio;
  const outLen = Math.max(1, Math.round(x.length / r));
  const out = new Float32Array(outLen);
  for (let i = 0; i < outLen; i++) {
    const pos = i * r;
    const i0 = Math.floor(pos);
    const i1 = Math.min(i0 + 1, x.length - 1);
    const frac = pos - i0;
    out[i] = x[i0]! * (1 - frac) + x[i1]! * frac;
  }
  return out;
}

/**
 * Weighted overlap-add time stretch by `factor` (>1 lengthens) preserving pitch.
 * Copies Hann-windowed time-domain grains at a synthesis hop, normalising by the
 * accumulated window so amplitude stays stable.
 */
export function timeStretch(x: Float32Array, factor: number, grain = 1024): Float32Array {
  const f = factor <= 0 ? 1 : factor;
  const N = Math.min(grain, Math.max(64, x.length));
  const Hs = Math.max(1, Math.floor(N / 4)); // synthesis hop (75% overlap)
  const Ha = Math.max(1, Math.round(Hs / f)); // analysis hop
  const win = new Float32Array(N);
  for (let k = 0; k < N; k++) win[k] = 0.5 - 0.5 * Math.cos((2 * Math.PI * k) / (N - 1));

  const outLen = Math.max(N, Math.round(x.length * f) + N);
  const out = new Float64Array(outLen);
  const wsum = new Float64Array(outLen);

  let a = 0;
  for (let s = 0; s + N <= outLen && a < x.length; s += Hs, a += Ha) {
    for (let k = 0; k < N; k++) {
      const xi = a + k;
      if (xi >= x.length) break;
      out[s + k] = out[s + k]! + win[k]! * x[xi]!;
      wsum[s + k] = wsum[s + k]! + win[k]!;
    }
  }

  const finalLen = Math.max(1, Math.round(x.length * f));
  const res = new Float32Array(finalLen);
  for (let i = 0; i < finalLen; i++) {
    res[i] = wsum[i]! > 1e-6 ? out[i]! / wsum[i]! : 0;
  }
  return res;
}

/** Shift pitch by `ratio` (>1 higher) while preserving duration. */
export function pitchShift(x: Float32Array, ratio: number): Float32Array {
  const r = ratio <= 0 ? 1 : ratio;
  return resampleLinear(timeStretch(x, r), r);
}

/** Add low-amplitude deterministic white noise. */
export function addAudioNoise(x: Float32Array, amplitude = 0.005, seed = 1): Float32Array {
  const rng = mulberry32(seed);
  const out = new Float32Array(x.length);
  for (let i = 0; i < x.length; i++) out[i] = x[i]! + (rng() * 2 - 1) * amplitude;
  return out;
}

/**
 * Sample-rate conversion (linear interpolation) that preserves real-time
 * duration and pitch — unlike {@link resampleLinear}, which changes speed. Used
 * to bring decoded audio to the Opus encoder's 48 kHz.
 */
export function convertSampleRate(x: Float32Array, srcRate: number, dstRate: number): Float32Array {
  if (srcRate === dstRate || x.length === 0) return x;
  const outLen = Math.max(1, Math.round((x.length * dstRate) / srcRate));
  const out = new Float32Array(outLen);
  const step = srcRate / dstRate;
  for (let i = 0; i < outLen; i++) {
    const pos = i * step;
    const i0 = Math.floor(pos);
    const i1 = Math.min(i0 + 1, x.length - 1);
    const frac = pos - i0;
    out[i] = x[i0]! * (1 - frac) + x[i1]! * frac;
  }
  return out;
}

export interface ObfuscateAudioOptions {
  /** Pitch shift ratio (duration-preserving). Small so it stays inaudible-ish. */
  pitch?: number;
  /** White-noise amplitude. */
  noise?: number;
  seed?: number;
  /** Encoder target rate (Opus wants 48 kHz). */
  targetRate?: number;
}

/**
 * Desynchronise audio fingerprints on a multi-channel track: a small
 * pitch micro-shift (duration-preserving, so A/V stays aligned) plus light
 * noise, resampled to `targetRate`. Pure; the browser encode/mux is the adapter.
 */
export function obfuscateAudio(
  channels: Float32Array[],
  srcRate: number,
  opts: ObfuscateAudioOptions = {},
): { channels: Float32Array[]; sampleRate: number } {
  const { pitch = 1.03, noise = 0.004, seed = 1, targetRate = 48000 } = opts;
  const out = channels.map((ch, i) => {
    let y = pitchShift(ch, pitch);
    y = addAudioNoise(y, noise, (seed ^ ((i + 1) * 0x9e3779b1)) >>> 0);
    y = convertSampleRate(y, srcRate, targetRate);
    return y;
  });
  return { channels: out, sampleRate: targetRate };
}
