import { describe, it, expect } from 'vitest';
import { transformImage } from '../src/core/pipeline';
import { ssim } from '../src/core/metrics/ssim';
import type { Raster } from '../src/core/types';
import { photoLike, gradient, checkerboard } from '../test/fixtures';
import { independentHashes, binHamming, hexHamming } from './redteam';

/**
 * Red-team the transforms against a THIRD-PARTY detector we didn't write.
 *
 * Independence has two layers here: pixels are decoded by jimp (not our codec),
 * and hashed by blockhash-core (not our hasher). But an oracle is only meaningful
 * if it is discriminative, so we validate that first — and, notably, jimp's own
 * .hash() turned out to be near-constant across totally different images (black
 * vs white differ by ~1/64), so we DO NOT trust it as a detector; we keep jimp
 * only as an independent decoder and use blockhash-core as the oracle.
 */

// blockhash-core, 256-bit: near-duplicate blocking threshold ~10 bits.
const BLOCK_MATCH = 10;

const photos = (): { name: string; img: Raster }[] => [
  { name: 'photo-1', img: photoLike(224, 224, 1) },
  { name: 'photo-2', img: photoLike(256, 192, 2) },
  { name: 'photo-3', img: photoLike(192, 256, 3) },
  { name: 'photo-4', img: photoLike(200, 200, 42) },
  { name: 'photo-5', img: photoLike(240, 180, 7) },
];

describe('red-team: oracle validation', () => {
  it('blockhash-core is discriminative (distinct photos are far apart)', async () => {
    const set = photos();
    const H = await Promise.all(set.map((p) => independentHashes(p.img)));
    let minPairwise = Infinity;
    for (let i = 0; i < H.length; i++) {
      for (let j = i + 1; j < H.length; j++) {
        minPairwise = Math.min(minPairwise, hexHamming(H[i]!.block, H[j]!.block));
      }
    }
    // eslint-disable-next-line no-console
    console.log(`[oracle] blockhash min inter-photo distance = ${minPairwise}/256`);
    // must be well above the match threshold, or "defeat" would be meaningless
    expect(minPairwise).toBeGreaterThan(BLOCK_MATCH * 2);
  });

  it('jimp .hash() is NOT discriminative and is excluded as an oracle', async () => {
    const a = await independentHashes(photoLike(224, 224, 1));
    const b = await independentHashes(checkerboard(224, 224, 16));
    const d = binHamming(a.phash, b.phash);
    // eslint-disable-next-line no-console
    console.log(`[oracle] jimp .hash() photo-vs-checker distance = ${d}/64 (near-constant => excluded)`);
    expect(d).toBeLessThan(16); // documents the finding
  });
});

async function defeatRate(mode: 'default' | 'maximize') {
  const rows: { name: string; d: number; ssim: number }[] = [];
  for (const { name, img } of photos()) {
    const before = await independentHashes(img);
    const opts = mode === 'maximize' ? { seed: 1, elastic: true, carve: true, prnu: true } : { seed: 1 };
    const after = await independentHashes(transformImage(img, opts).image);
    rows.push({ name, d: hexHamming(before.block, after.block), ssim: ssim(before.raster, after.raster) });
  }
  const defeated = rows.filter((r) => r.d >= BLOCK_MATCH).length;
  // eslint-disable-next-line no-console
  console.log(`\n[${mode}] blockhash-core (independent) defeat, n=${rows.length}, thr ${BLOCK_MATCH}/256`);
  for (const r of rows) {
    // eslint-disable-next-line no-console
    console.log(`  ${r.name} blockhash=${String(r.d).padStart(3)}/256 ssim=${r.ssim.toFixed(3)}`);
  }
  // eslint-disable-next-line no-console
  console.log(`  => defeated ${defeated}/${rows.length}`);
  return { rows, defeated };
}

describe('red-team: defeat vs blockhash-core', () => {
  it('default mode defeats blockhash on all photographic inputs, at readable fidelity', async () => {
    const { rows, defeated } = await defeatRate('default');
    expect(defeated).toBe(rows.length);
    // transformed image is at least as far as a different photo (see oracle test)
    expect(Math.min(...rows.map((r) => r.d))).toBeGreaterThan(BLOCK_MATCH);
    expect(Math.min(...rows.map((r) => r.ssim))).toBeGreaterThan(0.75);
  });

  it('maximize mode pushes blockhash distance even higher', async () => {
    const def = await defeatRate('default');
    const max = await defeatRate('maximize');
    const median = (xs: number[]) => xs.slice().sort((a, b) => a - b)[Math.floor(xs.length / 2)]!;
    expect(median(max.rows.map((r) => r.d))).toBeGreaterThanOrEqual(median(def.rows.map((r) => r.d)));
    expect(max.defeated).toBe(max.rows.length);
  });
});
