import { describe, it, expect } from 'vitest';
import { regenerateLatent, type LatentDenoiser } from '../../src/core/diffusion/regenerate';
import { alphasCumprod, linearBetaSchedule } from '../../src/core/diffusion/scheduler';

const alphaBar = alphasCumprod(linearBetaSchedule(1000));

/** Fake denoiser that records the timesteps it is asked about. */
function recorder(pred: (l: Float32Array, t: number) => Float32Array): LatentDenoiser & { calls: number[] } {
  const calls: number[] = [];
  return {
    calls,
    async predictNoise(latent, t) {
      calls.push(t);
      return pred(latent, t);
    },
  };
}

describe('regenerateLatent', () => {
  const x0 = Float32Array.from([0.5, -0.3, 0.9, -0.7, 0.1, 0.0]);

  it('calls the denoiser once per step with descending in-range timesteps', async () => {
    const model = recorder((l) => new Float32Array(l.length)); // predict zero noise
    const { timesteps } = await regenerateLatent(x0, alphaBar, model, { strength: 0.3, steps: 4, seed: 1 });
    expect(model.calls.length).toBe(4);
    expect(model.calls).toEqual(timesteps);
    for (let i = 1; i < timesteps.length; i++) expect(timesteps[i]!).toBeLessThan(timesteps[i - 1]!);
    for (const t of timesteps) {
      expect(t).toBeGreaterThanOrEqual(0);
      expect(t).toBeLessThan(1000);
    }
  });

  it('preserves latent shape', async () => {
    const model = recorder((l) => new Float32Array(l.length));
    const { latent } = await regenerateLatent(x0, alphaBar, model, { strength: 0.2, steps: 2 });
    expect(latent.length).toBe(x0.length);
  });

  it('is deterministic for a given seed and differs across seeds', async () => {
    const model = () => recorder((l) => new Float32Array(l.length).fill(0.01));
    const a = await regenerateLatent(x0, alphaBar, model(), { strength: 0.3, steps: 3, seed: 7 });
    const b = await regenerateLatent(x0, alphaBar, model(), { strength: 0.3, steps: 3, seed: 7 });
    const c = await regenerateLatent(x0, alphaBar, model(), { strength: 0.3, steps: 3, seed: 8 });
    expect(Array.from(a.latent)).toEqual(Array.from(b.latent));
    expect(Array.from(a.latent)).not.toEqual(Array.from(c.latent));
  });

  it('lower strength stays closer to the input (less re-synthesis)', async () => {
    // model that predicts the noise it is given a scaled version of -> some drift
    const model = () => recorder((l) => Float32Array.from(l, (v) => v * 0.1));
    const dist = async (strength: number) => {
      const { latent } = await regenerateLatent(x0, alphaBar, model(), { strength, steps: 3, seed: 1 });
      let d = 0;
      for (let i = 0; i < x0.length; i++) d += Math.abs(latent[i]! - x0[i]!);
      return d;
    };
    expect(await dist(0.05)).toBeLessThan(await dist(0.6));
  });
});
