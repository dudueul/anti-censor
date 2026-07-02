// Bundled (esbuild, globalName "AC") and injected into a real Chromium page so
// the integration tests can drive the browser-only adapter (OffscreenCanvas /
// createImageBitmap / ImageData / convertToBlob) together with the pure core.
export { processBlob, blobToRaster, rasterToBlob, outputName } from '../src/adapters/canvas';
export { transformImage } from '../src/core/pipeline';
export { stripMetadata } from '../src/core/codec';
export { pHash } from '../src/core/hash/phash';
export { hamming } from '../src/core/hash/hamming';
export { ssim } from '../src/core/metrics/ssim';
