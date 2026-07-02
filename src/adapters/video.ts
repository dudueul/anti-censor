import type { Raster } from '../core/types';
import { processFrame } from '../core/video/frame';
import { temporalPlan, type PlannedFrame, type TemporalOptions } from '../core/video/temporal';
import { obfuscateAudio, type ObfuscateAudioOptions } from '../core/audio/dsp';
import type { PipelineOptions } from '../core/pipeline';
import { Muxer, ArrayBufferTarget } from 'webm-muxer';

/**
 * Browser video adapter: decode a video Blob to frames (seek-based, no demuxer),
 * run each frame through the per-frame image pipeline, apply the temporal plan,
 * decode+obfuscate+re-encode the audio track (Opus), and mux everything to WebM
 * via WebCodecs + webm-muxer. Best-effort and real-decoder-bound; the pure
 * transform logic lives in `src/core`.
 *
 * WebCodecs constructors are accessed off the global to avoid a hard type
 * dependency; this module is browser-only (never unit-tested in Node).
 */
const g = globalThis as unknown as {
  VideoEncoder: any;
  VideoFrame: any;
  AudioEncoder: any;
  AudioData: any;
  AudioContext?: any;
  webkitAudioContext?: any;
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

async function encodeVideoToMuxer(
  muxer: Muxer<ArrayBufferTarget>,
  frames: Raster[],
  plan: PlannedFrame[] | undefined,
  fps: number,
  bitrate: number,
): Promise<void> {
  const width = frames[0]!.width;
  const height = frames[0]!.height;
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
}

async function encodeAudioToMuxer(
  muxer: Muxer<ArrayBufferTarget>,
  channels: Float32Array[],
  sampleRate: number,
  bitrate: number,
): Promise<void> {
  const numberOfChannels = channels.length;
  const total = channels[0]!.length;
  const encoder = new g.AudioEncoder({
    output: (chunk: unknown, meta: unknown) => muxer.addAudioChunk(chunk as never, meta as never),
    error: (e: unknown) => {
      throw e;
    },
  });
  encoder.configure({ codec: 'opus', sampleRate, numberOfChannels, bitrate });

  const chunkFrames = Math.max(1, Math.round(sampleRate / 10)); // ~100ms
  let ts = 0;
  for (let off = 0; off < total; off += chunkFrames) {
    const n = Math.min(chunkFrames, total - off);
    const data = new Float32Array(n * numberOfChannels);
    for (let c = 0; c < numberOfChannels; c++) {
      data.set(channels[c]!.subarray(off, off + n), c * n);
    }
    const ad = new g.AudioData({
      format: 'f32-planar',
      sampleRate,
      numberOfFrames: n,
      numberOfChannels,
      timestamp: ts,
      data,
    });
    encoder.encode(ad);
    ad.close();
    ts += Math.round((n * 1_000_000) / sampleRate);
  }
  await encoder.flush();
  encoder.close();
}

/** Encode same-size RGBA frames to a video-only WebM (VP8). */
export async function encodeFramesToWebm(
  frames: Raster[],
  opts: VideoEncodeOptions & { plan?: PlannedFrame[] } = {},
): Promise<Blob> {
  if (frames.length === 0) throw new Error('encodeFramesToWebm: no frames');
  const { fps = 30, bitrate = 2_000_000, plan } = opts;
  const target = new ArrayBufferTarget();
  const muxer = new Muxer({
    target,
    video: { codec: 'V_VP8', width: frames[0]!.width, height: frames[0]!.height, frameRate: fps },
  });
  await encodeVideoToMuxer(muxer, frames, plan, fps, bitrate);
  muxer.finalize();
  return new Blob([target.buffer], { type: 'video/webm' });
}

/** Encode multi-channel PCM to an audio-only WebM (Opus). */
export async function encodeAudioOnlyWebm(
  channels: Float32Array[],
  sampleRate: number,
  opts: { bitrate?: number } = {},
): Promise<Blob> {
  if (channels.length === 0) throw new Error('encodeAudioOnlyWebm: no channels');
  const target = new ArrayBufferTarget();
  const muxer = new Muxer({
    target,
    audio: { codec: 'A_OPUS', numberOfChannels: channels.length, sampleRate },
  });
  await encodeAudioToMuxer(muxer, channels, sampleRate, opts.bitrate ?? 96_000);
  muxer.finalize();
  return new Blob([target.buffer], { type: 'audio/webm' });
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

/** Decode a video Blob into RGBA frames by seeking. */
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

/** Decode a video/audio Blob's audio track to planar PCM, or null if none. */
async function decodeAudio(
  blob: Blob,
): Promise<{ channels: Float32Array[]; sampleRate: number } | null> {
  const Ctx = g.AudioContext ?? g.webkitAudioContext;
  if (!Ctx) return null;
  try {
    const buf = await blob.arrayBuffer();
    const ac = new Ctx();
    const audioBuffer = await ac.decodeAudioData(buf.slice(0));
    if (ac.close) await ac.close();
    const channels: Float32Array[] = [];
    for (let c = 0; c < audioBuffer.numberOfChannels; c++) {
      channels.push(audioBuffer.getChannelData(c).slice());
    }
    if (channels.length === 0 || channels[0]!.length === 0) return null;
    return { channels, sampleRate: audioBuffer.sampleRate };
  } catch {
    return null; // no audio track, or codec not decodable here
  }
}

export interface VideoTransformOptions extends PipelineOptions, VideoEncodeOptions {
  temporal?: TemporalOptions;
  maxFrames?: number;
  /** Process and mux the audio track (default true; falls back to video-only). */
  audio?: boolean;
  audioOptions?: ObfuscateAudioOptions;
}

/** Full client-side video obfuscation: decode -> transform (frames + audio) -> WebM. */
export async function processVideo(blob: Blob, opts: VideoTransformOptions = {}): Promise<Blob> {
  const fps = opts.fps ?? 30;
  const bitrate = opts.bitrate ?? 2_000_000;
  const src = await extractFrames(blob, fps, opts.maxFrames ?? 600);
  const plan = temporalPlan(src.length, { fps, seed: opts.seed ?? 1, ...opts.temporal });

  const outFrames: Raster[] = [];
  for (let k = 0; k < plan.frames.length; k++) {
    const pf = plan.frames[k]!;
    const source = src[Math.min(pf.sourceIndex, src.length - 1)]!;
    outFrames.push(processFrame(source, k, opts));
  }

  const rawAudio = opts.audio === false ? null : await decodeAudio(blob);
  const audio = rawAudio
    ? obfuscateAudio(rawAudio.channels, rawAudio.sampleRate, opts.audioOptions)
    : null;

  const target = new ArrayBufferTarget();
  const muxer = new Muxer({
    target,
    video: { codec: 'V_VP8', width: outFrames[0]!.width, height: outFrames[0]!.height, frameRate: fps },
    ...(audio
      ? { audio: { codec: 'A_OPUS', numberOfChannels: audio.channels.length, sampleRate: audio.sampleRate } }
      : {}),
  });

  await encodeVideoToMuxer(muxer, outFrames, plan.frames, fps, bitrate);
  if (audio) await encodeAudioToMuxer(muxer, audio.channels, audio.sampleRate, 96_000);
  muxer.finalize();
  return new Blob([target.buffer], { type: 'video/webm' });
}
