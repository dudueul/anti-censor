import { describe, it, expect } from 'vitest';
import { temporalPlan } from '../../src/core/video/temporal';

describe('temporalPlan', () => {
  it('produces one output entry per kept frame, with strictly increasing timestamps', () => {
    const plan = temporalPlan(60, { fps: 30, seed: 1 });
    expect(plan.frames.length).toBeGreaterThan(0);
    for (let i = 1; i < plan.frames.length; i++) {
      expect(plan.frames[i]!.timestampUs).toBeGreaterThan(plan.frames[i - 1]!.timestampUs);
    }
  });

  it('every output frame references a valid source index', () => {
    const n = 48;
    const plan = temporalPlan(n, { seed: 3, dropRate: 0.1, insertRate: 0.1 });
    for (const f of plan.frames) {
      expect(f.sourceIndex).toBeGreaterThanOrEqual(0);
      expect(f.sourceIndex).toBeLessThan(n);
    }
  });

  it('applies the speed factor to the total duration', () => {
    const base = temporalPlan(30, { fps: 30, seed: 5, dropRate: 0, insertRate: 0, timestampJitterUs: 0, speed: 1 });
    const fast = temporalPlan(30, { fps: 30, seed: 5, dropRate: 0, insertRate: 0, timestampJitterUs: 0, speed: 1.5 });
    const dur = (p: typeof base) => p.frames[p.frames.length - 1]!.timestampUs;
    expect(dur(fast)).toBeLessThan(dur(base));
  });

  it('randomizes keyframes but keeps the first frame a keyframe', () => {
    const plan = temporalPlan(60, { seed: 7, gopMin: 8, gopMax: 16 });
    expect(plan.frames[0]!.keyFrame).toBe(true);
    const kf = plan.frames.filter((f) => f.keyFrame).length;
    expect(kf).toBeGreaterThan(1); // multiple GOPs
    expect(kf).toBeLessThan(plan.frames.length); // not every frame
  });

  it('drops and inserts frames when asked (changes the count vs identity)', () => {
    const identity = temporalPlan(50, { seed: 9, dropRate: 0, insertRate: 0 });
    const churned = temporalPlan(50, { seed: 9, dropRate: 0.2, insertRate: 0.2 });
    expect(identity.frames.length).toBe(50);
    expect(churned.frames.length).not.toBe(50);
  });

  it('is deterministic for a given seed', () => {
    const a = temporalPlan(40, { seed: 11, dropRate: 0.1, insertRate: 0.1 });
    const b = temporalPlan(40, { seed: 11, dropRate: 0.1, insertRate: 0.1 });
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });
});
