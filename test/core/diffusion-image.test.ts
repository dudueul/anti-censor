import { describe, it, expect } from 'vitest';
import { rasterToTensor, tensorToRaster } from '../../src/core/diffusion/image-latent';
import { regenerateImage, type RegenerateImageDeps } from '../../src/core/diffusion/pipeline';
import { alphasCumprod, linearBetaSchedule } from '../../src/core/diffusion/scheduler';
import { ssim } from '../../src/core/metrics/ssim';
import { mulberry32 } from '../../src/core/prng';
import { photoLike } from '../fixtures';

describe('rasterToTensor / tensorToRaster', () => {
  const img = photoLike(32, 24, 3);

  it('produces a CHW RGB tensor normalised to [-1, 1]', () => {
    const t = rasterToTensor(img);
    expect(t.length).toBe(3 * img.width * img.height);
    for (const v of t) {
      expect(v).toBeGreaterThanOrEqual(-1);
      expect(v).toBeLessThanOrEqual(1);
    }
  });

  it('round-trips back to the original raster within rounding', () => {
    const back = tensorToRaster(rasterToTensor(img), img.width, img.height);
    expect(back.width).toBe(img.width);
    expect(back.height).toBe(img.height);
    let maxDiff = 0;
    for (let i = 0; i < img.data.length; i++) {
      if (i % 4 === 3) {
        expect(back.data[i]).toBe(255); // alpha
        continue;
      }
      maxDiff = Math.max(maxDiff, Math.abs(back.data[i]! - img.data[i]!));
    }
    expect(maxDiff).toBeLessThanOrEqual(1);
  });
});

describe('regenerateImage (orchestration with injected VAE + denoiser)', () => {
  const img = photoLike(48, 48, 5);
  const alphaBar = alphasCumprod(linearBetaSchedule(1000));

  // Identity VAE (latent == image tensor) and a zero-noise denoiser, to exercise
  // the full encode -> regenerate -> decode path without a real model.
  function identityDeps(): RegenerateImageDeps {
    return {
      alphaBar,
      async vaeEncode(tensor, w, h) {
        return { latent: tensor, shape: { w, h } };
      },
      denoiser: {
        async predictNoise(latent) {
          return new Float32Array(latent.length); // predict zero noise
        },
      },
      async vaeDecode(latent, shape) {
        return { imageTensor: latent, w: shape.w, h: shape.h };
      },
    };
  }

  it('runs encode -> denoise steps -> decode and preserves dimensions', async () => {
    const deps = identityDeps();
    const out = await regenerateImage(img, { strength: 0.15, steps: 2 }, deps);
    expect(out.width).toBe(img.width);
    expect(out.height).toBe(img.height);
  });

  it('a perfect denoiser (identity VAE, one step) recovers the image', async () => {
    // The loop injects noise = gaussian(seed); a denoiser returning exactly that
    // noise must reconstruct x0 -> output == input. Verifies the encode/noise/
    // denoise/decode wiring is correct (the real model approximates this).
    const seed = 1;
    const x0 = rasterToTensor(img);
    const rng = mulberry32(seed);
    const injected = Float32Array.from(x0, () => rng.gaussian());
    const deps: RegenerateImageDeps = {
      alphaBar,
      async vaeEncode(tensor, w, h) {
        return { latent: tensor, shape: { w, h } };
      },
      denoiser: { async predictNoise() {
        return injected;
      } },
      async vaeDecode(latent, shape) {
        return { imageTensor: latent, w: shape.w, h: shape.h };
      },
    };
    const out = await regenerateImage(img, { strength: 0.3, steps: 1, seed }, deps);
    expect(ssim(img, out)).toBeGreaterThan(0.99);
  });

  it('is deterministic for a given seed', async () => {
    const a = await regenerateImage(img, { strength: 0.2, steps: 3, seed: 9 }, identityDeps());
    const b = await regenerateImage(img, { strength: 0.2, steps: 3, seed: 9 }, identityDeps());
    expect(Array.from(a.data)).toEqual(Array.from(b.data));
  });
});
