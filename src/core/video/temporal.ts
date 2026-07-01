import { mulberry32 } from '../prng';

/**
 * Temporal restructuring plan for video.
 *
 * Whole-video hashes (Meta TMK+PDQF), keyframe/scene pHash sequences and
 * collage hashes rely on a stable frame cadence, sampling phase and keyframe
 * structure. This produces a deterministic schedule that desynchronises all of
 * them — per-frame timestamp jitter, occasional frame drop/insert (duplicate),
 * randomised GOP/keyframe intervals, and an optional speed change — as pure data
 * the WebCodecs encoder adapter consumes (it does the actual decode/encode).
 */
export interface TemporalOptions {
  fps?: number;
  /** Uniform speed factor (>1 faster/shorter). */
  speed?: number;
  /** Probability a source frame is dropped. */
  dropRate?: number;
  /** Probability a duplicate frame is inserted after a frame. */
  insertRate?: number;
  /** +/- jitter added to each presentation timestamp, microseconds. */
  timestampJitterUs?: number;
  /** Keyframe interval drawn uniformly from [gopMin, gopMax]. */
  gopMin?: number;
  gopMax?: number;
  seed?: number;
}

export interface PlannedFrame {
  /** Index into the source frames (a duplicate reuses the previous index). */
  sourceIndex: number;
  /** Presentation timestamp in microseconds (strictly increasing). */
  timestampUs: number;
  /** Whether the encoder should emit this as a keyframe. */
  keyFrame: boolean;
  /** True if this is an inserted duplicate. */
  inserted: boolean;
}

export interface TemporalPlanResult {
  frames: PlannedFrame[];
  fps: number;
}

export function temporalPlan(nFrames: number, opts: TemporalOptions = {}): TemporalPlanResult {
  const {
    fps = 30,
    speed = 1,
    dropRate = 0.05,
    insertRate = 0.05,
    timestampJitterUs = 4000,
    gopMin = 8,
    gopMax = 24,
    seed = 1,
  } = opts;

  const rng = mulberry32(seed);
  const baseStepUs = 1_000_000 / (fps * (speed <= 0 ? 1 : speed));

  // 1. build the kept/inserted source-index sequence
  const seq: { sourceIndex: number; inserted: boolean }[] = [];
  for (let i = 0; i < nFrames; i++) {
    if (i > 0 && rng() < dropRate) continue; // never drop the very first frame
    seq.push({ sourceIndex: i, inserted: false });
    if (rng() < insertRate) seq.push({ sourceIndex: i, inserted: true });
  }
  if (seq.length === 0) seq.push({ sourceIndex: 0, inserted: false });

  // 2. assign monotonic jittered timestamps and randomised keyframes
  const frames: PlannedFrame[] = [];
  let t = 0;
  let sinceKey = 0;
  let nextGop = gopMin + Math.floor(rng() * (gopMax - gopMin + 1));
  let prevTs = -1;
  for (let k = 0; k < seq.length; k++) {
    const nominal = k * baseStepUs;
    const jitter = (rng() * 2 - 1) * timestampJitterUs;
    t = Math.round(nominal + jitter);
    if (t <= prevTs) t = prevTs + 1; // keep strictly increasing
    prevTs = t;

    const keyFrame = k === 0 || sinceKey >= nextGop;
    if (keyFrame) {
      sinceKey = 0;
      nextGop = gopMin + Math.floor(rng() * (gopMax - gopMin + 1));
    } else {
      sinceKey++;
    }

    frames.push({
      sourceIndex: seq[k]!.sourceIndex,
      timestampUs: t,
      keyFrame,
      inserted: seq[k]!.inserted,
    });
  }

  return { frames, fps };
}
