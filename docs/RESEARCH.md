# Threat analysis: South Korea's anti–fake-content stack and the image/video identification it implies

This document is the analytical basis for the `anti-censor` extension. It maps
the South Korean 2024–2026 legal stack to the concrete, automated content-
identification technologies those laws deploy or imply, then catalogues each
detection technique and the client-side countermeasure that defeats it (and,
honestly, the ones that **cannot** be defeated client-side).

> Scope note. This is a circumvention tool for **state censorship of lawful
> expression** (journalism, satire, protest footage, political speech that gets
> hash-blocklisted and auto-removed on re-upload). Several of the laws below
> also target genuinely harmful content (non-consensual sexual deepfakes, CSAM).
> Defeating hash-based filtering of *that* material is out of scope, unsupported,
> and a serious legal/ethical line — see `docs/DESIGN.md` §Limitations & ethics.

## 1. The legal stack → detection technology mapping

| Law / instrument | Status | Duty | Implied detection tech |
|---|---|---|---|
| **AI Basic Act** (Basic Act on AI, eff. 2026-01-22), Art. 31 | In force, ~1-yr grace; 2026 amendment proposed | Generative-AI output must carry a *human-perceptible* or *machine-readable* AI label; deepfakes need a visible label. Proposed amendment mandates watermarks and **criminalizes watermark removal**. | Invisible-watermark **detection/decoding**, **C2PA**/metadata manifest parsing, visible-label OCR/classifier |
| **Telecommunications Business Act Art. 22-5** (anti–Nth-Room; video since 2021, images from 2026-07-01) | In force / expanding | Large providers must run **mandatory upload + re-upload filtering** using a government "standard filtering" tool and a public **"DNA" database** (or a TTA-certified self-built engine). | ETRI/MSIT **learned perceptual hash** ("DNA" deep feature vector robust to re-encode/resize) + **blocklist nearest-neighbour matching** + automated re-upload blocking |
| **Network Act amendment** — "Act on Eradication of False and Manipulated Information" (passed 2025-12-24) | Passed plenary; awaiting decrees; US/USTR objections | ≥1M-DAU providers must action reports; up to 5× damages; up to ₩1B fine for re-circulating the *same* adjudicated content ≥2× after a ruling. | **Report-triggered hash-blocklisting** and **re-upload detection** of adjudicated media (perceptual hashing again) |
| **Public Official Election Act Art. 82-8** (eff. 2024-01-29) | In force; used 2024/2025 elections | Bans campaign deepfakes 90 days pre-election; "virtual content" disclosure label otherwise. NEC fielded the **"Aegis"** deepfake classifier (NFS + KETI). | **Deepfake/synthetic-image classifier**, disclosure-label detection |
| **Press Arbitration Act** "fake news" bills (2021; revived 2025) | Repeatedly stalled | Up to 5× punitive damages for false/manipulated reporting. | None inherent (liability rule) |
| **KCSC / 방심위** | Standing body | Adjudicates content illegal; **curates the illegal-content + DNA feature databases** that feed the filters; issues blocking requests. | Operates the blocklist/DNA-DB that all hash filters consume |

**Takeaway.** The censorship engine that actually blocks *re-uploads of a banned
image* is **perceptual / learned-"DNA" hashing matched against a KCSC blocklist**.
That is the primary target. Secondary targets are **invisible AI-watermarks and
C2PA provenance** (the labeling mandate) and **deepfake classifiers** (elections).

## 2. Detection taxonomy and client-side countermeasures

### 2.1 Perceptual / robust hashing — *the core re-upload filter* (PRIMARY TARGET)

How matching works: the image is reduced to a short fingerprint that survives
benign edits, then any upload within a small Hamming/L2 distance of a blocklist
entry is flagged.

| Scheme | Fingerprint | Match threshold | Robust to | **Weak to (our lever)** |
|---|---|---|---|---|
| aHash | 8×8 mean-threshold, 64-bit | a few bits | scale, mild brightness | any geometry; local contrast crossing the mean |
| dHash | 9×8 gradient sign, 64-bit | ~10 bits | brightness/contrast (sign-invariant) | **flip ⇒ near-complement**; rotation; crop |
| pHash | 32×32 → DCT 8×8 vs median, 64-bit | ~10 bits | scale, aspect, JPEG, photometry | rotation, crop, flip, **targeted DCT-coefficient nudge** |
| wHash | Haar DWT LL band, 64-bit | tight | scale, JPEG, blur | geometry, targeted wavelet nudge |
| blockhash | 16×16 block means vs median, 256-bit | Hamming | scale, JPEG, photometry | geometry, per-region luma crossing block median |
| **Meta PDQ** | luminance→64×64→16×16 DCT vs median, 256-bit | **≤31/256** | resize, JPEG, color; 90°/flip *if* dihedral enumerated | **off-axis rotation** (5°⇒>10% bits, not in the 8 dihedral variants), asymmetric crop, anamorphic scale, seam-carve, local warp |
| **MS PhotoDNA** | gray→~26×26→6×6 Sobel-gradient sums, 144 bytes | L2 (<~200) | JPEG, photometry, small scale | **mirror** (reverses Sobel sign), crop (shifts 6×6 grid), rotation |
| **Apple NeuralHash** | CNN→128-d→96-bit | small Hamming | designed for JPEG/resize/crop — but empirically brittle | **flip, rotation, crop, even hue/contrast**; white-box gradient attack |

The single most important empirical finding: **grid-based hashes are engineered
to ignore photometric edits but are fragile to geometry that moves content
relative to the sampling lattice.** Brightness/contrast/hue/noise alone are the
*weakest* countermeasures. The strong levers, in order:

1. **Geometry** — one bounded content-relative warp (small off-axis rotation +
   asymmetric crop-and-rescale + anamorphic aspect jitter, optionally a flip).
   Defeats every grid hash at once and is not invertible by dihedral enumeration
   when crop/warp is included.
2. **Targeted coefficient nudge** — for pHash/wHash, push the low-frequency DCT
   coefficients that straddle the median just across it (white-box optimal: max
   Hamming distance per unit of pixel change). This is `maximizePerceptualHash`.
3. **Re-encode + quantization jitter** — fresh bitstream, kills byte hashes and
   re-quantization noise.

The learned **"DNA"** filter (ETRI/MSIT) is a deep feature vector; it is *more*
robust to photometry but, like NeuralHash, still moves under strong geometry —
see Limitations for the honest caveat (a defender can re-train on transformed
data).

### 2.2 Invisible watermarks (AI-label mandate)

| Family | Client-side removal | Verdict |
|---|---|---|
| LSB steganography | any lossy re-encode | **destroyed trivially** |
| DCT/DWT spread-spectrum, `invisible-watermark` dwtDct/dwtDctSvd, QIM/dither | re-encode + geometry + **mid-band coefficient randomization** | **high** (defeated with our frequency module) |
| RivaGAN, Meta Stable Signature (learned) | aggressive geometry + heavy distortion | **partial** |
| **Google SynthID-Image** | only diffusion img2img regeneration (needs a GPU diffusion model) | **NOT client-side defeatable** — ~99.9% detection retained under JPEG/crop/noise/colour/median |
| **Tree-Ring** (diffusion-noise, Fourier) | diffusion regeneration | **NOT client-side defeatable** (geometry-invariant) |
| StegaStamp / Digimarc (learned/robust) | regeneration | **NOT reliably client-side** |

We defeat classical/fragile marks and **honestly report** the learned-robust
ones as not-defeated rather than pretending otherwise.

### 2.3 Provenance / metadata / file signatures

EXIF/XMP/IPTC, C2PA Content Credentials (JUMBF manifests), file/byte hashes,
JPEG quantization-table fingerprints, PRNU sensor noise. **Stripping the bytes**
(our `codec` module) removes EXIF/XMP/C2PA/IPTC and the exact-file hash;
re-encoding changes the quantization fingerprint. Caveat: a C2PA *soft binding*
(a hash/watermark stored *inside* the manifest) is gone once the manifest is
stripped, but a separately-embedded SynthID-style mark survives manifest removal
(it lives in the pixels) — pixel transforms, not the stripper, address that.

### 2.4 AI classifiers, reverse image / face search, deepfake detectors

CNN/ViT classifiers, CLIP-embedding similarity, Google Lens / TinEye / Yandex /
PimEyes, NEC "Aegis". These are **black-box** (no client-side gradients). Only
transfer attacks from a bundled surrogate, heuristic high-frequency texture, and
geometry are possible, and the academic consensus (Radiya-Dixit & Tramèr 2022;
Hönig/Rando/Carlini/Tramèr 2024) is that one-shot client perturbation gives a
**false sense of security** (purification and newer models defeat Glaze/Fawkes/
LowKey). Our `adversarial-texture` module therefore ships **disabled by default**
with a caveat. Geometry + recompression remain the reliable degraders.

### 2.5 Video & audio

Whole-video hashing (Meta TMK+PDQF), keyframe pHash/PDQ sequences, audio
fingerprinting (Chromaprint/AcoustID, Shazam constellation), Content-ID. Defeated
by per-frame image transforms + temporal restructuring (timestamp/GOP jitter,
frame insert/drop, mild speed change) and audio pitch/tempo micro-shift — all
feasible for **short clips** via WebCodecs/WebAudio; ffmpeg.wasm is ~10× slower.
YouTube Content-ID and robust forensic video watermarks are the ceiling (not
reliably defeated).

## 3. Sources

Primary legal/enforcement and technical sources gathered during research
(non-exhaustive):

- NEC "Aegis" deepfake detection and Election Act Art. 82-8 — nec.go.kr, thediplomat.com, thereadable.co
- AI Basic Act Art. 31 labeling/watermark + 2026 amendment — trade.gov, babl.ai, koreatimes.co.kr, petapixel.com, kimchang.com
- Network Act "false/manipulated information" amendment — jurist.org, abcnews.go.com, biometricupdate.com, ccianet.org
- TBA Art. 22-5 standard filtering + KCSC DNA-DB — etnews.com, korea.kr, opennetkorea.org, en.wikipedia.org/wiki/Nth_Room_case
- Perceptual hashing & attacks — facebook/ThreatExchange PDQ README, phash.org, hackerfactor.com, Steinebach et al. (PhotoDNA), Struppek et al. & roboflow (NeuralHash), DFRWS Hamming-distribution study
- Watermarking — SynthID (DeepMind), Stable Signature (Meta), Tree-Ring, `invisible-watermark`, StegaStamp; regeneration-attack literature
- Adversarial-cloak fragility — Radiya-Dixit & Tramèr 2022; Hönig/Rando/Carlini/Tramèr 2024

Full URL list is preserved in the research run artifact.
