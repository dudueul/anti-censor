import type { Raster } from '../types';
import { transformImage, type PipelineOptions } from '../pipeline';

/**
 * Process one video frame through the image pipeline with a per-frame-derived
 * seed. Using a different seed per frame index means consecutive frames get
 * different (but individually bounded) perturbations, so per-frame/keyframe hash
 * *sequences* do not line up with the original — while each frame stays visually
 * faithful. Pure; the WebCodecs decode/encode lives in the adapter.
 */
export function processFrame(
  frame: Raster,
  frameIndex: number,
  opts: PipelineOptions = {},
): Raster {
  const baseSeed = opts.seed ?? 1;
  const frameSeed = (baseSeed ^ Math.imul(frameIndex + 1, 0x9e3779b1)) >>> 0;
  // One pass per frame by default (video is throughput-sensitive); callers can
  // override maxIterations for stills.
  return transformImage(frame, {
    maxIterations: 1,
    ...opts,
    seed: frameSeed,
  }).image;
}
