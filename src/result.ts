/** Ops never throw for algebra reasons: rejections are values (design.md D3). */

export type RejectionReason =
  | 'node-not-found'
  | 'at-h1-bound'
  | 'at-h6-bound'
  | 'no-previous-sibling'
  | 'at-top-level'
  | 'no-sibling-above'
  | 'no-sibling-below'
  | 'not-expressible-under-target'
  | 'cannot-reorder-across-heading-boundary'
  | 'cannot-split';

export interface Rejection {
  readonly reason: RejectionReason;
}

/** Replace lines [fromLine, toLine) of the source with `insert`. */
export interface Edit {
  readonly fromLine: number;
  readonly toLine: number;
  readonly insert: readonly string[];
}

export type OpResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly rejection: Rejection };

export const accept = <T>(value: T): OpResult<T> => ({ ok: true, value });
export const reject = <T>(reason: RejectionReason): OpResult<T> => ({
  ok: false,
  rejection: { reason },
});

/** Single-splice diff: the minimal contiguous line replacement. */
export function diffLines(before: readonly string[], after: readonly string[]): Edit[] {
  let prefix = 0;
  while (prefix < before.length && prefix < after.length && before[prefix] === after[prefix]) {
    prefix++;
  }
  let suffix = 0;
  while (
    suffix < before.length - prefix &&
    suffix < after.length - prefix &&
    before[before.length - 1 - suffix] === after[after.length - 1 - suffix]
  ) {
    suffix++;
  }
  if (prefix === before.length && prefix === after.length) return [];
  return [
    {
      fromLine: prefix,
      toLine: before.length - suffix,
      insert: after.slice(prefix, after.length - suffix),
    },
  ];
}

export function applyEdits(source: readonly string[], edits: readonly Edit[]): string[] {
  const out = [...source];
  // Edits are non-overlapping and ordered; apply from the end.
  for (const edit of [...edits].sort((a, b) => b.fromLine - a.fromLine)) {
    out.splice(edit.fromLine, edit.toLine - edit.fromLine, ...edit.insert);
  }
  return out;
}
