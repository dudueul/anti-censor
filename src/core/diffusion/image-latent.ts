import { createRaster, type Raster } from '../types';

/**
 * Image <-> tensor conversion for the diffusion pipeline (pure, unit-tested).
 * Tensors are CHW RGB in [-1, 1] — the convention Stable-Diffusion VAEs expect.
 */

/** RGBA raster -> CHW RGB Float32 tensor normalised to [-1, 1]. */
export function rasterToTensor(img: Raster): Float32Array {
  const n = img.width * img.height;
  const out = new Float32Array(3 * n);
  const d = img.data;
  for (let i = 0; i < n; i++) {
    const o = i * 4;
    out[i] = d[o]! / 127.5 - 1; // R plane
    out[n + i] = d[o + 1]! / 127.5 - 1; // G plane
    out[2 * n + i] = d[o + 2]! / 127.5 - 1; // B plane
  }
  return out;
}

/** CHW RGB [-1,1] tensor -> RGBA raster (alpha opaque). */
export function tensorToRaster(tensor: Float32Array, width: number, height: number): Raster {
  const img = createRaster(width, height);
  const n = width * height;
  for (let i = 0; i < n; i++) {
    const o = i * 4;
    img.data[o] = (tensor[i]! + 1) * 127.5;
    img.data[o + 1] = (tensor[n + i]! + 1) * 127.5;
    img.data[o + 2] = (tensor[2 * n + i]! + 1) * 127.5;
    img.data[o + 3] = 255;
  }
  return img;
}
