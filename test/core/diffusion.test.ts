import { describe, it, expect } from 'vitest';
import {
  linearBetaSchedule,
  alphasCumprod,
  strengthToTimesteps,
  addNoiseToLatent,
  lcmDenoiseStep,
  mixLatents,
} from '../../src/core/diffusion/scheduler';
import { mulberry32 } from '../../src/core/prng';

describe('linearBetaSchedule / alphasCumprod', () => {
  it('produces T increasing betas in (0,1) and a decreasing cumulative alpha', () => {
    const betas = linearBetaSchedule(1000);
    expect(betas.length).toBe(1000);
    expect(betas[0]!).toBeGreaterThan(0);
    expect(betas[999]!).toBeLessThan(1);
    expect(betas[999]!).toBeGreaterThan(betas[0]!);
    const ac = alphasCumprod(betas);
    expect(ac.length).toBe(1000);
    expect(ac[0]!).toBeLessThan(1);
    expect(ac[0]!).toBeGreaterThan(ac[999]!); // monotically decreasing
    expect(ac[999]!).toBeGreaterThan(0);
  });
});

describe('strengthToTimesteps', () => {
  it('selects fewer starting steps for lower strength', () => {
    const weak = strengthToTimesteps(0.1, 4, 1000);
    const strong = strengthToTimesteps(0.5, 4, 1000);
    // both return an ordered (descending) timestep list
    expect(weak.every((t, i) => i === 0 || t < weak[i - 1]!)).toBe(true);
    // lower strength starts at a lower initial timestep (less noise injected)
    expect(weak[0]!).toBeLessThan(strong[0]!);
    // start timesteps stay within range
    expect(strong[0]!).toBeLessThan(1000);
    expect(weak[weak.length - 1]!).toBeGreaterThanOrEqual(0);
  });

  it('clamps strength to [0,1] and step count to >=1', () => {
    expect(strengthToTimesteps(5, 0, 1000).length).toBeGreaterThanOrEqual(1);
    expect(strengthToTimesteps(-1, 2, 1000)[0]).toBeGreaterThanOrEqual(0);
  });
});

describe('addNoiseToLatent', () => {
  const ac = alphasCumprod(linearBetaSchedule(1000));

  it('at t=0 (min noise) stays close to the original latent', () => {
    const x0 = Float32Array.from([1, -1, 0.5, -0.5]);
    const noise = Float32Array.from([0.3, 0.3, 0.3, 0.3]);
    const xtLow = addNoiseToLatent(x0, noise, ac, 0);
    const xtHigh = addNoiseToLatent(x0, noise, ac, 900);
    let dLow = 0;
    let dHigh = 0;
    for (let i = 0; i < x0.length; i++) {
      dLow += Math.abs(xtLow[i]! - x0[i]!);
      dHigh += Math.abs(xtHigh[i]! - x0[i]!);
    }
    expect(dLow).toBeLessThan(dHigh); // more timestep => more deviation from x0
  });

  it('matches the closed form x_t = sqrt(ac)*x0 + sqrt(1-ac)*noise', () => {
    const x0 = Float32Array.from([2]);
    const noise = Float32Array.from([1]);
    const t = 500;
    const out = addNoiseToLatent(x0, noise, ac, t);
    const a = ac[t]!;
    expect(out[0]!).toBeCloseTo(Math.sqrt(a) * 2 + Math.sqrt(1 - a) * 1, 5);
  });
});

describe('lcmDenoiseStep', () => {
  const ac = alphasCumprod(linearBetaSchedule(1000));
  it('recovers x0 when the model predicts the true noise', () => {
    const x0 = Float32Array.from([0.7, -0.2, 0.4]);
    const rng = mulberry32(1);
    const noise = Float32Array.from(Array.from(x0, () => rng.gaussian()));
    const t = 400;
    const xt = addNoiseToLatent(x0, noise, ac, t);
    // model predicts the exact noise => x0_hat should match x0
    const x0hat = lcmDenoiseStep(xt, noise, ac, t);
    for (let i = 0; i < x0.length; i++) expect(x0hat[i]!).toBeCloseTo(x0[i]!, 4);
  });
});

describe('mixLatents', () => {
  it('linearly blends two latents by weight', () => {
    const a = Float32Array.from([0, 0]);
    const b = Float32Array.from([10, 20]);
    expect(Array.from(mixLatents(a, b, 0))).toEqual([0, 0]);
    expect(Array.from(mixLatents(a, b, 1))).toEqual([10, 20]);
    expect(Array.from(mixLatents(a, b, 0.5))).toEqual([5, 10]);
  });
});
