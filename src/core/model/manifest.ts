/**
 * Pure model-manifest logic for the regeneration model download/cache manager.
 * Manifest validation, byte accounting, progress aggregation, a fast content
 * hash for integrity, and the cache-hit/miss fetch plan are all pure and
 * unit-tested; only the actual fetch + Cache-API storage is browser-bound
 * (injected via {@link CacheStore} and a `fetchBytes` function).
 */
export interface ModelFile {
  name: string;
  url: string;
  bytes: number;
  /** Expected content hash (fnv1a32Hex) for integrity. */
  hash: string;
}

export interface ModelManifest {
  id: string;
  version: string;
  files: ModelFile[];
}

/** Abstraction over Cache API / OPFS / IndexedDB (keyed by cache key). */
export interface CacheStore {
  has(key: string): Promise<boolean>;
  get(key: string): Promise<Uint8Array | null>;
  put(key: string, value: Uint8Array): Promise<void>;
}

export function validateManifest(m: ModelManifest): { ok: boolean; reason?: string } {
  if (!m || typeof m.id !== 'string' || m.id.length === 0) return { ok: false, reason: 'missing id' };
  if (typeof m.version !== 'string' || m.version.length === 0) return { ok: false, reason: 'missing version' };
  if (!Array.isArray(m.files) || m.files.length === 0) return { ok: false, reason: 'no files' };
  for (const f of m.files) {
    if (!f.name || !f.url || !f.hash) return { ok: false, reason: `bad file entry ${f.name}` };
    if (!f.url.startsWith('https://')) return { ok: false, reason: `non-https url ${f.url}` };
    if (!(f.bytes > 0)) return { ok: false, reason: `bad size ${f.name}` };
  }
  return { ok: true };
}

export function totalBytes(m: ModelManifest): number {
  return m.files.reduce((s, f) => s + f.bytes, 0);
}

export interface Progress {
  received: number;
  total: number;
  fraction: number;
}

/** Aggregate per-file received-byte counts into overall progress. */
export function aggregateProgress(m: ModelManifest, received: Record<string, number>): Progress {
  const total = totalBytes(m);
  let got = 0;
  for (const f of m.files) got += Math.min(f.bytes, received[f.name] ?? 0);
  return { received: got, total, fraction: total === 0 ? 1 : got / total };
}

/** FNV-1a 32-bit content hash as 8 hex chars (fast integrity check, not crypto). */
export function fnv1a32Hex(bytes: Uint8Array): string {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < bytes.length; i++) {
    h ^= bytes[i]!;
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

/** Cache key for a manifest file (namespaced by model id + version). */
export function cacheKey(m: ModelManifest, f: ModelFile): string {
  return `anti-censor/${m.id}@${m.version}/${f.name}`;
}

/** Files that still need fetching (absent from the cache). */
export async function planFetches(m: ModelManifest, store: CacheStore): Promise<ModelFile[]> {
  const missing: ModelFile[] = [];
  for (const f of m.files) {
    if (!(await store.has(cacheKey(m, f)))) missing.push(f);
  }
  return missing;
}
