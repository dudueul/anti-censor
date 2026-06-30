import { createRaster, type Raster } from '../src/core/types';
import { mulberry32 } from '../src/core/prng';

/** Solid color image. */
export function solid(
  w: number,
  h: number,
  [r, g, b]: [number, number, number],
): Raster {
  const img = createRaster(w, h);
  for (let i = 0; i < w * h; i++) {
    img.data[i * 4] = r;
    img.data[i * 4 + 1] = g;
    img.data[i * 4 + 2] = b;
    img.data[i * 4 + 3] = 255;
  }
  return img;
}

/** Horizontal gray gradient 0..255. */
export function gradient(w: number, h: number): Raster {
  const img = createRaster(w, h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const v = Math.round((x / Math.max(1, w - 1)) * 255);
      const o = (y * w + x) * 4;
      img.data[o] = v;
      img.data[o + 1] = v;
      img.data[o + 2] = v;
      img.data[o + 3] = 255;
    }
  }
  return img;
}

export function checkerboard(w: number, h: number, cell: number): Raster {
  const img = createRaster(w, h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const on = (Math.floor(x / cell) + Math.floor(y / cell)) % 2 === 0;
      const v = on ? 230 : 25;
      const o = (y * w + x) * 4;
      img.data[o] = v;
      img.data[o + 1] = v;
      img.data[o + 2] = v;
      img.data[o + 3] = 255;
    }
  }
  return img;
}

/**
 * A deterministic "photo-like" image: smooth low-frequency color structure plus
 * a couple of shapes and mild noise. It has enough structure to produce
 * non-degenerate perceptual hashes and realistic SSIM behaviour, while being
 * fully reproducible (no Math.random, no binary fixtures in the repo).
 */
export function photoLike(w: number, h: number, seed = 1): Raster {
  const img = createRaster(w, h);
  const rng = mulberry32(seed);
  const cx = w * (0.35 + rng() * 0.3);
  const cy = h * (0.35 + rng() * 0.3);
  const rad = Math.min(w, h) * (0.18 + rng() * 0.1);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const u = x / w;
      const v = y / h;
      // low-frequency color field
      let r = 128 + 90 * Math.sin(u * 6.28 + 0.5) + 30 * Math.cos(v * 9.42);
      let g = 128 + 80 * Math.sin(v * 6.28 + 1.7) + 25 * Math.sin(u * 12.5);
      let b = 128 + 70 * Math.cos(u * 4.5 + v * 4.5);
      // a bright disc
      const dx = x - cx;
      const dy = y - cy;
      if (dx * dx + dy * dy < rad * rad) {
        r += 60;
        g += 40;
        b += 20;
      }
      // a dark rectangle
      if (x > w * 0.6 && x < w * 0.85 && y > h * 0.2 && y < h * 0.45) {
        r -= 70;
        g -= 70;
        b -= 50;
      }
      // mild grain (photo-realistic; large grain would make SSIM understate
      // fidelity since JPEG/resampling legitimately removes it)
      const n = (rng() - 0.5) * 4;
      const o = (y * w + x) * 4;
      img.data[o] = r + n;
      img.data[o + 1] = g + n;
      img.data[o + 2] = b + n;
      img.data[o + 3] = 255;
    }
  }
  return img;
}
