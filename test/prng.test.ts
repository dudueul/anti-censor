import { describe, it, expect } from 'vitest';
import { mulberry32, type Rng } from '../src/core/prng';

describe('mulberry32', () => {
  it('is deterministic for a given seed', () => {
    const a = mulberry32(12345);
    const b = mulberry32(12345);
    const seqA = Array.from({ length: 16 }, () => a());
    const seqB = Array.from({ length: 16 }, () => b());
    expect(seqA).toEqual(seqB);
  });

  it('produces different sequences for different seeds', () => {
    const a = mulberry32(1);
    const b = mulberry32(2);
    const seqA = Array.from({ length: 16 }, () => a());
    const seqB = Array.from({ length: 16 }, () => b());
    expect(seqA).not.toEqual(seqB);
  });

  it('returns values in [0, 1)', () => {
    const r = mulberry32(99);
    for (let i = 0; i < 10000; i++) {
      const v = r();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it('is roughly uniform (mean ~0.5)', () => {
    const r = mulberry32(7);
    let sum = 0;
    const n = 100000;
    for (let i = 0; i < n; i++) sum += r();
    expect(Math.abs(sum / n - 0.5)).toBeLessThan(0.01);
  });

  it('exposes helpers for integer and signed ranges', () => {
    const r: Rng = mulberry32(42);
    for (let i = 0; i < 1000; i++) {
      const n = r.int(0, 9);
      expect(Number.isInteger(n)).toBe(true);
      expect(n).toBeGreaterThanOrEqual(0);
      expect(n).toBeLessThanOrEqual(9);

      const s = r.range(-3, 3);
      expect(s).toBeGreaterThanOrEqual(-3);
      expect(s).toBeLessThan(3);
    }
  });

  it('gaussian() has ~0 mean and ~1 std', () => {
    const r = mulberry32(2024);
    let sum = 0;
    let sumSq = 0;
    const n = 100000;
    for (let i = 0; i < n; i++) {
      const g = r.gaussian();
      sum += g;
      sumSq += g * g;
    }
    const mean = sum / n;
    const variance = sumSq / n - mean * mean;
    expect(Math.abs(mean)).toBeLessThan(0.02);
    expect(Math.abs(Math.sqrt(variance) - 1)).toBeLessThan(0.03);
  });
});
