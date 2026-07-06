import { createRaster, type Raster } from '../types';
import { resizeBilinear } from '../resample';
import { mulberry32 } from '../prng';

/**
 * Smooth elastic warp: displace each pixel by a small, low-frequency random
 * vector field. Because the displacement varies smoothly across the image, it is
 * a *local* geometric change that no single global transform (rotation/flip/
 * crop) can invert — so it survives a dihedral-aware defender that re-normalises
 * orientation, while staying imperceptible at a 1-3px amplitude. Reproducible
 * from `seed`; output keeps input dimensions; input is never mutated.
 */
export interface ElasticWarpOptions {
  /** Peak displacement in pixels. */
  amplitude?: number;
  /** Resolution of the random displacement field. */
  grid?: number;
  seed?: number;
}

export function elasticWarp(img: Raster, opts: ElasticWarpOptions = {}): Raster {
  const { amplitude = 2, grid = 10, seed = 1 } = opts;
  const w = img.width;
  const h = img.height;
  const out = createRaster(w, h);

  const rng = mulberry32(seed);
  const gx = new Float64Array(grid * grid);
  const gy = new Float64Array(grid * grid);
  for (let i = 0; i < gx.length; i++) gx[i] = (rng() * 2 - 1) * amplitude;
  for (let i = 0; i < gy.length; i++) gy[i] = (rng() * 2 - 1) * amplitude;
  const dx = resizeBilinear(gx, grid, grid, w, h);
  const dy = resizeBilinear(gy, grid, grid, w, h);

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const idx = y * w + x;
      sampleBilinear(img, x + dx[idx]!, y + dy[idx]!, out, idx * 4);
    }
  }
  return out;
}

function sampleBilinear(
  img: Raster,
  fx: number,
  fy: number,
  out: Raster,
  outOff: number,
): void {
  const w = img.width;
  const h = img.height;
  let x = fx;
  let y = fy;
  if (x < 0) x = 0;
  if (y < 0) y = 0;
  if (x > w - 1) x = w - 1;
  if (y > h - 1) y = h - 1;
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const x1 = Math.min(x0 + 1, w - 1);
  const y1 = Math.min(y0 + 1, h - 1);
  const wx = x - x0;
  const wy = y - y0;
  const d = img.data;
  const o00 = (y0 * w + x0) * 4;
  const o01 = (y0 * w + x1) * 4;
  const o10 = (y1 * w + x0) * 4;
  const o11 = (y1 * w + x1) * 4;
  for (let ch = 0; ch < 4; ch++) {
    const top = d[o00 + ch]! * (1 - wx) + d[o01 + ch]! * wx;
    const bot = d[o10 + ch]! * (1 - wx) + d[o11 + ch]! * wx;
    out.data[outOff + ch] = top * (1 - wy) + bot * wy;
  }
}
