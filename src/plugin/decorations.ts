/**
 * CM6 adapter for outline mode's additive-only indentation decorations (see
 * docs/research/07-decoration-experiments-plan.md, Experiment 1). All depth
 * math lives in decorate.ts; this module only turns its facts into CM6
 * `Decoration.line`s, gated per-editor on outline mode via the public
 * `editorInfoField` — same gating pattern as keymap.ts's grammarExtension.
 *
 * Each fact becomes exactly one class plus one CSS custom property (never
 * an inline shorthand property) so styles.css owns the actual
 * `padding-left`/`margin-left` rules and their units — see styles.css for
 * why those are `rem`, not `em`.
 */

import { RangeSetBuilder, StateField, type Extension, type EditorState } from '@codemirror/state';
import { Decoration, EditorView, type DecorationSet } from '@codemirror/view';
import { editorInfoField } from 'obsidian';
import { parse } from '../parse';
import { decorate, type LineDecorationFact } from './decorate';
import type { ModeSource } from './keymap';

function lineDecoration(fact: LineDecorationFact): Decoration {
  if (fact.isListItem) {
    return Decoration.line({
      class: 'to-decor-list',
      attributes: { style: `--to-supp-depth: ${fact.supplementalDepth}` },
    });
  }
  const cls = fact.isAtom ? 'to-decor-atom' : 'to-decor-block';
  return Decoration.line({ class: cls, attributes: { style: `--to-depth: ${fact.depth}` } });
}

function computeDecorations(state: EditorState, modes: ModeSource): DecorationSet {
  const path = state.field(editorInfoField, false)?.file?.path;
  if (!path || !modes.isOutline(path)) return Decoration.none;

  const facts = decorate(parse(state.doc.toString()));
  const totalLines = state.doc.lines;
  const builder = new RangeSetBuilder<Decoration>();
  for (const fact of facts) {
    if (fact.lineNumber >= totalLines) continue; // stale fact past a shrunk doc
    const from = state.doc.line(fact.lineNumber + 1).from; // CM6 lines are 1-indexed
    builder.add(from, from, lineDecoration(fact));
  }
  return builder.finish();
}

export function decorationsExtension(modes: ModeSource): Extension {
  return StateField.define<DecorationSet>({
    create: (state) => computeDecorations(state, modes),
    // Recomputes on every transaction, not just docChanged ones: toggling
    // outline mode has no doc change of its own, only a nudged selection
    // transaction (see main.ts) to make this field re-run.
    update: (_value, tr) => computeDecorations(tr.state, modes),
    provide: (field) => EditorView.decorations.from(field),
  });
}
