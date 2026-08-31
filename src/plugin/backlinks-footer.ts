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
import {
  Component,
  Keymap,
  MarkdownRenderer,
  MarkdownView,
  editorInfoField,
  type App,
} from 'obsidian';
import type { ModeSource } from './keymap';
import { nestedEditorField } from './nested-editor';
import { buildMarkerIcon } from './decorations';
import {
  MARKER_LEFT_SHIFT_EXPR,
  applyLineChrome,
  lineChrome,
  plainGuideBackground,
} from './chrome-line';
import { buildRows, splitPath, type FooterRow } from './footer-model';
import type { BacklinkIndex } from './backlink-index';
import type { OutlineNode } from '../model';
import { nodeStartLine } from '../locate';

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
  /** The whole section, folded away. */
  collapsed: boolean;
  /** Groups whose height cap the reader has lifted. */
  readonly expandedGroups: Set<string>;
  /** Groups measured as overflowing their cap at least once. An expanded group
   * no longer overflows — it has no cap — so without this there is nothing to
   * tell it apart from one that always fitted, and its fold control would
   * vanish the moment it was used. */
  readonly truncatable: Set<string>;
  readonly collapsedGroups: Set<string>;
  readonly expandedRows: Set<string>;
}

const viewStates = new Map<string, ViewState>();

/**
 * Forgets the view state of every note that is no longer open.
 *
 * What the reader unfolded is about the reading they are doing, not about the
 * note: a group opened while chasing one question should not still be open a
 * week later, and a footer that reopens in a shape nobody remembers choosing is
 * a small mystery every time. Keyed to the tab rather than to the session,
 * because closing a tab is the moment a reader means "done with that".
 *
 * Called on layout change, which fires when a tab closes. Reopening the same
 * note in a still-open tab keeps its state, which is the point.
 */
export function pruneFooterViewState(openPaths: ReadonlySet<string>): void {
  for (const path of viewStates.keys()) {
    if (!openPaths.has(path)) viewStates.delete(path);
  }
}

function viewStateFor(path: string): ViewState {
  let state = viewStates.get(path);
  if (!state) {
    state = {
      collapsed: false,
      expandedGroups: new Set(),
      truncatable: new Set(),
      collapsedGroups: new Set(),
      expandedRows: new Set(),
    };
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
    // Reading the footer is not editing the note.
    //
    // The footer is a block widget inside a contenteditable, so a click in it
    // is a click in the editor as far as the BROWSER is concerned: it places a
    // DOM selection at the nearest editable position — the end of the document
    // — and CodeMirror then syncs its own selection from that. `ignoreEvent`
    // does not help, because that governs whether CM6 handles the event, not
    // whether the browser sets a selection before CM6 sees anything.
    //
    // Preventing the default on `mousedown` is what stops the selection from
    // being made at all. It costs the ability to drag-select text inside the
    // footer, which is the trade this makes deliberately: a reader glancing at
    // where a note is referenced has not asked to move their cursor, and having
    // it silently jump to the end of the note is the worse surprise. Links
    // still work — they act on `click`, not on the default of `mousedown`.
    this.el.addEventListener('mousedown', (event) => event.preventDefault());
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

    const state = viewStateFor(this.targetPath);
    this.renderHeader(root, totals, state.collapsed, summaries.length > 0);
    this.el.toggleClass('is-dormant', summaries.length === 0);
    if (summaries.length === 0 || state.collapsed) {
      this.swap(root);
      return;
    }

    // Most recently modified first — the default sort (docs/research/18, D15).
    // Path is the tie-break only: it used to be the whole comparison, which
    // sorted by filename backwards and called it recency.
    const ordered = [...summaries].sort(
      (a, b) => b.mtime - a.mtime || a.path.localeCompare(b.path),
    );
    const bodies: { path: string; body: HTMLElement; card: HTMLElement }[] = [];

    for (const summary of ordered) {
      const { name, folder } = splitPath(summary.path);
      const card = root.createDiv({ cls: 'to-backlinks-group' });
      const collapsed = state.collapsedGroups.has(summary.path);
      this.renderGroupHead(card, summary.path, name, folder, summary.count, collapsed);
      if (collapsed) continue;

      const body = card.createDiv({ cls: 'to-backlinks-rows' });
      // Capped by HEIGHT rather than by row count: what makes a group hard to
      // skim is how much of the screen it takes, and ten short rows take less
      // than three long ones. The threshold is a custom property so a setting
      // can drive it without this code knowing (docs/research/18, D10).
      body.toggleClass('is-capped', !state.expandedGroups.has(summary.path));
      body.createDiv({ cls: 'to-backlinks-resolving', text: 'resolving…' });
      bodies.push({ path: summary.path, body, card });
    }

    this.swap(root);
    // Started only after the swap, so a fast read cannot fill a body that is
    // still detached and about to be replaced. Per source, so a slow read holds
    // up only its own group (D-G).
    for (const { path, body, card } of bodies) void this.fillGroup(generation, path, body, card);
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
    card: HTMLElement,
  ): Promise<void> {
    const placed = await this.source.backlinks.place(this.targetPath, sourcePath);
    if (generation !== this.generation || !placed) return;

    const state = viewStateFor(this.targetPath);
    const rows = buildRows(
      placed.doc,
      placed.matches,
      placed.properties,
      (node: OutlineNode) => placed.refs.get(node.id),
      (node: OutlineNode) => state.expandedRows.has(`${sourcePath}:${node.id}`),
    );

    const built = createDiv();
    // Collected so the truncation measurement below happens against the rows as
    // they will actually be, not as they are a frame after being appended.
    const pending: Promise<void>[] = [];
    for (const row of rows) this.renderRow(built, sourcePath, row, pending);
    body.empty();
    // Rows were built off-tree just above and are moved into the widget's own
    // subtree.
    // eslint-disable-next-line no-restricted-syntax -- detached DOM before mount
    while (built.firstChild) body.appendChild(built.firstChild);

    // Truncation is decided AFTER the content settles, and only when the cap is
    // hiding something worth a control.
    //
    // `MarkdownRenderer.render` resolves asynchronously, so measuring straight
    // after appending measures rows that have not filled in yet — a group could
    // report an overflow it was about to grow out of, or, once it had grown,
    // fail to report one it now had. Both were visible: a "Show more" that
    // revealed nothing when pressed.
    await Promise.all(pending);
    if (generation !== this.generation || !body.isConnected) return;

    // A whole line of hidden content, not a stray pixel. An overflow smaller
    // than that is a margin rounding out, and offering to reveal it is a
    // promise the control cannot keep.
    const state2 = viewStateFor(this.targetPath);
    const expanded = state2.expandedGroups.has(sourcePath);
    if (!expanded) {
      const line = parseFloat(getComputedStyle(body).lineHeight) || 16;
      const hidden = body.scrollHeight - body.clientHeight;
      if (hidden < line) {
        state2.truncatable.delete(sourcePath);
        return;
      }
      state2.truncatable.add(sourcePath);
      body.addClass('is-truncated');
    } else if (!state2.truncatable.has(sourcePath)) {
      return;
    }

    // Centred on the card's own bottom edge: the control belongs to the whole
    // group, not to the last row, and the edge it sits on is the edge it moves.
    // A real `button`, not a clickable div: `aria-label` names a thing but does
    // not make it operable — a div is not in the tab order and does not answer
    // Enter or Space. `aria-expanded` is the part a label cannot carry at all,
    // since the control's meaning is which way it will move.
    const toggle = card.createEl('button', { cls: 'to-backlinks-more' });
    toggle.type = 'button';
    // eslint-disable-next-line no-restricted-syntax -- detached DOM: the card is still off-tree
    toggle.appendChild(capChevron(expanded));
    toggle.setAttribute('aria-label', expanded ? 'Show less' : 'Show more');
    toggle.setAttribute('aria-expanded', String(expanded));
    toggle.addEventListener('click', (event) => {
      event.stopPropagation();
      const s = viewStateFor(this.targetPath);
      if (expanded) s.expandedGroups.delete(sourcePath);
      else s.expandedGroups.add(sourcePath);
      void this.render();
    });
  }

  /**
   * The section's own header: what this is, how much of it there is, and a way
   * to fold the whole thing away.
   *
   * A note with no references gets the same one line, with `0 references`
   * beside it — the dormant state is not a different thing to look at, it is
   * this thing with nothing in it (docs/research/18, D9). One shape means one
   * place for the eye to land whether or not the note is referenced.
   */
  private renderHeader(
    root: HTMLElement,
    totals: { references: number; notes: number },
    collapsed: boolean,
    foldable: boolean,
  ): void {
    const head = root.createDiv({ cls: 'to-backlinks-head' });
    head.toggleClass('is-collapsed', collapsed);
    if (foldable) makeDisclosure(head, !collapsed, 'Structured backlinks');
    if (foldable) {
      const chevron = head.createSpan({ cls: 'to-backlinks-chevron' });
      // eslint-disable-next-line no-restricted-syntax -- detached DOM before mount
      chevron.appendChild(chevronGlyph(!collapsed));
    }
    // `head` is inside the off-tree root this pass is building; nothing here is
    // mounted until `swap`.
    // eslint-disable-next-line no-restricted-syntax -- detached DOM before mount
    head.appendChild(linkGlyph());
    head.createSpan({ cls: 'to-backlinks-title', text: 'Structured backlinks' });

    const refs = `${totals.references} ${totals.references === 1 ? 'reference' : 'references'}`;
    const counts =
      totals.references > 0
        ? `${refs} · ${totals.notes} ${totals.notes === 1 ? 'note' : 'notes'}`
        : refs;
    head.createSpan({ cls: 'to-backlinks-totals', text: counts });

    if (!foldable) return;
    head.addEventListener('click', () => {
      const state = viewStateFor(this.targetPath);
      state.collapsed = !state.collapsed;
      void this.render();
    });
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
    head.toggleClass('is-collapsed', collapsed);
    makeDisclosure(head, !collapsed, name);
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
   * `nativeBlocks: false` because no row here has a block of its own: the
   * rendered `<li>` is unwrapped and no atom keeps its box (D18), so every kind
   * is laid out as an ordinary block line with our own marker. Left true, a
   * quote or table row would take the atom rule, which moves the BOX by margin
   * — and the marker, placed for a padding-shifted line, would land a gutter
   * and a half away from its column.
   */
  private renderRow(
    body: HTMLElement,
    sourcePath: string,
    row: FooterRow,
    pending: Promise<void>[],
  ): void {
    const el = body.createDiv({ cls: 'to-backlinks-row' });
    // The row says what KIND of node it holds. The chrome class says how it is
    // laid out (every footer row is a block line) and the marker says the kind
    // in glyphs, but neither is readable — by a stylesheet, by a snippet, or by the
    // conformance matrix, which has to check that each kind got the treatment
    // its own rule promises.
    el.dataset.kind = row.type === 'node' ? row.fact.kind : row.type;
    applyLineChrome(el, lineChrome(row.fact, {
      nativeBlocks: false,
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
      pending.push(this.renderMarkdown(content.createSpan(), row.markdown, sourcePath));
      return;
    }

    if (row.type === 'lineage') {
      el.addClass('is-lineage');
      // eslint-disable-next-line no-restricted-syntax -- detached DOM: the row is still detached.
      el.appendChild(markerSlot(buildMarkerIcon(row.kind)));
      const content = el.createSpan({ cls: 'to-backlinks-content' });
      row.segments.forEach((segment, i) => {
        if (i > 0) content.createSpan({ cls: 'to-backlinks-sep', text: '›' });
        // Each ancestor is its own target. One handler on the row could only
        // open the note, which is not what "a lineage element navigates to that
        // ancestor" promises — a chain is several ancestors on one line.
        const seg = content.createSpan({
          cls: 'to-backlinks-seg',
          text: firstLineText(segment.text),
        });
        seg.setAttribute('role', 'link');
        seg.tabIndex = 0;
        seg.addEventListener('click', (event) => {
          event.stopPropagation();
          this.open(event, sourcePath, segment.nodeId);
        });
      });
      return;
    }

    if (row.isReference) el.addClass('is-reference');

    if (row.foldedCount > 0) {
      const fold = el.createEl('button', { cls: 'to-backlinks-fold' });
      fold.type = 'button';
      fold.setAttribute('aria-label', `Show ${row.foldedCount} hidden`);
      fold.setAttribute('aria-expanded', 'false');
      // eslint-disable-next-line no-restricted-syntax -- detached DOM before mount
      fold.appendChild(chevronGlyph(false));
      fold.addEventListener('click', (event) => {
        event.stopPropagation();
        viewStateFor(this.targetPath).expandedRows.add(`${sourcePath}:${row.nodeId}`);
        void this.render();
      });
    }

    // eslint-disable-next-line no-restricted-syntax -- detached DOM: the row is still detached.
    el.appendChild(markerFor(row));

    const content = el.createSpan({ cls: 'to-backlinks-content' });
    // The rendered content gets its own span: `MarkdownRenderer` resolves
    // asynchronously, and `unwrapBlocks` only unwraps a LONE wrapper — so a tag
    // appended beside it in the meantime left the `<p>` in place, which is a
    // block element in a row and exactly what the model forbids.
    pending.push(this.renderContent(content.createSpan(), row, sourcePath));
    if (row.referenceKind === 'embed') {
      content.createSpan({ cls: 'to-backlinks-tag', text: 'embed' });
    }
    el.addEventListener('click', (event) => this.open(event, sourcePath, row.nodeId));
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
  private async renderMarkdown(el: HTMLElement, markdown: string, sourcePath: string): Promise<void> {
    await MarkdownRenderer.render(this.source.app, markdown, el, sourcePath, this.component);
    unwrapBlocks(el);
  }

  /**
   * A node row's content, by the one of three ways it is to be rendered (D18).
   *
   * Only `markdown` reaches Obsidian, and by then the model has already removed
   * the node's block syntax — so the renderer is asked for inline content and
   * returns a single paragraph, which `unwrapBlocks` flattens.
   */
  private renderContent(
    el: HTMLElement,
    row: Extract<FooterRow, { type: 'node' }>,
    sourcePath: string,
  ): Promise<void> {
    if (row.markdown.length === 0) return Promise.resolve();
    if (row.render === 'text') {
      el.setText(row.markdown);
      return Promise.resolve();
    }
    if (row.render === 'code') {
      el.createEl('code', { cls: 'to-backlinks-code', text: row.markdown });
      return Promise.resolve();
    }
    // An embed of the target, rendered inside the target's OWN footer, would
    // transclude the note into itself — the reader asked where it was
    // referenced, not to read it again. Rendered as a link instead, and marked.
    const markdown =
      row.referenceKind === 'embed' ? row.markdown.replace(/!\[\[/g, '[[') : row.markdown;
    return this.renderMarkdown(el, markdown, sourcePath);
  }

  /**
   * Opens a source note at the node that was clicked.
   *
   * Three things the first version got wrong, all of them promises the spec
   * already made. It ignored the event, so `Mod`-click opened in place instead
   * of a new pane. It opened the note's default location rather than the node,
   * so a reference forty lines down arrived off screen. And it fired for clicks
   * that had already been handled by something inside the row — a rendered
   * `[[link]]` in a mention would navigate to the source note instead of to the
   * link's own target, which is the opposite of what was clicked.
   */
  private open(event: MouseEvent, sourcePath: string, nodeId?: number): void {
    // A nested link or control owns its own click. `defaultPrevented` covers
    // Obsidian's own internal links, which handle themselves.
    const target = event.target as HTMLElement | null;
    if (event.defaultPrevented || target?.closest('a, button')) return;

    const newLeaf = Keymap.isModEvent(event);
    void this.source.app.workspace
      .openLinkText(sourcePath, this.targetPath, newLeaf)
      .then(() => {
        if (nodeId === undefined) return;
        this.revealNode(sourcePath, nodeId);
      });
  }

  /** Puts the caret on the node's own first line in the note just opened, so a
   * reference deep in a long note arrives on screen rather than at the top. */
  private revealNode(sourcePath: string, nodeId: number): void {
    const view = this.source.app.workspace.getActiveViewOfType(MarkdownView);
    if (!view || view.file?.path !== sourcePath) return;
    const doc = this.source.backlinks.treeFor(sourcePath);
    if (!doc) return;
    const line = nodeStartLine(doc, nodeId);
    if (line < 0) return;
    view.editor.setCursor({ line, ch: 0 });
    view.editor.scrollIntoView({ from: { line, ch: 0 }, to: { line, ch: 0 } }, true);
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
  if (row.task !== undefined) return markerSlot(checkboxGlyph(row.task));
  if (row.ordinal) return ordinalMarker(row.ordinal);
  return markerSlot(buildMarkerIcon(row.fact.kind));
}

/**
 * An ordered item's number, in the marker's place.
 *
 * Inline rather than absolute, and sized so its LEFT edge lands on the block
 * icon's — which is the rule the editor's own ordered markers follow, and for
 * the reason recorded there: a fixed left edge reads as a column, where centring
 * each number on its own width leaves `10.` and `100.` ragged and eats the room
 * the fold chevron needs. A number too wide for the slot grows right and pushes
 * its own text out, exactly as it does in the editor.
 */
function ordinalMarker(label: string): HTMLElement {
  return createSpan({ cls: 'to-backlinks-ordinal', text: label });
}

/** A task's state, drawn where its bullet would be. Not interactive: the footer
 * is read-only (D2), and a checkbox that looks clickable and is not is worse
 * than one that does not. */
function checkboxGlyph(done: boolean): SVGSVGElement {
  const box = 'M2.8 2.8h10.4v10.4h-10.4z';
  return done
    ? glyph(16, [box, 'M5 8.2l2.4 2.4 4-4.8'], {
        fill: 'none',
        stroke: 'currentColor',
        'stroke-width': '1.6',
        'stroke-linecap': 'round',
        'stroke-linejoin': 'round',
      })
    : glyph(16, [box], {
        fill: 'none',
        stroke: 'currentColor',
        'stroke-width': '1.6',
        'stroke-linejoin': 'round',
      });
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

/**
 * The safety net, not the mechanism: the model strips block syntax before the
 * renderer ever sees the text (D18), so a lone `<p>` is all this normally
 * unwraps. The wider set stays because a stripping miss must not put a block
 * element in a row — the one invariant the whole model rests on.
 */
function unwrapBlocks(el: HTMLElement): void {
  for (;;) {
    const only = el.children.length === 1 ? el.firstElementChild : null;
    if (!only || !BLOCK_WRAPPERS.has(only.tagName)) break;
    only.replaceWith(...Array.from(only.childNodes));
  }
  trimEdgeWhitespace(el);
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

/**
 * Makes an element operable as a disclosure control.
 *
 * The heads are rows of several spans rather than single controls, so they
 * cannot be `button` elements without nesting interactive content inside one.
 * `role` plus a tab stop plus a key handler is the equivalent a composite row
 * gets — and `aria-expanded` is the part that matters, because the control's
 * meaning is which way it will move, which no label can say.
 */
function makeDisclosure(el: HTMLElement, expanded: boolean, label: string): void {
  el.setAttribute('role', 'button');
  el.setAttribute('aria-expanded', String(expanded));
  el.setAttribute('aria-label', label);
  el.tabIndex = 0;
  el.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    el.click();
  });
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

/** The cap's own control: down to reveal what is hidden, up to put it back.
 * Distinct from `chevronGlyph`, whose two states are a DISCLOSURE's — right for
 * closed, down for open — and would read as the wrong axis on an edge. */
function capChevron(up: boolean): SVGSVGElement {
  return glyph(16, [up ? 'M3 10l5-5 5 5' : 'M3 6l5 5 5-5'], {
    fill: 'none',
    stroke: 'currentColor',
    'stroke-width': '2',
    'stroke-linecap': 'round',
    'stroke-linejoin': 'round',
  });
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
