/**
 * The footer's view model: which rows exist, at what depth, carrying which
 * facts. Everything the footer decides is decided here, so it can be asserted
 * by reading a value rather than by inspecting a live app.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { parse } from '../src/parse';
import { buildRows, splitPath, type FooterRow } from '../src/plugin/footer-model';
import type { OutlineNode } from '../src/model';

const vault = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'test-vault');
const read = (rel: string): string => fs.readFileSync(path.join(vault, rel), 'utf8');

const referencesTarget = (node: OutlineNode): boolean =>
  node.lines.some((l) => l.includes('[[Aurora Dashboard'));

const noKind = () => undefined;
const noneExpanded = () => false;

/** A readable rendering of the rows, so failures show shape rather than JSON. */
function render(rows: readonly FooterRow[]): string[] {
  return rows.map((r) => {
    const indent = '  '.repeat(r.depth);
    if (r.type === 'lineage') {
      return `${indent}~ ${r.segments.map((s) => s.replace(/^[\t\s-]+/, '').trim()).join(' > ')}`;
    }
    if (r.type === 'property') return `${indent}[${r.property}] ${r.markdown}`;
    const first = r.markdown.split('\n')[0] ?? '';
    const fold = r.foldedCount > 0 ? `  [+${r.foldedCount}]` : '';
    const mark = r.isReference ? '*' : '.';
    return `${indent}${mark} ${first.replace(/^[\t\s-]+/, '').trim().slice(0, 46)}${fold}`;
  });
}

function rowsFor(rel: string): FooterRow[] {
  return buildRows(parse(read(rel)), referencesTarget, [], noKind, noneExpanded);
}

describe('footer model', () => {
  it('collapses a deep chain to one lineage row above the reference', () => {
    // The note's opening PARAGRAPH is part of the lineage, because in this tree
    // model a paragraph owns the list that follows it. Structurally right, and
    // a real consequence for the footer: a lineage can begin with prose rather
    // than with a heading or a bullet. See docs/research/17 (Q34), which asks
    // whether the attachment rule should hold at all.
    expect(render(rowsFor('Backlinks/Deep chain.md'))).toEqual([
      '~ Planning notes for the week. One thread runs deep on purpose. > work > Aurora dashboard — severity-first rollout > prototype review, second pass with Maya and Priya > open questions before Wednesday',
      '  * keep the timestamp on hover only, and note it ',
    ]);
  });

  it('shares a lineage across arms and collapses each arm on its own', () => {
    // `## Aurora` has a single surviving child, so it JOINS the chain rather
    // than standing above it — the collapse rule applied to the common prefix,
    // then again to each arm.
    expect(render(rowsFor('Backlinks/Branching arms.md'))).toEqual([
      '~ ## Aurora > work > Aurora',
      '  * ship the [[Aurora Dashboard]] triage view behi',
      '  ~ prototype review',
      '    * severity sort must be stable — see [[Aurora Da',
      '  ~ open questions > touch fallback',
      '    * ask Priya whether [[Aurora Dashboard]] hover w',
    ]);
  });

  it('carries a decoration fact on every node row, matching the node kind', () => {
    const rows = rowsFor('Backlinks/Atoms and anchors.md');
    const nodes = rows.filter((r): r is Extract<FooterRow, { type: 'node' }> => r.type === 'node');
    expect(nodes.length).toBeGreaterThan(0);
    for (const row of nodes) expect(row.fact).toBeDefined();
    // The callout reference is an atom and must say so, or the footer would
    // indent it with padding where it needs margin.
    const callout = nodes.find((r) => r.fact.kind === 'callout');
    expect(callout).toBeDefined();
    expect(callout!.fact.isAtom).toBe(true);
  });

  it('keeps a list under the paragraph that owns it', () => {
    // Our tree and Obsidian's metadata disagree here; the footer follows ours.
    const rows = rowsFor('Backlinks/Atoms and anchors.md');
    const lineage = rows.find((r) => r.type === 'lineage');
    expect(lineage).toBeDefined();
    if (lineage?.type !== 'lineage') throw new Error('expected lineage');
    expect(lineage.segments.join(' ')).toContain('Follow-ups from the review:');
  });

  it('renders a frontmatter reference as a property row with no lineage', () => {
    const doc = parse(read('Backlinks/Severity study writeup.md'));
    const rows = buildRows(
      doc,
      referencesTarget,
      [
        {
          kind: 'property',
          sourcePath: 'Backlinks/Severity study writeup.md',
          property: 'project',
          original: '[[Aurora Dashboard]]',
        },
      ],
      noKind,
      noneExpanded,
    );
    const property = rows.find((r) => r.type === 'property');
    expect(property).toBeDefined();
    if (property?.type !== 'property') throw new Error('expected property');
    expect(property.property).toBe('project');
    expect(property.depth).toBe(0);
  });

  it("shows a reference's own children, and folds a child that has its own", () => {
    const doc = parse(`- outer
\t- [[Aurora Dashboard]] hit
\t\t- shown child
\t\t- child with kids
\t\t\t- hidden grandchild
\t\t\t- another hidden
`);
    const rows = buildRows(doc, referencesTarget, [], noKind, noneExpanded);
    expect(render(rows)).toEqual([
      '~ outer',
      '  * [[Aurora Dashboard]] hit',
      '    . shown child',
      '    . child with kids  [+2]',
    ]);
  });

  it('drops the fold count once a row is expanded', () => {
    const doc = parse(`- [[Aurora Dashboard]] hit
\t- child with kids
\t\t- grandchild
`);
    const expandAll = () => true;
    const rows = buildRows(doc, referencesTarget, [], noKind, expandAll);
    const child = rows.filter((r) => r.type === 'node').at(-1);
    if (child?.type !== 'node') throw new Error('expected node');
    expect(child.foldedCount).toBe(0);
  });
});

describe('splitPath', () => {
  it('separates the display name from its folder', () => {
    expect(splitPath('Notes/Sub/Thing.md')).toEqual({ name: 'Thing', folder: 'Notes/Sub' });
    expect(splitPath('Root.md')).toEqual({ name: 'Root', folder: '' });
  });
});
