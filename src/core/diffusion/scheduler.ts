/**
 * Pure diffusion scheduler math for img2img regeneration (browser-free, fully
 * unit-tested). The GPU-bound parts — VAE encode/decode and the UNet forward
 * pass — live in the adapter; everything here (noise schedule, strength->timestep
 * mapping, latent noising, and the LCM-style denoise reconstruction) is exact,
 * deterministic float math, so the regeneration control flow is verifiable
 * without a model or a GPU.
 *
 * img2img regeneration attack (docs/REGENERATION-FEASIBILITY.md): encode the
 * image to a latent, add a controlled amount of noise (set by `strength`), then
 * run a few denoise steps so the diffusion prior re-synthesises the content —
 * which destroys learned pixel watermarks while preserving the image.
 */

/** Standard linear beta schedule (Stable Diffusion defaults). */
export function linearBetaSchedule(
  numTrain = 1000,
  betaStart = 0.00085,
  betaEnd = 0.012,
): Float64Array {
  const betas = new Float64Array(numTrain);
  // SD uses "scaled_linear": betas = linspace(sqrt(start), sqrt(end))^2
  const a = Math.sqrt(betaStart);
  const b = Math.sqrt(betaEnd);
  for (let i = 0; i < numTrain; i++) {
    const t = numTrain === 1 ? 0 : i / (numTrain - 1);
    const v = a + (b - a) * t;
    betas[i] = v * v;
  }
  return betas;
}

/** Cumulative product of alphas (alpha_bar_t) from a beta schedule. */
export function alphasCumprod(betas: Float64Array): Float64Array {
  const ac = new Float64Array(betas.length);
  let prod = 1;
  for (let i = 0; i < betas.length; i++) {
    prod *= 1 - betas[i]!;
    ac[i] = prod;
  }
  return ac;
}

/**
 * Map an img2img `strength` (0..1) and a step count to a descending list of
 * timesteps. Higher strength starts from a noisier timestep (more re-synthesis);
 * lower strength keeps more of the original.
 */
export function strengthToTimesteps(
  strength: number,
  steps: number,
  numTrain = 1000,
): number[] {
  const s = Math.min(1, Math.max(0, strength));
  const n = Math.max(1, Math.floor(steps));
  const startT = Math.min(numTrain - 1, Math.max(0, Math.round(s * (numTrain - 1))));
  const out: number[] = [];
  for (let i = 0; i < n; i++) {
    const t = Math.round((startT * (n - 1 - i)) / n);
    out.push(Math.max(0, Math.min(numTrain - 1, t)));
  }
  return out;
}

/** Forward diffusion: x_t = sqrt(alpha_bar_t) * x_0 + sqrt(1 - alpha_bar_t) * noise. */
export function addNoiseToLatent(
  x0: Float32Array,
  noise: Float32Array,
  alphaBar: Float64Array,
  t: number,
): Float32Array {
  const a = alphaBar[Math.max(0, Math.min(alphaBar.length - 1, t))]!;
  const sa = Math.sqrt(a);
  const sb = Math.sqrt(1 - a);
  const out = new Float32Array(x0.length);
  for (let i = 0; i < x0.length; i++) out[i] = sa * x0[i]! + sb * noise[i]!;
  return out;
}

/**
 * LCM/epsilon-prediction reconstruction of x_0 from x_t and predicted noise:
 *   x_0 = (x_t - sqrt(1 - alpha_bar_t) * eps) / sqrt(alpha_bar_t)
 * With the true noise this recovers x_0 exactly (verified in tests).
 */
export function lcmDenoiseStep(
  xt: Float32Array,
  predictedNoise: Float32Array,
  alphaBar: Float64Array,
  t: number,
): Float32Array {
  const a = alphaBar[Math.max(0, Math.min(alphaBar.length - 1, t))]!;
  const sa = Math.sqrt(a);
  const sb = Math.sqrt(1 - a);
  const out = new Float32Array(xt.length);
  for (let i = 0; i < xt.length; i++) out[i] = (xt[i]! - sb * predictedNoise[i]!) / sa;
  return out;
}

/** Linear blend: (1 - w) * a + w * b. */
export function mixLatents(a: Float32Array, b: Float32Array, w: number): Float32Array {
  const out = new Float32Array(a.length);
  for (let i = 0; i < a.length; i++) out[i] = (1 - w) * a[i]! + w * b[i]!;
  return out;
}
