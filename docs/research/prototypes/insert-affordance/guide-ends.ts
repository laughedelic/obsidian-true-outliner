/**
 * What a guide-end `+` would actually have to target: every place a guide
 * stops, what sits directly below it, how many stop on one line at once, and
 * how many nodes own no guide for such a control to hang off at all.
 *
 * Reads the project's own pure functions — `parse`, `computeLineGuides`,
 * `ancestryAtLine` — so the figures are the renderer's own arithmetic rather
 * than a second model of it. Run: `npx tsx docs/research/prototypes/insert-affordance/guide-ends.ts`
 */

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import fc from 'fast-check';
import { parse } from '../../../../src/parse';
import { walkNodes, type OutlineDoc, type OutlineNode } from '../../../../src/model';
import { computeLineGuides } from '../../../../src/plugin/decorate';
import { ancestryAtLine } from '../../../../src/plugin/fold-model';
import { arbMarkdownText, arbTree } from '../../../../tests/generators';
import { encode } from '../../../../src/encode';

/** Where a guide stops: the last line it runs through, and its column. */
interface GuideEnd {
  readonly line: number;
  readonly column: number;
  /** Which track drew it. */
  readonly track: 'guide' | 'list';
  /** What the line directly below the end is. */
  readonly below: 'doc-end' | 'blank' | 'content';
  /** The kind of the node whose guide this is, or null when unresolvable. */
  readonly ownerKind: string | null;
  /** Children the owner already has. */
  readonly ownerChildren: number;
  /** Was the ending line itself a blank gap line carrying the guide? */
  readonly endsOnGapLine: boolean;
  /** Tree depth of the ending line, minus the guide's column. */
  readonly hostClearance: number;
  /** Tree depth of the line below, minus the guide's column (content only). */
  readonly belowClearance: number | null;
}

function guideEnds(doc: OutlineDoc, lines: readonly string[]): GuideEnd[] {
  const facts = computeLineGuides(doc);
  const byLine = new Map(facts.map((f) => [f.lineNumber, f]));
  const ends: GuideEnd[] = [];
  for (const fact of facts) {
    const next = byLine.get(fact.lineNumber + 1);
    for (const track of ['guide', 'list'] as const) {
      const here = track === 'guide' ? fact.guideDepths : fact.listGuideDepths;
      const there = next ? (track === 'guide' ? next.guideDepths : next.listGuideDepths) : [];
      for (const column of here) {
        if (there.includes(column)) continue;
        const belowText = lines[fact.lineNumber + 1];
        const below =
          fact.lineNumber + 1 >= lines.length
            ? 'doc-end'
            : (belowText ?? '').trim() === ''
              ? 'blank'
              : 'content';
        const owner = ancestryAtLine(doc, fact.lineNumber)[column] ?? null;
        const hostDepth = ancestryAtLine(doc, fact.lineNumber).length - 1;
        const belowDepth =
          below === 'content' ? ancestryAtLine(doc, fact.lineNumber + 1).length - 1 : null;
        ends.push({
          endsOnGapLine: fact.isGapLine,
          hostClearance: hostDepth - column,
          belowClearance: belowDepth === null ? null : belowDepth - column,
          line: fact.lineNumber,
          column,
          track,
          below,
          ownerKind: owner ? owner.node.kind : null,
          ownerChildren: owner ? owner.node.children.length : 0,
        });
      }
    }
  }
  return ends;
}

interface Totals {
  docs: number;
  lines: number;
  nodes: number;
  leaves: number;
  parents: number;
  /** Nodes with children that are NOT the last child of their own parent. */
  midTreeBoundaries: number;
  ends: number;
  below: Record<GuideEnd['below'], number>;
  track: Record<GuideEnd['track'], number>;
  /** How many guide ends share one line: count of lines by stack size. */
  stack: Map<number, number>;
  /** Distinct owners reached by at least one guide end. */
  ownersReached: number;
  /** Guide ends landing on a blank gap line — expected zero. */
  endsOnGapLine: number;
  /** Clearance of the `+` inside its host line's gutter, by value. */
  hostClearance: Map<number, number>;
  /** Clearance against the line BELOW, when that line is content. */
  belowClearance: Map<number, number>;
}

function empty(): Totals {
  return {
    docs: 0,
    lines: 0,
    nodes: 0,
    leaves: 0,
    parents: 0,
    midTreeBoundaries: 0,
    ends: 0,
    below: { 'doc-end': 0, blank: 0, content: 0 },
    track: { guide: 0, list: 0 },
    stack: new Map(),
    ownersReached: 0,
    endsOnGapLine: 0,
    hostClearance: new Map(),
    belowClearance: new Map(),
  };
}

function siblingBoundaries(doc: OutlineDoc): number {
  let n = 0;
  const walk = (nodes: readonly OutlineNode[]): void => {
    if (nodes.length > 1) n += nodes.length - 1;
    for (const node of nodes) walk(node.children);
  };
  walk(doc.children);
  return n;
}

function tally(totals: Totals, md: string): void {
  const doc = parse(md);
  const lines = md.split('\n');
  totals.docs += 1;
  totals.lines += lines.length;
  for (const node of walkNodes(doc)) {
    totals.nodes += 1;
    if (node.children.length === 0) totals.leaves += 1;
    else totals.parents += 1;
  }
  totals.midTreeBoundaries += siblingBoundaries(doc);
  const ends = guideEnds(doc, lines);
  totals.ends += ends.length;
  const perLine = new Map<number, number>();
  const owners = new Set<string>();
  for (const end of ends) {
    totals.below[end.below] += 1;
    totals.track[end.track] += 1;
    perLine.set(end.line, (perLine.get(end.line) ?? 0) + 1);
    if (end.endsOnGapLine) totals.endsOnGapLine += 1;
    totals.hostClearance.set(
      end.hostClearance,
      (totals.hostClearance.get(end.hostClearance) ?? 0) + 1,
    );
    if (end.belowClearance !== null) {
      totals.belowClearance.set(
        end.belowClearance,
        (totals.belowClearance.get(end.belowClearance) ?? 0) + 1,
      );
    }
    owners.add(`${end.line}:${end.column}:${end.track}`);
  }
  for (const count of perLine.values()) {
    totals.stack.set(count, (totals.stack.get(count) ?? 0) + 1);
  }
  totals.ownersReached += owners.size;
}

function vaultFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    if (entry.startsWith('.')) continue;
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) out.push(...vaultFiles(path));
    else if (entry.endsWith('.md')) out.push(path);
  }
  return out;
}

function report(label: string, t: Totals): void {
  const pct = (n: number, of: number) => (of === 0 ? '—' : `${((n / of) * 100).toFixed(1)}%`);
  console.log(`\n## ${label}`);
  console.log(`docs ${t.docs}  lines ${t.lines}  nodes ${t.nodes}`);
  console.log(
    `parents ${t.parents} (${pct(t.parents, t.nodes)})  leaves ${t.leaves} (${pct(t.leaves, t.nodes)})`,
  );
  console.log(
    `guide ends ${t.ends}  per 100 lines ${((t.ends / t.lines) * 100).toFixed(1)}  per doc ${(t.ends / t.docs).toFixed(1)}`,
  );
  console.log(
    `  below: doc-end ${t.below['doc-end']} (${pct(t.below['doc-end'], t.ends)})  blank ${t.below.blank} (${pct(t.below.blank, t.ends)})  content ${t.below.content} (${pct(t.below.content, t.ends)})`,
  );
  console.log(`  track: guide ${t.track.guide}  list ${t.track.list}`);
  const stack = [...t.stack.entries()].sort((a, b) => a[0] - b[0]);
  const stackLines = stack.reduce((s, [, n]) => s + n, 0);
  console.log(
    `  ends per line: ${stack.map(([k, n]) => `${k}→${n} (${pct(n, stackLines)})`).join('  ')}`,
  );
  console.log(
    `  sibling boundaries (mid-tree candidates) ${t.midTreeBoundaries}  vs guide ends ${t.ends}`,
  );
  const dist = (m: Map<number, number>) =>
    [...m.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([k, n]) => `${k}→${n} (${pct(n, t.ends)})`)
      .join('  ');
  console.log(`  ends landing on a blank gap line ${t.endsOnGapLine}`);
  console.log(`  host-line clearance (host depth − guide column): ${dist(t.hostClearance)}`);
  console.log(`  below-line clearance, content only: ${dist(t.belowClearance)}`);
}

const vault = empty();
for (const path of vaultFiles('test-vault')) tally(vault, readFileSync(path, 'utf8'));
report('test vault', vault);

const text = empty();
fc.sample(arbMarkdownText, { numRuns: 3000, seed: 42 }).forEach((md) => tally(text, md));
report('arbMarkdownText (3000, seed 42)', text);

const tree = empty();
fc.sample(arbTree(), { numRuns: 600, seed: 42 }).forEach((doc) => tally(tree, encode(doc)));
report('arbTree (600, seed 42)', tree);
