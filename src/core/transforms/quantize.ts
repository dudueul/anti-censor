import { cloneRaster, type Raster } from '../types';
import { dct2d, idct2d } from '../hash/dct';
import { mulberry32 } from '../prng';
import { forEachBlockOrigin, readBlockChannel, writeBlockChannel } from './blocks';

/**
 * Deterministic JPEG-recompression simulator (pure, browser-free).
 *
 * In the extension the real re-encode is `canvas.toBlob('image/jpeg', q)`; this
 * is the unit-testable core that reproduces JPEG-style quantization damage so the
 * pipeline result is verifiable in Node. Per 8x8 block per RGB channel: forward
 * DCT, quantize the AC coefficients against the standard luma table scaled to
 * `quality`, optionally jitter a random subset of mid-band levels, dequantize,
 * inverse DCT. The DC coefficient is preserved exactly so block means (and thus
 * brightness) do not drift. This destroys LSB/QIM marks and the exact-file hash
 * and shifts byte/quantization fingerprints.
 */
export interface QuantizeOptions {
  /** JPEG quality 1..100 (lower = more damage). */
  quality?: number;
  /** Max +/- jitter added to a mid-band quantized level. */
  jitter?: number;
  /** Fraction of mid-band coefficients jittered. */
  jitterFraction?: number;
  seed?: number;
  blockSize?: number;
}

// Standard JPEG Annex K luminance quantization table (Q50).
const BASE_Q50 = [
  16, 11, 10, 16, 24, 40, 51, 61, 12, 12, 14, 19, 26, 58, 60, 55, 14, 13, 16, 24,
  40, 57, 69, 56, 14, 17, 22, 29, 51, 87, 80, 62, 18, 22, 37, 56, 68, 109, 103,
  77, 24, 35, 55, 64, 81, 104, 113, 92, 49, 64, 78, 87, 103, 121, 120, 101, 72,
  92, 95, 98, 112, 100, 103, 99,
];

function scaledTable(quality: number): Float64Array {
  const q = Math.min(100, Math.max(1, quality));
  const s = q < 50 ? 5000 / q : 200 - 2 * q;
  const t = new Float64Array(64);
  for (let i = 0; i < 64; i++) {
    const v = Math.floor((BASE_Q50[i]! * s + 50) / 100);
    t[i] = Math.min(255, Math.max(1, v));
  }
  return t;
}

export function simulateJpeg(img: Raster, opts: QuantizeOptions = {}): Raster {
  const {
    quality = 82,
    jitter = 1,
    jitterFraction = 0.15,
    seed = 1,
    blockSize = 8,
  } = opts;
  const table = scaledTable(quality);
  // For block sizes other than 8 we fall back to a flat table scaled like DC.
  const q = (i: number): number => (blockSize === 8 ? table[i]! : table[0]!);
  const rng = mulberry32(seed);
  const out = cloneRaster(img);
  const n = blockSize * blockSize;

  forEachBlockOrigin(img.width, img.height, blockSize, (bx, by) => {
    for (let ch = 0; ch < 3; ch++) {
      const block = readBlockChannel(out, ch, bx, by, blockSize);
      const coeffs = dct2d(block, blockSize);
      const dc = coeffs[0]!;
      for (let i = 1; i < n; i++) {
        let level = Math.round(coeffs[i]! / q(i));
        // jitter mid-band coefficients (radial index 2..6 in an 8x8 block)
        const u = i % blockSize;
        const v = (i / blockSize) | 0;
        const r = Math.hypot(u, v);
        if (jitter > 0 && r >= 2 && r <= 6 && rng() < jitterFraction) {
          level += Math.round((rng() * 2 - 1) * jitter);
        }
        coeffs[i] = level * q(i);
      }
      coeffs[0] = dc; // preserve DC exactly (no brightness drift)
      const spatial = idct2d(coeffs, blockSize);
      writeBlockChannel(out, ch, bx, by, blockSize, spatial);
    }
  });
  return out;
}
