# Design: anti-censor extension

`anti-censor` rewrites an image (and, best-effort, short video/audio) so that
automated identification systems treat it as **new, unidentified** media — while
a human still sees essentially the same picture (target **SSIM > 0.9**,
**PSNR > ~34 dB** at default strength). See `docs/RESEARCH.md` for the threat
model this is built against.

## Architecture

```
src/
  core/        PURE, deterministic, browser-free. All security logic lives here.
    types.ts          Raster (RGBA, ImageData-compatible) + Plane
    prng.ts           seedable mulberry32 (+gaussian, hashStringToSeed)
    color.ts          luma conversion
    resample.ts       area + bilinear resamplers
    hash/             aHash, dHash, pHash, DCT/IDCT, hamming  (to TEST evasion)
    metrics/          SSIM, PSNR                               (to TEST fidelity)
    codec/            JPEG/PNG metadata + C2PA stripper (byte-level)
    transforms/       the evasion transforms (pure functions over Raster)
    pipeline.ts       ordered controller + strength presets + verification gate
  adapters/    Thin BROWSER glue (canvas/WebCodecs decode-encode). Integration-
               tested only — never unit-tested. Keeps core deterministic.
  extension/   MV3: manifest, background (context menu), content script
               (upload intercept), popup (settings).
test/          Vitest, Node env, deterministic procedural fixtures.
```

Design rule: **every security-relevant transform is a pure function over typed
arrays.** No DOM, canvas, or network in `src/core`. That is what makes "the hash
moves while SSIM stays high" a single, deterministic Node assertion, and what
keeps the tool auditable.

## Transform pipeline (ordered)

A controller threads a per-image seed (`hashStringToSeed(filename + timestamp)`)
so the whole transform is reproducible, and gates orientation-changing ops when
the image looks like text / has known orientation.

1. **metadata-strip** (byte stream, before decode) — drop EXIF/XMP/C2PA/IPTC/
   comments. Lossless. `src/core/codec`.
2. **decode → Raster** (adapter).
3. **geometric-jitter** — one content-relative warp (small off-axis rotation +
   asymmetric crop-and-rescale + anamorphic aspect jitter + optional flip), a
   single resample pass. The highest-leverage defeat; applied early.
4. **frequency-domain-perturbation** — randomize the mid-band DCT coefficients
   that carry classical spread-spectrum / dwtDct / QIM watermarks.
5. **pixel-perturbation** — zero-mean low-frequency field + light luma-masked
   dither; hardens against re-derivation, nudges embeddings.
6. **perceptual-hash-maximizer** — surgical aHash/dHash/pHash bit-flips, applied
   **late** so it maximizes distance on the final pixels (survives a dihedral-
   aware defender who un-warps step 3).
7. **recompress-quantization-jitter** — re-encode at randomized quality + coeff
   jitter; fresh bitstream, destroys LSB/QIM and byte hashes. Real encode in the
   adapter; a pure 8×8 DCT round-trip **simulator** makes it testable in Node.
8. **verification gate** (pure) — recompute aHash/dHash/pHash Hamming distances
   and SSIM/PSNR; if any distance < target or SSIM < floor, re-run with adjusted
   strength.
9. *(opt-in, off by default)* adversarial-texture, decoy-watermark.

Video: per-frame steps 3–7 with a per-frame-jittered seed, plus a temporal plan
(timestamp/GOP jitter, frame insert/drop, mild speed) fed to a WebCodecs encoder;
audio via pure pitch/tempo DSP cores.

## Module status

| Module | Priority | Status |
|---|---|---|
| metadata-strip (JPEG/PNG/**WebP**/C2PA) | P0 | ✅ implemented + tested |
| perceptual-hash-maximizer (aHash, pHash, dHash) | P0 | ✅ implemented + tested |
| hash oracles for the full family (wHash, blockhash, **PDQ-256**) | P0 | ✅ implemented + tested |
| geometric-jitter (rotate/crop/anamorphic/flip) | P0 | ✅ implemented + tested |
| **seam carving** (content-aware retarget) | P1 | ✅ implemented + tested (opt-in) |
| **elastic warp** (smooth local displacement) | P1 | ✅ implemented + tested (opt-in) |
| pixel-perturbation (noise, tone, low-freq field) | P1 | ✅ implemented + tested |
| recompress-quantization-jitter (simulator) | P0 | ✅ implemented + tested |
| frequency-domain-perturbation (dctBandJitter) | P1 | ✅ implemented + tested |
| watermark-disruptor (orchestrator + honest report) | P1 | ✅ implemented + tested |
| **PRNU suppression** (sensor fingerprint) | P2 | ✅ implemented + tested (opt-in) |
| pipeline controller + verification gate | P0 | ✅ implemented + tested |
| browser adapters + MV3 extension + build | P0 | ✅ implemented |
| adversarial-texture / decoy-watermark | P3 | ✅ implemented + tested (opt-in, honestly weak) |
| video temporal plan + per-frame processor | P2 | ✅ pure cores implemented + tested (WebCodecs encode = adapter) |
| audio DSP cores (pitch/tempo/noise) | P2 | ✅ implemented + tested (WebAudio decode = adapter) |

Opt-in stages (seam carve, elastic warp, PRNU) are exposed via the pipeline
`carve` / `elastic` / `prnu` options and the extension's **"Maximize evasion"**
toggle; they are off by default so the tuned default path stays fast and
high-fidelity.

## Test strategy

- Pure core, Vitest, Node env (no browser/canvas/network).
- Deterministic procedural fixtures (`test/fixtures.ts`): `solid`, `gradient`,
  `checkerboard`, `photoLike(seed)`, `textImage`, and watermarked helpers. No
  binary assets in the repo.
- **Central contract** for every pixel-touching module: `hamming(hash(before),
  hash(after)) > T` for the hashes it targets **and** `ssim(before, after) >
  0.88–0.92` — deterministically.
- **Determinism contract** (mandatory per module): same seed+input ⇒ byte-
  identical output; different seeds differ; input never mutated.
- **Monotonicity**: higher strength ⇒ ≥ hash distance, ≤ SSIM.
- Watermark/codec: write a known payload, assert ≥40% bit-error after a pass;
  LSB fully destroyed by the recompress simulator; strippers idempotent and
  pixel-lossless.
- **Pipeline-order test**: full pipeline on `photoLike` ⇒ final aHash/dHash/pHash
  all past threshold and SSIM above floor.
- **Browser integration** (`test-e2e/`, `npm run test:e2e`): drives the
  pre-installed Chromium via Playwright to cover the adapter path unit tests
  can't — real `processBlob` decode → pipeline → re-encode (pHash moves, SSIM
  holds), output-format/dimension handling, and the File/DataTransfer/
  `input.files` swap the content script relies on. Separate Vitest config, kept
  out of the fast unit suite. Still manual-only: full unpacked-extension load,
  WebCodecs/WebAudio decode-encode, surrogate-model inference.

## Limitations & ethics

**Honesty is a feature.** The UI and docs must not over-claim.

- **Reliably defeated**: classical/grid perceptual hashes (aHash/dHash/pHash/
  wHash/blockhash/PDQ-style), exact-file/byte hashes, EXIF/XMP/C2PA metadata,
  LSB and classical DCT/DWT/QIM watermarks, near-duplicate reverse-image match.
- **Partial / unreliable**: learned "DNA" feature filters and NeuralHash (move
  only under strong geometry; a defender can re-train on transformed data);
  RivaGAN/Stable-Signature; black-box AI classifiers & face/reverse search
  (transfer attacks give a false sense of security).
- **NOT defeatable client-side**: Google SynthID-Image, Tree-Ring, StegaStamp/
  Digimarc — these need diffusion regeneration (a GPU model), out of scope for a
  pure MV3 extension. The watermark-disruptor reports `defeated: false` for them
  instead of pretending.
- **Quality/efficacy tradeoff** is intrinsic; defaults stay conservative
  (SSIM > 0.9) and escalation is explicit and warned.

**Ethical scope.** This is for circumventing censorship of **lawful expression**.
The same Korean laws also target non-consensual sexual deepfakes and CSAM; this
project is not built, documented, or supported as a means to evade hash-based
filtering of that material, and doing so is both unlawful and outside its intent.
