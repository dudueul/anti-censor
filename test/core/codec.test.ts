import { describe, it, expect } from 'vitest';
import {
  detectFormat,
  stripMetadata,
} from '../../src/core/codec/index';
import { stripJpegMetadata } from '../../src/core/codec/jpeg';
import { stripPngMetadata } from '../../src/core/codec/png';
import { stripWebpMetadata } from '../../src/core/codec/webp';

const ascii = (s: string): number[] => [...s].map((c) => c.charCodeAt(0));

function contains(haystack: Uint8Array, needle: number[]): boolean {
  outer: for (let i = 0; i <= haystack.length - needle.length; i++) {
    for (let j = 0; j < needle.length; j++) {
      if (haystack[i + j] !== needle[j]) continue outer;
    }
    return true;
  }
  return false;
}

// ---- JPEG ----
function jpegSeg(marker: number, payload: number[]): number[] {
  const len = payload.length + 2;
  return [0xff, marker, (len >> 8) & 0xff, len & 0xff, ...payload];
}

function buildJpeg(): Uint8Array {
  return new Uint8Array([
    0xff, 0xd8, // SOI
    ...jpegSeg(0xe0, [...ascii('JFIF'), 0, 1, 1, 0, 0, 1, 0, 1, 0, 0]), // APP0
    ...jpegSeg(0xe1, [...ascii('Exif'), 0, 0, 0xde, 0xad, 0xbe, 0xef]), // APP1 EXIF
    ...jpegSeg(0xeb, [...ascii('JP'), 0, 0, ...ascii('jumb'), 0x01]), // APP11 JUMBF/C2PA
    ...jpegSeg(0xfe, ascii('secret comment')), // COM
    ...jpegSeg(0xdb, [0, 1, 2, 3]), // DQT
    0xff, 0xda, 0x00, 0x03, 0x00, // SOS (len 3 => 1 payload byte)
    0x12, 0x34, 0x56, // entropy-coded scan
    0xff, 0xd9, // EOI
  ]);
}

describe('detectFormat', () => {
  it('detects jpeg and png by magic bytes', () => {
    expect(detectFormat(buildJpeg())).toBe('jpeg');
    expect(detectFormat(new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]))).toBe(
      'png',
    );
    expect(detectFormat(new Uint8Array([0, 1, 2, 3]))).toBe('unknown');
  });
});

describe('stripJpegMetadata', () => {
  it('removes EXIF, C2PA/JUMBF and comments but keeps JFIF and scan data', () => {
    const out = stripJpegMetadata(buildJpeg());
    expect(out[0]).toBe(0xff);
    expect(out[1]).toBe(0xd8); // still starts with SOI
    expect(contains(out, ascii('Exif'))).toBe(false);
    expect(contains(out, ascii('jumb'))).toBe(false);
    expect(contains(out, ascii('secret comment'))).toBe(false);
    expect(contains(out, ascii('JFIF'))).toBe(true); // JFIF kept by default
    expect(contains(out, [0x12, 0x34, 0x56])).toBe(true); // scan preserved
    expect(out[out.length - 2]).toBe(0xff);
    expect(out[out.length - 1]).toBe(0xd9); // EOI preserved
  });

  it('can strip every APPn segment when asked', () => {
    const out = stripJpegMetadata(buildJpeg(), { removeAllAppn: true });
    expect(contains(out, ascii('JFIF'))).toBe(false);
    expect(contains(out, [0x12, 0x34, 0x56])).toBe(true);
  });

  it('is idempotent', () => {
    const once = stripJpegMetadata(buildJpeg());
    const twice = stripJpegMetadata(once);
    expect(Array.from(twice)).toEqual(Array.from(once));
  });
});

// ---- PNG ----
const PNG_SIG = [137, 80, 78, 71, 13, 10, 26, 10];
function pngChunk(type: string, data: number[]): number[] {
  const len = data.length;
  return [
    (len >>> 24) & 255,
    (len >>> 16) & 255,
    (len >>> 8) & 255,
    len & 255,
    ...ascii(type),
    ...data,
    0, 0, 0, 0, // CRC placeholder (stripper does not validate it)
  ];
}

function buildPng(): Uint8Array {
  return new Uint8Array([
    ...PNG_SIG,
    ...pngChunk('IHDR', new Array(13).fill(1)),
    ...pngChunk('tEXt', [...ascii('Comment'), 0, ...ascii('hello')]),
    ...pngChunk('iTXt', [...ascii('XML:com.adobe.xmp'), 0, 0, 0, 0, 0, ...ascii('<xmp/>')]),
    ...pngChunk('caBX', ascii('c2pa-manifest')),
    ...pngChunk('eXIf', [0xde, 0xad]),
    ...pngChunk('IDAT', [9, 8, 7]),
    ...pngChunk('IEND', []),
  ]);
}

describe('stripPngMetadata', () => {
  it('removes text, EXIF and C2PA chunks but keeps IHDR/IDAT/IEND', () => {
    const out = stripPngMetadata(buildPng());
    for (let i = 0; i < 8; i++) expect(out[i]).toBe(PNG_SIG[i]); // signature
    expect(contains(out, ascii('hello'))).toBe(false);
    expect(contains(out, ascii('xmp'))).toBe(false);
    expect(contains(out, ascii('c2pa-manifest'))).toBe(false);
    expect(contains(out, ascii('IHDR'))).toBe(true);
    expect(contains(out, ascii('IDAT'))).toBe(true);
    expect(contains(out, ascii('IEND'))).toBe(true);
    expect(contains(out, [9, 8, 7])).toBe(true); // pixel data preserved
  });

  it('is idempotent', () => {
    const once = stripPngMetadata(buildPng());
    const twice = stripPngMetadata(once);
    expect(Array.from(twice)).toEqual(Array.from(once));
  });
});

// ---- WebP (RIFF) ----
function le32(n: number): number[] {
  return [n & 0xff, (n >> 8) & 0xff, (n >> 16) & 0xff, (n >> 24) & 0xff];
}
function webpChunk(fourcc: string, data: number[]): number[] {
  const bytes = [...ascii(fourcc), ...le32(data.length), ...data];
  if (data.length & 1) bytes.push(0); // pad to even
  return bytes;
}
function buildWebp(): Uint8Array {
  const vp8x = webpChunk('VP8X', [0x2c, 0, 0, 0, 0, 0, 0, 0, 0, 0]); // flags ICC|EXIF|XMP
  const iccp = webpChunk('ICCP', ascii('icc-profile'));
  const vp8 = webpChunk('VP8 ', [1, 2, 3, 4, 5]);
  const exif = webpChunk('EXIF', ascii('exif-payload'));
  const xmp = webpChunk('XMP ', ascii('<xmp-payload/>'));
  const c2pa = webpChunk('C2PA', ascii('c2pa-webp'));
  const body = [...ascii('WEBP'), ...vp8x, ...iccp, ...vp8, ...exif, ...xmp, ...c2pa];
  return new Uint8Array([...ascii('RIFF'), ...le32(body.length), ...body]);
}

describe('stripWebpMetadata', () => {
  it('removes EXIF/XMP/C2PA, keeps VP8/ICCP, fixes RIFF size and VP8X flags', () => {
    const src = buildWebp();
    const out = stripWebpMetadata(src);
    expect(ascii('RIFF').every((b, i) => out[i] === b)).toBe(true);
    expect(contains(out, ascii('exif-payload'))).toBe(false);
    expect(contains(out, ascii('<xmp-payload/>'))).toBe(false);
    expect(contains(out, ascii('c2pa-webp'))).toBe(false);
    expect(contains(out, [1, 2, 3, 4, 5])).toBe(true); // VP8 image data kept
    expect(contains(out, ascii('icc-profile'))).toBe(true); // ICC kept by default
    // RIFF size field == file length - 8
    const declared = out[4]! | (out[5]! << 8) | (out[6]! << 16) | (out[7]! << 24);
    expect(declared).toBe(out.length - 8);
    // VP8X EXIF/XMP flag bits cleared (ICC bit 0x20 remains)
    const vp8xIdx = out.indexOf(0x56); // 'V' of VP8X (first chunk after WEBP)
    expect(out[vp8xIdx + 8]! & 0x0c).toBe(0); // EXIF|XMP cleared
  });

  it('is idempotent', () => {
    const once = stripWebpMetadata(buildWebp());
    const twice = stripWebpMetadata(once);
    expect(Array.from(twice)).toEqual(Array.from(once));
  });
});

describe('stripMetadata dispatch', () => {
  it('routes by detected format and passes others through unchanged', () => {
    expect(detectFormat(buildWebp())).toBe('webp');
    expect(contains(stripMetadata(buildJpeg()), ascii('Exif'))).toBe(false);
    expect(contains(stripMetadata(buildPng()), ascii('c2pa-manifest'))).toBe(false);
    expect(contains(stripMetadata(buildWebp()), ascii('exif-payload'))).toBe(false);
    const unknown = new Uint8Array([1, 2, 3, 4]);
    expect(Array.from(stripMetadata(unknown))).toEqual([1, 2, 3, 4]);
  });
});
