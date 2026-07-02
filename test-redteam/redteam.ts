import { PNG } from 'pngjs';
import { Jimp } from 'jimp';
import { bmvbhash } from 'blockhash-core';
import type { Raster } from '../src/core/types';

/**
 * Red-team helpers. The whole point is to validate our transforms against
 * detector code we did NOT write: we encode a Raster to a real PNG (pngjs),
 * decode it with jimp, and hash it with jimp's own perceptual hash and
 * blockhash-core. If our transform still moves *their* hashes past a match
 * threshold, that is independent evidence — not a check against our own oracles.
 */

export function encodePng(r: Raster): Buffer {
  const png = new PNG({ width: r.width, height: r.height });
  png.data.set(r.data);
  return PNG.sync.write(png);
}

export interface IndependentHashes {
  /** jimp perceptual hash, 64-bit binary string. */
  phash: string;
  /** blockhash-core, 256-bit hex string. */
  block: string;
  /** the PNG-round-tripped raster (jimp-decoded), for independent SSIM. */
  raster: Raster;
}

export async function independentHashes(r: Raster): Promise<IndependentHashes> {
  const img = await Jimp.read(encodePng(r));
  const { width, height, data } = img.bitmap;
  return {
    phash: img.hash(2),
    block: bmvbhash({ width, height, data }, 16),
    raster: { width, height, data: new Uint8ClampedArray(data) },
  };
}

/** Hamming distance between two equal-length binary ('0'/'1') strings. */
export function binHamming(a: string, b: string): number {
  const n = Math.min(a.length, b.length);
  let d = 0;
  for (let i = 0; i < n; i++) if (a[i] !== b[i]) d++;
  return d;
}

/** Hamming distance between two equal-length hex strings (bit-level). */
export function hexHamming(a: string, b: string): number {
  const n = Math.min(a.length, b.length);
  let d = 0;
  for (let i = 0; i < n; i++) {
    let x = parseInt(a[i]!, 16) ^ parseInt(b[i]!, 16);
    while (x) {
      d += x & 1;
      x >>= 1;
    }
  }
  return d;
}
