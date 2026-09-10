/**
 * A Live-Preview-shaped rendering of markdown for the browser demo.
 *
 * Obsidian's Live Preview gives every line and mark a class the plugin's
 * stylesheet and decoration measurements build on: `HyperMD-list-line-N` with
 * a `.list-bullet` inside `.cm-formatting-list`, `HyperMD-header-N` with the
 * `#` run in `.cm-formatting-header`, a task's checkbox in `.task-list-label`,
 * `.cm-hmd-list-indent` around leading indentation. This extension emits the
 * same classes in the same nesting from a line-by-line read of the document,
 * so the plugin's own chrome lands where it does inside Obsidian.
 *
 * Formatting characters are shown only on lines the selection touches and
 * hidden elsewhere, which is Live Preview's rule too.
 */

import { RangeSetBuilder, type Range } from '@codemirror/state';
import { Decoration, EditorView, ViewPlugin, WidgetType, type DecorationSet, type ViewUpdate } from '@codemirror/view';

const LIST_RE = /^([ \t]*)([-*+]|\d+[.)])([ \t]+)(\[[ xX]\][ \t])?/;
const HEADING_RE = /^(#{1,6})([ \t]+)/;
const QUOTE_RE = /^([ \t]*>[ \t]?)/;
const FENCE_RE = /^[ \t]*(```|~~~)/;
const HR_RE = /^[ \t]*([-*_])([ \t]*\1){2,}[ \t]*$/;

class CheckboxWidget extends WidgetType {
  constructor(private readonly checked: boolean) {
    super();
  }
  override eq(other: CheckboxWidget): boolean {
    return other.checked === this.checked;
  }
  toDOM(): HTMLElement {
    const label = document.createElement('label');
    label.className = 'task-list-label';
    label.contentEditable = 'false';
    const input = document.createElement('input');
    input.className = 'task-list-item-checkbox';
    input.type = 'checkbox';
    input.checked = this.checked;
    input.setAttribute('data-task', this.checked ? 'x' : '');
    input.tabIndex = -1;
    label.appendChild(input);
    return label;
  }
  override ignoreEvent(): boolean {
    return false;
  }
}

class HiddenWidget extends WidgetType {
  toDOM(): HTMLElement {
    const span = document.createElement('span');
    span.className = 'cm-hidden-formatting';
    return span;
  }
  override eq(): boolean {
    return true;
  }
}
const hidden = Decoration.replace({ widget: new HiddenWidget() });

function mark(cls: string): Decoration {
  return Decoration.mark({ class: cls });
}

const INLINE_RULES: Array<{ re: RegExp; open: number; close: number; cls: string; formatting: string }> = [
  { re: /`([^`\n]+)`/g, open: 1, close: 1, cls: 'cm-inline-code', formatting: 'cm-formatting cm-formatting-code cm-inline-code' },
  { re: /\*\*([^*\n]+)\*\*/g, open: 2, close: 2, cls: 'cm-strong', formatting: 'cm-formatting cm-formatting-strong cm-strong' },
  { re: /(?<![*\w])\*([^*\n]+)\*(?!\*)/g, open: 1, close: 1, cls: 'cm-em', formatting: 'cm-formatting cm-formatting-em cm-em' },
  { re: /(?<!\w)_([^_\n]+)_(?!\w)/g, open: 1, close: 1, cls: 'cm-em', formatting: 'cm-formatting cm-formatting-em cm-em' },
  { re: /~~([^~\n]+)~~/g, open: 2, close: 2, cls: 'cm-strikethrough', formatting: 'cm-formatting cm-formatting-strikethrough cm-strikethrough' },
  { re: /==([^=\n]+)==/g, open: 2, close: 2, cls: 'cm-highlight', formatting: 'cm-formatting cm-formatting-highlight cm-highlight' },
];
const WIKILINK_RE = /\[\[([^\]|\n]+)(\|([^\]\n]+))?\]\]/g;
const TAG_RE = /(^|\s)(#[\p{L}\p{N}_/-]*[\p{L}_/-][\p{L}\p{N}_/-]*)/gu;

function inlineDecorations(text: string, base: number, active: boolean, out: Range<Decoration>[]): void {
  const taken: Array<[number, number]> = [];
  const free = (a: number, b: number) => taken.every(([x, y]) => b <= x || a >= y);
  const claim = (a: number, b: number) => taken.push([a, b]);

  for (const m of text.matchAll(WIKILINK_RE)) {
    const s = m.index;
    const e = s + m[0].length;
    if (!free(s, e)) continue;
    claim(s, e);
    const inner = 2;
    const target = m[1];
    const alias = m[3];
    const contentStart = s + inner;
    const contentEnd = e - inner;
    if (active) {
      out.push(mark('cm-formatting cm-formatting-link cm-formatting-link-start').range(base + s, base + contentStart));
      out.push(mark('cm-hmd-internal-link').range(base + contentStart, base + contentEnd));
      out.push(mark('cm-formatting cm-formatting-link cm-formatting-link-end').range(base + contentEnd, base + e));
    } else {
      out.push(hidden.range(base + s, base + contentStart));
      if (alias !== undefined) {
        const pipe = contentStart + target.length;
        out.push(hidden.range(base + contentStart, base + pipe + 1));
        out.push(mark('cm-hmd-internal-link cm-link-alias').range(base + pipe + 1, base + contentEnd));
      } else {
        out.push(mark('cm-hmd-internal-link').range(base + contentStart, base + contentEnd));
      }
      out.push(hidden.range(base + contentEnd, base + e));
    }
  }
  for (const rule of INLINE_RULES) {
    for (const m of text.matchAll(rule.re)) {
      const s = m.index;
      const e = s + m[0].length;
      if (!free(s, e)) continue;
      claim(s, e);
      const a = s + rule.open;
      const b = e - rule.close;
      if (active) {
        out.push(mark(rule.formatting).range(base + s, base + a));
        out.push(mark(rule.cls).range(base + a, base + b));
        out.push(mark(rule.formatting).range(base + b, base + e));
      } else {
        out.push(hidden.range(base + s, base + a));
        out.push(mark(rule.cls).range(base + a, base + b));
        out.push(hidden.range(base + b, base + e));
      }
    }
  }
  for (const m of text.matchAll(TAG_RE)) {
    const s = m.index + m[1].length;
    const e = s + m[2].length;
    if (!free(s, e)) continue;
    claim(s, e);
    out.push(mark('cm-hashtag cm-hashtag-begin').range(base + s, base + s + 1));
    out.push(mark('cm-hashtag cm-hashtag-end').range(base + s + 1, base + e));
  }
}

function build(view: EditorView): DecorationSet {
  const { doc } = view.state;
  const activeLines = new Set<number>();
  for (const r of view.state.selection.ranges) {
    const a = doc.lineAt(r.from).number;
    const b = doc.lineAt(r.to).number;
    for (let n = a; n <= b; n++) activeLines.add(n);
  }
  const ranges: Range<Decoration>[] = [];
  let inFence = false;
  let fenceOpen: string | null = null;
  for (let n = 1; n <= doc.lines; n++) {
    const line = doc.line(n);
    const text = line.text;
    const active = activeLines.has(n);
    const fence = FENCE_RE.exec(text);
    if (fence) {
      const marker = fence[1];
      if (!inFence) {
        inFence = true;
        fenceOpen = marker;
        ranges.push(Decoration.line({ class: 'HyperMD-codeblock HyperMD-codeblock-begin HyperMD-codeblock-bg' }).range(line.from));
        continue;
      }
      if (marker === fenceOpen) {
        inFence = false;
        ranges.push(Decoration.line({ class: 'HyperMD-codeblock HyperMD-codeblock-end HyperMD-codeblock-bg' }).range(line.from));
        continue;
      }
    }
    if (inFence) {
      ranges.push(Decoration.line({ class: 'HyperMD-codeblock HyperMD-codeblock-bg' }).range(line.from));
      if (text.length) ranges.push(mark('cm-inline-code').range(line.from, line.to));
      continue;
    }
    if (!text.trim()) continue;
    if (HR_RE.test(text)) {
      ranges.push(Decoration.line({ class: 'hr' }).range(line.from));
      continue;
    }

    let pos = 0;
    const quote = QUOTE_RE.exec(text);
    if (quote) {
      ranges.push(Decoration.line({ class: 'HyperMD-quote HyperMD-quote-1' }).range(line.from));
      const end = quote[1].length;
      ranges.push(mark('cm-formatting cm-formatting-quote cm-formatting-quote-1 cm-quote cm-quote-1').range(line.from, line.from + end));
      if (end < text.length) ranges.push(mark('cm-quote cm-quote-1').range(line.from + end, line.to));
      inlineDecorations(text.slice(end), line.from + end, active, ranges);
      continue;
    }

    const heading = HEADING_RE.exec(text);
    if (heading) {
      const level = heading[1].length;
      const markEnd = heading[0].length;
      ranges.push(Decoration.line({ class: `HyperMD-header HyperMD-header-${level}` }).range(line.from));
      if (active) {
        ranges.push(mark(`cm-formatting cm-formatting-header cm-formatting-header-${level} cm-header cm-header-${level}`).range(line.from, line.from + markEnd));
      } else {
        ranges.push(hidden.range(line.from, line.from + markEnd));
      }
      if (markEnd < text.length) ranges.push(mark(`cm-header cm-header-${level}`).range(line.from + markEnd, line.to));
      inlineDecorations(text.slice(markEnd), line.from + markEnd, active, ranges);
      continue;
    }

    const list = LIST_RE.exec(text);
    if (list) {
      const indent = list[1];
      const marker = list[2];
      const gap = list[3];
      const task = list[4];
      const depth = indentDepth(indent, view);
      const ordered = /\d/.test(marker);
      const classes = [`HyperMD-list-line`, `HyperMD-list-line-${depth}`];
      if (task) classes.push('HyperMD-task-line');
      ranges.push(Decoration.line({ class: classes.join(' ') }).range(line.from));
      if (indent.length) {
        ranges.push(mark('cm-hmd-list-indent').range(line.from, line.from + indent.length));
        let i = 0;
        while (i < indent.length) {
          const unit = indent[i] === '\t' ? 1 : Math.min(4, indent.length - i);
          ranges.push(mark(unit === 1 && indent[i] === '\t' ? 'cm-indent' : indent.length - i >= 4 ? 'cm-indent' : 'cm-indent-spacing').range(line.from + i, line.from + i + unit));
          i += unit;
        }
      }
      pos = indent.length;
      const markerFrom = line.from + pos;
      const markerTo = markerFrom + marker.length + gap.length;
      const kind = ordered ? 'ol' : 'ul';
      ranges.push(mark(`cm-formatting cm-formatting-list cm-formatting-list-${kind} cm-list-${depth}`).range(markerFrom, markerTo));
      if (!ordered) ranges.push(mark('list-bullet').range(markerFrom, markerFrom + 1));
      pos += marker.length + gap.length;
      if (task) {
        const boxFrom = line.from + pos;
        const boxTo = boxFrom + 3;
        const checked = /x/i.test(task);
        if (active) {
          ranges.push(mark('cm-formatting cm-formatting-task').range(boxFrom, boxTo));
        } else {
          ranges.push(Decoration.replace({ widget: new CheckboxWidget(checked) }).range(boxFrom, boxTo));
        }
        pos += 3;
      }
      if (pos < text.length) ranges.push(mark(`cm-list-${depth}`).range(line.from + pos, line.to));
      inlineDecorations(text.slice(pos), line.from + pos, active, ranges);
      continue;
    }

    inlineDecorations(text, line.from, active, ranges);
  }
  ranges.sort((a, b) => a.from - b.from || a.value.startSide - b.value.startSide);
  const builder = new RangeSetBuilder<Decoration>();
  for (const r of ranges) builder.add(r.from, r.to, r.value);
  return builder.finish();
}

function indentDepth(indent: string, view: EditorView): number {
  let depth = 1;
  let spaces = 0;
  for (const ch of indent) {
    if (ch === '\t') {
      depth += 1;
      spaces = 0;
    } else if (++spaces === 4) {
      depth += 1;
      spaces = 0;
    }
  }
  void view;
  return depth;
}

export function livePreviewExtension() {
  return ViewPlugin.fromClass(
    class {
      decorations: DecorationSet;
      constructor(view: EditorView) {
        this.decorations = build(view);
      }
      update(update: ViewUpdate) {
        if (update.docChanged || update.selectionSet || update.viewportChanged) this.decorations = build(update.view);
      }
    },
    { decorations: (v) => v.decorations },
  );
}
