/**
 * Multi-level 2D Haar discrete wavelet transform (and its inverse), used by the
 * wavelet hash and available as a coefficient domain for watermark disruption.
 * The transform is orthonormal (1/sqrt(2) scaling), so it is energy-preserving
 * and round-trips within float epsilon. Coefficients use the standard recursive
 * layout: after each level the LL approximation occupies the top-left quadrant.
 */
const SQRT2 = Math.SQRT2;

function haarStep1D(data: Float64Array, n: number): void {
  const h = n >> 1;
  const tmp = new Float64Array(n);
  for (let i = 0; i < h; i++) {
    const a = data[2 * i]!;
    const b = data[2 * i + 1]!;
    tmp[i] = (a + b) / SQRT2;
    tmp[h + i] = (a - b) / SQRT2;
  }
  for (let i = 0; i < n; i++) data[i] = tmp[i]!;
}

function ihaarStep1D(data: Float64Array, n: number): void {
  const h = n >> 1;
  const tmp = new Float64Array(n);
  for (let i = 0; i < h; i++) {
    const avg = data[i]!;
    const diff = data[h + i]!;
    tmp[2 * i] = (avg + diff) / SQRT2;
    tmp[2 * i + 1] = (avg - diff) / SQRT2;
  }
  for (let i = 0; i < n; i++) data[i] = tmp[i]!;
}

export function haar2d(src: Float64Array, size: number, levels: number): Float64Array {
  const out = Float64Array.from(src);
  const row = new Float64Array(size);
  for (let l = 0; l < levels; l++) {
    const s = size >> l;
    if (s < 2) break;
    // rows
    for (let y = 0; y < s; y++) {
      for (let x = 0; x < s; x++) row[x] = out[y * size + x]!;
      haarStep1D(row, s);
      for (let x = 0; x < s; x++) out[y * size + x] = row[x]!;
    }
    // columns
    for (let x = 0; x < s; x++) {
      for (let y = 0; y < s; y++) row[y] = out[y * size + x]!;
      haarStep1D(row, s);
      for (let y = 0; y < s; y++) out[y * size + x] = row[y]!;
    }
  }
  return out;
}

export function ihaar2d(src: Float64Array, size: number, levels: number): Float64Array {
  const out = Float64Array.from(src);
  const row = new Float64Array(size);
  for (let l = levels - 1; l >= 0; l--) {
    const s = size >> l;
    if (s < 2) continue;
    // columns
    for (let x = 0; x < s; x++) {
      for (let y = 0; y < s; y++) row[y] = out[y * size + x]!;
      ihaarStep1D(row, s);
      for (let y = 0; y < s; y++) out[y * size + x] = row[y]!;
    }
    // rows
    for (let y = 0; y < s; y++) {
      for (let x = 0; x < s; x++) row[x] = out[y * size + x]!;
      ihaarStep1D(row, s);
      for (let x = 0; x < s; x++) out[y * size + x] = row[x]!;
    }
  }
  return out;
}
