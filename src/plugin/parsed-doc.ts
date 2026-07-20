/**
 * Parse cache for the transaction filter (design.md D7): a module-level
 * `WeakMap<Text, OutlineDoc>` keyed by CM6's immutable `Text` instance, so
 * every transaction against the same document version — and, crucially,
 * every `selection-only` transaction, whose doc is unchanged — shares one
 * parse. No `StateField`, so no extension-ordering coupling with the rest
 * of the filter. A separate cache from decorations.ts's own `docFacts`
 * (different shape: this stores the bare tree, not decoration facts) but
 * the same pattern, and reusable by any other consumer later (D7).
 */

import type { Text } from '@codemirror/state';
import type { OutlineDoc } from '../model';
import { parse } from '../parse';

export interface ParsedDocResult {
  readonly doc: OutlineDoc;
  /** Wall-clock ms spent parsing — 0 on a cache hit. Folded into the
   * filter's own per-transaction timing (D7's classification budget
   * explicitly includes tree access), exposed separately here for
   * diagnosing whether cache misses or classification itself dominates. */
  readonly parseMs: number;
}

const cache = new WeakMap<Text, OutlineDoc>();

export function parsedDoc(text: Text): ParsedDocResult {
  const cached = cache.get(text);
  if (cached) return { doc: cached, parseMs: 0 };
  const start = performance.now();
  const doc = parse(text.toString());
  const parseMs = performance.now() - start;
  cache.set(text, doc);
  return { doc, parseMs };
}
