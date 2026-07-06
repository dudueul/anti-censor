import { assertSameSize, type Raster } from '../types';
import { rgbaToLuma } from '../color';

/**
 * Structural Similarity Index (Wang et al. 2004) computed on the luma channel
 * with a Gaussian window. Returns the mean SSIM over the image in [-1, 1]
 * (1 == identical). Used by tests to assert that a transform stays visually
 * faithful (e.g. SSIM > 0.9) while it moves the perceptual hash.
 */
export function ssim(
  a: Raster,
  b: Raster,
  opts: { radius?: number; sigma?: number; peak?: number } = {},
): number {
  assertSameSize(a, b);
  const { radius = 5, sigma = 1.5, peak = 255 } = opts;
  const w = a.width;
  const h = a.height;
  const la = rgbaToLuma(a);
  const lb = rgbaToLuma(b);

  const kernel = gaussianKernel(radius, sigma);
  const muA = blur(la, w, h, kernel);
  const muB = blur(lb, w, h, kernel);

  const aa = mul(la, la);
  const bb = mul(lb, lb);
  const ab = mul(la, lb);
  const muAA = blur(aa, w, h, kernel);
  const muBB = blur(bb, w, h, kernel);
  const muAB = blur(ab, w, h, kernel);

  const C1 = (0.01 * peak) ** 2;
  const C2 = (0.03 * peak) ** 2;

  let sum = 0;
  const n = w * h;
  for (let i = 0; i < n; i++) {
    const ma = muA[i]!;
    const mb = muB[i]!;
    const va = muAA[i]! - ma * ma;
    const vb = muBB[i]! - mb * mb;
    const cov = muAB[i]! - ma * mb;
    const num = (2 * ma * mb + C1) * (2 * cov + C2);
    const den = (ma * ma + mb * mb + C1) * (va + vb + C2);
    sum += num / den;
  }
  return sum / n;
}

function gaussianKernel(radius: number, sigma: number): Float64Array {
  const k = new Float64Array(2 * radius + 1);
  let sum = 0;
  for (let i = -radius; i <= radius; i++) {
    const v = Math.exp(-(i * i) / (2 * sigma * sigma));
    k[i + radius] = v;
    sum += v;
  }
  for (let i = 0; i < k.length; i++) k[i] = k[i]! / sum;
  return k;
}

function mul(a: Float64Array, b: Float64Array): Float64Array {
  const out = new Float64Array(a.length);
  for (let i = 0; i < a.length; i++) out[i] = a[i]! * b[i]!;
  return out;
}

/** Separable Gaussian blur with reflect padding (same-size output). */
function blur(
  src: Float64Array,
  w: number,
  h: number,
  kernel: Float64Array,
): Float64Array {
  const radius = (kernel.length - 1) / 2;
  const tmp = new Float64Array(w * h);
  const out = new Float64Array(w * h);

  // Horizontal.
  for (let y = 0; y < h; y++) {
    const row = y * w;
    for (let x = 0; x < w; x++) {
      let acc = 0;
      for (let t = -radius; t <= radius; t++) {
        acc += src[row + reflect(x + t, w)]! * kernel[t + radius]!;
      }
      tmp[row + x] = acc;
    }
  }
  // Vertical.
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let acc = 0;
      for (let t = -radius; t <= radius; t++) {
        acc += tmp[reflect(y + t, h) * w + x]! * kernel[t + radius]!;
      }
      out[y * w + x] = acc;
    }
  }
  return out;
}

function reflect(i: number, n: number): number {
  if (n === 1) return 0;
  while (i < 0 || i >= n) {
    if (i < 0) i = -i - 1;
    if (i >= n) i = 2 * n - i - 1;
  }
  return i;
}
