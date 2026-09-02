/**
 * Spike S3 (docs/research/19-backlinks-footer-spikes.md): does `decorate()`
 * hold up on a foreign, projected tree?
 *
 * Design decision D-A makes the footer render from the same `decorate()` the
 * editor uses, fed a projection of another note's tree. This checks that the
 * fact layer really is independent of the surface asking.
 *
 * Deliberately a unit test, not e2e. The editor's own facts come from
 * `decorate(doc)` via `docFacts(state)` (decorations.ts, `factsFor`) — the same
 * pure function called here — so an e2e comparison would add render timing and
 * a live app without adding evidence. What it *would* add is flakiness.
 *
 * Runs against the real corpus files on disk rather than inline fixtures, so a
 * change to the corpus is caught here rather than silently diverging from what
 * the other spikes measure.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { parse } from '../src/parse';
import { project } from '../src/project';
import { decorate, type LineDecorationFact } from '../src/plugin/decorate';
import type { OutlineNode } from '../src/model';

const vault = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'test-vault');

/** Every corpus note that references the target, per docs/research/19. */
const CORPUS = [
  'Backlinks/Deep chain.md',
  'Backlinks/Branching arms.md',
  'Backlinks/Atoms and anchors.md',
  'Backlinks/Severity study writeup.md',
  'Journal/2026-07-07.md',
  'Notes/Reading – The Design of Everyday Things.md',
];

const read = (rel: string): string => fs.readFileSync(path.join(vault, rel), 'utf8');

/** A reference to the corpus target, in any of its written forms. */
const referencesTarget = (node: OutlineNode): boolean =>
  node.lines.some((l) => l.includes('[[Aurora Dashboard'));

/** Facts keyed by the node text they describe, so two trees can be compared
 * without depending on line numbers, which projection necessarily changes. */
function factsByNodeText(md: string): Map<string, LineDecorationFact> {
  const lines = md.split('\n');
  const out = new Map<string, LineDecorationFact>();
  for (const fact of decorate(parse(md))) {
    if (!fact.isFirstLine) continue;
    out.set(lines[fact.lineNumber] ?? '', fact);
  }
  return out;
}

/** The same, for an already-parsed tree re-encoded to text. */
function factsForTree(nodes: readonly OutlineNode[]): Map<string, LineDecorationFact> {
  const md = renderTree(nodes);
  return factsByNodeText(md);
}

/** Re-encodes a projected tree so it can be decorated as a document. */
function renderTree(nodes: readonly OutlineNode[]): string {
  const out: string[] = [];
  const go = (list: readonly OutlineNode[]): void => {
    for (const n of list) {
      out.push(...n.lines, ...n.trailingGap);
      go(n.children);
    }
  };
  go(nodes);
  return out.join('\n');
}

describe('S3: decorate() on a projected tree', () => {
  for (const rel of CORPUS) {
    it(`derives kind and rendering-class facts identically for ${rel}`, () => {
      const md = read(rel);
      const sourceFacts = factsByNodeText(md);
      const projected = project(parse(md), referencesTarget, { descendantDepth: 1 });
      const projectedFacts = factsForTree(projected.children);

      expect(projectedFacts.size).toBeGreaterThan(0);

      for (const [text, projectedFact] of projectedFacts) {
        const sourceFact = sourceFacts.get(text);
        expect(sourceFact, `node not found in source: ${JSON.stringify(text)}`).toBeDefined();
        // Invariant under projection: what KIND of thing a node is, and which
        // rendering rules therefore apply to it, are properties of the node.
        expect(projectedFact.kind).toBe(sourceFact!.kind);
        expect(projectedFact.isAtom).toBe(sourceFact!.isAtom);
        expect(projectedFact.isListItem).toBe(sourceFact!.isListItem);
        expect(projectedFact.hasNativeMarker).toBe(sourceFact!.hasNativeMarker);
      }
    });
  }

  it('re-bases depth to the projection, keeping full paths at source depth', () => {
    // Every ancestor survives here, so the projection's depths are the source's.
    const md = read('Backlinks/Deep chain.md');
    const sourceFacts = factsByNodeText(md);
    const projected = project(parse(md), referencesTarget, { descendantDepth: 0 });
    const projectedFacts = factsForTree(projected.children);

    for (const [text, fact] of projectedFacts) {
      expect(fact.depth).toBe(sourceFacts.get(text)!.depth);
    }
  });

  it('reports hasChildren for the PROJECTED tree, not the source', () => {
    // The one fact projection legitimately changes, and the reason the contract
    // is "kind and rendering class", not "every fact". A node whose children
    // were pruned genuinely has none here, and the footer must draw it that way
    // — claiming otherwise would put a fold affordance on nothing.
    const md = `- outer
\t- [[Aurora Dashboard]] hit
\t\t- pruned child
`;
    const source = factsByNodeText(md);
    const projected = factsForTree(project(parse(md), referencesTarget, { descendantDepth: 0 }).children);

    const hitLine = '\t- [[Aurora Dashboard]] hit';
    expect(source.get(hitLine)!.hasChildren).toBe(true);
    expect(projected.get(hitLine)!.hasChildren).toBe(false);
  });

  it('keeps a list under a paragraph attached, as the plugin tree does', () => {
    // The case where our tree and Obsidian's metadata disagree: a list after a
    // paragraph is that paragraph's children. If projection broke that, the
    // footer would show the reference without the paragraph that introduces it.
    const md = read('Backlinks/Atoms and anchors.md');
    const projected = project(parse(md), referencesTarget, { descendantDepth: 0 });
    const texts = renderTree(projected.children);
    expect(texts).toContain('Follow-ups from the review:');
    expect(texts).toContain('[[Aurora Dashboard#Current sprint]]');
  });
});
