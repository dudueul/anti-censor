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

// Individual transforms (for callers composing their own pipeline).
export { elasticWarp } from './transforms/warp';
export { seamCarve } from './transforms/seam';
export { suppressPrnu } from './transforms/prnu';
export { adversarialTexture } from './transforms/adversarial';
export { injectDecoyWatermark, detectDecoy } from './transforms/decoy';

// Diffusion regeneration core (pure math; the ONNX/GPU model is an adapter).
export {
  linearBetaSchedule,
  alphasCumprod,
  strengthToTimesteps,
  addNoiseToLatent,
  lcmDenoiseStep,
} from './diffusion/scheduler';
export { regenerateLatent } from './diffusion/regenerate';
export type { LatentDenoiser, RegenerateOptions } from './diffusion/regenerate';
export { rasterToTensor, tensorToRaster } from './diffusion/image-latent';
export { regenerateImage } from './diffusion/pipeline';
export type { RegenerateImageDeps } from './diffusion/pipeline';

// Model download/cache manager (pure orchestration; fetch + Cache API = adapter).
export {
  validateManifest,
  totalBytes,
  aggregateProgress,
  fnv1a32Hex,
  cacheKey,
  planFetches,
} from './model/manifest';
export type { ModelManifest, ModelFile, CacheStore, Progress } from './model/manifest';
export { acquireModel } from './model/acquire';
export type { AcquireDeps, AcquiredModel } from './model/acquire';

// Video / audio cores (pure; the WebCodecs/WebAudio decode-encode is an adapter).
export { temporalPlan } from './video/temporal';
export type { TemporalOptions, PlannedFrame, TemporalPlanResult } from './video/temporal';
export { processFrame } from './video/frame';
export { resampleLinear, timeStretch, pitchShift, addAudioNoise } from './audio/dsp';

// Hashes & metrics (useful for callers that want to verify a result themselves).
export { aHash } from './hash/ahash';
export { dHash } from './hash/dhash';
export { pHash } from './hash/phash';
export { wHash } from './hash/whash';
export { blockHash } from './hash/blockhash';
export { pdqHash } from './hash/pdq';
export { hamming, normalizedHamming } from './hash/hamming';
export { ssim } from './metrics/ssim';
export { psnr, mse } from './metrics/psnr';
