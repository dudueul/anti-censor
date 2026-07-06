import type { CacheStore } from '../core/model/manifest';

/**
 * Browser-only glue for the model manager: a Cache-API–backed {@link CacheStore}
 * and a streaming fetch with byte-level progress. Thin and standard; the
 * orchestration that drives them (`acquireModel`) is fully unit-tested. Used by
 * the GPU regeneration adapter to fetch/cache the ~1 GB model on first run.
 */
export function cacheApiStore(cacheName = 'anti-censor-models'): CacheStore {
  const open = () => caches.open(cacheName);
  const req = (key: string) => new Request(`https://anti-censor.local/${encodeURIComponent(key)}`);
  return {
    async has(key) {
      const c = await open();
      return (await c.match(req(key))) !== undefined;
    },
    async get(key) {
      const c = await open();
      const res = await c.match(req(key));
      if (!res) return null;
      return new Uint8Array(await res.arrayBuffer());
    },
    async put(key, value) {
      const c = await open();
      // Copy into a fresh ArrayBuffer-backed view for the Response body.
      await c.put(req(key), new Response(new Uint8Array(value)));
    },
  };
}

/** Fetch a URL to bytes, reporting cumulative received bytes as the body streams. */
export async function fetchBytesWithProgress(
  url: string,
  onChunk?: (received: number) => void,
): Promise<Uint8Array> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`fetch ${url} failed: ${res.status}`);
  if (!res.body) return new Uint8Array(await res.arrayBuffer());

  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let received = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) {
      chunks.push(value);
      received += value.length;
      onChunk?.(received);
    }
  }
  const out = new Uint8Array(received);
  let off = 0;
  for (const c of chunks) {
    out.set(c, off);
    off += c.length;
  }
  return out;
}
