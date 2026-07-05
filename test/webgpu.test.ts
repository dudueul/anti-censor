import { describe, it, expect } from 'vitest';
import { classifyAdapter, MIN_BUFFER_BYTES } from '../src/adapters/webgpu';

describe('classifyAdapter', () => {
  const big = { maxBufferSize: 2 * 1024 * 1024 * 1024, maxStorageBufferBindingSize: 2 * 1024 * 1024 * 1024 };
  const small = { maxBufferSize: 256 * 1024 * 1024, maxStorageBufferBindingSize: 256 * 1024 * 1024 };

  it('flags SwiftShader as software => not suitable for regeneration', () => {
    const c = classifyAdapter({ vendor: 'google', architecture: 'swiftshader' }, ['shader-f16'], big);
    expect(c.software).toBe(true);
    expect(c.suitable).toBe(false);
  });

  it('flags llvmpipe / lavapipe / warp as software', () => {
    for (const s of ['llvmpipe', 'lavapipe', 'Microsoft Basic Render']) {
      expect(classifyAdapter({ vendor: '', architecture: '', description: s }, [], big).software).toBe(true);
    }
  });

  it('accepts a hardware GPU with fp16 and enough memory', () => {
    const c = classifyAdapter({ vendor: 'nvidia', architecture: 'ampere', description: 'NVIDIA RTX' }, ['shader-f16'], big);
    expect(c.software).toBe(false);
    expect(c.fp16).toBe(true);
    expect(c.sufficientMemory).toBe(true);
    expect(c.suitable).toBe(true);
  });

  it('rejects hardware with insufficient buffer memory', () => {
    const c = classifyAdapter({ vendor: 'intel', architecture: 'gen-9' }, ['shader-f16'], small);
    expect(c.software).toBe(false);
    expect(c.sufficientMemory).toBe(false);
    expect(c.suitable).toBe(false);
  });

  it('reports fp16 absence but still allows a capable fp32 GPU', () => {
    const c = classifyAdapter({ vendor: 'apple', architecture: 'm-series' }, [], big);
    expect(c.fp16).toBe(false);
    expect(c.suitable).toBe(true); // fp16 recommended, not required
  });

  it('uses MIN_BUFFER_BYTES as the memory bar', () => {
    const atBar = { maxBufferSize: MIN_BUFFER_BYTES, maxStorageBufferBindingSize: MIN_BUFFER_BYTES };
    expect(classifyAdapter({ vendor: 'amd' }, ['shader-f16'], atBar).sufficientMemory).toBe(true);
  });
});
