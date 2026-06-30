import type { Raster } from '../core/types';
import { transformImage, type PipelineOptions } from '../core/pipeline';
import { stripMetadata } from '../core/codec';

/**
 * Browser glue between encoded image blobs and the pure {@link Raster} core.
 * Lives in `src/adapters` because it touches OffscreenCanvas/createImageBitmap;
 * it is integration-tested (manual / Playwright), never unit-tested, so the
 * security-relevant logic in `src/core` stays deterministic and pure.
 *
 * Works in both a content script (window) and an MV3 service worker (which has
 * OffscreenCanvas, createImageBitmap and fetch).
 */
export async function blobToRaster(blob: Blob): Promise<Raster> {
  const bitmap = await createImageBitmap(blob);
  const { width, height } = bitmap;
  const canvas = new OffscreenCanvas(width, height);
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('2D canvas context unavailable');
  ctx.drawImage(bitmap, 0, 0);
  const imageData = ctx.getImageData(0, 0, width, height);
  bitmap.close();
  return { width, height, data: imageData.data };
}

export async function rasterToBlob(
  img: Raster,
  type = 'image/jpeg',
  quality = 0.92,
): Promise<Blob> {
  const canvas = new OffscreenCanvas(img.width, img.height);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2D canvas context unavailable');
  // Copy into a fresh ArrayBuffer-backed array (ImageData requires that exact
  // buffer type under TS's strict typed-array generics).
  const pixels = new Uint8ClampedArray(img.data);
  ctx.putImageData(new ImageData(pixels, img.width, img.height), 0, 0);
  return canvas.convertToBlob({ type, quality });
}

export interface ProcessOptions extends PipelineOptions {
  outputType?: string;
  outputQuality?: number;
  /** Strip EXIF/XMP/C2PA at the byte level before decode (default true). */
  stripMeta?: boolean;
}

/**
 * Full client-side transform: byte-level metadata strip -> decode -> pure
 * pipeline -> re-encode (a fresh bitstream). Returns the new Blob.
 */
export async function processBlob(blob: Blob, opts: ProcessOptions = {}): Promise<Blob> {
  let bytes: Uint8Array = new Uint8Array(await blob.arrayBuffer());
  if (opts.stripMeta !== false) bytes = stripMetadata(bytes);
  // Copy into a fresh ArrayBuffer-backed view for the Blob constructor (strict
  // typed-array generics require ArrayBuffer, not ArrayBufferLike).
  const stripped = new Blob([new Uint8Array(bytes)], {
    type: blob.type || 'image/jpeg',
  });

  const raster = await blobToRaster(stripped);
  const { image } = transformImage(raster, opts);

  return rasterToBlob(
    image,
    opts.outputType ?? 'image/jpeg',
    opts.outputQuality ?? 0.92,
  );
}

/** Suggest an output filename/extension for the chosen type. */
export function outputName(original: string, type: string): string {
  const ext = type === 'image/png' ? 'png' : type === 'image/webp' ? 'webp' : 'jpg';
  const base = original.replace(/\.[^.]+$/, '') || 'image';
  return `${base}.anti-censor.${ext}`;
}
