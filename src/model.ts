/**
 * The block tree model.
 *
 * Design invariant (design.md D2): nodes own their original lines VERBATIM —
 * markers, indentation, trailing whitespace and all. Encoding is pure span
 * concatenation, which makes the byte-identity round-trip structural rather
 * than aspirational. A "line" is a string without its terminating newline;
 * the document is `lines.join('\n')`.
 *
 * Blank-line ownership: a run of blank lines belongs to the *preceding* node
 * as its `trailingGap` (or to the preamble). Segmentation is total: every
 * input line lives in exactly one span.
 */

/** Kinds that participate in the outline structure. */
export type StructuralKind = 'heading' | 'paragraph' | 'list-item';

/** Leaf atoms: movable as units, internals never parsed as nodes. */
export type AtomKind = 'code' | 'table' | 'callout' | 'quote' | 'html' | 'hr';

export type NodeKind = StructuralKind | AtomKind;

export const ATOM_KINDS: ReadonlySet<NodeKind> = new Set<NodeKind>([
  'code',
  'table',
  'callout',
  'quote',
  'html',
  'hr',
]);

export type ListStyle =
  | { type: 'bullet'; marker: '-' | '*' | '+' }
  | { type: 'ordered'; number: number; delimiter: '.' | ')' };

export interface OutlineNode {
  /** Stable within one tree; not persisted anywhere. */
  readonly id: number;
  readonly kind: NodeKind;
  /** Heading level 1–6. Present iff kind === 'heading'. */
  readonly level?: number;
  /** Present iff kind === 'heading' and the source used setext underlines. */
  readonly setext?: boolean;
  /** Present iff kind === 'list-item'. */
  readonly listStyle?: ListStyle;
  /**
   * The node's own lines, verbatim: the heading line (2 lines for setext),
   * the paragraph's lines, the list item's marker line plus its continuation
   * lines, or the atom's full block.
   */
  readonly lines: readonly string[];
  /**
   * A block id written on a line of its own that names this node
   * (`docs/research/lone-block-id`): the blank lines between the node's own
   * lines and the id, then the id's line, both verbatim. It is part of the
   * node the way an inline ` ^id` is, and is emitted between `lines` and
   * `trailingGap`, so the trailing gap stays the separation after everything
   * the node owns.
   */
  readonly blockId?: BlockIdLines;
  /** Blank lines that follow this node's lines, verbatim. */
  readonly trailingGap: readonly string[];
  readonly children: readonly OutlineNode[];
}

export interface BlockIdLines {
  readonly gap: readonly string[];
  readonly line: string;
}

export interface OutlineDoc {
  /**
   * Inert document preamble: YAML frontmatter plus the blank lines that
   * follow it. Never a node, never touched by operations.
   */
  readonly preamble: readonly string[];
  readonly children: readonly OutlineNode[];
}

let nextId = 1;

export function makeNode(
  partial: Omit<OutlineNode, 'id' | 'trailingGap' | 'children'> &
    Partial<Pick<OutlineNode, 'trailingGap' | 'children'>>,
): OutlineNode {
  return {
    trailingGap: [],
    children: [],
    ...partial,
    id: nextId++,
  };
}

export function isAtom(node: OutlineNode): boolean {
  return ATOM_KINDS.has(node.kind);
}

/**
 * A node's own line footprint: its own lines plus the trailing gap it owns,
 * excluding descendants — the blank-line-ownership rule above expressed once.
 * The line just past it is its PREORDER successor, which for a node with
 * children is its own first child.
 */
export function ownSpan(node: OutlineNode): number {
  return node.lines.length + blockIdSpan(node) + node.trailingGap.length;
}

/** The lines an attached block id takes in its node's own span: the blank
 * lines before it and its own line. */
export function blockIdSpan(node: OutlineNode): number {
  return node.blockId ? node.blockId.gap.length + 1 : 0;
}

/**
 * What a line of a node's OWN span is, by its index into that span:
 * the node's content, the blank lines before an attached block id, the id's
 * line, or the trailing gap. The one place that boundary is drawn, so every
 * walker that tells content from gap agrees on where an id sits.
 */
export type LineRole = 'content' | 'id-gap' | 'id' | 'gap';

export function lineRole(node: OutlineNode, index: number): LineRole {
  if (index < node.lines.length) return 'content';
  const idGap = node.blockId?.gap.length ?? 0;
  if (node.blockId && index < node.lines.length + idGap) return 'id-gap';
  if (node.blockId && index === node.lines.length + idGap) return 'id';
  return 'gap';
}

/** The index of an attached block id's line in its node's own span. */
export function idLineIndex(node: OutlineNode): number | undefined {
  return node.blockId ? node.lines.length + node.blockId.gap.length : undefined;
}

/** The index of the node's last line the caret may stand on: its attached
 * id's line where it has one, its last content line otherwise. */
export function lastPlaceIndex(node: OutlineNode): number {
  return idLineIndex(node) ?? node.lines.length - 1;
}

/**
 * The text of a line of the node's own span the caret may stand on — a
 * content line or an attached id's line — or `undefined` for a blank line
 * before the id or in the trailing gap.
 */
export function placeLineText(node: OutlineNode, index: number): string | undefined {
  const role = lineRole(node, index);
  if (role === 'content') return node.lines[index];
  if (role === 'id') return node.blockId!.line;
  return undefined;
}

/** Path from the root to a node: indices into successive `children` arrays. */
export type NodePath = readonly number[];

export function nodeAt(doc: OutlineDoc, path: NodePath): OutlineNode | undefined {
  let list: readonly OutlineNode[] = doc.children;
  let node: OutlineNode | undefined;
  for (const index of path) {
    node = list[index];
    if (!node) return undefined;
    list = node.children;
  }
  return node;
}

export function findPath(doc: OutlineDoc, id: number): NodePath | undefined {
  const walk = (nodes: readonly OutlineNode[], prefix: NodePath): NodePath | undefined => {
    for (let i = 0; i < nodes.length; i++) {
      const node = nodes[i]!;
      if (node.id === id) return [...prefix, i];
      const found = walk(node.children, [...prefix, i]);
      if (found) return found;
    }
    return undefined;
  };
  return walk(doc.children, []);
}

/**
 * The children list at `path` — the document's own top level for the empty
 * path. A path resolving to nothing yields no children rather than throwing,
 * so a stale path degrades to an empty scope.
 */
export function childrenAt(doc: OutlineDoc, path: NodePath): readonly OutlineNode[] {
  return path.length === 0 ? doc.children : (nodeAt(doc, path)?.children ?? []);
}

/** Replace the children array at `path`'s parent level via a pure update. */
export function updateSiblings(
  doc: OutlineDoc,
  parentPath: NodePath,
  update: (siblings: readonly OutlineNode[]) => readonly OutlineNode[],
): OutlineDoc {
  const rebuild = (
    nodes: readonly OutlineNode[],
    depth: number,
  ): readonly OutlineNode[] => {
    if (depth === parentPath.length) return update(nodes);
    const index = parentPath[depth]!;
    return nodes.map((node, i) =>
      i === index ? { ...node, children: rebuild(node.children, depth + 1) } : node,
    );
  };
  return { ...doc, children: rebuild(doc.children, 0) };
}

export function* walkNodes(doc: OutlineDoc): Generator<OutlineNode> {
  function* walk(nodes: readonly OutlineNode[]): Generator<OutlineNode> {
    for (const node of nodes) {
      yield node;
      yield* walk(node.children);
    }
  }
  yield* walk(doc.children);
}

/**
 * Structural equality ignoring node ids — the comparison used by the
 * round-trip and closure property tests.
 */
export function treesEqual(a: OutlineDoc, b: OutlineDoc): boolean {
  const nodeEqual = (x: OutlineNode, y: OutlineNode): boolean =>
    x.kind === y.kind &&
    x.level === y.level &&
    x.setext === y.setext &&
    JSON.stringify(x.listStyle ?? null) === JSON.stringify(y.listStyle ?? null) &&
    x.lines.length === y.lines.length &&
    x.lines.every((line, i) => line === y.lines[i]) &&
    (x.blockId?.line ?? null) === (y.blockId?.line ?? null) &&
    JSON.stringify(x.blockId?.gap ?? null) === JSON.stringify(y.blockId?.gap ?? null) &&
    x.trailingGap.length === y.trailingGap.length &&
    x.trailingGap.every((line, i) => line === y.trailingGap[i]) &&
    x.children.length === y.children.length &&
    x.children.every((child, i) => nodeEqual(child, y.children[i]!));
  return (
    a.preamble.length === b.preamble.length &&
    a.preamble.every((line, i) => line === b.preamble[i]) &&
    a.children.length === b.children.length &&
    a.children.every((child, i) => nodeEqual(child, b.children[i]!))
  );
}
