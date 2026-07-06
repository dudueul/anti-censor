/**
 * PNG metadata stripper. Walks the chunk structure and drops chunks that carry
 * identity/provenance:
 *   - text chunks tEXt / zTXt / iTXt  (includes XMP)
 *   - eXIf  (EXIF)
 *   - caBX  (C2PA Content Credentials)
 *   - tIME  (modification timestamp)
 * Critical and colour-relevant chunks (IHDR, PLTE, IDAT, IEND, gAMA, sRGB,
 * iCCP, cHRM, tRNS, bKGD, ...) are copied verbatim, so the result stays a valid
 * PNG and the operation is idempotent.
 */
export interface PngStripOptions {
  /** Remove tEXt/zTXt/iTXt (includes XMP). Default true. */
  removeText?: boolean;
  /** Remove eXIf. Default true. */
  removeExif?: boolean;
  /** Remove caBX (C2PA). Default true. */
  removeC2pa?: boolean;
  /** Remove tIME timestamp. Default true. */
  removeTime?: boolean;
}

const SIGNATURE = [137, 80, 78, 71, 13, 10, 26, 10];

export function stripPngMetadata(
  bytes: Uint8Array,
  opts: PngStripOptions = {},
): Uint8Array {
  const {
    removeText = true,
    removeExif = true,
    removeC2pa = true,
    removeTime = true,
  } = opts;

  if (!hasSignature(bytes)) return bytes;

  const parts: Uint8Array[] = [bytes.subarray(0, 8)];
  let i = 8;
  while (i + 8 <= bytes.length) {
    const len =
      (bytes[i]! << 24) |
      (bytes[i + 1]! << 16) |
      (bytes[i + 2]! << 8) |
      bytes[i + 3]!;
    const type = String.fromCharCode(
      bytes[i + 4]!,
      bytes[i + 5]!,
      bytes[i + 6]!,
      bytes[i + 7]!,
    );
    const chunkEnd = i + 12 + len; // 4 len + 4 type + len data + 4 crc
    if (chunkEnd > bytes.length) {
      // Malformed; keep the remainder verbatim.
      parts.push(bytes.subarray(i));
      i = bytes.length;
      break;
    }

    const drop =
      ((type === 'tEXt' || type === 'zTXt' || type === 'iTXt') && removeText) ||
      (type === 'eXIf' && removeExif) ||
      (type === 'caBX' && removeC2pa) ||
      (type === 'tIME' && removeTime);

    if (!drop) parts.push(bytes.subarray(i, chunkEnd));
    i = chunkEnd;
    if (type === 'IEND') break;
  }

  let total = 0;
  for (const p of parts) total += p.length;
  const out = new Uint8Array(total);
  let off = 0;
  for (const p of parts) {
    out.set(p, off);
    off += p.length;
  }
  return out;
}

function hasSignature(bytes: Uint8Array): boolean {
  if (bytes.length < 8) return false;
  for (let i = 0; i < 8; i++) if (bytes[i] !== SIGNATURE[i]) return false;
  return true;
}
