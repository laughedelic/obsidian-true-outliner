import { describe, expect, it } from 'vitest';
import { TransactionStats } from '../src/plugin/stats';

describe('TransactionStats', () => {
  it('counts per class and computes median/p95/max', () => {
    const stats = new TransactionStats();
    for (const ms of [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]) {
      stats.record('within-node-edit', ms, 'input.type');
    }
    const snap = stats.snapshot();
    expect(snap.counts['within-node-edit']).toBe(10);
    expect(snap.counts.programmatic).toBe(0);
    expect(snap.timing['within-node-edit'].count).toBe(10);
    expect(snap.timing['within-node-edit'].median).toBe(6); // 50th percentile index
    expect(snap.timing['within-node-edit'].max).toBe(10);
  });

  it('keeps a bounded ring buffer of the most recent classifications', () => {
    const stats = new TransactionStats();
    for (let i = 0; i < 250; i++) stats.record('selection-only', i, 'select.pointer');
    const snap = stats.snapshot();
    expect(snap.counts['selection-only']).toBe(250); // counter is unbounded
    expect(snap.recent.length).toBeLessThanOrEqual(200); // ring buffer is bounded
    expect(snap.recent[snap.recent.length - 1]!.ms).toBe(249); // most recent kept
  });

  it('reset clears counts, timings, and the ring buffer', () => {
    const stats = new TransactionStats();
    stats.record('programmatic', 1, undefined);
    stats.reset();
    const snap = stats.snapshot();
    expect(snap.counts.programmatic).toBe(0);
    expect(snap.timing.programmatic.count).toBe(0);
    expect(snap.recent).toEqual([]);
  });

  it('an empty class reports zeroed timing, not NaN/Infinity', () => {
    const stats = new TransactionStats();
    const snap = stats.snapshot();
    expect(snap.timing.composition).toEqual({ count: 0, median: 0, p95: 0, max: 0 });
  });

  it('counts per-verdict occurrences and timing independently of class counts', () => {
    const stats = new TransactionStats();
    stats.record('boundary-crossing-edit', 2, 'delete.structural');
    stats.recordVerdict('rewrite', 2);
    stats.record('boundary-crossing-edit', 1, 'input.type');
    stats.recordVerdict('veto', 1);
    stats.record('boundary-crossing-edit', 3, 'input.type');
    stats.recordVerdict('pass', 3);

    const snap = stats.snapshot();
    expect(snap.verdictCounts).toEqual({ pass: 1, rewrite: 1, veto: 1 });
    expect(snap.verdictTiming.rewrite.count).toBe(1);
    expect(snap.verdictTiming.rewrite.max).toBe(2);
  });

  it('reset also clears verdict counters and timing', () => {
    const stats = new TransactionStats();
    stats.recordVerdict('veto', 5);
    stats.reset();
    const snap = stats.snapshot();
    expect(snap.verdictCounts).toEqual({ pass: 0, rewrite: 0, veto: 0 });
    expect(snap.verdictTiming.veto).toEqual({ count: 0, median: 0, p95: 0, max: 0 });
  });
});
