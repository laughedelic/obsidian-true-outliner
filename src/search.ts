/**
 * What a search query means, for every surface that has one.
 *
 * The grammar lives in `matchesText` and nowhere else. Word splitting, quoted
 * phrases, exclusion and fuzziness all arrive by changing that one function,
 * and every surface follows on the same day — which is the whole reason this is
 * a module in the mapping core rather than a predicate in the footer.
 *
 * What is NOT shared is the CORPUS. Each surface decides which text a query is
 * answered against, because each shows different text: the footer answers for a
 * reference against exactly the content it renders around one
 * (`referenceMatches`), while a palette or an in-note filter asks a simpler
 * question about a node on its own (`matchNodes`). Sharing the grammar is what
 * keeps two surfaces from disagreeing about what a query says; sharing the
 * corpus would make them disagree about what they show.
 *
 * Beside `project.ts`, whose header names filtered search as its intended
 * second consumer.
 */

import type { OutlineDoc, OutlineNode } from './model';
import { nodeContent, segmentContent, type ContentRef } from './node-text';

/**
 * The grammar: a trimmed, case-insensitive literal substring.
 *
 * An empty query — or one that is only whitespace — matches everything, which
 * is what makes "no term typed" the same code path as "no term filtering".
 */
export function matchesText(text: string, query: string): boolean {
  const term = query.trim().toLowerCase();
  if (term.length === 0) return true;
  return text.toLowerCase().includes(term);
}

/** Where a term sits in a piece of text: a half-open range over `text`. */
export interface MatchRange {
  readonly from: number;
  readonly to: number;
}

/**
 * Every occurrence of `query` in `text`, left to right and non-overlapping.
 *
 * The half of highlighting that does not need a DOM. A surface that marks its
 * matches walks its own rendered text nodes and asks this where to cut each
 * one, so the rule for WHAT counts as an occurrence is the same rule
 * `matchesText` answers yes or no with, rather than a second implementation
 * that agrees with it until someone changes the grammar.
 *
 * An empty query yields nothing, which is what makes "no term" cost a caller
 * one comparison rather than a walk.
 */
export function matchRanges(text: string, query: string): MatchRange[] {
  const term = query.trim().toLowerCase();
  if (term.length === 0) return [];

  const ranges: MatchRange[] = [];
  const lower = text.toLowerCase();
  // Non-overlapping, and it has to be: the ranges become sibling nodes in the
  // caller's output, and two that overlap cannot both be cut out of one string.
  for (let at = lower.indexOf(term); at >= 0; at = lower.indexOf(term, at + term.length)) {
    ranges.push({ from: at, to: at + term.length });
  }
  return ranges;
}

/**
 * The ids of nodes whose OWN text matches, in document order.
 *
 * Own text is the node's own lines, verbatim and joined — not the per-kind
 * preview `nodeContent` derives. A surface that filters a document in place
 * shows the node as the document has it, so that is the text a reader is
 * searching; a preview would make a query miss the very line it is looking at
 * because the preview quoted a different one.
 */
export function matchNodes(doc: OutlineDoc, query: string): number[] {
  const ids: number[] = [];
  const walk = (nodes: readonly OutlineNode[]): void => {
    for (const node of nodes) {
      if (matchesText(node.lines.join('\n'), query)) ids.push(node.id);
      walk(node.children);
    }
  };
  walk(doc.children);
  return ids;
}

/**
 * Every text the footer renders for a reference at `nodeId`, root-most first.
 *
 * The set is stated on the TREE rather than read back off `buildRows`' output,
 * so it stays a pure function of the document and is testable without the row
 * model. It is deliberately the same set of nodes `buildRows` puts on screen
 * for a match, and `tests/search.test.ts` holds the two together — a change to
 * either that the other does not follow fails there rather than in a reader's
 * footer.
 *
 * Ancestors contribute their first line only, because that is what a lineage
 * segment shows. Children contribute their whole own text, because a child row
 * renders it. Nothing deeper, because the footer folds it.
 *
 * `ref` is what the footer knows about the reference — which of the node's own
 * lines carries it, and the link as written. The per-kind rule reads it (a
 * table quotes the cell the reference sits in, a fence the line it is on), so
 * omitting it here would search a different string than the row displays.
 */
export function referenceTexts(
  doc: OutlineDoc,
  nodeId: number,
  ref?: ContentRef,
): string[] {
  const path = pathTo(doc.children, nodeId);
  if (!path) return [];

  const node = path[path.length - 1] as OutlineNode;
  const ancestors = path.slice(0, -1);
  return [
    ...ancestors.map((a) => segmentContent(a).markdown),
    nodeContent(node, ref).markdown,
    ...node.children.map((c) => nodeContent(c).markdown),
  ];
}

/**
 * Whether the content the footer shows for a reference at `nodeId` matches.
 *
 * The source note's NAME is the other half of the rule and is deliberately not
 * here: a name is a fact about the file, not about the tree, and this module
 * stays free of paths so that a surface with no file behind it can still use
 * it. The caller holds the path and ORs the two — `admitReferences` in
 * `footer-filter.ts` is the one place that does.
 */
export function referenceMatches(
  doc: OutlineDoc,
  nodeId: number,
  query: string,
  ref?: ContentRef,
): boolean {
  if (query.trim().length === 0) return true;
  return referenceTexts(doc, nodeId, ref).some((text) => matchesText(text, query));
}

/** The chain from a root down to `id`, inclusive, or undefined when absent. */
function pathTo(nodes: readonly OutlineNode[], id: number): OutlineNode[] | undefined {
  for (const node of nodes) {
    if (node.id === id) return [node];
    const below = pathTo(node.children, id);
    if (below) return [node, ...below];
  }
  return undefined;
}
