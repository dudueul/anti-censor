// Public API of the pure, browser-free core.
export type { Raster, Plane } from './types';
export { createRaster, cloneRaster } from './types';

export { transformImage } from './pipeline';
export type {
  PipelineOptions,
  PipelineResult,
  PipelineMetrics,
} from './pipeline';

export { stripMetadata, detectFormat } from './codec';
export {
  disruptWatermark,
  watermarkEfficacyReport,
} from './transforms/watermark';
export type { SchemeVerdict, SchemeStatus } from './transforms/watermark';

// Hashes & metrics (useful for callers that want to verify a result themselves).
export { aHash } from './hash/ahash';
export { dHash } from './hash/dhash';
export { pHash } from './hash/phash';
export { hamming, normalizedHamming } from './hash/hamming';
export { ssim } from './metrics/ssim';
export { psnr, mse } from './metrics/psnr';
