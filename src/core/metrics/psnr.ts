import { assertSameSize, type Raster } from '../types';

/** Mean squared error over the RGB channels (alpha ignored). */
export function mse(a: Raster, b: Raster): number {
  assertSameSize(a, b);
  const da = a.data;
  const db = b.data;
  let sum = 0;
  const n = a.width * a.height;
  for (let i = 0; i < n; i++) {
    const o = i * 4;
    for (let c = 0; c < 3; c++) {
      const diff = da[o + c]! - db[o + c]!;
      sum += diff * diff;
    }
  }
  return sum / (n * 3);
}

/** Peak signal-to-noise ratio in dB (Infinity when identical). */
export function psnr(a: Raster, b: Raster, peak = 255): number {
  const m = mse(a, b);
  if (m === 0) return Infinity;
  return 10 * Math.log10((peak * peak) / m);
}
