import {
  validateManifest,
  totalBytes,
  fnv1a32Hex,
  cacheKey,
  type ModelManifest,
  type ModelFile,
  type CacheStore,
  type Progress,
} from './manifest';

/**
 * Acquire all files for a model manifest: use the cache where present, fetch the
 * rest, verify each against its declared hash, cache them, and report progress.
 * The `fetchBytes`/`store` dependencies are injected so this whole orchestration
 * is unit-tested without any network or Cache API.
 */
export interface AcquireDeps {
  store: CacheStore;
  fetchBytes(url: string, onChunk?: (received: number) => void): Promise<Uint8Array>;
  onProgress?: (p: Progress) => void;
}

export interface AcquiredModel {
  id: string;
  version: string;
  files: Record<string, Uint8Array>;
}

export async function acquireModel(
  manifest: ModelManifest,
  deps: AcquireDeps,
): Promise<AcquiredModel> {
  const v = validateManifest(manifest);
  if (!v.ok) throw new Error(`invalid model manifest: ${v.reason}`);

  const total = totalBytes(manifest);
  const received: Record<string, number> = {};
  const report = () => {
    if (!deps.onProgress) return;
    let got = 0;
    for (const f of manifest.files) got += Math.min(f.bytes, received[f.name] ?? 0);
    deps.onProgress({ received: got, total, fraction: total === 0 ? 1 : got / total });
  };

  const files: Record<string, Uint8Array> = {};
  for (const f of manifest.files) {
    const key = cacheKey(manifest, f);
    const cached = await deps.store.get(key);
    if (cached) {
      verify(f, cached);
      files[f.name] = cached;
      received[f.name] = f.bytes;
      report();
      continue;
    }
    const bytes = await deps.fetchBytes(f.url, (r) => {
      received[f.name] = r;
      report();
    });
    verify(f, bytes);
    await deps.store.put(key, bytes);
    files[f.name] = bytes;
    received[f.name] = f.bytes;
    report();
  }

  return { id: manifest.id, version: manifest.version, files };
}

function verify(f: ModelFile, bytes: Uint8Array): void {
  const got = fnv1a32Hex(bytes);
  if (got !== f.hash) {
    throw new Error(`integrity check failed for ${f.name}: expected ${f.hash}, got ${got}`);
  }
}
