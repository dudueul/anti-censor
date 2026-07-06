# Feasibility: client-side diffusion regeneration (removing robust learned watermarks)

Scope of this spike: can the extension add **img2img diffusion regeneration** to
defeat the watermarks our signal-processing pipeline provably cannot touch
(SynthID, Tree-Ring, StegaStamp, Stable Signature)? This is a feasibility
assessment backed by an environment probe and literature, not an implementation.

## Verdict

- **Product (real user hardware): GO-WITH-CAVEATS.** It is technically feasible
  and is the *only* client-side approach that removes learned pixel watermarks —
  but it is a heavy feature (hundreds of MB of model weights, WebGPU required,
  seconds-to-minutes of latency depending on GPU) and it does **not** cleanly
  defeat every target (Tree-Ring resists; SynthID needs a specialised attack).
  Ship it as an explicit, opt-in "deep clean (experimental, requires WebGPU + a
  one-time model download)" mode, not a default.
- **Automated CI testing: NO-GO for the full pipeline.** The sandbox's WebGPU is
  **SwiftShader software** only (confirmed by probe below) — a full diffusion pass
  would take minutes and is too heavy/flaky for CI. We test the *capability gate*
  and the *plumbing*, and validate real regeneration manually on a GPU machine.

## Environment probe (measured)

Launching the pre-installed Chromium (`--enable-unsafe-webgpu`) and calling
`navigator.gpu.requestAdapter()`:

| flags | adapter | vendor / arch | limits |
|---|---|---|---|
| default | **none** | — | — |
| `--enable-unsafe-webgpu` | ✅ yes | `google` / **`swiftshader`** | maxBuffer 1 GiB |
| `+ Vulkan/ANGLE` | ✅ yes | `google` / `swiftshader` | maxBuffer 1 GiB |

So WebGPU compute is reachable, but only on a **software** backend here. Real
users on Chrome/Edge with a GPU get hardware acceleration; our CI does not.

Runtime package sizes (npm): `onnxruntime-web` ~137 MB (bundle incl. WASM),
`@huggingface/transformers` ~9.5 MB (models fetched separately), `diffusers.js`
~0.35 MB (wraps onnxruntime-web).

## Attack efficacy — what regeneration actually beats (be honest)

From the regeneration-attack literature (Zhao et al., *Invisible Image Watermarks
Are Provably Removable Using Generative AI*, NeurIPS 2024; Saberi et al.; WAVES;
2025–2026 diffusion-editing papers):

| Watermark | Regeneration (img2img) outcome |
|---|---|
| Classical dwtDct / spread-spectrum / QIM | **removed** (already handled by our cheap pipeline too) |
| RivaGAN, Stable Signature, StegaStamp (learned pixel) | **removed** at SSIM ~0.94 — this is the win regeneration uniquely adds |
| **Tree-Ring** (semantic, in the initial latent/Fourier) | **resists** plain img2img — content is re-synthesised but the semantic mark tends to survive |
| **SynthID-Image** | **survives plain img2img**; falls only to a *specialised* attack (e.g. UnMarker drops detection ~100%→21%), which is a much bigger build |

Takeaway: regeneration meaningfully extends coverage to **learned pixel
watermarks**, but should **not** be marketed as "defeats SynthID/Tree-Ring."
Those remain honest limitations; SynthID needs targeted research beyond a generic
img2img pass.

## Recommended stack (if we proceed)

- **Runtime:** `onnxruntime-web` with the **WebGPU** execution provider (most
  mature path; Microsoft-supported; FP16). `mlc-ai/web-stable-diffusion` (TVM) is
  the alternative.
- **Model:** an **SD-Turbo / LCM** img2img at **1–2 steps**, FP16, with the **VAE
  encoder** included (img2img needs image→latent). Prefer a quantized/distilled
  build to keep weights ~0.8–1.5 GB.
- **Attack params:** img2img **denoise strength ≈ 0.10–0.25** — enough to clear
  learned pixel marks while keeping SSIM ≳ 0.9. Expose as a slider with a quality
  warning; higher strength = stronger removal, more content drift.
- **Latency budget:** ~1 s (discrete GPU) to tens of seconds (integrated); minutes
  on software — gate the feature behind a hardware-adapter check.

## Phased plan (smallest first step first)

1. **Capability gate (this commit).** `detectWebGpu()` adapter probe + a pure,
   unit-tested `classifyAdapter()` that decides available / software-vs-hardware /
   fp16 / enough-memory. The extension only *offers* regeneration when a suitable
   adapter exists. Cheap, testable now, de-risks everything downstream.
2. **Runtime spike — ✅ VALIDATED.** `onnxruntime-web` loads in the target
   Chromium and runs a real compute on the **WebGPU execution provider**
   (`test-e2e/ort.e2e.ts`: `Add(X,X)` on `[1,2,3,4]` → `[2,4,6,8]`, `ep: webgpu`).
   Confirmed on SwiftShader here — the same code path runs GPU-accelerated on real
   hardware; only latency differs. The biggest integration unknown (does the ML
   runtime + WebGPU work in this browser context) is now closed.
3. **Model plumbing — orchestration ✅ DONE, glue scaffolded.** `src/core/model`
   (unit-tested): manifest validation (https-only), byte accounting, progress
   aggregation, an FNV-1a integrity hash, cache-hit/miss fetch planning, and
   `acquireModel` (cache→fetch→verify→cache→report, injected fetch/store).
   `src/adapters/model-store.ts` provides the browser glue (Cache-API store +
   streaming `fetchBytesWithProgress`). Still needs, at integration time:
   `host_permissions` for the model CDN and CSP `wasm-unsafe-eval`.
4. **img2img regeneration adapter — pure core ✅ DONE, GPU wiring scaffolded.**
   The diffusion MATH is implemented and fully unit-tested in `src/core/diffusion`
   (noise schedule, strength→timestep mapping, latent noising, LCM denoise
   reconstruction, image↔tensor, and the encode→regenerate→decode orchestration
   with an injected VAE/denoiser — a perfect denoiser provably recovers the
   image). `src/adapters/regenerate.ts` wires ONNX (VAE encoder / UNet / VAE
   decoder) sessions to that core behind the WebGPU gate, with **configurable
   tensor I/O names** (not guessed). The adapter is **GPU-only and not run in CI**
   (needs the real ~1 GB model); it is validated manually on a GPU machine.
5. **Validation.** On a GPU machine, measure real removal of Stable
   Signature / StegaStamp (open decoders) and confirm SSIM; document that
   Tree-Ring/SynthID are not reliably removed.

## Risks

- **Weight size / UX:** ~1 GB one-time download; storage quota and first-run
  friction; some users on integrated GPUs will find it too slow.
- **Efficacy gap:** it does **not** solve SynthID/Tree-Ring — over-claiming here is
  the one thing that would make the tool unsafe to rely on.
- **CI untestable:** no hardware GPU in CI; regeneration correctness must be
  validated manually / on a self-hosted GPU runner.
- **Memory:** FP16 SD in an extension page is heavy; risk of OOM on low-RAM
  devices.
- **Ethics/scope:** a heavier, more capable tool widens misuse surface. Keep it
  opt-in, keep the honest limitations prominent, keep the lawful-expression scope.

## Testability given no GPU in CI

- **Unit-test the decision logic** (`classifyAdapter`) fully in Node.
- **Capability probe E2E** can run in the sandbox (SwiftShader) to confirm the
  gate detects an adapter and correctly flags it as *software* (so the feature
  would be withheld) — that path is exercised here.
- **The runtime path is CI-testable** even without a GPU: `onnxruntime-web`
  executes on the WebGPU EP (SwiftShader) or falls back to WASM, and
  `test-e2e/ort.e2e.ts` asserts a correct result either way.
- **Regeneration itself** (a real diffusion model at usable speed) is validated on
  a **GPU machine / self-hosted runner**, not in the default CI.

## Sources

- Zhao et al., "Invisible Image Watermarks Are Provably Removable Using Generative AI" — arxiv.org/abs/2306.01953; github.com/XuandongZhao/WatermarkAttacker
- "Invisible Watermarks: Attacks and Robustness" — arxiv.org/pdf/2412.12511
- "Diffusion-Based Image Editing for Breaking Robust Watermarks" — arxiv.org/html/2510.05978v1
- ONNX Runtime Web + WebGPU generative AI — opensource.microsoft.com/blog/2024/02/29/onnx-runtime-web-unleashes-generative-ai-in-the-browser-using-webgpu/
- mlc-ai/web-stable-diffusion — github.com/mlc-ai/web-stable-diffusion
