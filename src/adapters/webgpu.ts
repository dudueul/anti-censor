/**
 * WebGPU capability gate. Diffusion regeneration (docs/REGENERATION-FEASIBILITY.md)
 * only makes sense on a real GPU adapter with enough memory; on a software
 * (SwiftShader/llvmpipe) adapter it would take minutes, so the feature must be
 * withheld. The decision logic (`classifyAdapter`) is pure and unit-tested; the
 * `detectWebGpu` probe is the thin browser wrapper.
 */

/** Minimum single-buffer size we require before offering regeneration (512 MiB). */
export const MIN_BUFFER_BYTES = 512 * 1024 * 1024;

const SOFTWARE_RE = /swiftshader|software|llvmpipe|lavapipe|warp|basic render|microsoft basic/i;

export interface AdapterInfo {
  vendor?: string;
  architecture?: string;
  description?: string;
}

export interface AdapterLimits {
  maxBufferSize: number;
  maxStorageBufferBindingSize: number;
}

export interface AdapterClassification {
  vendor: string;
  architecture: string;
  /** Software/emulated backend (unusable for practical diffusion). */
  software: boolean;
  /** shader-f16 feature present (recommended for FP16 diffusion). */
  fp16: boolean;
  /** Buffer limits large enough for diffusion weights/activations. */
  sufficientMemory: boolean;
  /** Overall: safe to offer regeneration on this adapter. */
  suitable: boolean;
}

export function classifyAdapter(
  info: AdapterInfo,
  features: string[],
  limits: AdapterLimits,
): AdapterClassification {
  const haystack = `${info.vendor ?? ''} ${info.architecture ?? ''} ${info.description ?? ''}`;
  const software = SOFTWARE_RE.test(haystack);
  const fp16 = features.includes('shader-f16');
  const sufficientMemory =
    limits.maxBufferSize >= MIN_BUFFER_BYTES &&
    limits.maxStorageBufferBindingSize >= MIN_BUFFER_BYTES;
  return {
    vendor: info.vendor ?? '',
    architecture: info.architecture ?? '',
    software,
    fp16,
    sufficientMemory,
    suitable: !software && sufficientMemory,
  };
}

export interface WebGpuStatus {
  available: boolean;
  reason?: string;
  adapter?: AdapterClassification;
}

/** Probe the running browser for a WebGPU adapter and classify it. Never throws. */
export async function detectWebGpu(): Promise<WebGpuStatus> {
  const nav = navigator as unknown as { gpu?: any };
  if (!nav.gpu) return { available: false, reason: 'navigator.gpu unavailable' };
  try {
    const adapter = await nav.gpu.requestAdapter();
    if (!adapter) return { available: false, reason: 'no WebGPU adapter' };
    let info: AdapterInfo = {};
    try {
      info = (adapter.info ?? {}) as AdapterInfo;
    } catch {
      /* older Chromium: info may be unavailable */
    }
    const features: string[] = adapter.features ? Array.from(adapter.features) : [];
    const limits: AdapterLimits = {
      maxBufferSize: adapter.limits?.maxBufferSize ?? 0,
      maxStorageBufferBindingSize: adapter.limits?.maxStorageBufferBindingSize ?? 0,
    };
    return { available: true, adapter: classifyAdapter(info, features, limits) };
  } catch (e) {
    return { available: false, reason: String(e) };
  }
}
