# anti-censor

A Chromium (Manifest V3) extension that applies imperceptible transformations to
images (and short videos) before they leave your browser, so that automated
content-identification systems — perceptual-hash blocklists, file/metadata
signatures, invisible watermarks, provenance manifests, and ML classifiers —
no longer recognise the media as a previously-seen item, while it remains
visually faithful to a human viewer.

## Why

A growing number of "anti–fake-news" / disinformation regimes pair takedown
duties with **automated re-upload filtering**: once a piece of media is flagged,
its fingerprint is added to a blocklist and every visually-similar re-upload is
blocked automatically. For people sharing lawful journalism, protest footage,
satire, or political speech, this turns a single takedown into a permanent,
machine-enforced silence. This project is a circumvention tool for that class of
**state censorship of one's own / lawful expression**.

## Scope & boundaries

This is an anti-censorship and personal-privacy tool. It is **not** designed or
documented as a way to defeat detection of illegal content (e.g. CSAM
hash-matching databases), to launder copyrighted material, or to strip
authenticity provenance in order to pass off manipulated media as genuine. The
underlying techniques are dual-use; please use it only to protect lawful speech
you have the right to publish.

## Status

Early development. The base branch for integration is `next`; feature work lands
via pull requests. Architecture, the analysed threat model, and the transform
pipeline are documented under `docs/` as they are built.

## License

To be determined.
