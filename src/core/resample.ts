/**
 * Separable area ("box") resampling for single-channel float planes.
 *
 * Area resampling averages the source pixels covered by each destination pixel
 * with fractional edge weights. It is the standard, deterministic downsampler
 * used when computing perceptual hashes (it matches PIL's area/antialias
 * behaviour closely enough for hash purposes) and it preserves the image mean,
 * which makes its behaviour easy to assert in tests.
 */

interface Weight {
  idx: number;
  w: number;
}

/** Precompute normalized source->dest contribution weights for one axis. */
function buildWeights(srcLen: number, dstLen: number): Weight[][] {
  const scale = srcLen / dstLen;
  const out: Weight[][] = [];
  for (let o = 0; o < dstLen; o++) {
    const start = o * scale;
    const end = (o + 1) * scale;
    const entries: Weight[] = [];
    let total = 0;
    for (let s = Math.floor(start); s < end; s++) {
      const segStart = Math.max(start, s);
      const segEnd = Math.min(end, s + 1);
      const w = segEnd - segStart;
      if (w > 0) {
        entries.push({ idx: s, w });
        total += w;
      }
    }
    for (const e of entries) e.w /= total;
    out.push(entries);
  }
  return out;
}

/**
 * Bilinear resampling with half-pixel center alignment. Used to upscale a small
 * bias field (e.g. an 8x8 perturbation grid) smoothly to full resolution so the
 * added signal is low-frequency and imperceptible (no block edges).
 */
export function resizeBilinear(
  src: Float64Array,
  sw: number,
  sh: number,
  dw: number,
  dh: number,
): Float64Array {
  const out = new Float64Array(dw * dh);
  const sxr = sw / dw;
  const syr = sh / dh;
  for (let oy = 0; oy < dh; oy++) {
    let fy = (oy + 0.5) * syr - 0.5;
    if (fy < 0) fy = 0;
    if (fy > sh - 1) fy = sh - 1;
    const y0 = Math.floor(fy);
    const y1 = Math.min(y0 + 1, sh - 1);
    const wy = fy - y0;
    for (let ox = 0; ox < dw; ox++) {
      let fx = (ox + 0.5) * sxr - 0.5;
      if (fx < 0) fx = 0;
      if (fx > sw - 1) fx = sw - 1;
      const x0 = Math.floor(fx);
      const x1 = Math.min(x0 + 1, sw - 1);
      const wx = fx - x0;
      const v00 = src[y0 * sw + x0]!;
      const v01 = src[y0 * sw + x1]!;
      const v10 = src[y1 * sw + x0]!;
      const v11 = src[y1 * sw + x1]!;
      const top = v00 * (1 - wx) + v01 * wx;
      const bot = v10 * (1 - wx) + v11 * wx;
      out[oy * dw + ox] = top * (1 - wy) + bot * wy;
    }
  }
  return out;
}

export function resizeArea(
  src: Float64Array,
  sw: number,
  sh: number,
  dw: number,
  dh: number,
): Float64Array {
  const colW = buildWeights(sw, dw);
  const rowW = buildWeights(sh, dh);

  // Horizontal pass -> intermediate of size dw x sh.
  const tmp = new Float64Array(dw * sh);
  for (let y = 0; y < sh; y++) {
    const rowOff = y * sw;
    for (let ox = 0; ox < dw; ox++) {
      let acc = 0;
      for (const { idx, w } of colW[ox]!) acc += src[rowOff + idx]! * w;
      tmp[y * dw + ox] = acc;
    }
  }

  // Vertical pass -> output of size dw x dh.
  const out = new Float64Array(dw * dh);
  for (let oy = 0; oy < dh; oy++) {
    const weights = rowW[oy]!;
    for (let ox = 0; ox < dw; ox++) {
      let acc = 0;
      for (const { idx, w } of weights) acc += tmp[idx * dw + ox]! * w;
      out[oy * dw + ox] = acc;
    }
  }
  return out;
}
