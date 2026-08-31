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
import type { BacklinkReference, PlacedReference } from './backlink-index';

/** How many levels of a reference's own descendants the footer shows before
 * folding. One: enough to make a node like "Decisions that came out of it:"
 * mean something, without pasting whole subtrees under every reference. */
export const DESCENDANT_DEPTH = 1;

/** Fields every row kind carries, because every row is a line of the outline
 * and draws the same chrome from them. */
interface FooterRowBase {
  readonly depth: number;
  /**
   * The depths this row draws a guide at — one per ancestor row above it.
   *
   * Derived from the row's own depth rather than from `computeLineGuides`,
   * which answers a different question: its depths are the PROJECTION's, and
   * the footer renders the COLLAPSED tree, where a three-node lineage chain is
   * one row at one depth. `collapseLineage` emits a strict preorder in which
   * every row at depth d has exactly one ancestor row at each shallower depth
   * (its `below = depth + 1` step is unconditional), so the ancestors' depths
   * are exactly `0 … d-1`. `tests/lineage.test.ts` holds that invariant.
   */
  readonly guideDepths: readonly number[];
  /** What the shared chrome contract reads. Synthetic for rows that are not a
   * single projected node — a lineage chain, a frontmatter property. */
  readonly fact: LineDecorationFact;
}

export type FooterRow =
  | (FooterRowBase & {
      readonly type: 'lineage';
      /** Each element's own first line, root-most first. */
      readonly segments: readonly string[];
      /** The first element's kind, so the row can carry the same marker an
       * ordinary node of that kind would. */
      readonly kind: LineDecorationFact['kind'];
    })
  | (FooterRowBase & {
      readonly type: 'node';
      /**
       * The node's content as INLINE markdown: its block syntax removed, so
       * nothing block-level can reach the row (D18). Kind is said once, by the
       * marker; a row that also carried its kind's typography would say it
       * twice, in the channel a reader reads first.
       */
      readonly markdown: string;
      /** How `markdown` is to be turned into DOM. */
      readonly render: RowRender;
      /** A task's checked state, when this row is one. Drawn by the marker, in
       * the bullet's place — it is state the reader is looking for, not
       * presentation. */
      readonly task?: boolean | undefined;
      /** An ordered item's own label (`10.`), when this row is one. Drawn by
       * the marker, in the bullet's place. */
      readonly ordinal?: string | undefined;
      /** True when this node is one the reference was found in. */
      readonly isReference: boolean;
      /** Kind of reference, when this row is one and the kind is worth marking. */
      readonly referenceKind?: BacklinkReference['kind'] | undefined;
      /** Descendants hidden behind this row's fold affordance; 0 when none. */
      readonly foldedCount: number;
    })
  | (FooterRowBase & {
      readonly type: 'property';
      readonly depth: 0;
      readonly property: string;
      readonly markdown: string;
    });

/** One guide per ancestor row — see `FooterRowBase.guideDepths`. */
function guideDepthsFor(depth: number): number[] {
  return Array.from({ length: depth }, (_, i) => i);
}

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

/**
 * How a row's content becomes DOM.
 *
 * - `markdown` — inline markdown, rendered by Obsidian, so links and emphasis
 *   look as they do anywhere else.
 * - `text` — plain text, rendered by nobody. An HTML block's wikilinks are not
 *   resolved by Obsidian, so rendering it as markdown would only pretend to.
 * - `code` — plain text in a monospace run.
 */
export type RowRender = 'markdown' | 'text' | 'code';

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

/** A row's content, and how to render it — the whole of D18's per-kind table.
 *
 * `refLine` is which of the node's OWN lines carries the reference, counted
 * from its first. Absent for a node that is context rather than a match, and
 * for kinds that do not use it.
 */
interface RowContent {
  readonly markdown: string;
  readonly render: RowRender;
  readonly task?: boolean | undefined;
  readonly ordinal?: string | undefined;
}

/**
 * The split this switch encodes: `code` and `table` lines are separate RECORDS,
 * so joining them would fabricate a sentence the source does not contain; every
 * other kind's lines are continuations of one thought and join. `callout` needs
 * neither rule — its title names it, and only a reference in the body displaces
 * that.
 */
function contentOf(node: OutlineNode, ref: PlacedReference | undefined): RowContent {
  const refLine = ref?.line;
  const task = taskStateOf(node);
  const ordinal = ordinalOf(node);
  const extra = { ...(task !== undefined ? { task } : {}), ...(ordinal ? { ordinal } : {}) };

  switch (node.kind) {
    case 'hr':
      // Nothing to say: the marker is the whole node.
      return { markdown: '', render: 'markdown', ...extra };
    case 'html':
      // Obsidian does not resolve wikilinks inside an HTML block, so rendering
      // one as markdown shows the reader `[[Target]]` and calls it a link. Its
      // TEXT is what the block says; its tags are how it says it, and a footer
      // row is not the place to read markup.
      return { markdown: htmlTextOf(node), render: 'text', ...extra };
    case 'code':
      return { markdown: codeLineOf(node, refLine), render: 'code', ...extra };
    case 'table':
      return { markdown: tableTextOf(node, ref), render: 'markdown', ...extra };
    case 'callout':
      return { markdown: calloutTextOf(node, refLine), render: 'markdown', ...extra };
    default:
      return { markdown: proseOf(node), render: 'markdown', ...extra };
  }
}

/** Continuation lines, joined: a paragraph, heading, quote or list item's lines
 * are one thought wrapped, not several records. */
function proseOf(node: OutlineNode): string {
  return node.lines.map(stripBlockPrefix).filter((l) => l.length > 0).join(' ');
}

/**
 * One line's leading block syntax: quote carets, heading hashes, a list marker
 * with its optional checkbox, an ordered number. Whatever survives is inline.
 *
 * Order matters: a quoted heading is `> # Title`, and a task's checkbox sits
 * after its bullet.
 */
function stripBlockPrefix(line: string): string {
  return line
    .trim()
    .replace(/^(?:>\s?)+/, '')
    .replace(/^#{1,6}\s+/, '')
    .replace(/^(?:[-*+]|\d{1,9}[.)])\s+(?:\[[ xX]\]\s+)?/, '')
    .trim();
}

/** `- [x] ` — a task's state, or absent when the item is not a task. */
function taskStateOf(node: OutlineNode): boolean | undefined {
  if (node.kind !== 'list-item') return undefined;
  const m = /^\s*[-*+]\s+\[([ xX])\]\s/.exec(node.lines[0] ?? '');
  return m ? m[1] !== ' ' : undefined;
}

/** `10.` — an ordered item's own label, as written. */
function ordinalOf(node: OutlineNode): string | undefined {
  if (node.kind !== 'list-item') return undefined;
  return /^\s*(\d{1,9}[.)])\s/.exec(node.lines[0] ?? '')?.[1];
}

/** A fence's lines are statements, not a sentence: show the one the reference
 * is on, or the first real line when it is context rather than a match. */
function codeLineOf(node: OutlineNode, refLine: number | undefined): string {
  const isFence = (l: string): boolean => /^\s*(?:```|~~~)/.test(l);
  const at = refLine !== undefined ? node.lines[refLine] : undefined;
  if (at !== undefined && !isFence(at)) return at.trim();
  return (node.lines.find((l) => !isFence(l) && l.trim().length > 0) ?? '').trim();
}

/**
 * An HTML block's visible text: tags removed, entities left to the DOM.
 *
 * A wikilink inside one is reduced to the text it would have shown. Obsidian
 * does not resolve it, so rendering it as a link would lie — but showing the
 * reader `[[Target]]` with its brackets is not the alternative, it is just
 * source code in a row that holds no other source code.
 */
function htmlTextOf(node: OutlineNode): string {
  return node.lines
    .join(' ')
    .replace(/<[^>]*>/g, ' ')
    .replace(/!?\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (_m, target: string, alias?: string) =>
      (alias ?? target).trim(),
    )
    .replace(/\s+/g, ' ')
    .trim();
}

const TABLE_SEPARATOR = /^\s*\|?[\s:|-]+\|?\s*$/;

/**
 * The single CELL the reference sits in.
 *
 * An earlier version showed the header row alongside the reference's own row,
 * on the reasoning that a bare value needs its column name. Seen in place it was
 * the noisiest row in the footer: two rows of pipe-separated fields to say that
 * one cell mentions the note. A cell is the smallest thing that can hold a
 * reference, and quoting it is the same promise every other kind's row makes.
 *
 * Found by the reference's own text, not by position, because a row can hold
 * more than one link and only one of them is the reason this row exists.
 */
function tableTextOf(node: OutlineNode, ref: PlacedReference | undefined): string {
  const cellsOf = (line: string): string[] =>
    line
      .replace(/^\s*\|/, '')
      .replace(/\|\s*$/, '')
      .split('|')
      .map((c) => c.trim());

  const at = ref?.line !== undefined ? node.lines[ref.line] : undefined;
  const row = at !== undefined && !TABLE_SEPARATOR.test(at) ? at : node.lines[0];
  if (row === undefined) return '';

  const cells = cellsOf(row);
  const hit = ref?.text ? cells.find((c) => c.includes(ref.text)) : undefined;
  // No reference to place — a table shown as CONTEXT — so its first cell names
  // it, the way a first line names every other kind.
  return hit ?? cells.find((c) => c.length > 0) ?? '';
}

/**
 * A callout's title, with its `[!type]` token dropped — the marker already says
 * callout, so the token would be the kind said a second time. A reference in the
 * BODY shows that body line instead, since the title is not where it is.
 */
function calloutTextOf(node: OutlineNode, refLine: number | undefined): string {
  if (refLine !== undefined && refLine > 0) {
    const body = node.lines[refLine];
    if (body !== undefined) return stripBlockPrefix(body);
  }
  const title = stripBlockPrefix(node.lines[0] ?? '').replace(/^\[![a-zA-Z-]+\][-+]?\s*/, '').trim();
  // An untitled callout has only its type; its first body line names it instead.
  if (title.length > 0) return title;
  return stripBlockPrefix(node.lines[1] ?? '');
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
  /**
   * What is known about the reference in a node: its kind, which of the node's
   * own lines carries it, and the link as written. One accessor rather than
   * three, because every caller knows all three or none of them.
   */
  refOf: (node: OutlineNode) => PlacedReference | undefined,
  expanded: (node: OutlineNode) => boolean,
): FooterRow[] {
  const rows: FooterRow[] = [];

  for (const ref of properties) {
    rows.push({
      type: 'property',
      depth: 0,
      guideDepths: [],
      fact: rowFact('paragraph', 0),
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
  /** Nodes already given a row, so neither pass renders one twice. */
  const emitted = new Set<number>();

  for (const row of collapseLineage(projected.children, matches)) {
    if (row.type === 'lineage') {
      rows.push({
        type: 'lineage',
        depth: row.depth,
        guideDepths: guideDepthsFor(row.depth),
        // A chain renders as one line of dim text whatever its elements were,
        // so it takes a plain block line's chrome even when its first element
        // is an atom kind — a lineage row is never a callout box.
        fact: rowFact(row.kind, row.depth),
        // First line only: continuation lines are context for reading a node,
        // not for naming it (docs/research/18, D5).
        segments: row.elements.map((n) => n.lines[0] ?? ''),
        kind: row.kind,
      });
      continue;
    }

    const fact = factFor(row.node);
    if (!fact) continue;
    // Already rendered as a descendant of an earlier match, in its own source
    // position. The lineage pass emits every match in the PROJECTION's order,
    // which drops the non-matching siblings between them.
    if (emitted.has(row.node.id)) continue;
    emitted.add(row.node.id);
    rows.push({
      type: 'node',
      depth: row.depth,
      guideDepths: guideDepthsFor(row.depth),
      ...contentOf(row.node, refOf(row.node)),
      // The projected fact says what KIND of node this is; its depth is the
      // projection's, and the rendered tree collapsed lineage out from under
      // it. The row's own depth is the one the chrome lays out against.
      fact: { ...fact, depth: row.depth },
      isReference: true,
      referenceKind: refOf(row.node)?.kind,
      foldedCount: 0,
    });

    const source = sourceById.get(row.node.id);
    if (source) emitDescendants(source.children, row.depth + 1, DESCENDANT_DEPTH);
  }

  return rows;

  /**
   * A reference's own subtree, in SOURCE ORDER, to `remaining` levels.
   *
   * Every child is emitted here, references included, because the reader is
   * looking at a piece of someone's document and its order is part of what it
   * says — an ordered list whose `2.` precedes its `1.` is not the note that was
   * written. An earlier version skipped matches and left them to the lineage
   * pass, which emits in the PROJECTION's order: the non-matching siblings
   * between them are not in the projection, so every referenced child migrated
   * below every unreferenced one.
   *
   * A match emitted here is marked as one, and `emitted` keeps the lineage pass
   * from rendering it a second time.
   *
   * A node at the display boundary that still has children carries their count
   * instead of them, so the reader is told what is hidden rather than left to
   * wonder.
   */
  function emitDescendants(
    nodes: readonly OutlineNode[],
    depth: number,
    remaining: number,
  ): void {
    if (remaining <= 0) return;
    for (const node of nodes) {
      if (emitted.has(node.id)) continue;
      emitted.add(node.id);
      const isMatch = matches(node);
      const open = expanded(node);
      // A reference is substance, not context: the depth bound describes how
      // much CONTEXT to show around one, so it restarts at each one rather than
      // burying a reference that happens to sit deep under another. The reset
      // applies to what is shown BELOW the node, not to the node itself — a
      // match's own children are shown, so it folds nothing.
      const childBudget = isMatch ? DESCENDANT_DEPTH : open ? remaining : remaining - 1;
      const hidden = !isMatch && node.children.length > 0 && remaining === 1 && !open
        ? countDescendants(node)
        : 0;
      rows.push({
        type: 'node',
        depth,
        guideDepths: guideDepthsFor(depth),
        // Only a reference has a line something points at; a context row shows
        // its first line instead.
        ...contentOf(node, isMatch ? refOf(node) : undefined),
        fact: syntheticFact(node, depth),
        isReference: isMatch,
        referenceKind: isMatch ? refOf(node)?.kind : undefined,
        foldedCount: hidden,
      });
      // `open` lets one row escape the depth bound, which is exactly what
      // expanding it means.
      emitDescendants(node.children, depth + 1, childBudget);
    }
  }
}

/**
 * A plain block line of `kind` at `depth` — the fact for a row that is not a
 * projected node at all: a collapsed lineage chain, or a frontmatter property.
 * Never an atom and never a list item, because both of those describe how a
 * node's own box is rendered and such a row has no node.
 */
function rowFact(kind: LineDecorationFact['kind'], depth: number): LineDecorationFact {
  return {
    lineNumber: 0,
    depth,
    isFirstLine: true,
    hasNativeMarker: false,
    isAtom: false,
    isListItem: false,
    supplementalDepth: 0,
    kind,
    hasChildren: false,
  };
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
