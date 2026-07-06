import type { Raster } from '../types';
import { rasterToTensor, tensorToRaster } from './image-latent';
import { regenerateLatent, type LatentDenoiser, type RegenerateOptions } from './regenerate';

/**
 * Pure image-level img2img regeneration orchestration. The VAE encode/decode and
 * the UNet denoiser are injected (the adapter supplies ONNX-backed versions), so
 * the whole encode -> regenerate -> decode flow is unit-testable with fakes; only
 * the real model weights are GPU-only. See docs/REGENERATION-FEASIBILITY.md.
 */
export interface LatentShape {
  w: number;
  h: number;
}

export interface RegenerateImageDeps {
  alphaBar: Float64Array;
  /** Image tensor (CHW RGB [-1,1]) -> latent. */
  vaeEncode(imageTensor: Float32Array, w: number, h: number): Promise<{ latent: Float32Array; shape: LatentShape }>;
  denoiser: LatentDenoiser;
  /** Latent -> image tensor (CHW RGB [-1,1]). */
  vaeDecode(latent: Float32Array, shape: LatentShape): Promise<{ imageTensor: Float32Array; w: number; h: number }>;
}

export async function regenerateImage(
  raster: Raster,
  opts: RegenerateOptions,
  deps: RegenerateImageDeps,
): Promise<Raster> {
  const tensor = rasterToTensor(raster);
  const { latent, shape } = await deps.vaeEncode(tensor, raster.width, raster.height);
  const { latent: regenerated } = await regenerateLatent(latent, deps.alphaBar, deps.denoiser, opts);
  const { imageTensor, w, h } = await deps.vaeDecode(regenerated, shape);
  return tensorToRaster(imageTensor, w, h);
}
