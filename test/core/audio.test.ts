import { describe, it, expect } from 'vitest';
import {
  resampleLinear,
  timeStretch,
  pitchShift,
  addAudioNoise,
  convertSampleRate,
  obfuscateAudio,
} from '../../src/core/audio/dsp';

const SR = 8000;

function sine(freq: number, seconds: number, sr = SR): Float32Array {
  const n = Math.round(seconds * sr);
  const x = new Float32Array(n);
  for (let i = 0; i < n; i++) x[i] = Math.sin((2 * Math.PI * freq * i) / sr);
  return x;
}

/** Autocorrelation fundamental-frequency estimate (50..1000 Hz). */
function estFreq(x: Float32Array, sr = SR): number {
  const minLag = Math.floor(sr / 1000);
  const maxLag = Math.floor(sr / 50);
  let bestLag = minLag;
  let best = -Infinity;
  for (let lag = minLag; lag <= maxLag; lag++) {
    let s = 0;
    for (let i = 0; i + lag < x.length; i++) s += x[i]! * x[i + lag]!;
    if (s > best) {
      best = s;
      bestLag = lag;
    }
  }
  return sr / bestLag;
}

describe('resampleLinear', () => {
  it('changes length by 1/ratio and pitch by ratio', () => {
    const x = sine(300, 0.5);
    const out = resampleLinear(x, 1.25);
    expect(out.length).toBe(Math.round(x.length / 1.25));
    expect(estFreq(out)).toBeGreaterThan(estFreq(x) * 1.1);
  });
});

describe('timeStretch', () => {
  it('changes duration by the factor while preserving pitch', () => {
    const x = sine(300, 0.5);
    const out = timeStretch(x, 1.5);
    expect(out.length / x.length).toBeCloseTo(1.5, 1);
    expect(estFreq(out)).toBeCloseTo(300, -1.05); // ~within 10%
  });

  it('is deterministic', () => {
    const x = sine(220, 0.3);
    expect(Array.from(timeStretch(x, 1.3))).toEqual(Array.from(timeStretch(x, 1.3)));
  });
});

describe('pitchShift', () => {
  it('shifts the fundamental by the ratio and preserves duration', () => {
    const x = sine(300, 0.5);
    const out = pitchShift(x, 1.2);
    expect(out.length).toBeCloseTo(x.length, -1.1); // ~same length
    const f = estFreq(out);
    expect(f).toBeGreaterThan(300 * 1.1);
    expect(f).toBeLessThan(300 * 1.32);
  });
});

describe('convertSampleRate', () => {
  it('changes sample count to the target rate while preserving pitch/duration', () => {
    const x = sine(300, 0.5, 8000);
    const up = convertSampleRate(x, 8000, 16000);
    expect(up.length).toBe(Math.round(x.length * 16000 / 8000));
    // duration preserved => same real frequency at the new rate
    expect(estFreq(up, 16000)).toBeCloseTo(300, -1.05);
  });

  it('is identity when rates match', () => {
    const x = sine(220, 0.2, 8000);
    const out = convertSampleRate(x, 8000, 8000);
    expect(Array.from(out)).toEqual(Array.from(x));
  });
});

describe('obfuscateAudio', () => {
  it('returns 48k channels, shifts pitch, is deterministic', () => {
    const ch = sine(300, 0.4, 16000);
    const a = obfuscateAudio([ch], 16000, { pitch: 1.08, noise: 0.003, seed: 1 });
    const b = obfuscateAudio([ch], 16000, { pitch: 1.08, noise: 0.003, seed: 1 });
    expect(a.sampleRate).toBe(48000);
    expect(a.channels.length).toBe(1);
    expect(Array.from(a.channels[0]!)).toEqual(Array.from(b.channels[0]!));
    // pitch raised: fundamental at the new rate exceeds the original 300 Hz
    expect(estFreq(a.channels[0]!, 48000)).toBeGreaterThan(300 * 1.03);
  });

  it('preserves channel count for stereo', () => {
    const l = sine(200, 0.2, 48000);
    const r = sine(400, 0.2, 48000);
    const out = obfuscateAudio([l, r], 48000, { seed: 2 });
    expect(out.channels.length).toBe(2);
    expect(out.sampleRate).toBe(48000);
  });
});

describe('addAudioNoise', () => {
  it('perturbs the signal deterministically without large amplitude change', () => {
    const x = sine(440, 0.2);
    const a = addAudioNoise(x, 0.01, 1);
    const b = addAudioNoise(x, 0.01, 1);
    expect(Array.from(a)).toEqual(Array.from(b));
    expect(Array.from(a)).not.toEqual(Array.from(x));
    let maxd = 0;
    for (let i = 0; i < x.length; i++) maxd = Math.max(maxd, Math.abs(a[i]! - x[i]!));
    expect(maxd).toBeLessThan(0.05);
  });
});
