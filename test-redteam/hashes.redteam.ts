import { describe, it, expect } from 'vitest';
import { transformImage } from '../src/core/pipeline';
import { ssim } from '../src/core/metrics/ssim';
import type { Raster } from '../src/core/types';
import { photoLike, checkerboard } from '../test/fixtures';
import { independentHashes, binHamming, hexHamming } from './redteam';

/**
 * Red-team the transforms against THIRD-PARTY detector code we didn't write:
 *   - sharp-phash: a real DCT perceptual hash (32x32 -> DCT -> 8x8 -> median),
 *     the imagehash-standard family that Korea's "DNA"/pHash filters use.
 *   - blockhash-core: block-mean-value hashing (256-bit).
 * Pixels are also decoded independently (jimp / sharp), not by our codec.
 *
 * An oracle is only meaningful if it is discriminative, so we validate that
 * first. jimp's own .hash() failed that check (near-constant across distinct
 * images) and is excluded — kept only as an independent decoder.
 */
const PHASH_MATCH = 10; // near-duplicate cutoff for a 64-bit DCT pHash
const BLOCK_MATCH = 10; // near-duplicate cutoff for 256-bit blockhash

const photos = (): { name: string; img: Raster }[] => [
  { name: 'photo-1', img: photoLike(224, 224, 1) },
  { name: 'photo-2', img: photoLike(256, 192, 2) },
  { name: 'photo-3', img: photoLike(192, 256, 3) },
  { name: 'photo-4', img: photoLike(200, 200, 42) },
  { name: 'photo-5', img: photoLike(240, 180, 7) },
];

describe('red-team: oracle validation', () => {
  it('sharp-phash and blockhash-core are discriminative; jimp .hash() is not', async () => {
    const set = photos();
    const H = await Promise.all(set.map((p) => independentHashes(p.img)));
    let minDct = Infinity;
    let minBlock = Infinity;
    for (let i = 0; i < H.length; i++) {
      for (let j = i + 1; j < H.length; j++) {
        minDct = Math.min(minDct, binHamming(H[i]!.dct, H[j]!.dct));
        minBlock = Math.min(minBlock, hexHamming(H[i]!.block, H[j]!.block));
      }
    }
    const a = await independentHashes(photoLike(224, 224, 1));
    const b = await independentHashes(checkerboard(224, 224, 16));
    const jimpDistinct = binHamming(a.phash, b.phash);
    // eslint-disable-next-line no-console
    console.log(
      `[oracle] min inter-photo: sharp-phash=${minDct}/64 blockhash=${minBlock}/256 | jimp photo-vs-checker=${jimpDistinct}/64 (excluded)`,
    );
    expect(minDct).toBeGreaterThan(PHASH_MATCH); // distinct photos separate cleanly
    expect(minBlock).toBeGreaterThan(BLOCK_MATCH * 2);
    expect(jimpDistinct).toBeLessThan(16); // jimp .hash() near-constant => not an oracle
  });
});

async function measure(mode: 'default' | 'maximize') {
  const rows: { name: string; dct: number; block: number; ssim: number }[] = [];
  for (const { name, img } of photos()) {
    const before = await independentHashes(img);
    const opts = mode === 'maximize' ? { seed: 1, elastic: true, carve: true, prnu: true } : { seed: 1 };
    const after = await independentHashes(transformImage(img, opts).image);
    rows.push({
      name,
      dct: binHamming(before.dct, after.dct),
      block: hexHamming(before.block, after.block),
      ssim: ssim(before.raster, after.raster),
    });
  }
  // eslint-disable-next-line no-console
  console.log(`\n[${mode}] independent-detector defeat (n=${rows.length})`);
  for (const r of rows) {
    // eslint-disable-next-line no-console
    console.log(
      `  ${r.name} sharp-phash=${String(r.dct).padStart(2)}/64 blockhash=${String(r.block).padStart(3)}/256 ssim=${r.ssim.toFixed(3)}`,
    );
  }
  return rows;
}

describe('red-team: defeat vs sharp-phash + blockhash-core', () => {
  it('default mode defeats BOTH independent hashes on every photo, at readable fidelity', async () => {
    const rows = await measure('default');
    expect(Math.min(...rows.map((r) => r.dct))).toBeGreaterThanOrEqual(PHASH_MATCH + 2);
    expect(Math.min(...rows.map((r) => r.block))).toBeGreaterThan(BLOCK_MATCH);
    expect(Math.min(...rows.map((r) => r.ssim))).toBeGreaterThan(0.8);
  });

  it('maximize mode also defeats both on every photo', async () => {
    const rows = await measure('maximize');
    expect(rows.every((r) => r.dct >= PHASH_MATCH && r.block >= BLOCK_MATCH)).toBe(true);
    expect(Math.min(...rows.map((r) => r.ssim))).toBeGreaterThan(0.72);
  });
});
