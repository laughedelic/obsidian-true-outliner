/**
 * Classification observability surface (design.md D8): per-class counters,
 * per-class timing aggregates, and a bounded ring buffer of recent
 * classifications — exposed as a public field on the plugin instance so
 * the e2e harness (which already executes JS in the app and reads plugin
 * state, e.g. `isOutlineMode`) can assert on it directly. This turns each
 * Phase A choke-point assumption into a permanent, assertable regression
 * test instead of a one-off manual observation.
 */

import type { TransactionClass } from '../classify';

export interface ClassificationRecord {
  readonly cls: TransactionClass;
  readonly userEvent: string | undefined;
  readonly ms: number;
  readonly timestamp: number;
}

export interface TimingSummary {
  readonly count: number;
  readonly median: number;
  readonly p95: number;
  readonly max: number;
}

export interface StatsSnapshot {
  readonly counts: Record<TransactionClass, number>;
  readonly timing: Record<TransactionClass, TimingSummary>;
  readonly recent: readonly ClassificationRecord[];
}

const ALL_CLASSES: readonly TransactionClass[] = [
  'programmatic',
  'composition',
  'plugin-own',
  'selection-only',
  'within-node-edit',
  'boundary-crossing-edit',
];

/** Per-class sample cap — bounds memory on a long editing session; recent
 * samples are what the budget (D7) cares about, not full history. */
const MAX_SAMPLES_PER_CLASS = 1000;
const RING_BUFFER_SIZE = 200;

function emptyTiming(): TimingSummary {
  return { count: 0, median: 0, p95: 0, max: 0 };
}

function summarize(samples: readonly number[]): TimingSummary {
  if (samples.length === 0) return emptyTiming();
  const sorted = [...samples].sort((a, b) => a - b);
  const at = (p: number): number => sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))]!;
  return { count: sorted.length, median: at(0.5), p95: at(0.95), max: sorted[sorted.length - 1]! };
}

export class TransactionStats {
  private counts: Record<TransactionClass, number> = {
    programmatic: 0,
    composition: 0,
    'plugin-own': 0,
    'selection-only': 0,
    'within-node-edit': 0,
    'boundary-crossing-edit': 0,
  };
  private samples: Record<TransactionClass, number[]> = {
    programmatic: [],
    composition: [],
    'plugin-own': [],
    'selection-only': [],
    'within-node-edit': [],
    'boundary-crossing-edit': [],
  };
  private ring: ClassificationRecord[] = [];

  record(cls: TransactionClass, ms: number, userEvent: string | undefined): void {
    this.counts[cls]++;
    const bucket = this.samples[cls];
    bucket.push(ms);
    if (bucket.length > MAX_SAMPLES_PER_CLASS) bucket.shift();
    this.ring.push({ cls, userEvent, ms, timestamp: Date.now() });
    if (this.ring.length > RING_BUFFER_SIZE) this.ring.shift();
  }

  snapshot(): StatsSnapshot {
    const timing = {} as Record<TransactionClass, TimingSummary>;
    for (const cls of ALL_CLASSES) timing[cls] = summarize(this.samples[cls]);
    return { counts: { ...this.counts }, timing, recent: [...this.ring] };
  }

  reset(): void {
    for (const cls of ALL_CLASSES) {
      this.counts[cls] = 0;
      this.samples[cls] = [];
    }
    this.ring = [];
  }

  /** One-line-per-class human-readable summary for the dev command. */
  formatSummary(): string {
    const snap = this.snapshot();
    return ALL_CLASSES.map((cls) => {
      const t = snap.timing[cls];
      return `${cls}: ${snap.counts[cls]} (median ${t.median.toFixed(2)}ms, p95 ${t.p95.toFixed(2)}ms, max ${t.max.toFixed(2)}ms)`;
    }).join('\n');
  }
}
