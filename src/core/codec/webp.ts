/**
 * WebP (RIFF) metadata stripper. WebP is a RIFF container: "RIFF" + size(LE32) +
 * "WEBP" + a sequence of chunks (FourCC + size(LE32) + data + 1 pad byte if the
 * size is odd). Identity/provenance rides in the "EXIF" and "XMP " chunks (and
 * any non-image chunk); this keeps only the image chunks, updates the RIFF size,
 * and clears the corresponding presence bits in the VP8X flags so the result
 * stays a consistent, valid WebP.
 */
export interface WebpStripOptions {
  /** Remove EXIF. Default true. */
  removeExif?: boolean;
  /** Remove XMP. Default true. */
  removeXmp?: boolean;
  /** Remove the ICC colour profile. Default false (keep colour). */
  removeIcc?: boolean;
}

// VP8X flag bits (first byte of the VP8X chunk data).
const FLAG_ICC = 0x20;
const FLAG_EXIF = 0x08;
const FLAG_XMP = 0x04;

const ascii = (bytes: Uint8Array, off: number, n: number): string => {
  let s = '';
  for (let i = 0; i < n; i++) s += String.fromCharCode(bytes[off + i]!);
  return s;
};

export function stripWebpMetadata(bytes: Uint8Array, opts: WebpStripOptions = {}): Uint8Array {
  const { removeExif = true, removeXmp = true, removeIcc = false } = opts;
  if (
    bytes.length < 12 ||
    ascii(bytes, 0, 4) !== 'RIFF' ||
    ascii(bytes, 8, 4) !== 'WEBP'
  ) {
    return bytes;
  }

  const kept: Uint8Array[] = [];
  let i = 12;
  while (i + 8 <= bytes.length) {
    const fourcc = ascii(bytes, i, 4);
    const size =
      bytes[i + 4]! |
      (bytes[i + 5]! << 8) |
      (bytes[i + 6]! << 16) |
      (bytes[i + 7]! << 24);
    const end = i + 8 + size + (size & 1); // include pad byte
    if (end > bytes.length) {
      kept.push(bytes.subarray(i));
      i = bytes.length;
      break;
    }

    const drop =
      (fourcc === 'EXIF' && removeExif) ||
      (fourcc === 'XMP ' && removeXmp) ||
      (fourcc === 'ICCP' && removeIcc) ||
      // anything that is not a known image/structure chunk (e.g. C2PA)
      !['VP8 ', 'VP8L', 'VP8X', 'ALPH', 'ANIM', 'ANMF', 'ICCP'].includes(fourcc);

    if (fourcc === 'VP8X') {
      // Keep VP8X but clear presence flags for what we are removing.
      const chunk = bytes.slice(i, end);
      let flags = chunk[8]!;
      if (removeExif) flags &= ~FLAG_EXIF;
      if (removeXmp) flags &= ~FLAG_XMP;
      if (removeIcc) flags &= ~FLAG_ICC;
      chunk[8] = flags & 0xff;
      kept.push(chunk);
    } else if (!drop) {
      kept.push(bytes.subarray(i, end));
    }
    i = end;
  }

  let bodyLen = 4; // "WEBP"
  for (const c of kept) bodyLen += c.length;

  const out = new Uint8Array(8 + bodyLen);
  out.set([0x52, 0x49, 0x46, 0x46], 0); // "RIFF"
  const riffSize = bodyLen; // everything after the size field
  out[4] = riffSize & 0xff;
  out[5] = (riffSize >> 8) & 0xff;
  out[6] = (riffSize >> 16) & 0xff;
  out[7] = (riffSize >> 24) & 0xff;
  out.set([0x57, 0x45, 0x42, 0x50], 8); // "WEBP"
  let off = 12;
  for (const c of kept) {
    out.set(c, off);
    off += c.length;
  }
  return out;
}
