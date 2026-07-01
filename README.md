# anti-censor

A Chromium (Manifest V3) extension that applies imperceptible transformations to
images before they leave your browser, so that automated content-identification
systems — **perceptual-hash blocklists** (aHash/dHash/pHash/wHash/blockhash and
the PDQ/PhotoDNA family), **file/metadata signatures** (JPEG/PNG/WebP EXIF/XMP),
**C2PA provenance**, **classical invisible watermarks**, **camera PRNU
fingerprints**, and near-duplicate reverse-image matching — no longer recognise
the media as a previously-seen item, while it stays visually faithful to a human
viewer.

## Why

South Korea's 2024–2026 "anti–fake-content" stack pairs takedown duties with
**automated re-upload filtering**: once media is adjudicated, a perceptual
fingerprint ("DNA") is added to a KCSC blocklist and every visually-similar
re-upload is auto-blocked (Telecommunications Business Act Art. 22-5; the 2025
Network Act amendment). For people sharing lawful journalism, satire, protest
footage, or political speech, this turns a single takedown into permanent,
machine-enforced silence. `anti-censor` makes a re-upload read as **new,
unidentified** media so it is not auto-matched against the blocklist.

The full legal-stack → detection-tech analysis is in
[`docs/RESEARCH.md`](docs/RESEARCH.md); the architecture and transform pipeline
are in [`docs/DESIGN.md`](docs/DESIGN.md).

## How it works

A deterministic, ordered pipeline (all of the security logic is pure and
unit-tested in Node, with no DOM/canvas/network):

1. **metadata-strip** — drop EXIF/XMP/C2PA/IPTC at the byte level.
2. **geometric-jitter** — gentle rotation + asymmetric crop/rescale + anamorphic
   scale (desyncs every grid-based hash; the strongest single lever).
3. **frequency-domain perturbation** — randomise the mid-band DCT coefficients
   classical spread-spectrum / dwtDct / QIM watermarks live in.
4. **pixel perturbation** — low-frequency field + light grain + mild tone.
5. **perceptual-hash maximizers** — surgical aHash/dHash/pHash bit-flips
   (pHash via inverse-DCT; near-invisible) applied late so they target the final
   pixels.
6. **recompress** — a fresh bitstream that destroys LSB/QIM marks and byte hashes.
7. **verification gate** — re-runs at adjusted strength until all three hashes
   clear the match threshold and SSIM stays high.

On the test fixtures this moves aHash, dHash and pHash all **>12/64 bits** (well
past the ~10-bit match thresholds), and also clears wHash/blockhash/**PDQ**
(PDQ moves 48–72/256 vs a 31/256 cutoff), while keeping **SSIM ≥ 0.75** (higher
on real photos); strength is a fidelity/efficacy dial.

**Maximize evasion** (opt-in toggle) adds dihedral-resistant geometry that a
defender cannot normalise away — **seam carving** (content-aware retarget, hammers
PDQ/PhotoDNA-class hashes to 78–84/256), an **elastic warp**, and **PRNU
suppression** — plus opt-in adversarial-texture and decoy-watermark stages.

## Build & install

```bash
npm install
npm test          # 100+ pure unit tests
npm run build     # bundles the extension into dist/
```

Then in Chrome/Chromium: **Extensions → Enable Developer mode → Load unpacked →
select the `dist/` folder.**

## Usage

- **Right-click any image → “Obfuscate image (anti-censor)”** → the transformed
  image is downloaded. (Robust path.)
- **Auto-intercept** (toggle in the popup) transparently transforms images you
  upload through standard `<input type=file>` fields before the page reads them.
  This is best-effort — see the limitations.
- The popup exposes **strength**, **allow-flip**, **Maximize evasion** (seam
  carve + elastic warp + PRNU), **strip-metadata** and the **output
  format/quality**.

## Limitations & ethics

Honesty is a design goal — see [`docs/DESIGN.md`](docs/DESIGN.md) §Limitations.

- **Reliably defeated**: the classical/grid perceptual-hash family (aHash/dHash/
  pHash/wHash/blockhash + PDQ/PhotoDNA-class), exact-file/byte hashes, EXIF/XMP/
  C2PA metadata (JPEG/PNG/WebP), LSB & classical DCT/DWT/QIM watermarks, and
  (opt-in) camera PRNU sensor fingerprints.
- **Partial / unreliable**: learned "DNA" feature filters & NeuralHash (move only
  under strong geometry; re-trainable), black-box AI classifiers and face/reverse
  search (transfer attacks give a false sense of security).
- **NOT defeatable client-side**: Google SynthID, Tree-Ring, StegaStamp,
  Digimarc — these need diffusion regeneration (a GPU model), out of scope; the
  watermark-disruptor reports them as `not-defeated` rather than pretending.
- Auto-intercept cannot cover every upload path (custom uploaders, drag-drop,
  direct `fetch` of a `File`); the right-click action is the fallback.

**Ethical scope.** This is a circumvention tool for **state censorship of lawful
expression**. The same Korean laws also target non-consensual sexual deepfakes
and CSAM; this project is not built, documented, or supported as a way to evade
hash-based filtering of that material, and doing so is unlawful and outside its
intent.

## License

To be determined.
