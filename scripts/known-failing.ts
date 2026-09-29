/**
 * What a `known-failing` case that still fails leaves for the report: the record a worker writes,
 * the launcher's collection of them, and the Markdown a CI job's step summary shows. Pure, so the
 * unit suite covers it; the wdio launcher (`e2e-tests/wdio.shared.mts`) and
 * `known-failing-summary.ts` are the callers.
 */

export interface KnownFailingEntry {
  /** The case as a failure names it: its path under `e2e-tests/cases/`, without the extension. */
  case: string;
  issue: number;
  platform: 'desktop' | 'mobile';
  /** What differs from `expected`: `text`, `caret`, `selection`, `block selection`. */
  differs: string[];
  /** The drawing of `before`, `expected` and `actual`, as the run printed it. */
  drawing: string;
}

const isEntry = (value: unknown): value is KnownFailingEntry => {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.case === 'string' &&
    Number.isInteger(v.issue) &&
    (v.platform === 'desktop' || v.platform === 'mobile') &&
    Array.isArray(v.differs) &&
    v.differs.every((d) => typeof d === 'string') &&
    typeof v.drawing === 'string'
  );
};

/**
 * The entries in a worker's record file: one JSON object per line. A line that is not one, such as
 * the half a killed worker left, is skipped, and the entries around it are kept.
 */
export function collapseRecords(text: string): KnownFailingEntry[] {
  const entries: KnownFailingEntry[] = [];
  for (const line of text.split('\n')) {
    if (!line.trim()) continue;
    try {
      const value: unknown = JSON.parse(line);
      if (isEntry(value)) entries.push(value);
    } catch {
      // A partial line.
    }
  }
  return entries;
}

/** A table cell: no pipes and no line breaks. */
const cell = (text: string): string => text.replace(/\s+/g, ' ').replace(/\|/g, '\\|');

/** A fence longer than any run of backticks in the text it holds. */
function fenced(text: string): string {
  const longest = Math.max(2, ...[...text.matchAll(/`+/g)].map((m) => m[0].length));
  const fence = '`'.repeat(longest + 1);
  return [fence, text, fence].join('\n');
}

/**
 * The step summary of a job that ran known-failing cases: a table of what still differs, with each
 * drawing folded under it. The issue links through `repository` (`owner/name`) when it is given.
 * Nothing at all for no entries, so a job with none adds no section.
 */
export function renderStepSummary(entries: readonly KnownFailingEntry[], repository?: string): string {
  if (entries.length === 0) return '';
  const sorted = [...entries].sort((a, b) => a.case.localeCompare(b.case) || a.platform.localeCompare(b.platform));
  const issue = (n: number) => (repository ? `[#${n}](https://github.com/${repository}/issues/${n})` : `#${n}`);
  const out: string[] = ['### Known-failing cases still failing', ''];
  out.push('These cases wait on an open issue and passed because they still differ as recorded.', '');
  out.push('| case | issue | platform | differs |', '|---|---|---|---|');
  for (const e of sorted) {
    out.push(`| \`${cell(e.case)}\` | ${issue(e.issue)} | ${e.platform} | ${cell(e.differs.join(', '))} |`);
  }
  out.push('');
  for (const e of sorted) {
    out.push(`<details><summary>${cell(e.case)} (#${e.issue}, ${e.platform})</summary>`, '', fenced(e.drawing), '', '</details>', '');
  }
  return out.join('\n');
}
