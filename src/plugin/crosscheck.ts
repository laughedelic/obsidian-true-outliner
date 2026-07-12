/**
 * Dialect-drift guard (mapping-core design risk): compare our parse against
 * Obsidian's CachedMetadata.sections and log disagreements so they can be
 * turned into corpus fixtures. Pure comparison; the plugin feeds it data.
 */

import type { OutlineDoc, OutlineNode } from '../model';

/** Obsidian's SectionCache, reduced to what the comparison needs. */
export interface SectionInfo {
  type: string;
  startLine: number;
  endLine: number;
}

/** Our top-level block spans (heading scoping flattened away). */
export function topLevelSpans(doc: OutlineDoc): SectionInfo[] {
  const out: SectionInfo[] = [];
  let line = doc.preamble.length;
  const walk = (node: OutlineNode, top: boolean): void => {
    // Obsidian sections are flat top-level blocks; lists collapse into one
    // section, so only compare non-list block starts.
    if (top || node.kind === 'heading') {
      out.push({
        type: node.kind,
        startLine: line,
        endLine: line + node.lines.length - 1,
      });
    }
    line += node.lines.length + node.trailingGap.length;
    node.children.forEach((child) => walk(child, false));
  };
  doc.children.forEach((node) => walk(node, true));
  return out;
}

/**
 * Returns human-readable disagreement lines (empty = agreement). Only
 * heading positions are compared strictly — they are the anchors both
 * parsers must agree on; block-type taxonomy differs by design.
 */
export function compareWithSections(
  doc: OutlineDoc,
  sections: readonly SectionInfo[],
): string[] {
  const ourHeadings = topLevelSpans(doc)
    .filter((s) => s.type === 'heading')
    .map((s) => s.startLine);
  const theirHeadings = sections.filter((s) => s.type === 'heading').map((s) => s.startLine);
  const issues: string[] = [];
  const ours = new Set(ourHeadings);
  const theirs = new Set(theirHeadings);
  for (const line of ourHeadings) {
    if (!theirs.has(line)) issues.push(`heading at line ${line}: ours only`);
  }
  for (const line of theirHeadings) {
    if (!ours.has(line)) issues.push(`heading at line ${line}: Obsidian only`);
  }
  return issues;
}
