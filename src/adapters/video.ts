import type { Raster } from '../core/types';
import { processFrame } from '../core/video/frame';
import { temporalPlan, type PlannedFrame, type TemporalOptions } from '../core/video/temporal';
import type { PipelineOptions } from '../core/pipeline';
import { Muxer, ArrayBufferTarget } from 'webm-muxer';

/**
 * Browser video adapter: decode a video Blob to frames (seek-based, no demuxer
 * needed), run each frame through the per-frame image pipeline, apply the
 * temporal plan (timestamp/keyframe/drop/insert), and re-encode to WebM (VP8)
 * via WebCodecs + webm-muxer. Best-effort and real-decoder-bound; the pure
 * transform logic lives in `src/core/video`. Audio is dropped in this version
 * (the pure audio DSP cores are exported separately for a future muxed track).
 *
 * WebCodecs constructors are accessed off the global to avoid a hard type
 * dependency; this module is browser-only (never unit-tested in Node).
 */
const g = globalThis as unknown as {
  VideoEncoder: any;
  VideoFrame: any;
};

export interface VideoEncodeOptions {
  fps?: number;
  bitrate?: number;
}

function rasterToCanvas(r: Raster): OffscreenCanvas {
  const c = new OffscreenCanvas(r.width, r.height);
  const ctx = c.getContext('2d');
  if (!ctx) throw new Error('2D context unavailable');
  ctx.putImageData(new ImageData(new Uint8ClampedArray(r.data), r.width, r.height), 0, 0);
  return c;
}

/** Encode a sequence of same-size frames to a WebM Blob (VP8). */
export async function encodeFramesToWebm(
  frames: Raster[],
  opts: VideoEncodeOptions & { plan?: PlannedFrame[] } = {},
): Promise<Blob> {
  if (frames.length === 0) throw new Error('encodeFramesToWebm: no frames');
  const { fps = 30, bitrate = 2_000_000, plan } = opts;
  const width = frames[0]!.width;
  const height = frames[0]!.height;

  const target = new ArrayBufferTarget();
  const muxer = new Muxer({
    target,
    video: { codec: 'V_VP8', width, height, frameRate: fps },
  });

  const encoder = new g.VideoEncoder({
    output: (chunk: unknown, meta: unknown) => muxer.addVideoChunk(chunk as never, meta as never),
    error: (e: unknown) => {
      throw e;
    },
  });
  encoder.configure({ codec: 'vp8', width, height, bitrate, framerate: fps });

  for (let i = 0; i < frames.length; i++) {
    const ts = plan ? plan[i]!.timestampUs : Math.round((i * 1_000_000) / fps);
    const keyFrame = plan ? plan[i]!.keyFrame : i === 0;
    const canvas = rasterToCanvas(frames[i]!);
    const vf = new g.VideoFrame(canvas, { timestamp: ts });
    encoder.encode(vf, { keyFrame });
    vf.close();
  }

  await encoder.flush();
  encoder.close();
  muxer.finalize();
  return new Blob([target.buffer], { type: 'video/webm' });
}

function seek(video: HTMLVideoElement, t: number): Promise<void> {
  return new Promise((res) => {
    const done = (): void => {
      video.removeEventListener('seeked', done);
      res();
    };
    video.addEventListener('seeked', done);
    video.currentTime = t;
  });
}

/** Decode a video Blob into RGBA frames by seeking (browser-decodable formats). */
export async function extractFrames(blob: Blob, fps: number, maxFrames = 600): Promise<Raster[]> {
  const url = URL.createObjectURL(blob);
  try {
    const video = document.createElement('video');
    video.muted = true;
    video.src = url;
    await new Promise<void>((res, rej) => {
      video.onloadeddata = () => res();
      video.onerror = () => rej(new Error('video decode/load failed'));
    });
    const w = video.videoWidth;
    const h = video.videoHeight;
    const duration = Number.isFinite(video.duration) ? video.duration : 0;
    const n = Math.min(maxFrames, Math.max(1, Math.floor(duration * fps)));

    const canvas = new OffscreenCanvas(w, h);
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('2D context unavailable');

    const frames: Raster[] = [];
    for (let i = 0; i < n; i++) {
      const t = Math.min(Math.max(0, duration - 1e-3), i / fps);
      await seek(video, t);
      ctx.drawImage(video, 0, 0, w, h);
      const id = ctx.getImageData(0, 0, w, h);
      frames.push({ width: w, height: h, data: id.data });
    }
    return frames;
  } finally {
    URL.revokeObjectURL(url);
  }
}

export interface VideoTransformOptions extends PipelineOptions, VideoEncodeOptions {
  temporal?: TemporalOptions;
  maxFrames?: number;
}

/** Full client-side video obfuscation: decode -> per-frame transform + temporal plan -> WebM. */
export async function processVideo(blob: Blob, opts: VideoTransformOptions = {}): Promise<Blob> {
  const fps = opts.fps ?? 30;
  const src = await extractFrames(blob, fps, opts.maxFrames ?? 600);
  const plan = temporalPlan(src.length, { fps, seed: opts.seed ?? 1, ...opts.temporal });

  const out: Raster[] = [];
  for (let k = 0; k < plan.frames.length; k++) {
    const pf = plan.frames[k]!;
    const source = src[Math.min(pf.sourceIndex, src.length - 1)]!;
    out.push(processFrame(source, k, opts));
  }
  return encodeFramesToWebm(out, { fps, bitrate: opts.bitrate, plan: plan.frames });
}
