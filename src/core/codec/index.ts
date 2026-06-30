import { stripJpegMetadata, type JpegStripOptions } from './jpeg';
import { stripPngMetadata, type PngStripOptions } from './png';

export { stripJpegMetadata, stripPngMetadata };
export type { JpegStripOptions, PngStripOptions };

export type ImageFormat = 'jpeg' | 'png' | 'unknown';

const PNG_SIG = [137, 80, 78, 71, 13, 10, 26, 10];

export function detectFormat(bytes: Uint8Array): ImageFormat {
  if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xd8) return 'jpeg';
  if (bytes.length >= 8 && PNG_SIG.every((b, i) => bytes[i] === b)) return 'png';
  return 'unknown';
}

export interface StripOptions {
  jpeg?: JpegStripOptions;
  png?: PngStripOptions;
}

/** Strip identity/provenance metadata, dispatching on the detected format. */
export function stripMetadata(bytes: Uint8Array, opts: StripOptions = {}): Uint8Array {
  switch (detectFormat(bytes)) {
    case 'jpeg':
      return stripJpegMetadata(bytes, opts.jpeg);
    case 'png':
      return stripPngMetadata(bytes, opts.png);
    default:
      return bytes;
  }
}
