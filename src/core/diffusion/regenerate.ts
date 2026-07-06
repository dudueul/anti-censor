import { mulberry32 } from '../prng';
import {
  strengthToTimesteps,
  addNoiseToLatent,
  lcmDenoiseStep,
} from './scheduler';

/**
 * Pure img2img regeneration loop over latents. The denoiser (the UNet forward
 * pass) is injected, so this LCM-style multistep control flow is fully
 * unit-testable without a model or a GPU; the adapter supplies a real ONNX-backed
 * denoiser. See docs/REGENERATION-FEASIBILITY.md.
 */
export interface LatentDenoiser {
  /** Predict the noise present in `latent` at timestep `t`. */
  predictNoise(latent: Float32Array, t: number): Promise<Float32Array>;
}

export interface RegenerateOptions {
  /** img2img strength 0..1: how much of the original to re-synthesise. */
  strength?: number;
  /** Denoise steps (1-4 for LCM/Turbo). */
  steps?: number;
  seed?: number;
  numTrain?: number;
}

export interface RegenerateResult {
  latent: Float32Array;
  timesteps: number[];
}

function gaussianLike(ref: Float32Array, seed: number): Float32Array {
  const rng = mulberry32(seed);
  const out = new Float32Array(ref.length);
  for (let i = 0; i < out.length; i++) out[i] = rng.gaussian();
  return out;
}

export async function regenerateLatent(
  x0: Float32Array,
  alphaBar: Float64Array,
  model: LatentDenoiser,
  opts: RegenerateOptions = {},
): Promise<RegenerateResult> {
  const { strength = 0.2, steps = 2, seed = 1, numTrain = alphaBar.length } = opts;
  const timesteps = strengthToTimesteps(strength, steps, numTrain);

  // Inject the initial noise, scaled to the starting timestep.
  let xt = addNoiseToLatent(x0, gaussianLike(x0, seed), alphaBar, timesteps[0]!);

  for (let i = 0; i < timesteps.length; i++) {
    const t = timesteps[i]!;
    const eps = await model.predictNoise(xt, t);
    const x0hat = lcmDenoiseStep(xt, eps, alphaBar, t);
    if (i < timesteps.length - 1) {
      // Re-noise the current x0 estimate down to the next (lower) timestep.
      const nextT = timesteps[i + 1]!;
      const fresh = gaussianLike(x0, (seed ^ ((i + 1) * 0x9e3779b1)) >>> 0);
      xt = addNoiseToLatent(x0hat, fresh, alphaBar, nextT);
    } else {
      xt = x0hat;
    }
  }

  return { latent: xt, timesteps };
}
