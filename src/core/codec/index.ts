import { stripJpegMetadata, type JpegStripOptions } from './jpeg';
import { stripPngMetadata, type PngStripOptions } from './png';
import { stripWebpMetadata, type WebpStripOptions } from './webp';

export { stripJpegMetadata, stripPngMetadata, stripWebpMetadata };
export type { JpegStripOptions, PngStripOptions, WebpStripOptions };

export type ImageFormat = 'jpeg' | 'png' | 'webp' | 'unknown';

const PNG_SIG = [137, 80, 78, 71, 13, 10, 26, 10];

const ascii = (bytes: Uint8Array, off: number, n: number): string => {
  let s = '';
  for (let i = 0; i < n; i++) s += String.fromCharCode(bytes[off + i]!);
  return s;
};

export function detectFormat(bytes: Uint8Array): ImageFormat {
  if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xd8) return 'jpeg';
  if (bytes.length >= 8 && PNG_SIG.every((b, i) => bytes[i] === b)) return 'png';
  if (bytes.length >= 12 && ascii(bytes, 0, 4) === 'RIFF' && ascii(bytes, 8, 4) === 'WEBP')
    return 'webp';
  return 'unknown';
}

export interface StripOptions {
  jpeg?: JpegStripOptions;
  png?: PngStripOptions;
  webp?: WebpStripOptions;
}

/** Strip identity/provenance metadata, dispatching on the detected format. */
export function stripMetadata(bytes: Uint8Array, opts: StripOptions = {}): Uint8Array {
  switch (detectFormat(bytes)) {
    case 'jpeg':
      return stripJpegMetadata(bytes, opts.jpeg);
    case 'png':
      return stripPngMetadata(bytes, opts.png);
    case 'webp':
      return stripWebpMetadata(bytes, opts.webp);
    default:
      return bytes;
  }
}
