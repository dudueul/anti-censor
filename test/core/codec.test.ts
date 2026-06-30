import { describe, it, expect } from 'vitest';
import {
  detectFormat,
  stripMetadata,
} from '../../src/core/codec/index';
import { stripJpegMetadata } from '../../src/core/codec/jpeg';
import { stripPngMetadata } from '../../src/core/codec/png';

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

describe('stripMetadata dispatch', () => {
  it('routes by detected format and passes others through unchanged', () => {
    expect(contains(stripMetadata(buildJpeg()), ascii('Exif'))).toBe(false);
    expect(contains(stripMetadata(buildPng()), ascii('c2pa-manifest'))).toBe(false);
    const unknown = new Uint8Array([1, 2, 3, 4]);
    expect(Array.from(stripMetadata(unknown))).toEqual([1, 2, 3, 4]);
  });
});
