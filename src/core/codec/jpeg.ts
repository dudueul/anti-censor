/**
 * JPEG metadata stripper. Walks the marker-segment structure and drops the
 * segments that carry identity/provenance:
 *   - APP1  (0xE1): EXIF and XMP
 *   - APP11 (0xEB): JUMBF / C2PA Content Credentials
 *   - COM   (0xFE): free-text comments
 * It keeps the actual image (DQT/DHT/SOF/SOS scan) and, by default, JFIF (APP0)
 * and the ICC profile (APP2) so colour is preserved. Kept segments are copied
 * verbatim, so the result stays a valid JPEG and the operation is idempotent.
 */
export interface JpegStripOptions {
  /** Remove EXIF + XMP (APP1). Default true. */
  removeApp1?: boolean;
  /** Remove the ICC colour profile (APP2). Default false (keep colour). */
  removeApp2Icc?: boolean;
  /** Remove JUMBF / C2PA (APP11). Default true. */
  removeApp11?: boolean;
  /** Remove comment (COM) segments. Default true. */
  removeComments?: boolean;
  /** Remove every APPn (0xE0..0xEF) segment. Default false. */
  removeAllAppn?: boolean;
}

const SOS = 0xda;

export function stripJpegMetadata(
  bytes: Uint8Array,
  opts: JpegStripOptions = {},
): Uint8Array {
  const {
    removeApp1 = true,
    removeApp2Icc = false,
    removeApp11 = true,
    removeComments = true,
    removeAllAppn = false,
  } = opts;

  // Fail safe: not a JPEG -> return unchanged.
  if (bytes.length < 2 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return bytes;

  const parts: Uint8Array[] = [bytes.subarray(0, 2)]; // SOI
  let i = 2;
  while (i + 1 < bytes.length) {
    if (bytes[i] !== 0xff) {
      // Misaligned; bail out and keep the remainder verbatim.
      parts.push(bytes.subarray(i));
      i = bytes.length;
      break;
    }
    // Skip fill bytes (sequences of 0xFF).
    let m = i + 1;
    while (m < bytes.length && bytes[m] === 0xff) m++;
    const marker = bytes[m]!;

    if (marker === SOS) {
      // Start of scan: copy from this marker to the end verbatim.
      parts.push(bytes.subarray(i));
      i = bytes.length;
      break;
    }

    // Standalone markers without a length payload.
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd9)) {
      parts.push(bytes.subarray(i, m + 1));
      i = m + 1;
      continue;
    }

    const len = (bytes[m + 1]! << 8) | bytes[m + 2]!;
    const segEnd = m + 1 + len; // m+1 is first length byte
    const drop = shouldDrop(marker, {
      removeApp1,
      removeApp2Icc,
      removeApp11,
      removeComments,
      removeAllAppn,
    });
    if (!drop) parts.push(bytes.subarray(i, segEnd));
    i = segEnd;
  }

  return concat(parts);
}

function shouldDrop(
  marker: number,
  o: Required<JpegStripOptions>,
): boolean {
  const isAppn = marker >= 0xe0 && marker <= 0xef;
  if (o.removeAllAppn && isAppn) return true;
  if (marker === 0xe1) return o.removeApp1;
  if (marker === 0xe2) return o.removeApp2Icc;
  if (marker === 0xeb) return o.removeApp11;
  if (marker === 0xfe) return o.removeComments;
  return false;
}

function concat(parts: Uint8Array[]): Uint8Array {
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
