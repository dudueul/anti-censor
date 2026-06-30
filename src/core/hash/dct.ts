/**
 * Orthonormal DCT-II (the transform used by pHash). Naive O(N^2) per axis; the
 * sizes we use (<= 32) make that negligible. Orthonormal scaling keeps it
 * energy-preserving, which makes correctness easy to assert in tests.
 */
export function dct1d(input: Float64Array): Float64Array {
  const N = input.length;
  const out = new Float64Array(N);
  const factor = Math.PI / N;
  const c0 = Math.sqrt(1 / N);
  const ck = Math.sqrt(2 / N);
  for (let k = 0; k < N; k++) {
    let sum = 0;
    for (let n = 0; n < N; n++) sum += input[n]! * Math.cos((n + 0.5) * k * factor);
    out[k] = sum * (k === 0 ? c0 : ck);
  }
  return out;
}

/** Inverse of {@link dct1d} (orthonormal DCT-III). */
export function idct1d(input: Float64Array): Float64Array {
  const N = input.length;
  const out = new Float64Array(N);
  const factor = Math.PI / N;
  const c0 = Math.sqrt(1 / N);
  const ck = Math.sqrt(2 / N);
  for (let n = 0; n < N; n++) {
    let sum = 0;
    for (let k = 0; k < N; k++) {
      const a = k === 0 ? c0 : ck;
      sum += a * input[k]! * Math.cos((n + 0.5) * k * factor);
    }
    out[n] = sum;
  }
  return out;
}

/** Separable 2D DCT-II over a square `size`x`size` plane (row-major). */
export function dct2d(data: Float64Array, size: number): Float64Array {
  const tmp = new Float64Array(size * size);
  const line = new Float64Array(size);

  // Rows.
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) line[x] = data[y * size + x]!;
    const r = dct1d(line);
    for (let x = 0; x < size; x++) tmp[y * size + x] = r[x]!;
  }

  // Columns.
  const out = new Float64Array(size * size);
  for (let x = 0; x < size; x++) {
    for (let y = 0; y < size; y++) line[y] = tmp[y * size + x]!;
    const c = dct1d(line);
    for (let y = 0; y < size; y++) out[y * size + x] = c[y]!;
  }
  return out;
}

/** Inverse separable 2D DCT-II (recovers a plane from its coefficients). */
export function idct2d(coeffs: Float64Array, size: number): Float64Array {
  const tmp = new Float64Array(size * size);
  const line = new Float64Array(size);

  // Rows.
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) line[x] = coeffs[y * size + x]!;
    const r = idct1d(line);
    for (let x = 0; x < size; x++) tmp[y * size + x] = r[x]!;
  }

  // Columns.
  const out = new Float64Array(size * size);
  for (let x = 0; x < size; x++) {
    for (let y = 0; y < size; y++) line[y] = tmp[y * size + x]!;
    const c = idct1d(line);
    for (let y = 0; y < size; y++) out[y * size + x] = c[y]!;
  }
  return out;
}
