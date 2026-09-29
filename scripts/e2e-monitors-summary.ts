/**
 * Renders the ambient monitors' report as Markdown, for CI's step summary and for reading after
 * a local run.
 *
 *   node scripts/e2e-monitors-summary.ts [report.json] >> "$GITHUB_STEP_SUMMARY"
 *
 * The report is `.obsidian-cache/e2e-monitors.json`, written by the launcher's `onComplete`
 * (`e2e-tests/wdio.shared.mts`, `writeMonitorReport`). A run that wrote none prints nothing, so a
 * job whose specs never started adds no empty section to its summary.
 *
 * The shape below restates the report's. `scripts/` is typechecked without the e2e tree's types,
 * so it cannot import them.
 */

import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import * as path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

interface Report {
  ranAt: string;
  cases: number;
  coverage: Record<string, { checked: number; skipped: Record<string, number> }>;
  findings: {
    monitor: string;
    rule: string;
    cases: number;
    observations: number;
    examples: { spec: string; test: string; detail: string }[];
  }[];
  overheadMs: number;
  exemptions: { spec: string; test: string; monitor: string; reason: string }[];
}

/** A table cell: no pipes or line breaks, and not so long it wraps a whole summary. */
const cell = (text: string, max = 140): string => {
  const flat = text.replace(/\s+/g, ' ').replace(/\|/g, '\\|');
  return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat;
};

export function render(report: Report): string {
  const out: string[] = [];
  const total = report.findings.reduce((n, f) => n + f.observations, 0);
  out.push('### Ambient monitors (report-only)');
  out.push('');
  out.push(
    `${total} observation${total === 1 ? '' : 's'} in ${report.findings.length} rule${report.findings.length === 1 ? '' : 's'} across ${report.cases} case${report.cases === 1 ? '' : 's'}; ` +
      `the monitors took ${(report.overheadMs / 1000).toFixed(1)} s in all.`,
  );
  out.push('');

  if (report.findings.length > 0) {
    out.push('| monitor / rule | observations | cases | first example |');
    out.push('|---|---|---|---|');
    for (const f of report.findings) {
      const e = f.examples[0];
      const where = e ? `${path.basename(e.spec)} › ${e.test}: ${e.detail}` : '';
      out.push(`| ${f.monitor} / ${f.rule} | ${f.observations} | ${f.cases} | ${cell(where)} |`);
    }
    out.push('');
  }

  out.push('| monitor | read | not read |');
  out.push('|---|---|---|');
  for (const [monitor, c] of Object.entries(report.coverage)) {
    const why = Object.entries(c.skipped)
      .sort((a, b) => b[1] - a[1])
      .map(([reason, n]) => `${n} ${reason}`)
      .join('; ');
    out.push(`| ${monitor} | ${c.checked} | ${cell(why, 200)} |`);
  }
  out.push('');

  if (report.exemptions.length > 0) {
    out.push('<details><summary>Exemptions</summary>');
    out.push('');
    for (const e of report.exemptions) {
      out.push(`- \`${path.basename(e.spec)}\` › ${e.test} — ${e.monitor}: ${e.reason}`);
    }
    out.push('');
    out.push('</details>');
    out.push('');
  }
  return out.join('\n');
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const file = process.argv[2] ?? path.join(root, '.obsidian-cache', 'e2e-monitors.json');
  if (existsSync(file)) {
    process.stdout.write(render(JSON.parse(readFileSync(file, 'utf-8')) as Report));
  }
}
