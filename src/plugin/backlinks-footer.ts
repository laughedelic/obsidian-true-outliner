/**
 * The backlinks footer: every reference to the open note, in the tree of the
 * note it came from, below the note's own content.
 *
 * ## Mechanism (spikes S1 and S2, docs/research/19)
 *
 * A `StateField`, not a `ViewPlugin`. CodeMirror refuses block decorations from
 * a plugin outright — they change document height, and the view needs them
 * before plugins run in order to lay out. Every other decoration layer here is
 * a `ViewPlugin` because none of them uses a block decoration; this is the
 * first.
 *
 * A field has no `view` and so cannot run `isNestedEditor`'s DOM-ancestry check.
 * It does not need to: `nested-editor.ts` publishes that answer into state for
 * exactly this class of consumer.
 *
 * A field also recomputes only when a transaction arrives, and toggling outline
 * mode dispatches none — the shared nudge in `main.ts` is a selection set to the
 * position the caret already occupies, which a `ViewPlugin` observes and a field
 * does not. `refreshBridge` closes that gap without widening the shared nudge,
 * which sits on every existing layer's path.
 *
 * ## Why the DOM is built imperatively and kept
 *
 * The widget's identity is its note path, not its contents (`eq`). CodeMirror
 * discards and rebuilds a widget's DOM whenever the new widget is not equal to
 * the old one, so identity-by-contents would tear the footer down every time a
 * reference resolved — taking scroll position, focus, and any expanded row with
 * it. Instead one controller owns the element for as long as the note is open
 * and mutates it in place.
 */

import { Decoration, EditorView, ViewPlugin, WidgetType, type DecorationSet } from '@codemirror/view';
import { StateEffect, StateField, type EditorState, type Extension } from '@codemirror/state';
import { Component, MarkdownRenderer, editorInfoField, type App } from 'obsidian';
import type { ModeSource } from './keymap';
import { nestedEditorField } from './nested-editor';
import { buildMarkerIcon } from './decorations';
import {
  MARKER_LEFT_SHIFT_EXPR,
  applyLineChrome,
  atomMarkerLeftExpr,
  lineChrome,
  plainGuideBackground,
} from './chrome-line';
import { buildRows, splitPath, type FooterRow } from './footer-model';
import type { BacklinkIndex } from './backlink-index';
import type { OutlineNode } from '../model';

export const FOOTER_CLASS = 'to-backlinks';

export interface FooterSource extends ModeSource {
  readonly app: App;
  readonly backlinks: BacklinkIndex;
  /** Whether the footer renders at all. */
  readonly backlinksFooter: boolean;
  /** Bumped when something outside editor state changes what the footer would
   * show — outline mode, the setting, or the index. See `refreshBridge`. */
  readonly footerRevision: number;
}

const refreshFooter = StateEffect.define<void>();

/** Per-note view state: which groups are collapsed, which rows are expanded.
 * Outside the document, because none of it belongs in the file. */
interface ViewState {
  readonly collapsedGroups: Set<string>;
  readonly expandedRows: Set<string>;
}

const viewStates = new Map<string, ViewState>();

function viewStateFor(path: string): ViewState {
  let state = viewStates.get(path);
  if (!state) {
    state = { collapsedGroups: new Set(), expandedRows: new Set() };
    viewStates.set(path, state);
  }
  return state;
}

class FooterController {
  readonly el: HTMLElement;
  private readonly component = new Component();
  /** Bumped on every render pass; an async group fill from an earlier pass
   * checks it and gives up rather than writing into a rebuilt DOM. */
  private generation = 0;

  constructor(
    private readonly source: FooterSource,
    private readonly targetPath: string,
  ) {
    this.el = createDiv({ cls: FOOTER_CLASS });
    this.component.load();
    void this.render();
  }

  destroy(): void {
    this.generation++;
    this.component.unload();
    this.el.detach();
  }

  /** Repaints from scratch: cheap, and simpler than diffing a tree whose shape
   * changes with every expand. Async group fills are keyed to a generation so a
   * late arrival never writes into a DOM that has since been rebuilt. */
  async render(): Promise<void> {
    const generation = ++this.generation;
    this.component.unload();
    this.component.load();

    // Built DETACHED, then swapped in with a single mutation. The plugin's
    // DOM-insertion guard exists because appending into a live `.cm-line`
    // sends CM6's mutation observer into a feedback loop (outline-decorations
    // hardening 5.2, measured at 100%+ CPU). A block widget's own subtree is
    // not that case, but building off-tree and swapping once keeps the number
    // of mounted-DOM mutations at one either way, which is cheap insurance.
    const root = createDiv();
    const summaries = this.source.backlinks.summaries(this.targetPath);
    const totals = this.source.backlinks.totals(this.targetPath);

    this.renderHeader(root, totals);
    this.el.toggleClass('is-dormant', summaries.length === 0);
    if (summaries.length === 0) {
      this.renderDormant(root);
      this.swap(root);
      return;
    }

    const state = viewStateFor(this.targetPath);
    // Most recently modified first — the default sort (docs/research/18, D15).
    const ordered = [...summaries].sort((a, b) => b.path.localeCompare(a.path));
    const bodies: { path: string; body: HTMLElement }[] = [];

    for (const summary of ordered) {
      const { name, folder } = splitPath(summary.path);
      const card = root.createDiv({ cls: 'to-backlinks-group' });
      const collapsed = state.collapsedGroups.has(summary.path);
      this.renderGroupHead(card, summary.path, name, folder, summary.count, collapsed);
      if (collapsed) continue;

      const body = card.createDiv({ cls: 'to-backlinks-rows' });
      body.createDiv({ cls: 'to-backlinks-resolving', text: 'resolving…' });
      bodies.push({ path: summary.path, body });
    }

    this.swap(root);
    // Started only after the swap, so a fast read cannot fill a body that is
    // still detached and about to be replaced. Per source, so a slow read holds
    // up only its own group (D-G).
    for (const { path, body } of bodies) void this.fillGroup(generation, path, body);
  }

  private swap(root: HTMLElement): void {
    this.el.empty();
    // `root` is detached DOM built entirely by this controller, moved into the
    // widget's OWN subtree — never a plain `.cm-line`, which is what the guard
    // is about.
    // eslint-disable-next-line no-restricted-syntax -- detached DOM before mount
    while (root.firstChild) this.el.appendChild(root.firstChild);
  }

  private async fillGroup(
    generation: number,
    sourcePath: string,
    body: HTMLElement,
  ): Promise<void> {
    const placed = await this.source.backlinks.place(this.targetPath, sourcePath);
    if (generation !== this.generation || !placed) return;

    const state = viewStateFor(this.targetPath);
    const rows = buildRows(
      placed.doc,
      placed.matches,
      placed.properties,
      (node: OutlineNode) => placed.kinds.get(node.id),
      (node: OutlineNode) => state.expandedRows.has(`${sourcePath}:${node.id}`),
    );

    const built = createDiv();
    for (const row of rows) this.renderRow(built, sourcePath, row);
    body.empty();
    // Rows were built off-tree just above and are moved into the widget's own
    // subtree.
    // eslint-disable-next-line no-restricted-syntax -- detached DOM before mount
    while (built.firstChild) body.appendChild(built.firstChild);
  }

  private renderHeader(root: HTMLElement, totals: { references: number; notes: number }): void {
    const head = root.createDiv({ cls: 'to-backlinks-head' });
    // `head` is inside the off-tree root this pass is building; nothing here is
    // mounted until `swap`.
    // eslint-disable-next-line no-restricted-syntax -- detached DOM before mount
    head.appendChild(linkGlyph());
    head.createSpan({ cls: 'to-backlinks-title', text: 'Structured backlinks' });
    if (totals.references > 0) {
      const refs = `${totals.references} ${totals.references === 1 ? 'reference' : 'references'}`;
      const notes = `${totals.notes} ${totals.notes === 1 ? 'note' : 'notes'}`;
      head.createSpan({ cls: 'to-backlinks-totals', text: `${refs} · ${notes}` });
    }
  }

  /** A note nothing links to still ends predictably, rather than the footer
   * appearing and vanishing as a note gains its first reference. */
  private renderDormant(root: HTMLElement): void {
    root.createDiv({ cls: 'to-backlinks-dormant', text: 'No linked references' });
  }

  private renderGroupHead(
    card: HTMLElement,
    path: string,
    name: string,
    folder: string,
    count: number,
    collapsed: boolean,
  ): void {
    const head = card.createDiv({ cls: 'to-backlinks-group-head' });
    const chevron = head.createSpan({ cls: 'to-backlinks-chevron' });
    // eslint-disable-next-line no-restricted-syntax -- detached DOM before mount
    chevron.appendChild(chevronGlyph(!collapsed));
    head.createSpan({ cls: 'to-backlinks-group-name', text: name });
    if (folder) head.createSpan({ cls: 'to-backlinks-group-folder', text: folder });
    head.createSpan({ cls: 'to-backlinks-group-count', text: String(count) });

    head.addEventListener('click', () => {
      const state = viewStateFor(this.targetPath);
      if (collapsed) state.collapsedGroups.delete(path);
      else state.collapsedGroups.add(path);
      void this.render();
    });
  }

  /**
   * One row, drawn as an outline line.
   *
   * The row IS a line: it takes the same class and custom properties
   * `lineChrome` gives a `.cm-line`, and `styles.css` lays it out with the same
   * rules. Nothing here computes an offset. The footer's earlier version had a
   * flex gutter of its own and set `margin-inline-start` by hand, which is how
   * its bullets ended up off the editor's column and its guides absent
   * altogether (docs/research/19, S4).
   *
   * `nativeList: false` because the footer draws every marker itself: the
   * rendered `<li>` is unwrapped in `renderMarkdown`, so a list row is an
   * ordinary block line here rather than something Obsidian's list rendering
   * has already positioned.
   */
  private renderRow(body: HTMLElement, sourcePath: string, row: FooterRow): void {
    const el = body.createDiv({ cls: 'to-backlinks-row' });
    applyLineChrome(el, lineChrome(row.fact, {
      nativeList: false,
      // A row with no ancestor row above it draws nothing, exactly as a
      // top-level line in the editor does.
      ...(row.guideDepths.length > 0
        ? { guides: plainGuideBackground(row.guideDepths) }
        : {}),
    }));

    if (row.type === 'property') {
      el.addClass('is-property');
      // eslint-disable-next-line no-restricted-syntax -- detached DOM: the row is still detached.
      el.appendChild(markerSlot(propertyGlyph()));
      const content = el.createSpan({ cls: 'to-backlinks-content' });
      content.createSpan({ cls: 'to-backlinks-prop-name', text: row.property });
      void this.renderMarkdown(content.createSpan(), row.markdown, sourcePath);
      return;
    }

    if (row.type === 'lineage') {
      el.addClass('is-lineage');
      // eslint-disable-next-line no-restricted-syntax -- detached DOM: the row is still detached.
      el.appendChild(markerSlot(buildMarkerIcon(row.kind)));
      const content = el.createSpan({ cls: 'to-backlinks-content' });
      row.segments.forEach((segment, i) => {
        if (i > 0) content.createSpan({ cls: 'to-backlinks-sep', text: '›' });
        content.createSpan({ text: firstLineText(segment) });
      });
      el.addEventListener('click', () => this.open(sourcePath));
      return;
    }

    if (row.isReference) el.addClass('is-reference');

    if (row.foldedCount > 0) {
      const fold = el.createSpan({ cls: 'to-backlinks-fold' });
      // eslint-disable-next-line no-restricted-syntax -- detached DOM before mount
      fold.appendChild(chevronGlyph(false));
      fold.addEventListener('click', (event) => {
        event.stopPropagation();
        viewStateFor(this.targetPath).expandedRows.add(`${sourcePath}:${row.fact.lineNumber}`);
        void this.render();
      });
    }

    // eslint-disable-next-line no-restricted-syntax -- detached DOM: the row is still detached.
    el.appendChild(markerFor(row));

    const content = el.createSpan({ cls: 'to-backlinks-content' });
    // An embed of the target, rendered inside the target's OWN footer, would
    // transclude the note into itself — the reader asked where it was
    // referenced, not to read it again. Rendered as a link instead, and marked.
    const markdown = row.referenceKind === 'embed' ? row.markdown.replace(/!\[\[/g, '[[') : row.markdown;
    void this.renderMarkdown(content, markdown, sourcePath, el);
    if (row.referenceKind === 'embed') {
      content.createSpan({ cls: 'to-backlinks-tag', text: 'embed' });
    }
    el.addEventListener('click', () => this.open(sourcePath));
  }

  /**
   * Obsidian renders the node's own text, so links, tags, checkboxes and
   * formatting look exactly as they do anywhere else. `sourcePath` is the
   * REFERENCING note, so its relative links resolve from where they were
   * written rather than from the note being read.
   *
   * The result is then unwrapped down to inline content. `MarkdownRenderer`
   * answers with a document — a `<p>`, or a `<ul><li>` for a list item — and a
   * document brings a document's block margins and its own list indentation.
   * That is what put a reference row's children far right of the marker column
   * with large gaps between them: the row already expresses depth through the
   * shared chrome, and the wrapper was expressing it a second time, differently.
   * Unwrapped, the row's marker and text sit in one inline flow, exactly as a
   * `.cm-line`'s do.
   */
  private async renderMarkdown(
    el: HTMLElement,
    markdown: string,
    sourcePath: string,
    row?: HTMLElement,
  ): Promise<void> {
    await MarkdownRenderer.render(this.source.app, markdown, el, sourcePath, this.component);
    const heading = unwrapBlocks(el);
    // A heading's SIZE belongs to the row, not to the text inside it: the
    // marker is a sibling of the content, so if only the text grew, the marker
    // would be centred against the row's font while sitting beside much bigger
    // text — the `0.5ex` correction computed from the wrong font.
    if (heading && row) row.addClass(`to-backlinks-h${heading}`);
  }

  private open(sourcePath: string): void {
    void this.source.app.workspace.openLinkText(sourcePath, this.targetPath, false);
  }
}

/**
 * The marker for a node row, by the mechanism its kind needs.
 *
 * Three, because the footer's content comes from the reading-mode renderer and
 * that renderer answers in three shapes:
 *
 * - An ORDERED item's number is not notation, it is what the item is called.
 *   Unwrapping the `<ol>` discards it, so it is read back off the source line
 *   and drawn in the gutter, right-aligned against the text the way a list
 *   numbers itself.
 * - An ATOM (quote, callout, table, code, html) arrives as a real block with no
 *   text run to sit beside, so its marker is positioned against the row's box —
 *   the same absolute mechanism the editor uses for its widget atoms. Note the
 *   set is wider here than in the editor, where a quote and a code fence are
 *   still `.cm-line`s; this renderer returns a block for every one of them.
 * - Everything else sits in the inline flow, beside the first text run.
 */
function markerFor(row: Extract<FooterRow, { type: 'node' }>): HTMLElement {
  const ordered = orderedMarkerOf(row.markdown);
  if (ordered) return orderedMarker(ordered);
  if (row.fact.isAtom) return atomMarker(buildMarkerIcon(row.fact.kind), row.fact);
  return markerSlot(buildMarkerIcon(row.fact.kind));
}

/** `1.`, `10)` — an ordered item's own label, as written. */
function orderedMarkerOf(markdown: string): string | undefined {
  return /^\s*(\d{1,9}[.)])\s/.exec(markdown.split('\n')[0] ?? '')?.[1];
}

function orderedMarker(label: string): HTMLElement {
  const el = createSpan({ cls: 'to-backlinks-ol-marker', text: label });
  return el;
}

/** An atom's marker, positioned against the row's own box. */
function atomMarker(icon: Element, fact: FooterRow['fact']): HTMLElement {
  const el = createSpan({ cls: 'to-decor-marker-icon to-decor-marker-icon--widget' });
  el.setCssProps({ '--to-marker-left': atomMarkerLeftExpr(fact) });
  // `el` was created on the line above and is not mounted until the caller
  // attaches the row it belongs to.
  // eslint-disable-next-line no-restricted-syntax -- detached DOM before mount
  el.appendChild(icon);
  return el;
}

/**
 * A row's marker, built exactly the way the editor builds a plain line's: an
 * inline `.to-decor-marker-icon` span carrying the shared left shift, sitting
 * at the start of the row's own text.
 *
 * Same class, same shift expression, same inline-flow mechanism — so the icon
 * lands on `depth * unit`, the column its guide is drawn on, and it aligns to
 * the row text's own baseline rather than to the row box (the reason the editor
 * chose inline flow over absolute positioning: a heading's box carries
 * asymmetric spacing that would pull the icon visibly high).
 */
function markerSlot(icon: Element): HTMLElement {
  const el = createSpan({ cls: 'to-decor-marker-icon' });
  el.setCssProps({ '--to-marker-left': MARKER_LEFT_SHIFT_EXPR });
  // `el` was created on the line above and is not mounted until the caller
  // attaches the row it belongs to.
  // eslint-disable-next-line no-restricted-syntax -- detached DOM before mount
  el.appendChild(icon);
  return el;
}

/**
 * Strips the block wrappers `MarkdownRenderer` returns, leaving inline content.
 *
 * Applied repeatedly from the outside in, because a list item arrives as
 * `<ul><li>…` — two wrappers deep — and a single pass would leave the `<li>`
 * behind with its list-item display and its marker box. Stops at the first
 * element that is not a lone wrapper, so a row whose markdown genuinely holds
 * several blocks keeps them.
 */
const BLOCK_WRAPPERS = new Set(['P', 'UL', 'OL', 'LI', 'DIV', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6']);

/** Returns the heading level unwrapped along the way, if any, so the caller can
 * give the ROW that heading's size. */
function unwrapBlocks(el: HTMLElement): number | undefined {
  let heading: number | undefined;
  for (;;) {
    const only = el.children.length === 1 ? el.firstElementChild : null;
    if (!only || !BLOCK_WRAPPERS.has(only.tagName)) break;
    const level = /^H([1-6])$/.exec(only.tagName);
    if (level) heading = Number(level[1]);
    only.replaceWith(...Array.from(only.childNodes));
  }
  trimEdgeWhitespace(el);
  return heading;
}

/**
 * Drops the whitespace Obsidian's own HTML carries between a wrapper and its
 * content — the newline inside an `<li>`, say.
 *
 * Inside a block that whitespace would collapse away entirely, which is why it
 * is invisible in Obsidian's own rendering. Here the content follows an inline
 * marker, so it collapses to a real SPACE instead: measured, it pushed a list
 * row's text 3.6px right of the column, against the 13.2px gap the editor's own
 * lines hold between marker and text.
 */
function trimEdgeWhitespace(el: HTMLElement): void {
  const isBlank = (n: ChildNode): boolean => n.nodeType === Node.TEXT_NODE && !(n.textContent ?? '').trim();
  while (el.firstChild && isBlank(el.firstChild)) el.firstChild.remove();
  while (el.lastChild && isBlank(el.lastChild)) el.lastChild.remove();
  const first = el.firstChild;
  if (first?.nodeType === Node.TEXT_NODE) {
    first.textContent = (first.textContent ?? '').replace(/^\s+/, '');
  }
}

/** A lineage segment names its node, so it shows the node's first line only. */
function firstLineText(line: string): string {
  return line.replace(/^\s*(?:[-*+]\s+|\d+[.)]\s+|#{1,6}\s+|>\s?)?/, '').trim();
}

/**
 * Glyphs the footer draws itself, all built DETACHED and handed to a caller
 * that mounts them — the shape the DOM-insertion guard sanctions. Node MARKERS
 * are not here: those come from `buildMarkerIcon`, shared with the editor,
 * because a marker says what kind of node something is and two icon sets would
 * be two answers to one question.
 */
function glyph(box: number, d: string[], attrs: Record<string, string>): SVGSVGElement {
  const el = createSvg('svg', {
    attr: { viewBox: `0 0 ${box} ${box}`, width: '100%', height: '100%', 'aria-hidden': 'true', ...attrs },
  });
  for (const spec of d) el.createSvg('path', { attr: { d: spec } });
  return el;
}

function linkGlyph(): SVGSVGElement {
  const el = glyph(24, ['M9 17H7A5 5 0 0 1 7 7h2', 'M15 7h2a5 5 0 1 1 0 10h-2', 'M8 12h8'], {
    fill: 'none', stroke: 'currentColor', 'stroke-width': '1.9', 'stroke-linecap': 'round',
  });
  el.addClass('to-backlinks-icon');
  return el;
}

function chevronGlyph(open: boolean): SVGSVGElement {
  return glyph(16, [open ? 'M3 6l5 5 5-5' : 'M6 3l5 5-5 5'], {
    fill: 'none', stroke: 'currentColor', 'stroke-width': '2',
    'stroke-linecap': 'round', 'stroke-linejoin': 'round',
  });
}

function propertyGlyph(): SVGSVGElement {
  return glyph(16, ['M2 4.5h4M9 4.5h5M2 11.5h5M10 11.5h4'], {
    fill: 'none', stroke: 'currentColor', 'stroke-width': '1.6', 'stroke-linecap': 'round',
  });
}

/**
 * Every mounted controller, so an index change can repaint them all. A SET, not
 * a map keyed by path: the same note can be open in two editors, each of which
 * gets its own widget and therefore its own element.
 *
 * Sharing one element per path was the first version, and it produced no footer
 * at all whenever a note was open twice — an element can only be in one place in
 * the DOM, so the second mount moved it out of the first, and the first
 * editor's `destroy` then disposed the element the second was using. Exactly
 * the "one widget per editor" invariant spike S2 exists to hold.
 */
const liveControllers = new Set<FooterController>();

class BacklinksFooterWidget extends WidgetType {
  /** Created on first mount and owned by this widget instance — see
   * `liveControllers` for why it cannot be shared by path. */
  private controller: FooterController | null = null;

  constructor(
    private readonly source: FooterSource,
    private readonly targetPath: string,
  ) {
    super();
  }

  /** Identity is the note, NOT the contents — see the module note on why. */
  override eq(other: WidgetType): boolean {
    return other instanceof BacklinksFooterWidget && other.targetPath === this.targetPath;
  }

  toDOM(): HTMLElement {
    if (!this.controller) {
      this.controller = new FooterController(this.source, this.targetPath);
      liveControllers.add(this.controller);
    }
    return this.controller.el;
  }

  override destroy(): void {
    if (!this.controller) return;
    liveControllers.delete(this.controller);
    this.controller.destroy();
    this.controller = null;
  }

  override ignoreEvent(): boolean {
    // The footer is interactive: its own clicks are its own, not editor input.
    return true;
  }
}

function compute(state: EditorState, source: FooterSource): DecorationSet {
  if (!source.backlinksFooter) return Decoration.none;
  if (state.field(nestedEditorField, false) === true) return Decoration.none;
  const path = state.field(editorInfoField, false)?.file?.path;
  if (!path || !source.isOutline(path)) return Decoration.none;

  return Decoration.set([
    Decoration.widget({
      widget: new BacklinksFooterWidget(source, path),
      side: -1,
      block: true,
    }).range(state.doc.length),
  ]);
}

/** See the module note: a `ViewPlugin` observes the mode-toggle nudge that a
 * `StateField` cannot, and turns it into a transaction the field can act on. */
function refreshBridge(source: FooterSource): Extension {
  return ViewPlugin.define((view) => {
    let seen = source.footerRevision;
    return {
      update() {
        if (seen === source.footerRevision) return;
        seen = source.footerRevision;
        queueMicrotask(() => view.dispatch({ effects: refreshFooter.of() }));
      },
    };
  });
}

export function backlinksFooterExtension(source: FooterSource): Extension {
  const field = StateField.define<DecorationSet>({
    create: (state) => compute(state, source),
    update: (_value, tr) => compute(tr.state, source),
    provide: (f) => EditorView.decorations.from(f),
  });
  return [field, refreshBridge(source)];
}

/** Repaints every mounted footer — for when the INDEX changed rather than the
 * document, which no transaction would otherwise announce. */
export function repaintFooters(): void {
  for (const controller of liveControllers) void controller.render();
}
