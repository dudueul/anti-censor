/**
 * A perceptual hash is represented as a bit array (one byte per bit, value 0/1)
 * to keep the math obvious and the tests readable.
 */
export type Hash = Uint8Array;

export function hamming(a: Hash, b: Hash): number {
  if (a.length !== b.length) {
    throw new Error(`hamming: length mismatch ${a.length} vs ${b.length}`);
  }
  let d = 0;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) d++;
  return d;
}

export function normalizedHamming(a: Hash, b: Hash): number {
  return a.length === 0 ? 0 : hamming(a, b) / a.length;
}
