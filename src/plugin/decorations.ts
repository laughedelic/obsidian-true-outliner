/**
 * CM6 adapter for outline mode's additive-only indentation decorations (see
 * docs/research/07-decoration-experiments-plan.md, Experiment 1). All depth
 * math lives in decorate.ts; this module only turns its facts into CM6
 * decorations, gated per-editor on outline mode via the public
 * `editorInfoField` — same gating pattern as keymap.ts's grammarExtension.
 *
 * Two mechanisms, because Obsidian renders atom kinds two different ways in
 * Live Preview:
 *
 * - Most lines (headings, paragraphs, list items, code fences, plain
 *   blockquotes) render as a real `.cm-line` that CM6 lets us decorate
 *   declaratively: one class plus one CSS custom property per fact (never
 *   an inline shorthand property), so styles.css owns the actual
 *   `padding-left`/`margin-left` rules and their units.
 * - Tables, callouts, raw HTML blocks, and horizontal rules are rendered as
 *   opaque replacement widgets (`.cm-embed-block`, or `.hr` for the rule) —
 *   confirmed live: a `Decoration.line` targeting that line's position has
 *   no effect at all (not even a class-merge partial win), because the
 *   widget's own `toDOM()` produces the line's DOM wholesale and neither
 *   CM6 nor Obsidian threads our decoration's class/attributes through it.
 *   These need a direct, imperative DOM patch instead — a `ViewPlugin`
 *   that, after each render, sets `margin-left` inline (with `!important`,
 *   which always wins for an inline style regardless of what any
 *   stylesheet rule does) on whichever such widgets are currently mounted.
 */

import { RangeSetBuilder, StateField, type Extension, type EditorState } from '@codemirror/state';
import {
  Decoration,
  EditorView,
  ViewPlugin,
  type DecorationSet,
  type PluginValue,
} from '@codemirror/view';
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

// Obsidian's own selectors for widget-replaced atom kinds — matches tables,
// callouts, and raw HTML blocks (`.cm-embed-block`) plus horizontal rules
// (`.hr`, which oddly also carries `cm-line` but is widget-rendered all the
// same). Broad by design: elements it catches that don't correspond to an
// atom fact (e.g. an inline image embed inside a paragraph) just get their
// margin cleared, a no-op.
const WIDGET_ATOM_SELECTOR = '.cm-embed-block, .cm-line.hr';

class AtomWidgetMargins implements PluginValue {
  constructor(
    private readonly view: EditorView,
    private readonly modes: ModeSource,
  ) {
    this.apply();
  }

  docViewUpdate(): void {
    this.apply();
  }

  destroy(): void {
    this.clearAll();
  }

  private apply(): void {
    const path = this.view.state.field(editorInfoField, false)?.file?.path;
    if (!path || !this.modes.isOutline(path)) {
      this.clearAll();
      return;
    }

    const factsByLine = new Map(
      decorate(parse(this.view.state.doc.toString())).map((f) => [f.lineNumber, f]),
    );
    const widgets = Array.from(
      this.view.contentDOM.querySelectorAll<HTMLElement>(WIDGET_ATOM_SELECTOR),
    );
    for (const el of widgets) {
      const fact = factsByLine.get(this.view.state.doc.lineAt(this.view.posAtDOM(el)).number - 1);
      if (fact?.isAtom) {
        el.style.setProperty(
          'margin-left',
          `calc(${fact.depth} * var(--to-decor-unit, 1.5rem))`,
          'important',
        );
      } else {
        el.style.removeProperty('margin-left');
      }
    }
  }

  private clearAll(): void {
    const widgets = Array.from(
      this.view.contentDOM.querySelectorAll<HTMLElement>(WIDGET_ATOM_SELECTOR),
    );
    for (const el of widgets) el.style.removeProperty('margin-left');
  }
}

export function decorationsExtension(modes: ModeSource): Extension {
  return [
    StateField.define<DecorationSet>({
      create: (state) => computeDecorations(state, modes),
      // Recomputes on every transaction, not just docChanged ones:
      // toggling outline mode has no doc change of its own, only a nudged
      // selection transaction (see main.ts) to make this field re-run.
      update: (_value, tr) => computeDecorations(tr.state, modes),
      provide: (field) => EditorView.decorations.from(field),
    }),
    ViewPlugin.define<AtomWidgetMargins>((view) => new AtomWidgetMargins(view, modes)),
  ];
}
