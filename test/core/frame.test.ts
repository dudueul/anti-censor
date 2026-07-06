import { describe, it, expect } from 'vitest';
import { processFrame } from '../../src/core/video/frame';
import { pHash } from '../../src/core/hash/phash';
import { hamming } from '../../src/core/hash/hamming';
import { ssim } from '../../src/core/metrics/ssim';
import { photoLike } from '../fixtures';

describe('processFrame', () => {
  const frame = photoLike(128, 128, 30);

  it('moves the frame past a hash match threshold while staying faithful', () => {
    const out = processFrame(frame, 0, { seed: 1 });
    expect(hamming(pHash(frame), pHash(out))).toBeGreaterThanOrEqual(12);
    expect(ssim(frame, out)).toBeGreaterThan(0.7);
    expect(out.width).toBe(frame.width);
    expect(out.height).toBe(frame.height);
  });

  it('gives different output per frame index (sequence desync) for the same source', () => {
    const a = processFrame(frame, 0, { seed: 1 });
    const b = processFrame(frame, 1, { seed: 1 });
    expect(Array.from(a.data)).not.toEqual(Array.from(b.data));
  });

  it('is deterministic for the same (frame, index, seed) and does not mutate input', () => {
    const copy = Array.from(frame.data);
    const a = processFrame(frame, 4, { seed: 2 });
    const b = processFrame(frame, 4, { seed: 2 });
    expect(Array.from(a.data)).toEqual(Array.from(b.data));
    expect(Array.from(frame.data)).toEqual(copy);
  });
});
