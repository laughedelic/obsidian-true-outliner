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
import type { PlacedReference } from '../src/plugin/backlink-index';

const vault = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'test-vault');
const read = (rel: string): string => fs.readFileSync(path.join(vault, rel), 'utf8');

const referencesTarget = (node: OutlineNode): boolean =>
  node.lines.some((l) => l.includes('[[Aurora Dashboard'));

const noRef = () => undefined;
const noneExpanded = () => false;

/** A readable rendering of the rows, so failures show shape rather than JSON. */
function render(rows: readonly FooterRow[]): string[] {
  return rows.map((r) => {
    const indent = '  '.repeat(r.depth);
    if (r.type === 'lineage') {
      return `${indent}~ ${r.segments.map((seg) => seg.text.replace(/^[\t\s-]+/, '').trim()).join(' > ')}`;
    }
    if (r.type === 'property') return `${indent}[${r.property}] ${r.markdown}`;
    const first = r.markdown.split('\n')[0] ?? '';
    const fold = r.foldedCount > 0 ? `  [+${r.foldedCount}]` : '';
    const mark = r.isReference ? '*' : '.';
    return `${indent}${mark} ${first.replace(/^[\t\s-]+/, '').trim().slice(0, 46)}${fold}`;
  });
}

function rowsFor(rel: string): FooterRow[] {
  return buildRows(parse(read(rel)), referencesTarget, [], noRef, noneExpanded);
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
      // `##` gone: a segment's text arrives with its block syntax already
      // stripped, the same rule a node row follows.
      '~ Aurora > work > Aurora',
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
    expect(lineage.segments.map((s) => s.text).join(' ')).toContain(
      'Follow-ups from the review:',
    );
  });

  /**
   * Review found this: a segment kept only `kind`, so a task or ordered ancestor
   * drew the generic bullet while its `[x]` / `10.` stayed in the text — the
   * state said twice, in the channel D18 reserves for the marker.
   */
  it('carries a lineage element’s task and ordinal, and takes them out of its text', () => {
    const doc = parse(`- [ ] an open task ancestor
\t1. an ordered ancestor
\t\t- [[Aurora Dashboard]] the reference
`);
    const rows = buildRows(doc, referencesTarget, [], noRef, noneExpanded);
    const chain = rows.find((r) => r.type === 'lineage');
    if (chain?.type !== 'lineage') throw new Error('expected a lineage row');
    expect(chain.segments).toHaveLength(2);

    const [task, ordered] = chain.segments;
    expect(task!.task).toBe(false);
    expect(task!.text).toBe('an open task ancestor');
    expect(task!.text).not.toContain('[ ]');

    expect(ordered!.ordinal).toBe('1.');
    expect(ordered!.text).toBe('an ordered ancestor');
    expect(ordered!.text).not.toMatch(/^1\./);
  });

  it("carries each lineage element its own kind, not the chain leader's", () => {
    // Every ancestor on a collapsed line is named by its own marker, so each
    // segment has to bring its kind with it. Only a chain whose elements DIFFER
    // can tell that apart from handing `row.kind` to all of them — this one is
    // a heading above two list items, so a leader-for-everyone bug shows.
    const rows = rowsFor('Backlinks/Branching arms.md');
    const mixed = rows.find(
      (r) => r.type === 'lineage' && new Set(r.segments.map((s) => s.kind)).size > 1,
    );
    expect(mixed).toBeDefined();
    if (mixed?.type !== 'lineage') throw new Error('expected a mixed-kind lineage');

    expect(mixed.segments.map((s) => s.kind)).toEqual(['heading', 'list-item', 'list-item']);
    // The row's own marker stays the FIRST element's: that is what puts segment
    // 0's icon in the gutter and leaves the rest to be drawn inline beside it.
    expect(mixed.kind).toBe('heading');
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
      noRef,
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
    const rows = buildRows(doc, referencesTarget, [], noRef, noneExpanded);
    expect(render(rows)).toEqual([
      '~ outer',
      '  * [[Aurora Dashboard]] hit',
      '    . shown child',
      '    . child with kids  [+2]',
    ]);
  });

  /**
   * A reference inside another reference's subtree used to be rendered twice:
   * once as dim context under its parent (the descendant pass) and once as
   * itself (the lineage pass, which emits every match). Nothing in the original
   * corpus nested one reference inside another, so it went unseen until
   * `Backlinks/Kinds gallery.md` — where every list item under a referencing
   * paragraph duplicated, ten rows into twenty.
   */
  it('renders a reference nested inside another reference exactly once', () => {
    const doc = parse(`- [[Aurora Dashboard]] outer
\t- plain child
\t- [[Aurora Dashboard]] inner
\t\t- child of inner
`);
    const rows = buildRows(doc, referencesTarget, [], noRef, noneExpanded);
    expect(render(rows)).toEqual([
      '* [[Aurora Dashboard]] outer',
      '  . plain child',
      '  * [[Aurora Dashboard]] inner',
      '    . child of inner',
    ]);
    const inner = rows.filter((r) => r.type === 'node' && r.markdown.includes(']] inner'));
    expect(inner).toHaveLength(1);
  });

  /**
   * Order is part of what a document says. An ordered list whose `2.` precedes
   * its `1.` is not the note that was written, and a reader looking at someone
   * else's structure has no way to tell that the footer rearranged it.
   *
   * Regressed once: skipping matches in the descendant pass left them to the
   * lineage pass, which emits in the PROJECTION's order — and the non-matching
   * siblings between them are not in the projection, so every referenced child
   * migrated below every unreferenced one.
   */
  it('keeps a reference’s children in source order, referenced or not', () => {
    const doc = parse(`- [[Aurora Dashboard]] parent
\t- first, no mention
\t- second mentions [[Aurora Dashboard]]
\t- third, no mention
\t- fourth mentions [[Aurora Dashboard]]
`);
    const rows = buildRows(doc, referencesTarget, [], noRef, noneExpanded);
    expect(render(rows)).toEqual([
      '* [[Aurora Dashboard]] parent',
      '  . first, no mention',
      '  * second mentions [[Aurora Dashboard]]',
      '  . third, no mention',
      '  * fourth mentions [[Aurora Dashboard]]',
    ]);
  });

  /**
   * Review found this: the count was every descendant, but a nested reference
   * under a folded context row is emitted anyway — the lineage pass renders every
   * match wherever it sits. So a row said "+2" with one of the two already on
   * screen beneath it, and expanding revealed less than promised.
   */
  it('counts only what a fold actually withholds', () => {
    const doc = parse(`- [[Aurora Dashboard]] outer
\t- plain child
\t\t- [[Aurora Dashboard]] nested deep
\t\t- sibling of nested
`);
    const rows = buildRows(doc, referencesTarget, [], noRef, noneExpanded);
    const folded = rows.find((r) => r.type === 'node' && r.markdown.includes('plain child'));
    if (folded?.type !== 'node') throw new Error('expected the context row');
    // `nested deep` is visible right below it; only its sibling is hidden.
    expect(rows.some((r) => r.type === 'node' && r.markdown.includes('nested deep'))).toBe(true);
    expect(folded.foldedCount).toBe(1);
  });

  it('drops the fold count once a row is expanded', () => {
    const doc = parse(`- [[Aurora Dashboard]] hit
\t- child with kids
\t\t- grandchild
`);
    const expandAll = () => true;
    const rows = buildRows(doc, referencesTarget, [], noRef, expandAll);
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

/**
 * The per-kind content rules of D18, read off the fixture that exists to hold
 * one reference of every kind. Model-level, because every one of these rules is
 * a decision about WHICH TEXT a row carries — no DOM required to be sure of it,
 * and the e2e matrix then only has to check that the DOM says what the model
 * said.
 */
describe('row content is notation, not reproduction (D18)', () => {
  const GALLERY = 'Backlinks/Kinds gallery.md';
  const mentionsTarget = (node: OutlineNode): boolean =>
    node.lines.some((l) => l.includes('[[Reference target]]'));
  /** What the index supplies at runtime, computed here from the same text. */
  const refAt = (node: OutlineNode): PlacedReference | undefined => {
    const i = node.lines.findIndex((l) => l.includes('[[Reference target]]'));
    return i === -1 ? undefined : { kind: 'note', line: i, text: '[[Reference target]]' };
  };

  const galleryRows = (): FooterRow[] =>
    buildRows(parse(read(GALLERY)), mentionsTarget, [], refAt, noneExpanded);

  const rowStartingWith = (prefix: string): Extract<FooterRow, { type: 'node' }> => {
    const row = galleryRows().find((r) => r.type === 'node' && r.markdown.startsWith(prefix));
    if (row?.type !== 'node') throw new Error(`no row starting with ${JSON.stringify(prefix)}`);
    return row;
  };

  it('strips a heading to its text', () => {
    const row = rowStartingWith('A heading mentions');
    expect(row.markdown).toBe('A heading mentions [[Reference target]]');
    expect(row.fact.kind).toBe('heading');
  });

  it('strips a quote to its text', () => {
    const row = rowStartingWith('A quote mentions');
    expect(row.markdown.startsWith('>')).toBe(false);
    expect(row.fact.kind).toBe('quote');
  });

  it('moves a task’s state into the row, out of its text', () => {
    const open = rowStartingWith('an open task');
    const done = rowStartingWith('a done task');
    expect(open.task).toBe(false);
    expect(done.task).toBe(true);
    // The checkbox is drawn by the marker; the text must not repeat it.
    expect(open.markdown).not.toContain('[ ]');
    expect(done.markdown).not.toContain('[x]');
  });

  it('moves an ordered item’s number into the row, out of its text', () => {
    const row = rowStartingWith('a two-digit ordered item');
    expect(row.ordinal).toBe('10.');
    expect(row.markdown.startsWith('a two-digit')).toBe(true);
  });

  it('joins a hard-wrapped paragraph’s lines into one row', () => {
    const row = rowStartingWith('A hard-wrapped paragraph');
    expect(row.markdown).toContain('falls');
    expect(row.markdown).not.toContain('\n');
  });

  it('quotes only the table cell the reference is in', () => {
    const row = rowStartingWith('Mobile triage mentions');
    expect(row.markdown).toBe('Mobile triage mentions [[Reference target]]');
    // Not the row's other cells, not the header, not the rows it is not on.
    expect(row.markdown).not.toContain('Priya');
    expect(row.markdown).not.toContain('Surface');
    expect(row.markdown).not.toContain('Desktop triage');
  });

  /**
   * Review found this: a table cell writes an aliased link as `[[T\\|alias]]`,
   * because a bare pipe there IS a column break. Splitting on every pipe cut the
   * cell in two, so no cell contained the reference's own text and the fallback
   * showed the FIRST cell — a different cell, silently, and only for links that
   * happen to have an alias.
   */
  it('finds the cell when its link has an alias, whose pipe is escaped', () => {
    const doc = parse(
      ['| Surface | Owner |', '| --- | --- |', '| Mobile [[Reference target\\|the target]] | Priya |'].join('\n'),
    );
    const refAlias = (node: OutlineNode): PlacedReference | undefined =>
      node.lines.some((l) => l.includes('[[Reference target'))
        ? { kind: 'note', line: 2, text: '[[Reference target\\|the target]]' }
        : undefined;
    const rows = buildRows(
      doc,
      (n) => n.lines.some((l) => l.includes('[[Reference target')),
      [],
      refAlias,
      noneExpanded,
    );
    const row = rows.find((r) => r.type === 'node');
    if (row?.type !== 'node') throw new Error('expected a node row');
    // The referencing cell, with the escape gone — it is table syntax, not text.
    expect(row.markdown).toBe('Mobile [[Reference target|the target]]');
    expect(row.markdown).not.toContain('Owner');
    expect(row.markdown).not.toContain('Priya');
  });

  /**
   * `parse.ts` classifies ANY `> [!…` line as a callout, so restricting the
   * token's identifier to letters and hyphens here left a valid custom type
   * containing a digit or underscore classified as a callout with its `[!type]`
   * still in the text — the kind said twice, which dropping the token is for.
   */
  it('drops the callout token whatever characters its type uses', () => {
    for (const type of ['note', 'my-type', 'step1', 'phase_2', 'v2_final']) {
      const doc = parse(`> [!${type}] A titled callout\n> mentioning [[Reference target]]\n`);
      const rows = buildRows(
        doc,
        (n) => n.lines.some((l) => l.includes('[[Reference target')),
        [],
        () => undefined,
        noneExpanded,
      );
      const row = rows.find((r) => r.type === 'node');
      if (row?.type !== 'node') throw new Error(`no row for [!${type}]`);
      expect(row.fact.kind).toBe('callout');
      expect(row.markdown).toBe('A titled callout');
    }
  });

  it('shows a callout’s body line when the reference is in the body', () => {
    const row = rowStartingWith('whose body mentions');
    expect(row.markdown).toBe('whose body mentions [[Reference target]] rather than its title.');
    expect(row.markdown).not.toContain('[!tip]');
  });

  it('shows an HTML block’s text, not its markup', () => {
    const row = galleryRows().find((r) => r.type === 'node' && r.fact.kind === 'html');
    if (row?.type !== 'node') throw new Error('no html row');
    expect(row.render).toBe('text');
    expect(row.markdown).not.toContain('<div>');
    expect(row.markdown).not.toContain('href');
    expect(row.markdown).toContain('An HTML block mentions');
    // Entities stay ENCODED here on purpose — the model has no DOM to decode
    // them with, and the renderer does it (`decodeEntities`) before setting the
    // text. The pair matters: `setText` escapes rather than decodes, so leaving
    // it to "the DOM" without that step displayed the source of the ampersand.
    expect(row.markdown).toContain('&amp;');
  });
});

