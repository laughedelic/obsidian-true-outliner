/**
 * What the backlinks footer draws, as data — no DOM, no Obsidian, no editor.
 *
 * The rendering half (`backlinks-footer.ts`) turns these rows into elements and
 * nothing else: every decision about which rows exist, at what depth, carrying
 * which node facts, is made here where it can be tested by reading a value
 * rather than by inspecting a live app.
 *
 * Rows come from `decorate()` — the same pure function the editor's own chrome
 * is derived from (design.md D-A), fed the projected tree. That is what stops
 * depth and kind meaning one thing in the editor and another in the footer.
 */

import { ATOM_KINDS, type OutlineDoc, type OutlineNode } from '../model';
import { decorate, type LineDecorationFact } from './decorate';
import { collapseLineage } from '../lineage';
import { project, type NodePredicate } from '../project';
import type { BacklinkReference } from './backlink-index';

/** How many levels of a reference's own descendants the footer shows before
 * folding. One: enough to make a node like "Decisions that came out of it:"
 * mean something, without pasting whole subtrees under every reference. */
export const DESCENDANT_DEPTH = 1;

export type FooterRow =
  | {
      readonly type: 'lineage';
      readonly depth: number;
      /** Each element's own first line, root-most first. */
      readonly segments: readonly string[];
      /** The first element's kind, so the row can carry the same marker an
       * ordinary node of that kind would. */
      readonly kind: LineDecorationFact['kind'];
    }
  | {
      readonly type: 'node';
      readonly depth: number;
      /** The node's own source text, for Obsidian to render. */
      readonly markdown: string;
      readonly fact: LineDecorationFact;
      /** True when this node is one the reference was found in. */
      readonly isReference: boolean;
      /** Kind of reference, when this row is one and the kind is worth marking. */
      readonly referenceKind?: BacklinkReference['kind'] | undefined;
      /** Descendants hidden behind this row's fold affordance; 0 when none. */
      readonly foldedCount: number;
    }
  | {
      readonly type: 'property';
      readonly depth: 0;
      readonly property: string;
      readonly markdown: string;
    };

export interface FooterGroup {
  readonly path: string;
  /** Basename without extension — what the reader recognises. */
  readonly name: string;
  /** Containing folder, or '' at the vault root. */
  readonly folder: string;
  readonly count: number;
  /** Absent until this source has been read and parsed; the footer paints the
   * header first and fills this in (D-G). */
  readonly rows?: readonly FooterRow[] | undefined;
}

export interface FooterModel {
  readonly totalReferences: number;
  readonly totalNotes: number;
  readonly groups: readonly FooterGroup[];
}

/** `Notes/Sub/Thing.md` -> `{ name: 'Thing', folder: 'Notes/Sub' }`. */
export function splitPath(path: string): { name: string; folder: string } {
  const slash = path.lastIndexOf('/');
  const folder = slash === -1 ? '' : path.slice(0, slash);
  const file = slash === -1 ? path : path.slice(slash + 1);
  return { name: file.replace(/\.md$/i, ''), folder };
}

/**
 * Decoration facts keyed by node, by walking the tree and the facts in the same
 * order `decorate()` documents: a node's own lines, then its children, with
 * exactly one `isFirstLine` fact per node.
 *
 * Zipping rather than looking up by line number because a projected tree's line
 * numbers are its own, not the source's, and a footer row is about a node
 * rather than about a line.
 */
function factsByNode(doc: OutlineDoc): Map<OutlineNode, LineDecorationFact> {
  const preorder: OutlineNode[] = [];
  const walk = (nodes: readonly OutlineNode[]): void => {
    for (const node of nodes) {
      preorder.push(node);
      walk(node.children);
    }
  };
  walk(doc.children);

  const firsts = decorate(doc).filter((f) => f.isFirstLine);
  const out = new Map<OutlineNode, LineDecorationFact>();
  // Defensive: if the two ever disagree the zip is meaningless, and silently
  // rendering the wrong marker on every row is far worse than rendering none.
  if (firsts.length !== preorder.length) return out;
  preorder.forEach((node, i) => out.set(node, firsts[i]!));
  return out;
}

/**
 * A node's own text, dedented, without the trailing gap it owns.
 *
 * The dedent is not cosmetic. A node's lines carry the indentation that
 * expresses its depth in the source note, and markdown reads a leading tab (or
 * four spaces) as a CODE BLOCK — so a nested list item rendered verbatim came
 * out as raw text with its `-` marker and `[[link]]` brackets showing, while a
 * top-level paragraph in the same footer rendered correctly. Depth is expressed
 * by the row's own indentation here; the text itself must start at column 0.
 */
function markdownOf(node: OutlineNode): string {
  const first = node.lines[0] ?? '';
  const indent = first.slice(0, first.length - first.trimStart().length);
  if (!indent) return node.lines.join('\n');
  return node.lines.map((l) => (l.startsWith(indent) ? l.slice(indent.length) : l.trimStart())).join('\n');
}

/**
 * The rows for one source note: its references in their lineage, plus any
 * frontmatter references, which have no position in the tree and so no lineage.
 *
 * Descendants are emitted here rather than by widening the projection, because
 * the two are answering different questions. The projection's job is which
 * PATHS survive; a reference's own subtree is content the reader asked for, and
 * how much of it to show is a display rule that changes per row as the reader
 * expands things. Folding those together meant projecting one level deeper to
 * count what was hidden and then rendering the very rows that were supposed to
 * be hidden — measured, in the first version of this function.
 */
export function buildRows(
  doc: OutlineDoc,
  matches: NodePredicate,
  properties: readonly BacklinkReference[],
  kindOf: (node: OutlineNode) => BacklinkReference['kind'] | undefined,
  expanded: (node: OutlineNode) => boolean,
): FooterRow[] {
  const rows: FooterRow[] = [];

  for (const ref of properties) {
    rows.push({
      type: 'property',
      depth: 0,
      property: ref.property ?? '',
      markdown: ref.original,
    });
  }

  // Ancestors and matches only. A projection copies node ids, so the source
  // subtree of any projected node is still reachable — which is how a row can
  // report descendants the projection deliberately left out.
  const projected = project(doc, matches, { descendantDepth: 0 });
  const facts = factsByNode(projected);
  const sourceById = new Map<number, OutlineNode>();
  const indexSource = (nodes: readonly OutlineNode[]): void => {
    for (const node of nodes) {
      sourceById.set(node.id, node);
      indexSource(node.children);
    }
  };
  indexSource(doc.children);

  const factFor = (node: OutlineNode): LineDecorationFact | undefined => facts.get(node);

  for (const row of collapseLineage(projected.children, matches)) {
    if (row.type === 'lineage') {
      rows.push({
        type: 'lineage',
        depth: row.depth,
        // First line only: continuation lines are context for reading a node,
        // not for naming it (docs/research/18, D5).
        segments: row.elements.map((n) => n.lines[0] ?? ''),
        kind: row.kind,
      });
      continue;
    }

    const fact = factFor(row.node);
    if (!fact) continue;
    rows.push({
      type: 'node',
      depth: row.depth,
      markdown: markdownOf(row.node),
      fact,
      isReference: true,
      referenceKind: kindOf(row.node),
      foldedCount: 0,
    });

    const source = sourceById.get(row.node.id);
    if (source) emitDescendants(source.children, row.depth + 1, DESCENDANT_DEPTH);
  }

  return rows;

  /**
   * A reference's own subtree, to `remaining` levels. A node at the boundary
   * that still has children of its own carries their count instead of them, so
   * the reader is told what is hidden rather than left to wonder.
   */
  function emitDescendants(
    nodes: readonly OutlineNode[],
    depth: number,
    remaining: number,
  ): void {
    if (remaining <= 0) return;
    for (const node of nodes) {
      const open = expanded(node);
      const hidden = node.children.length > 0 && remaining === 1 && !open
        ? countDescendants(node)
        : 0;
      rows.push({
        type: 'node',
        depth,
        markdown: markdownOf(node),
        fact: syntheticFact(node, depth),
        isReference: false,
        referenceKind: undefined,
        foldedCount: hidden,
      });
      // `open` lets one row escape the depth bound, which is exactly what
      // expanding it means.
      emitDescendants(node.children, depth + 1, open ? remaining : remaining - 1);
    }
  }
}

/**
 * Facts for a descendant, which is not in the projection and so has no fact
 * from `decorate()`.
 *
 * Only the fields the footer's chrome reads are meaningful here — kind, atom
 * and list-item classification, and whether the node has children. Depth comes
 * from the caller because a descendant's depth is its position under the
 * reference, not in either tree. Deliberately NOT run through `decorate()` on a
 * one-node document: that would report a root-level node at depth 0 and claim
 * to be the shared fact layer while answering a different question.
 */
function syntheticFact(node: OutlineNode, depth: number): LineDecorationFact {
  return {
    lineNumber: 0,
    depth,
    isFirstLine: true,
    hasNativeMarker: node.kind === 'list-item',
    isAtom: ATOM_KINDS.has(node.kind),
    isListItem: node.kind === 'list-item',
    supplementalDepth: 0,
    kind: node.kind,
    hasChildren: node.children.length > 0,
  };
}

/** Every node beneath `node`, at any depth. */
function countDescendants(node: OutlineNode): number {
  let total = 0;
  const walk = (nodes: readonly OutlineNode[]): void => {
    for (const child of nodes) {
      total += 1;
      walk(child.children);
    }
  };
  walk(node.children);
  return total;
}
