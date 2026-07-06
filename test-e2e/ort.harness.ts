// Bundled (esbuild, globalName irrelevant) and injected to prove onnxruntime-web
// initialises and runs a real compute in the target Chromium. Kept separate from
// the main harness so its large bundle doesn't weigh on other E2E tests.
import * as ort from 'onnxruntime-web';

(globalThis as unknown as { runOrt: unknown }).runOrt = async (
  modelUrl: string,
  wasmBase: string,
) => {
  ort.env.wasm.wasmPaths = wasmBase;
  ort.env.wasm.numThreads = 1; // avoid SharedArrayBuffer / COOP-COEP requirement
  const input = () => new ort.Tensor('float32', Float32Array.from([1, 2, 3, 4]), [4]);
  for (const ep of ['webgpu', 'wasm'] as const) {
    try {
      const session = await ort.InferenceSession.create(modelUrl, {
        executionProviders: [ep],
      });
      const out = await session.run({ X: input() });
      return { ep, y: Array.from(out['Y']!.data as Float32Array) };
    } catch (e) {
      if (ep === 'wasm') return { ep: 'error', error: String(e) };
    }
  }
  return { ep: 'none' };
};
