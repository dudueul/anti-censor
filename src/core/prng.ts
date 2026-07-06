/**
 * Deterministic, seedable pseudo-random number generator.
 *
 * All transforms in this project must be reproducible: given the same seed and
 * the same input they must produce the same output. That makes the perturbations
 * testable (we can assert exact pixel deltas / hash distances) and lets a user
 * re-derive the same result. `Math.random()` is non-deterministic and therefore
 * unusable here.
 *
 * mulberry32 is a tiny, fast, well-distributed 32-bit generator.
 */

export interface Rng {
  /** Uniform float in [0, 1). */
  (): number;
  /** Integer in [min, max] inclusive. */
  int(min: number, max: number): number;
  /** Uniform float in [min, max). */
  range(min: number, max: number): number;
  /** Standard normal sample (mean 0, std 1) via Box–Muller. */
  gaussian(): number;
}

export function mulberry32(seed: number): Rng {
  let a = seed >>> 0;
  const next = (): number => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  const rng = next as Rng;
  rng.int = (min: number, max: number): number =>
    min + Math.floor(next() * (max - min + 1));
  rng.range = (min: number, max: number): number => min + next() * (max - min);
  rng.gaussian = (): number => {
    // Box–Muller; guard against log(0).
    let u = next();
    while (u === 0) u = next();
    const v = next();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  };
  return rng;
}

/**
 * Derive a stable 32-bit seed from a string (e.g. a filename or image hash) so
 * that the same input image yields the same transform unless the user reseeds.
 */
export function hashStringToSeed(input: string): number {
  let h = 2166136261 >>> 0; // FNV-1a
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
