import { describe, it, expect } from 'vitest';
import {
  validateManifest,
  totalBytes,
  aggregateProgress,
  fnv1a32Hex,
  planFetches,
  type ModelManifest,
  type CacheStore,
} from '../../src/core/model/manifest';
import { acquireModel } from '../../src/core/model/acquire';

const MANIFEST: ModelManifest = {
  id: 'sd-turbo-int8',
  version: '1',
  files: [
    { name: 'vae_encoder.onnx', url: 'https://cdn/e.onnx', bytes: 100, hash: 'aaa' },
    { name: 'unet.onnx', url: 'https://cdn/u.onnx', bytes: 900, hash: 'bbb' },
    { name: 'vae_decoder.onnx', url: 'https://cdn/d.onnx', bytes: 200, hash: 'ccc' },
  ],
};

describe('validateManifest', () => {
  it('accepts a well-formed manifest', () => {
    expect(validateManifest(MANIFEST).ok).toBe(true);
  });
  it('rejects missing id / empty files / non-https url', () => {
    expect(validateManifest({ ...MANIFEST, id: '' }).ok).toBe(false);
    expect(validateManifest({ ...MANIFEST, files: [] }).ok).toBe(false);
    expect(
      validateManifest({ ...MANIFEST, files: [{ name: 'x', url: 'http://insecure/x', bytes: 1, hash: 'h' }] }).ok,
    ).toBe(false);
  });
});

describe('totalBytes / aggregateProgress', () => {
  it('sums declared bytes', () => {
    expect(totalBytes(MANIFEST)).toBe(1200);
  });
  it('reports fractional progress across files', () => {
    const p = aggregateProgress(MANIFEST, { 'vae_encoder.onnx': 100, unet: 0, 'unet.onnx': 450 });
    expect(p.received).toBe(550);
    expect(p.total).toBe(1200);
    expect(p.fraction).toBeCloseTo(550 / 1200, 6);
  });
});

describe('fnv1a32Hex', () => {
  it('is stable and differs for different content', () => {
    const a = fnv1a32Hex(new Uint8Array([1, 2, 3]));
    expect(a).toBe(fnv1a32Hex(new Uint8Array([1, 2, 3])));
    expect(a).not.toBe(fnv1a32Hex(new Uint8Array([1, 2, 4])));
    expect(a).toMatch(/^[0-9a-f]{8}$/);
  });
});

describe('planFetches', () => {
  it('only fetches files absent from the cache', async () => {
    const store: CacheStore = {
      has: async (k) => k.includes('unet.onnx'),
      get: async () => null,
      put: async () => {},
    };
    const plan = await planFetches(MANIFEST, store);
    expect(plan.map((f) => f.name).sort()).toEqual(['vae_decoder.onnx', 'vae_encoder.onnx']);
  });
});

describe('acquireModel (orchestration with injected fetch + store)', () => {
  function fakeStore(): CacheStore & { saved: Record<string, Uint8Array> } {
    const saved: Record<string, Uint8Array> = {};
    return {
      saved,
      async has(k) {
        return k in saved;
      },
      async get(k) {
        return saved[k] ?? null;
      },
      async put(k, v) {
        saved[k] = v;
      },
    };
  }

  it('downloads all files, verifies hashes, caches, and reports progress', async () => {
    const store = fakeStore();
    const bytesFor: Record<string, Uint8Array> = {
      'https://cdn/e.onnx': new Uint8Array([1, 1]),
      'https://cdn/u.onnx': new Uint8Array([2, 2, 2]),
      'https://cdn/d.onnx': new Uint8Array([3]),
    };
    const manifest: ModelManifest = {
      id: 'm',
      version: '1',
      files: [
        { name: 'e', url: 'https://cdn/e.onnx', bytes: 2, hash: fnv1a32Hex(bytesFor['https://cdn/e.onnx']!) },
        { name: 'u', url: 'https://cdn/u.onnx', bytes: 3, hash: fnv1a32Hex(bytesFor['https://cdn/u.onnx']!) },
        { name: 'd', url: 'https://cdn/d.onnx', bytes: 1, hash: fnv1a32Hex(bytesFor['https://cdn/d.onnx']!) },
      ],
    };
    const seen: number[] = [];
    const result = await acquireModel(manifest, {
      store,
      fetchBytes: async (url) => bytesFor[url]!,
      onProgress: (p) => seen.push(p.fraction),
    });
    expect(Object.keys(result.files).sort()).toEqual(['d', 'e', 'u']);
    expect(seen[seen.length - 1]).toBeCloseTo(1, 6); // reaches 100%
    // second run is a cache hit -> no fetches
    let fetched = 0;
    await acquireModel(manifest, {
      store,
      fetchBytes: async (url) => {
        fetched++;
        return bytesFor[url]!;
      },
    });
    expect(fetched).toBe(0);
  });

  it('rejects a file whose hash does not match (integrity failure)', async () => {
    const store = fakeStore();
    const manifest: ModelManifest = {
      id: 'm',
      version: '1',
      files: [{ name: 'e', url: 'https://cdn/e.onnx', bytes: 2, hash: 'deadbeef' }],
    };
    await expect(
      acquireModel(manifest, { store, fetchBytes: async () => new Uint8Array([9, 9]) }),
    ).rejects.toThrow(/integrity/i);
  });
});
