import type { Raster } from '../core/types';
import { alphasCumprod, linearBetaSchedule } from '../core/diffusion/scheduler';
import {
  regenerateImage,
  type RegenerateImageDeps,
  type LatentShape,
} from '../core/diffusion/pipeline';
import type { RegenerateOptions } from '../core/diffusion/regenerate';
import { detectWebGpu, type WebGpuStatus } from './webgpu';
import type { AcquiredModel } from '../core/model/acquire';
import type * as Ort from 'onnxruntime-web';

/**
 * GPU-ONLY diffusion img2img regeneration adapter (Phase 4).
 *
 * ⚠️ Not exercised in CI: it needs a real ~1 GB SD-Turbo/LCM ONNX model and a
 * hardware GPU (on SwiftShader it takes minutes). The transform MATH is fully
 * unit-tested in `src/core/diffusion`; this adapter only wires ONNX sessions to
 * it and is validated manually on a GPU machine. Model tensor I/O names are
 * CONFIG (not guessed), so it adapts to whatever export you point it at.
 *
 * It removes learned PIXEL watermarks (Stable Signature, StegaStamp, RivaGAN)
 * but does NOT defeat SynthID or Tree-Ring — see docs/REGENERATION-FEASIBILITY.md.
 */
export interface RegenerationConfig {
  /** ONNX source: a URL, or the raw bytes (e.g. from acquireModel). */
  vaeEncoder: string | Uint8Array;
  unet: string | Uint8Array;
  vaeDecoder: string | Uint8Array;
  /** SD latent scaling factor. */
  latentScale?: number;
  /** ORT WASM asset directory URL. */
  wasmPaths?: string;
  /** Tensor I/O names for the exported model (defaults follow diffusers exports). */
  io?: {
    vaeEncoderInput?: string;
    vaeEncoderOutput?: string;
    unetSample?: string;
    unetTimestep?: string;
    unetEncoderHidden?: string;
    unetOutput?: string;
    vaeDecoderInput?: string;
    vaeDecoderOutput?: string;
  };
  /** Latent channels / downscale (SD: 4 channels, /8). */
  latentChannels?: number;
  downscale?: number;
}

const DEFAULT_IO = {
  vaeEncoderInput: 'sample',
  vaeEncoderOutput: 'latent_sample',
  unetSample: 'sample',
  unetTimestep: 'timestep',
  unetEncoderHidden: 'encoder_hidden_states',
  unetOutput: 'out_sample',
  vaeDecoderInput: 'latent_sample',
  vaeDecoderOutput: 'sample',
};

/** Whether regeneration can run here (suitable WebGPU adapter). */
export async function isRegenerationAvailable(): Promise<WebGpuStatus> {
  return detectWebGpu();
}

export interface Regenerator {
  regenerate(raster: Raster, opts?: RegenerateOptions): Promise<Raster>;
}

export async function createRegenerator(config: RegenerationConfig): Promise<Regenerator> {
  const status = await detectWebGpu();
  if (!status.available || !status.adapter?.suitable) {
    throw new Error(
      `regeneration unavailable: ${status.reason ?? (status.adapter?.software ? 'software WebGPU backend' : 'unsuitable adapter')}`,
    );
  }

  const ort = (await import('onnxruntime-web')) as typeof Ort;
  if (config.wasmPaths) ort.env.wasm.wasmPaths = config.wasmPaths;
  const io = { ...DEFAULT_IO, ...config.io };
  const latentScale = config.latentScale ?? 0.18215;
  const latentChannels = config.latentChannels ?? 4;
  const downscale = config.downscale ?? 8;
  const alphaBar = alphasCumprod(linearBetaSchedule(1000));

  const eps = ['webgpu'];
  const [vaeEnc, unet, vaeDec] = await Promise.all([
    ort.InferenceSession.create(config.vaeEncoder as string, { executionProviders: eps }),
    ort.InferenceSession.create(config.unet as string, { executionProviders: eps }),
    ort.InferenceSession.create(config.vaeDecoder as string, { executionProviders: eps }),
  ]);

  const T = (data: Float32Array, dims: number[]) => new ort.Tensor('float32', data, dims);
  // The latent shape is set by vaeEncode and reused by the denoiser (the
  // regenerate loop passes only the latent array, not its shape).
  let latentShape: LatentShape = { w: 0, h: 0 };

  const deps: RegenerateImageDeps = {
    alphaBar,
    async vaeEncode(imageTensor, w, h) {
      const out = await vaeEnc.run({ [io.vaeEncoderInput]: T(imageTensor, [1, 3, h, w]) });
      const raw = out[io.vaeEncoderOutput]!.data as Float32Array;
      const latent = Float32Array.from(raw, (v) => v * latentScale);
      latentShape = { w: Math.floor(w / downscale), h: Math.floor(h / downscale) };
      return { latent, shape: latentShape };
    },
    denoiser: {
      async predictNoise(latent, t) {
        const { w, h } = latentShape;
        // NOTE: encoder_hidden_states is model-specific; a Turbo/uncond export
        // takes a zero (or precomputed empty-prompt) embedding. Sized per the model.
        const hidden = T(new Float32Array(1 * 77 * 768), [1, 77, 768]);
        const out = await unet.run({
          [io.unetSample]: T(latent, [1, latentChannels, h, w]),
          [io.unetTimestep]: new ort.Tensor('int64', BigInt64Array.from([BigInt(t)]), [1]),
          [io.unetEncoderHidden]: hidden,
        });
        return out[io.unetOutput]!.data as Float32Array;
      },
    },
    async vaeDecode(latent, shape: LatentShape) {
      const scaled = Float32Array.from(latent, (v) => v / latentScale);
      const out = await vaeDec.run({
        [io.vaeDecoderInput]: T(scaled, [1, latentChannels, shape.h, shape.w]),
      });
      const img = out[io.vaeDecoderOutput]!.data as Float32Array;
      return { imageTensor: img, w: shape.w * downscale, h: shape.h * downscale };
    },
  };

  return {
    regenerate: (raster, opts = { strength: 0.2, steps: 2 }) => regenerateImage(raster, opts, deps),
  };
}

/** Build a regenerator from an already-downloaded/cached model (see acquireModel). */
export function createRegeneratorFromAcquired(
  acquired: AcquiredModel,
  names: { vaeEncoder: string; unet: string; vaeDecoder: string },
  config: Omit<RegenerationConfig, 'vaeEncoder' | 'unet' | 'vaeDecoder'> = {},
): Promise<Regenerator> {
  const get = (n: string): Uint8Array => {
    const b = acquired.files[n];
    if (!b) throw new Error(`acquired model missing file: ${n}`);
    return b;
  };
  return createRegenerator({
    ...config,
    vaeEncoder: get(names.vaeEncoder),
    unet: get(names.unet),
    vaeDecoder: get(names.vaeDecoder),
  });
}
