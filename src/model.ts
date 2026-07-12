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
  /** Blank lines that follow this node's lines, verbatim. */
  readonly trailingGap: readonly string[];
  readonly children: readonly OutlineNode[];
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
