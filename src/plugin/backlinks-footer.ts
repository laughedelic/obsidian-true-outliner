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
  TFile,
  editorInfoField,
  getAllTags,
  type App,
} from 'obsidian';
import type { ModeSource } from './keymap';
import { nestedEditorField } from './nested-editor';
import { buildMarkerIcon } from './decorations';
import {
  MARKER_LEFT_SHIFT_EXPR,
  OWN_CHROME_CLASS,
  applyLineChrome,
  lineChrome,
  plainGuideBackground,
} from './chrome-line';
import {
  CHROME_VARS,
  MARKER_GAP_CSS,
  MARKER_GUTTER_CSS,
  MARKER_ICON_CSS,
} from './chrome-tokens';
import {
  buildRows,
  rowFact,
  splitPath,
  type FooterRow,
  type LineageSegment,
} from './footer-model';
import {
  applyControls,
  axesOf,
  type ControlsState,
  type FilterAxes,
  type SortOrder,
  type SourceRefs,
} from './footer-filter';
import {
  GROUP_HEIGHT_CSS,
  OVERALL_CAP_REFERENCES,
  type GroupHeight,
  type LineageSeparator,
  type OverallCap,
  type SegmentIcons,
} from './mode-registry';
import type { ReferenceKind } from './backlink-index';
import type { BacklinkIndex } from './backlink-index';
import type { NodeKind, OutlineNode } from '../model';
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
  /** Group order. Plugin data rather than per-note view state: its values are
   * note-independent, so a reader who wants source-name order wants it in
   * every footer (backlinks-controls design D4). */
  readonly backlinksSort: SortOrder;
  setBacklinksSort(value: SortOrder): Promise<void>;
  readonly backlinksOverallCap: OverallCap;
  readonly backlinksGroupHeight: GroupHeight;
  readonly backlinksSuppressCore: boolean;
  readonly backlinksSegmentIcons: SegmentIcons;
  readonly backlinksSeparator: LineageSeparator;
  readonly backlinksGuides: boolean;
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
  /** Whether the filter controls are revealed. */
  filtersOpen: boolean;
  /** Focus-on selections. Per note, because the values on offer are the
   * current note's — a folder selected here means nothing in another note. */
  readonly folders: Set<string>;
  readonly kinds: Set<ReferenceKind>;
  readonly tags: Set<string>;
  search: string;
  /** Which popover is on screen, if any. One at a time — the sort menu is in
   * here with the facets precisely so opening one closes another. */
  openFacet: OpenPopover | null;
  /** What each unbounded axis's own find box holds (design D10). */
  folderQuery: string;
  tagQuery: string;
  /** Tranches the reader has asked for, added to the overall cap. */
  capBonus: number;
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
      filtersOpen: false,
      folders: new Set(),
      kinds: new Set(),
      tags: new Set(),
      search: '',
      openFacet: null,
      folderQuery: '',
      tagQuery: '',
      capBonus: 0,
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
  /**
   * The control that had focus when a repaint started, and where its caret was.
   *
   * The footer rebuilds its whole subtree on every render, so any control the
   * reader is using is replaced mid-use. For a button that costs a keyboard
   * user their place; for the search field it cost every character after the
   * first, because the `input` handler renders and the element the next
   * keystroke would have gone to no longer existed. Controls carry a stable
   * `data-focus-key`, and focus follows the key rather than the element.
   */
  private focused: { key: string; caret: number | null } | null = null;

  constructor(
    private readonly source: FooterSource,
    private readonly targetPath: string,
  ) {
    // `OWN_CHROME_CLASS`: the footer is view chrome mounted after the content,
    // not a rendering of the last line, and the widget-line patch cannot tell
    // the difference on its own — it works from the document line `posAtDOM`
    // attributes a block widget to. Without this the footer inherits that
    // line's node chrome, so a note whose last line is a nested list item drew
    // that item's ancestor guide straight down through the whole footer.
    this.el = createDiv({ cls: `${FOOTER_CLASS} ${OWN_CHROME_CLASS}` });
    // The section's own chrome — its heading, its "resolving…" placeholder, a
    // wide ordinal's clearance — lays out against the gutter and the gap, and
    // is not a row, so `chrome-line.ts` never reaches it. Published here rather
    // than left to a literal fallback in the stylesheet: the gutter is derived
    // (chrome-tokens.ts), so a fallback is a copy that goes stale the first time
    // the derivation is re-run, and the heading then sits off the column of the
    // very rows it heads.
    this.el.setCssProps({
      [CHROME_VARS.markerGutter]: MARKER_GUTTER_CSS,
      [CHROME_VARS.markerGap]: MARKER_GAP_CSS,
      // The section's own icon is not a row mark. Footer rows deliberately draw
      // their marks smaller than the editor does (`--to-marker-icon-size` on
      // `.to-backlinks`, 0.8em, so a four-deep trail does not read as a row of
      // buttons), but the head's icon sits on the depth-0 column beside the
      // editor's own top-level markers and should be the size of one. Published
      // from the token rather than written into the stylesheet, for the reason
      // the gutter is: a literal here is a copy that goes stale when the
      // derivation moves.
      '--to-backlinks-head-icon': MARKER_ICON_CSS,
    });
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
    // `pointerdown` as well as `mousedown`: the two cover different input
    // paths, and only the pair covers both. A touch (or an emulated one) goes
    // through the pointer sequence, where the compatibility `mousedown` arrives
    // too late to stop the browser giving focus to whatever was tapped — so on
    // touch the section head, which is deliberately tabbable for the keyboard,
    // took focus away from the editor and the reader's next undo went nowhere.
    const keepFocus = (event: Event): void => {
      // Every control EXCEPT a form field: focusing an input and opening a
      // select are the browser's default action on pointerdown, so preventing
      // it here left the search field impossible to type in and the sort
      // dropdown impossible to open. A button needs no default to work, and
      // still wants the editor to keep its caret.
      if ((event.target as HTMLElement | null)?.closest('input, select, textarea')) return;
      event.preventDefault();
    };
    this.el.addEventListener('pointerdown', keepFocus);
    this.el.addEventListener('mousedown', keepFocus);
    // A popover closes when the reader looks away from it.
    //
    // On the DOCUMENT rather than on the footer: the click that dismisses a
    // menu is usually somewhere else entirely — the note, another pane — and a
    // listener inside the footer never sees it. Clicks on the anchor are left
    // alone so the button's own handler decides, which is what makes pressing
    // an open facet close it rather than close-and-reopen.
    //
    // On `click`, NOT `pointerdown`, and that is not a detail. Dismissing at
    // pointerdown repaints the footer before the browser has acted on the
    // press — so clicking the search field while a menu was open destroyed the
    // input the press was about to focus, and the term the reader then typed
    // went into the note. Caught by the read-only spec, which is what it is
    // for. By `click` the focus has landed, and the repaint's own focus
    // restoration carries it across.
    this.el.doc.addEventListener('click', this.closeOnOutsideClick, true);
    this.component.load();
    void this.render();
  }

  /** Bound once so it can be removed again; see the constructor. */
  private readonly closeOnOutsideClick = (event: Event): void => {
    const state = viewStates.get(this.targetPath);
    if (!state || state.openFacet === null) return;
    const target = event.target as HTMLElement | null;
    if (target && this.el.contains(target) && target.closest('.to-backlinks-facet-anchor')) return;
    state.openFacet = null;
    void this.render();
  };

  destroy(): void {
    this.generation++;
    this.el.doc.removeEventListener('click', this.closeOnOutsideClick, true);
    this.component.unload();
    this.el.detach();
  }

  /**
   * Fold or unfold, and put the section's head back where the reader had it.
   *
   * Folding takes height out of the document from BELOW the head, so the head's
   * own position does not move and the browser has no reason to scroll. It does
   * anyway once the footer is more than about half the screen — reported from
   * use, and reproducible: below that share the view holds, above it the note
   * jumps to the top, whatever the note's length or where the caret is. Length
   * is what rules out the obvious explanation, since a clamp cannot take a long
   * document to its top.
   *
   * What is left is CodeMirror's own scroll restoration. It keeps the view
   * steady across an update by holding a block at a fixed offset, and the block
   * it holds is the one at the top of the visible area — which IS this widget
   * once the footer covers that much of the screen. Restoring a shrunken
   * block's top then moves the view rather than steadying it.
   *
   * So the head's offset is measured before and restored after, twice: once
   * immediately, and once past the frame in which CodeMirror re-measures, since
   * the correction has to outlive the restoration it is correcting. Where the
   * document is genuinely too short to hold the position the browser still
   * clamps, which is the one case nothing can help.
   */
  private foldKeepingPlace(): void {
    const scroller = this.el.closest<HTMLElement>('.cm-scroller');
    if (!scroller) {
      void this.render();
      return;
    }
    const offsetOfHead = (): number | null => {
      const head = this.el.querySelector<HTMLElement>('.to-backlinks-head');
      if (!head) return null;
      return head.getBoundingClientRect().top - scroller.getBoundingClientRect().top;
    };

    const before = offsetOfHead();
    void this.render();
    if (before === null) return;

    const restore = (): void => {
      const now = offsetOfHead();
      if (now === null) return;
      scroller.scrollTop += now - before;
    };
    restore();
    const win = this.el.win;
    win.requestAnimationFrame(() => win.requestAnimationFrame(restore));
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
    const state = viewStateFor(this.targetPath);

    // The controls decide everything BEFORE a source note is read: the folder
    // is part of the path and the kind is on the reference, so `place()` is
    // never called for a group the cap did not admit (design D1, D2).
    const sources = this.sourceRefs();
    const axes = axesOf(sources, this.controls(state));
    const result = applyControls(sources, this.controls(state));

    this.el.toggleClass('is-suppressing-core', this.source.backlinksSuppressCore);
    this.el.style.setProperty(
      '--to-backlinks-group-max',
      GROUP_HEIGHT_CSS[this.source.backlinksGroupHeight],
    );

    this.renderHeader(root, result.totals, state, sources.length > 0);
    if (state.filtersOpen && sources.length > 0) this.renderFilterRow(root, axes, state);
    this.el.toggleClass('is-dormant', sources.length === 0);
    if (sources.length === 0 || state.collapsed) {
      this.swap(root);
      return;
    }

    const bodies: { path: string; body: HTMLElement; card: HTMLElement }[] = [];

    for (const group of result.groups) {
      const { name, folder } = splitPath(group.path);
      const card = root.createDiv({ cls: 'to-backlinks-group' });
      const collapsed = state.collapsedGroups.has(group.path);
      this.renderGroupHead(card, group.path, name, folder, group.count, collapsed);
      if (collapsed) continue;

      const body = card.createDiv({ cls: 'to-backlinks-rows' });
      // Capped by HEIGHT rather than by row count: what makes a group hard to
      // skim is how much of the screen it takes, and ten short rows take less
      // than three long ones. The threshold is a custom property so a setting
      // can drive it without this code knowing (docs/research/18, D10).
      body.toggleClass('is-capped', !state.expandedGroups.has(group.path));
      body.createDiv({ cls: 'to-backlinks-resolving', text: 'resolving…' });
      bodies.push({ path: group.path, body, card });
    }

    this.renderTail(root, result.shortfall);

    this.swap(root);
    // Started only after the swap, so a fast read cannot fill a body that is
    // still detached and about to be replaced. Per source, so a slow read holds
    // up only its own group (D-G).
    for (const { path, body, card } of bodies) void this.fillGroup(generation, path, body, card);
  }

  /**
   * What the overall cap held back, said twice: as a rung where the missing
   * notes would have been, and as a sentence.
   *
   * A count alone is too quiet for a section a reader scrolls past
   * (docs/research/18, D10) — so the last card fades as well, and a list that
   * is complete gets none of the three.
   */
  private renderTail(root: HTMLElement, shortfall: { references: number; notes: number }): void {
    if (shortfall.notes <= 0) return;

    const cards = root.querySelectorAll('.to-backlinks-group');
    cards.item(cards.length - 1)?.addClass('is-fading');

    const tail = root.createDiv({ cls: 'to-backlinks-tail' });
    // Depth 0, because a source note is a top-level thing in this footer and
    // that is the rung the missing ones would have stood on.
    const more = tail.createEl('button', { cls: 'to-backlinks-rung to-backlinks-load-more' });
    more.type = 'button';
    applyLineChrome(more, lineChrome(rowFact('paragraph', 0), { nativeBlocks: false }));
    // eslint-disable-next-line no-restricted-syntax -- detached DOM before mount
    more.appendChild(markerSlot(ellipsisGlyph()));
    // The action, not the count. D10 draws both a rung reading "93 more notes"
    // and a "Load next Z" beside the sentence, but the sentence to its right
    // already states the notes — two elements a hand-span apart saying "112"
    // read as two different numbers until they are compared.
    const tranche = OVERALL_CAP_REFERENCES[this.source.backlinksOverallCap];
    const next = Number.isFinite(tranche) ? `Load ${tranche} more` : 'Load more';
    more.createSpan({ cls: 'to-backlinks-more-count', text: next });
    more.setAttribute('aria-label', next);
    more.addEventListener('click', (event) => {
      event.stopPropagation();
      // Additive: the model is a pure function of the controls and its order is
      // stable, so a larger cap yields a superset in the same order and nothing
      // already on screen moves (design D5).
      viewStateFor(this.targetPath).capBonus += Number.isFinite(tranche) ? tranche : 0;
      void this.render();
    });

    const refs = `${shortfall.references} ${shortfall.references === 1 ? 'reference' : 'references'}`;
    const notes = `${shortfall.notes} ${shortfall.notes === 1 ? 'note' : 'notes'}`;
    tail.createSpan({
      cls: 'to-backlinks-shortfall',
      text: `${refs} across ${notes} not shown`,
    });
  }

  private swap(root: HTMLElement): void {
    this.rememberFocus();
    this.el.empty();
    // `root` is detached DOM built entirely by this controller, moved into the
    // widget's OWN subtree — never a plain `.cm-line`, which is what the guard
    // is about.
    // eslint-disable-next-line no-restricted-syntax -- detached DOM before mount
    while (root.firstChild) this.el.appendChild(root.firstChild);
    this.restoreFocus();
  }

  /** Which control the reader was in, before its element is thrown away. */
  private rememberFocus(): void {
    const active = this.el.doc.activeElement as HTMLElement | null;
    const key = active?.dataset?.focusKey;
    if (!active || !key || !this.el.contains(active)) {
      this.focused = null;
      return;
    }
    const caret = active.instanceOf(HTMLInputElement) ? active.selectionStart : null;
    this.focused = { key, caret };
  }

  /** Put it back, by key rather than by element. */
  private restoreFocus(): void {
    const wanted = this.focused;
    this.focused = null;
    if (!wanted) return;
    const el = this.el.querySelector<HTMLElement>(`[data-focus-key="${wanted.key}"]`);
    if (!el) return;
    el.focus();
    if (el.instanceOf(HTMLInputElement) && wanted.caret !== null) {
      el.setSelectionRange(wanted.caret, wanted.caret);
    }
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
    // than that is not worth a control — but it is not worth HIDING either, and
    // for a while this drew the right conclusion about the control and left the
    // clip in place: no control, no fade, and a row cut horizontally through its
    // glyphs, which reads as a rendering bug because it is one. Measured on the
    // hub fixture, where 16px of a 24px line was being clipped off eleven groups
    // at once.
    //
    // So the cap comes OFF instead. The card grows by less than a line, shows
    // everything, and there is nothing left to reveal.
    const state2 = viewStateFor(this.targetPath);
    const expanded = state2.expandedGroups.has(sourcePath);
    let omitted: Omission | null = null;
    if (!expanded) {
      const line = parseFloat(getComputedStyle(body).lineHeight) || 16;
      const hidden = body.scrollHeight - body.clientHeight;
      if (hidden < line) {
        state2.truncatable.delete(sourcePath);
        body.removeClass('is-capped');
        return;
      }
      state2.truncatable.add(sourcePath);
      body.addClass('is-truncated');
      // The same pass, one step further. The cap is a HEIGHT, so how much it
      // hid is only knowable once the content has settled — which is the
      // measurement that just ran (design D3).
      omitted = omissionBelow(body, rows);
    } else if (!state2.truncatable.has(sourcePath)) {
      return;
    }

    // Centred on the card's own bottom edge: the control belongs to the whole
    // group, not to the last row, and the edge it sits on is the edge it moves.
    // A real `button`, not a clickable div: `aria-label` names a thing but does
    // not make it operable — a div is not in the tab order and does not answer
    // Enter or Space. `aria-expanded` is the part a label cannot carry at all,
    // since the control's meaning is which way it will move.
    //
    // Rendered AFTER the body rather than inside it: the body is what clips, so
    // a cue placed among the rows it hid would be hidden with them.
    const toggle = card.createEl('button', { cls: 'to-backlinks-more' });
    toggle.type = 'button';
    toggle.setAttribute('aria-expanded', String(expanded));

    if (omitted) {
      // A rung in the tree's own vocabulary, at the depth the hidden rows would
      // have occupied, saying how many there are (docs/research/18, D10).
      toggle.addClass('to-backlinks-rung');
      applyLineChrome(toggle, lineChrome(rowFact('paragraph', omitted.depth), {
        nativeBlocks: false,
      }));
      // eslint-disable-next-line no-restricted-syntax -- detached DOM: the card is still off-tree
      toggle.appendChild(markerSlot(ellipsisGlyph()));
      toggle.createSpan({ cls: 'to-backlinks-more-count', text: `${omitted.count} more` });
      toggle.setAttribute('aria-label', `Show ${omitted.count} more`);
    } else {
      // eslint-disable-next-line no-restricted-syntax -- detached DOM: the card is still off-tree
      toggle.appendChild(capChevron(expanded));
      toggle.setAttribute('aria-label', expanded ? 'Show less' : 'Show more');
    }

    toggle.addEventListener('click', (event) => {
      event.stopPropagation();
      const s = viewStateFor(this.targetPath);
      if (expanded) s.expandedGroups.delete(sourcePath);
      else s.expandedGroups.add(sourcePath);
      void this.render();
    });
  }

  /**
   * Everything the controls read about this note's references, from the index's
   * cheap half only. No file is read here, which is what lets the cap be
   * applied before `place()`.
   */
  private sourceRefs(): SourceRefs[] {
    return this.source.backlinks.summaries(this.targetPath).map((summary) => ({
      path: summary.path,
      mtime: summary.mtime,
      refs: this.source.backlinks.referencesFrom(this.targetPath, summary.path),
      tags: this.tagsOf(summary.path),
    }));
  }

  /**
   * A source note's own tags, `#` stripped and deduplicated.
   *
   * `getAllTags` is Obsidian's own reader, so frontmatter tags and inline ones
   * arrive the same way and this code never has to know which is which. It
   * reads the metadata cache, so it costs no file access — which is what keeps
   * the tag axis upstream of `place()` with the other two (design D9).
   */
  private tagsOf(path: string): string[] {
    const file = this.source.app.vault.getAbstractFileByPath(path);
    if (!(file instanceof TFile)) return [];
    const cache = this.source.app.metadataCache.getFileCache(file);
    if (!cache) return [];
    return [...new Set((getAllTags(cache) ?? []).map((tag) => tag.replace(/^#/, '')))];
  }

  /** The reader's per-note selections, plus the two note-independent settings. */
  private controls(state: ViewState): ControlsState {
    return {
      folders: state.folders,
      kinds: state.kinds,
      tags: state.tags,
      search: state.search,
      sort: this.source.backlinksSort,
      cap: OVERALL_CAP_REFERENCES[this.source.backlinksOverallCap] + state.capBonus,
    };
  }

  /** Whether anything is narrowing the footer right now. */
  private isFiltering(state: ViewState): boolean {
    return (
      state.folders.size > 0 ||
      state.kinds.size > 0 ||
      state.tags.size > 0 ||
      state.search.trim().length > 0
    );
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
    state: ViewState,
    foldable: boolean,
  ): void {
    const collapsed = state.collapsed;
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
    // The controls go AFTER the totals and stop the click that folds the
    // section, so operating one never also collapses what it just changed.
    this.renderHeaderControls(head, state);

    head.addEventListener('click', () => {
      const current = viewStateFor(this.targetPath);
      current.collapsed = !current.collapsed;
      this.foldKeepingPlace();
    });
  }

  /**
   * The filter affordance and the sort control, the two that stay on the header
   * row. Neither is offered while the section is folded away: they would change
   * something nobody can see.
   *
   * How lineage is collapsed and how deep descendants go are decided (D4, D7)
   * and so are deliberately not here.
   */
  private renderHeaderControls(head: HTMLElement, state: ViewState): void {
    if (state.collapsed) return;

    const filters = head.createEl('button', { cls: 'to-backlinks-filter-toggle' });
    filters.type = 'button';
    // The dot is the whole point of the affordance while the row is hidden: a
    // narrowed footer that looks unfiltered is a footer lying about its counts.
    filters.toggleClass('is-active', this.isFiltering(state));
    filters.setAttribute('aria-expanded', String(state.filtersOpen));
    filters.setAttribute('aria-label', state.filtersOpen ? 'Hide filters' : 'Show filters');
    filters.dataset.focusKey = 'filters';
    // eslint-disable-next-line no-restricted-syntax -- detached DOM before mount
    filters.appendChild(filterGlyph());
    filters.addEventListener('click', (event) => {
      event.stopPropagation();
      const current = viewStateFor(this.targetPath);
      current.filtersOpen = !current.filtersOpen;
      void this.render();
    });

    this.renderSortControl(head, state);
  }

  /**
   * Sort: the same popover the facets use, and an icon-only button.
   *
   * It was a native `select`, which put a platform control beside three of our
   * own and made the one that is not a filter look like the odd one out rather
   * than the different one. The menu here is `renderFacetMenu`'s shape — a cap,
   * a list, a check against the current value — so the header and the filter
   * row speak with one vocabulary.
   *
   * Icon-only, because the four sort orders have long names and the button
   * would otherwise be the widest thing in a header whose job is to state
   * counts. What is chosen is shown by the check inside the menu.
   */
  private renderSortControl(head: HTMLElement, state: ViewState): void {
    const current = this.source.backlinksSort;
    const open = state.openFacet === 'sort';

    const anchor = head.createDiv({ cls: 'to-backlinks-facet-anchor' });
    const button = anchor.createEl('button', { cls: 'to-backlinks-sort' });
    button.type = 'button';
    button.dataset.focusKey = 'sort';
    button.toggleClass('is-active', open);
    button.setAttribute('aria-expanded', String(open));
    button.setAttribute('aria-haspopup', 'true');
    button.setAttribute('aria-label', `Sort backlinks — ${SORT_LABELS[current]}`);
    // eslint-disable-next-line no-restricted-syntax -- detached DOM before mount
    button.appendChild(sortGlyph());
    button.addEventListener('click', (event) => {
      event.stopPropagation();
      const now = viewStateFor(this.targetPath);
      now.openFacet = open ? null : 'sort';
      void this.render();
    });

    if (!open) return;

    const menu = anchor.createDiv({ cls: 'to-backlinks-facet-menu to-backlinks-sort-menu' });
    // A radio group, not a set of toggles. The facets' own boxes say "several
    // of these can be on at once", which is true of an axis and false here.
    menu.setAttribute('role', 'menu');
    menu.setAttribute('aria-label', 'Sort');
    menu.createDiv({ cls: 'to-backlinks-facet-cap' }).createSpan({ text: 'sort' });
    const list = menu.createDiv({ cls: 'to-backlinks-facet-list' });
    for (const [value, label] of Object.entries(SORT_LABELS)) {
      const chosen = value === current;
      const option = list.createEl('button', { cls: 'to-backlinks-facet-option' });
      option.type = 'button';
      option.setAttribute('role', 'menuitemradio');
      option.setAttribute('aria-checked', String(chosen));
      option.toggleClass('is-selected', chosen);
      const box = option.createSpan({ cls: 'to-backlinks-facet-box' });
      box.setAttribute('aria-hidden', 'true');
      if (chosen) {
        // eslint-disable-next-line no-restricted-syntax -- detached DOM before mount
        box.appendChild(checkGlyph());
      }
      option.createSpan({ cls: 'to-backlinks-facet-label', text: label });
      option.addEventListener('click', (event) => {
        event.stopPropagation();
        // One at a time, so choosing an order closes the menu it was chosen
        // from — unlike a facet, where a second value is a normal next move.
        viewStateFor(this.targetPath).openFacet = null;
        void this.source.setBacklinksSort(value as SortOrder);
      });
    }
  }

  /**
   * The revealed row: the search field, then one facet per axis.
   *
   * The row is flush with the CARDS, not with the header. The header's leading
   * gutter is the marker column, which exists to hold the section icon; nothing
   * in this row sits in it.
   *
   * Its shape never changes with width. Search takes what is left over and the
   * facets are fixed, so nothing here competes for space — which is what a
   * facet shedding its word on a narrow footer relies on: only a button's
   * CONTENT changes, and the row cannot reflow.
   */
  private renderFilterRow(root: HTMLElement, axes: FilterAxes, state: ViewState): void {
    if (state.collapsed) return;
    const row = root.createDiv({ cls: 'to-backlinks-filters' });

    const field = row.createDiv({ cls: 'to-backlinks-search-field' });
    const glass = field.createSpan({ cls: 'to-backlinks-search-icon' });
    glass.setAttribute('aria-hidden', 'true');
    // eslint-disable-next-line no-restricted-syntax -- detached DOM before mount
    glass.appendChild(searchGlyph());
    const search = field.createEl('input', { cls: 'to-backlinks-search' });
    // `text`, not `search`. A search input carries Chromium's own cancel
    // button, which reserved room at the field's end whether or not there was
    // anything to clear and sat exactly where this field's own clear control
    // is — so the press that looked like it should empty the field went to the
    // native button instead, which clears the ELEMENT's value and reports it
    // through a `search` event this code does not listen for. The value came
    // straight back on the next repaint, which reads as a control that does
    // nothing.
    search.type = 'text';
    search.placeholder = 'Filter by note name…';
    search.value = state.search;
    search.setAttribute('aria-label', 'Filter by source note name');
    search.dataset.focusKey = 'search';
    search.addEventListener('click', (event) => event.stopPropagation());
    // `input`, not `change`: a filter that waits for blur is a filter the
    // reader has to commit to before seeing what it does.
    search.addEventListener('input', () => {
      const current = viewStateFor(this.targetPath);
      current.search = search.value;
      current.capBonus = 0;
      void this.render();
    });
    search.addEventListener('keydown', (event) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      const current = viewStateFor(this.targetPath);
      current.search = '';
      void this.render();
    });
    if (state.search.length > 0) {
      const clear = field.createEl('button', { cls: 'to-backlinks-search-clear' });
      clear.type = 'button';
      clear.setAttribute('aria-label', 'Clear the name filter');
      // eslint-disable-next-line no-restricted-syntax -- detached DOM before mount
      clear.appendChild(clearGlyph());
      // `click`, like every other control here. It was `mousedown`, to keep the
      // field from blurring before the press was handled — but this footer
      // cancels the default on `pointerdown` to hold the editor's caret, and a
      // cancelled pointerdown takes the compatibility `mousedown` with it. So
      // the handler never ran, and the control that looks like it empties the
      // field did nothing at all. The blur it was avoiding is not a problem
      // either: the same cancelled default is what stops focus moving, and a
      // repaint restores it by key.
      clear.addEventListener('click', (event) => {
        event.stopPropagation();
        const current = viewStateFor(this.targetPath);
        current.search = '';
        void this.render();
      });
    }

    // Kind first: its four values never change, so it is the one facet whose
    // position a reader can learn. Then folder, then tag.
    this.renderFacet(row, state, {
      axis: 'kind',
      word: 'kind',
      glyph: wikilinkGlyph(),
      values: axes.kinds.map((v) => ({ ...v, label: KIND_LABELS[v.value] })),
      selected: state.kinds,
      // Four values, always — nothing to search (design D10).
      findable: false,
    });
    this.renderFacet(row, state, {
      axis: 'folder',
      word: 'folder',
      glyph: folderGlyph(),
      values: axes.folders.map((v) => ({ ...v, label: v.value === '' ? '/' : v.value })),
      selected: state.folders,
      findable: true,
    });
    this.renderFacet(row, state, {
      axis: 'tag',
      word: 'tag',
      glyph: tagGlyph(),
      values: axes.tags.map((v) => ({ ...v, label: '#' + v.value })),
      selected: state.tags,
      findable: true,
    });

    // One control that undoes all of them, offered only while there is
    // something to undo. Each facet can also clear its own axis, but a reader
    // who has narrowed three ways should not have to visit three menus.
    //
    // An icon button rather than a labelled one: a fourth rectangle at the end
    // of three facets reads as another facet.
    //
    // Its SLOT is always here, empty or not. The search field is the one
    // control that grows, so a button appearing at the row's end took its width
    // out of the field — and every facet between them shifted left. Choosing a
    // filter value should not move the control next to the one being used, so
    // the space is reserved and only the button comes and goes.
    const slot = row.createDiv({ cls: 'to-backlinks-reset-slot' });
    if (!this.isFiltering(state)) return;
    const reset = slot.createEl('button', { cls: 'to-backlinks-reset' });
    reset.type = 'button';
    reset.dataset.focusKey = 'reset';
    reset.setAttribute('aria-label', 'Clear filters and search');
    // eslint-disable-next-line no-restricted-syntax -- detached DOM before mount
    reset.appendChild(clearGlyph());
    reset.addEventListener('click', (event) => {
      event.stopPropagation();
      const current = viewStateFor(this.targetPath);
      current.folders.clear();
      current.kinds.clear();
      current.tags.clear();
      current.search = '';
      current.folderQuery = '';
      current.tagQuery = '';
      current.openFacet = null;
      current.capBonus = 0;
      void this.render();
    });
  }

  /**
   * One facet: a button carrying its mark, its word while there is room for it,
   * and a popover of values.
   *
   * The popover is a sibling of the button inside a positioned wrapper rather
   * than an element placed by measurement — the footer rebuilds itself often
   * enough that a computed position would be one repaint behind.
   */
  private renderFacet(row: HTMLElement, state: ViewState, spec: FacetSpec): void {
    if (spec.values.length === 0) return;
    const anchor = row.createDiv({ cls: 'to-backlinks-facet-anchor' });
    const open = state.openFacet === spec.axis;
    const active = spec.selected.size > 0;

    const button = anchor.createEl('button', { cls: 'to-backlinks-facet' });
    button.type = 'button';
    button.dataset.axis = spec.axis;
    button.dataset.focusKey = `facet:${spec.axis}`;
    button.toggleClass('is-active', active || open);
    button.setAttribute('aria-expanded', String(open));
    button.setAttribute('aria-label', spec.word);
    const mark = button.createSpan({ cls: 'to-backlinks-facet-mark' });
    mark.setAttribute('aria-hidden', 'true');
    // eslint-disable-next-line no-restricted-syntax -- detached DOM before mount
    mark.appendChild(spec.glyph);
    button.createSpan({ cls: 'to-backlinks-facet-word', text: this.facetWord(spec) });
    button.addEventListener('click', (event) => {
      event.stopPropagation();
      const current = viewStateFor(this.targetPath);
      current.openFacet = open ? null : spec.axis;
      void this.render();
    });

    if (!open) return;
    this.renderFacetMenu(anchor, state, spec);
  }

  /** What a facet says about itself: its axis until something is chosen, then
   * that choice — a count only once there are too many to name. */
  private facetWord(spec: FacetSpec): string {
    const chosen = spec.values.filter((v) => spec.selected.has(v.value));
    if (chosen.length === 0) return spec.word;
    if (chosen.length === 1) return chosen[0]?.label ?? spec.word;
    return `${chosen.length} ${spec.word}s`;
  }

  private renderFacetMenu(anchor: HTMLElement, state: ViewState, spec: FacetSpec): void {
    const menu = anchor.createDiv({ cls: 'to-backlinks-facet-menu' });
    menu.setAttribute('role', 'group');
    menu.setAttribute('aria-label', spec.word);

    const cap = menu.createDiv({ cls: 'to-backlinks-facet-cap' });
    cap.createSpan({ text: spec.word });
    if (spec.selected.size > 0) {
      const clear = cap.createEl('button', { cls: 'to-backlinks-facet-clear', text: 'Clear' });
      clear.type = 'button';
      clear.addEventListener('click', (event) => {
        event.stopPropagation();
        spec.selected.clear();
        viewStateFor(this.targetPath).capBonus = 0;
        void this.render();
      });
    }

    const query = spec.findable ? this.facetQuery(state, spec.axis) : '';
    if (spec.findable) {
      const find = menu.createDiv({ cls: 'to-backlinks-facet-find' });
      const glass = find.createSpan({ cls: 'to-backlinks-search-icon' });
      glass.setAttribute('aria-hidden', 'true');
      // eslint-disable-next-line no-restricted-syntax -- detached DOM before mount
      glass.appendChild(searchGlyph());
      const input = find.createEl('input', { cls: 'to-backlinks-find-input' });
      // Named by a class of its own rather than reached as `... find input`.
      // Measured: the descendant form matched the element and still lost the
      // background to Obsidian's own input rule, so the box drew a lighter pill
      // inside itself with the caret against its rounded end. The main search
      // field, whose rule names a class ON the element, has never had it.
      input.type = 'text';
      input.placeholder = `Find ${spec.word}…`;
      input.value = query;
      input.setAttribute('aria-label', `Find a ${spec.word}`);
      input.dataset.focusKey = `find:${spec.axis}`;
      input.addEventListener('click', (event) => event.stopPropagation());
      input.addEventListener('input', () => {
        this.setFacetQuery(spec.axis, input.value);
        void this.render();
      });
      // Escape leaves the MENU rather than clearing the box: the box is a way
      // to reach a value, not a filter of its own.
      input.addEventListener('keydown', (event) => {
        if (event.key !== 'Escape') return;
        event.preventDefault();
        const current = viewStateFor(this.targetPath);
        current.openFacet = null;
        void this.render();
      });
    }

    // A SELECTED value stays listed however the box is narrowed. Hiding it
    // would leave a filter in effect with no visible cause and no way to switch
    // it off from the control that set it (design D10).
    const needle = query.trim().toLowerCase();
    const shown = spec.values.filter(
      (v) => spec.selected.has(v.value) || needle === '' || v.label.toLowerCase().includes(needle),
    );

    if (shown.length === 0) {
      menu.createDiv({ cls: 'to-backlinks-facet-none', text: `No ${spec.word} matches` });
      return;
    }

    const list = menu.createDiv({ cls: 'to-backlinks-facet-list' });
    for (const value of shown) {
      const on = spec.selected.has(value.value);
      const option = list.createEl('button', { cls: 'to-backlinks-facet-option' });
      option.type = 'button';
      option.setAttribute('aria-pressed', String(on));
      option.toggleClass('is-selected', on);
      // Nothing left under the other axes' selections. Still offered and still
      // operable — adding it and dropping whatever emptied it is a normal way
      // out — but it says so rather than showing a count that stopped being true.
      option.toggleClass('is-empty', value.notes === 0 && !on);
      const box = option.createSpan({ cls: 'to-backlinks-facet-box' });
      box.setAttribute('aria-hidden', 'true');
      if (on) {
        // eslint-disable-next-line no-restricted-syntax -- detached DOM before mount
        box.appendChild(checkGlyph());
      }
      option.createSpan({ cls: 'to-backlinks-facet-label', text: value.label });
      option.createSpan({ cls: 'to-backlinks-chip-count', text: String(value.notes) });
      option.addEventListener('click', (event) => {
        event.stopPropagation();
        toggleMember(spec.selected, value.value);
        // A narrowed set should not stay behind a cap the wider set consumed.
        viewStateFor(this.targetPath).capBonus = 0;
        void this.render();
      });
    }
  }

  private facetQuery(state: ViewState, axis: FacetAxis): string {
    return axis === 'folder' ? state.folderQuery : state.tagQuery;
  }

  private setFacetQuery(axis: FacetAxis, value: string): void {
    const current = viewStateFor(this.targetPath);
    if (axis === 'folder') current.folderQuery = value;
    else current.tagQuery = value;
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
    // Guides are off by default. The footer is a quotation of a tree, not the
    // tree itself, and at a card's scale the stripes crowded a body that is only
    // ever a few rows deep — indentation alone carries the depth here. The model
    // reports `guideDepths` either way; this is the one site that declines to
    // draw them, so the model has one shape under test rather than one per
    // setting combination (design D7).
    applyLineChrome(
      el,
      lineChrome(row.fact, {
        nativeBlocks: false,
        ...(this.source.backlinksGuides
          ? { guides: plainGuideBackground(row.guideDepths) }
          : {}),
      }),
    );

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
      const icons = this.source.backlinksSegmentIcons;
      // The gutter marker IS the first segment's, so it takes that segment's own
      // state — a task ancestor gets its checkbox and an ordered one its number,
      // the same rule a node row follows. `row.kind` alone gave both of them the
      // generic bullet.
      if (icons !== 'none') {
        // eslint-disable-next-line no-restricted-syntax -- detached DOM: the row is still detached.
        el.appendChild(segmentMarker(row.segments[0], row.kind));
      }
      const content = el.createSpan({ cls: 'to-backlinks-content' });
      row.segments.forEach((segment, i) => {
        // Between two ancestors, so outside both — a separator that sat inside a
        // segment would share that ancestor's link target and open it.
        if (i > 0 && this.source.backlinksSeparator === 'chevron') {
          const sep = content.createSpan({ cls: 'to-backlinks-seg-sep' });
          sep.setAttribute('aria-hidden', 'true');
          // eslint-disable-next-line no-restricted-syntax -- detached DOM: the row is still detached.
          sep.appendChild(separatorGlyph());
        }
        // Each ancestor is its own target. One handler on the row could only
        // open the note, which is not what "a lineage element navigates to that
        // ancestor" promises — a chain is several ancestors on one line.
        const seg = content.createSpan({ cls: 'to-backlinks-seg' });
        // Every ancestor names its own kind. The FIRST one's marker is the
        // row's, already drawn in the gutter above, so only the rest need one
        // here — and it goes inside the segment, not between two of them, so it
        // shares that ancestor's link target and its hover rather than sitting
        // in dead space.
        if (i > 0) {
          if (segment.ordinal) {
            // Its number IS its mark, and the model has taken it out of the
            // text — a bullet here would drop it entirely. Drawn whatever the
            // icon setting says, because it is CONTENT the model removed from
            // the text rather than notation added to it: without it the row
            // reads "Item" where the note reads "10. Item". No gutter slot:
            // this one sits in the text run, where the number needs its own
            // width.
            seg.createSpan({ cls: 'to-backlinks-seg-ord', text: segment.ordinal });
          } else if (icons === 'all') {
            const icon = seg.createSpan({ cls: 'to-backlinks-seg-icon' });
            // eslint-disable-next-line no-restricted-syntax -- detached DOM: the row is still detached.
            icon.appendChild(segmentGlyph(segment));
          }
        }
        // Already stripped by the model, which owns the rule so that a segment
        // and a node row of the same kind say the same thing.
        seg.appendText(segment.text);
        // Focusable AND operable. `role="link"` with a tab stop and no key
        // handler is a control the keyboard can reach and cannot use, which is
        // worse than one it cannot reach at all — it advertises itself and then
        // does nothing.
        seg.setAttribute('role', 'link');
        seg.tabIndex = 0;
        seg.addEventListener('click', (event) => {
          event.stopPropagation();
          this.open(event, sourcePath, segment.nodeId);
        });
        seg.addEventListener('keydown', (event) => {
          if (event.key !== 'Enter') return;
          // `open` BEFORE `preventDefault`, not after. Its first guard is
          // `event.defaultPrevented`, which exists to let a nested link that has
          // already handled itself win — so preventing the default first made
          // this handler veto its own call, and Enter on a segment did nothing
          // at all. Shipped that way: the segment was focusable and inert, which
          // is worse than not being reachable.
          this.open(event, sourcePath, segment.nodeId);
          event.preventDefault();
          event.stopPropagation();
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
    // Reachable AND operable from the keyboard, on the same terms as a lineage
    // segment. The row was clickable and nothing else: a keyboard-only reader
    // could tab to the links INSIDE a mention — which go to the link's own
    // target — and had no way at all to reach the thing the row is for, which is
    // the referencing node. `role="link"` without a key handler would be worse
    // than nothing: it advertises a control the keyboard can reach and cannot
    // use.
    el.setAttribute('role', 'link');
    el.tabIndex = 0;
    el.addEventListener('click', (event) => this.open(event, sourcePath, row.nodeId));
    el.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter') return;
      // A nested link owns Enter when the focus is on IT, not on the row.
      if (event.target !== el) return;
      // Order matters — see the segment handler above.
      this.open(event, sourcePath, row.nodeId);
      event.preventDefault();
    });
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
      el.setText(decodeEntities(row.markdown));
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
  private open(event: MouseEvent | KeyboardEvent, sourcePath: string, nodeId?: number): void {
    // A nested link or control owns its own click. `defaultPrevented` covers
    // Obsidian's own internal links, which handle themselves.
    const target = event.target as HTMLElement | null;
    if (event.defaultPrevented || target?.closest('a, button')) return;

    // `isModEvent` reads the modifier keys, which a KeyboardEvent carries just
    // as a MouseEvent does — so Mod+Enter on a segment opens a new pane the
    // same way Mod+click does.
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
 * A lineage segment's mark, by the same rule `markerFor` applies to a node row:
 * a task's checkbox and an ordered item's number replace the bullet, because
 * they are state the reader is looking for rather than presentation (D18).
 *
 * `fallbackKind` covers a chain with no elements, which the model does not
 * produce but the type permits.
 */
function segmentMarker(segment: LineageSegment | undefined, fallbackKind: NodeKind): HTMLElement {
  if (!segment) return markerSlot(buildMarkerIcon(fallbackKind));
  if (segment.task !== undefined) return markerSlot(checkboxGlyph(segment.task));
  if (segment.ordinal) return ordinalMarker(segment.ordinal);
  return markerSlot(buildMarkerIcon(segment.kind));
}

/** The same choice as `segmentMarker`, as a bare glyph for an INLINE segment
 * icon — which sits in the text run and needs no gutter slot around it. An
 * ordered segment never reaches here: its number is drawn as text instead,
 * since no fixed-width icon box holds `10.`. */
function segmentGlyph(segment: LineageSegment): Element {
  if (segment.task !== undefined) return checkboxGlyph(segment.task);
  return buildMarkerIcon(segment.kind);
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
 * An HTML block's entities, decoded — `&amp;` shown as `&`.
 *
 * `htmlTextOf` deliberately leaves them encoded and says "left to the DOM", but
 * the DOM never saw them: `setText` writes textContent, which ESCAPES rather
 * than decodes, so a block containing `A &amp; B` displayed the ampersand's
 * source instead of the ampersand.
 *
 * `DOMParser` rather than `innerHTML` on a scratch element: it parses without a
 * live document, so nothing loads, runs, or is inserted anywhere. Safe on
 * content this plugin does not control, which a note's HTML block is. The result
 * still goes through `setText`, so a decoded `&lt;script&gt;` stays the text
 * `<script>` and is never markup.
 */
function decodeEntities(text: string): string {
  if (!text.includes('&')) return text;
  return (
    new DOMParser().parseFromString(text, 'text/html').documentElement.textContent ?? text
  );
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

/**
 * The chevron, in both the orientations this file needs.
 *
 * Both chevrons in the footer — fold and cap — come from this one path.
 *
 * It was the lineage separator too, before every segment gained its own icon
 * and the separator went. Before that it was the text glyph `❯` (U+276F), a
 * DINGBAT most UI fonts do not carry: it rendered from whatever fallback the
 * platform chose, at a weight and baseline nobody picked and differing between
 * machines. Worth keeping in mind for any future mark — an SVG has none of that.
 */
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
      // `side: 1`. At the END of a line a block widget with a NEGATIVE side
      // sorts inside that line and splits it, leaving an empty second half
      // rendered BELOW the widget — measured, and it is a real line: it takes
      // the caret, so a click anywhere under the footer put the cursor there,
      // on a position after the content the footer sits after.
      side: 1,
      block: true,
    }).range(state.doc.length),
  ]);
}

/** What a group's height cap is holding back, once it is measurable. */
interface Omission {
  /** References hidden, which is what a reader is counting. */
  readonly count: number;
  /** The depth of the first hidden row, so the rung sits where they would. */
  readonly depth: number;
}

/**
 * What the cap clipped, read off the settled layout.
 *
 * The rows were appended in `rows` order and each produced exactly one element,
 * so the two are index-aligned and a clipped element names its own row's depth.
 * Measured against the body's own top rather than `offsetTop`, which is
 * relative to whichever ancestor happens to be positioned.
 *
 * References are counted rather than rows: a lineage row is context for the
 * reference under it, and "3 more" means three more mentions. A clip that
 * caught only context still reports the rows it caught, so the rung never
 * reads "0 more".
 */
function omissionBelow(body: HTMLElement, rows: readonly FooterRow[]): Omission | null {
  const kids = Array.from(body.children) as HTMLElement[];
  if (kids.length !== rows.length) return null;
  const limit = body.getBoundingClientRect().top + body.clientHeight;

  let first = -1;
  let references = 0;
  let clipped = 0;
  kids.forEach((el, i) => {
    if (el.getBoundingClientRect().bottom <= limit) return;
    if (first === -1) first = i;
    clipped++;
    const row = rows[i];
    if (row?.type === 'node' && row.isReference) references++;
  });

  if (first === -1) return null;
  return { count: references > 0 ? references : clipped, depth: rows[first]?.depth ?? 0 };
}

/**
 * The sort control's mark: an arrow beside bars that shorten along it.
 *
 * Bars alone were three shortening lines, which is also what a paragraph looks
 * like at this size — the two marks sat a few pixels apart in the same header
 * and read as the same thing. The arrow is what makes it a sort figure rather
 * than a picture of text: it names the direction the bars are ordered in, and
 * it is the form the icon has settled into across editors.
 */
function sortGlyph(): SVGSVGElement {
  return glyph(
    24,
    ['M6 4v15', 'M3 16l3 3 3-3', 'M12 6h9', 'M12 12h6', 'M12 18h3'],
    {
      fill: 'none',
      stroke: 'currentColor',
      'stroke-width': '2',
      'stroke-linecap': 'round',
      'stroke-linejoin': 'round',
    },
  );
}

/** Reset's mark: a cross, which is what clearing looks like everywhere else. */
function clearGlyph(): SVGSVGElement {
  return glyph(24, ['M6 6l12 12', 'M18 6L6 18'], {
    fill: 'none',
    stroke: 'currentColor',
    'stroke-width': '2',
    'stroke-linecap': 'round',
  });
}

/** What stands between two ancestors when the separator setting asks for one. */
function separatorGlyph(): SVGSVGElement {
  return glyph(24, ['M9 5l7 7-7 7'], {
    fill: 'none',
    stroke: 'currentColor',
    'stroke-width': '2',
    'stroke-linecap': 'round',
    'stroke-linejoin': 'round',
  });
}

/** The rung's own mark: an omission, in the place a marker would be. */
function ellipsisGlyph(): SVGSVGElement {
  return glyph(24, ['M6 12h.01', 'M12 12h.01', 'M18 12h.01'], {
    fill: 'none',
    stroke: 'currentColor',
    'stroke-width': '3',
    'stroke-linecap': 'round',
  });
}

/** The three axes, in the order they sit in the row. */
type FacetAxis = 'kind' | 'folder' | 'tag';
/** Sort is not an axis — it does not filter — but its menu is one of the same
 * set of popovers, so it shares the slot that keeps only one of them open. */
type OpenPopover = FacetAxis | 'sort';

/** Everything one facet needs; the axes differ only in these fields. */
interface FacetSpec {
  readonly axis: FacetAxis;
  readonly word: string;
  readonly glyph: SVGSVGElement;
  readonly values: readonly { value: string; notes: number; label: string }[];
  readonly selected: Set<string>;
  /** Whether the axis's value set is unbounded, and so carries a find box. */
  readonly findable: boolean;
}

const SORT_LABELS: Record<SortOrder, string> = {
  recent: 'Recently modified',
  oldest: 'Oldest first',
  name: 'Note name',
  references: 'Most references',
};

/** Kind names as a reader would say them (docs/research/18, D14). */
const KIND_LABELS: Record<ReferenceKind, string> = {
  note: 'Note',
  anchor: 'Anchor',
  embed: 'Embed',
  property: 'Property',
};

/** Focus-on in one line: absent means the axis is not filtering. */
function toggleMember<T>(set: Set<T>, value: T): void {
  if (!set.delete(value)) set.add(value);
}

function searchGlyph(): SVGSVGElement {
  // The lens as arcs rather than a `circle`: `glyph` builds paths, and one
  // element kind keeps every mark in this file made the same way.
  return glyph(24, ['M16 11a5 5 0 1 1-10 0 5 5 0 0 1 10 0', 'M19.5 19.5l-4.9-4.9'], {
    fill: 'none',
    stroke: 'currentColor',
    'stroke-width': '2',
    'stroke-linecap': 'round',
  });
}

/** A tick, for a facet value that is selected. */
function checkGlyph(): SVGSVGElement {
  return glyph(24, ['M5 13l4 4L19 7'], {
    fill: 'none',
    stroke: 'currentColor',
    'stroke-width': '2.6',
    'stroke-linecap': 'round',
    'stroke-linejoin': 'round',
  });
}

function folderGlyph(): SVGSVGElement {
  return glyph(24, ['M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z'], {
    fill: 'none',
    stroke: 'currentColor',
    'stroke-width': '2',
    'stroke-linejoin': 'round',
  });
}

function tagGlyph(): SVGSVGElement {
  return glyph(24, ['M5 9h14', 'M5 15h14', 'M10 4L8 20', 'M17 4l-2 16'], {
    fill: 'none',
    stroke: 'currentColor',
    'stroke-width': '2',
    'stroke-linecap': 'round',
  });
}

/**
 * The kind axis's mark: `[[]]`, the syntax it filters.
 *
 * Four brackets closed to a THREE-unit centre gap — measured down against the
 * rendered glyph until the inner pair stopped resolving, then back one step.
 * Drawn a little larger than the other marks because a bracket is lighter ink
 * than a filled outline, and matching their numbers makes it look smaller.
 */
function wikilinkGlyph(): SVGSVGElement {
  return glyph(
    24,
    ['M6.7 5H4.1v14h2.6', 'M10.5 5H7.9v14h2.6', 'M13.5 5h2.6v14h-2.6', 'M17.3 5h2.6v14h-2.6'],
    {
      fill: 'none',
      stroke: 'currentColor',
      'stroke-width': '1.7',
      'stroke-linecap': 'round',
      'stroke-linejoin': 'round',
    },
  );
}

/** The filter affordance's glyph — a funnel. The active dot is drawn by CSS,
 * so the glyph itself says nothing about state. */
function filterGlyph(): SVGSVGElement {
  // Deliberately NOT `to-backlinks-icon`: that class is absolutely positioned
  // into the marker gutter, which is the section icon's place and not a
  // control's.
  return glyph(24, ['M3 5h18l-7 8v6l-4 2v-8z'], {
    fill: 'none',
    stroke: 'currentColor',
    'stroke-width': '1.8',
    'stroke-linejoin': 'round',
  });
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

/**
 * Wakes the footer's `StateField` in EVERY open markdown editor.
 *
 * Bumping the revision does not itself wake anything: `refreshBridge` is a
 * ViewPlugin, and a ViewPlugin only observes the revision on ITS OWN view's
 * next update. Nudging the active view therefore left every other visible
 * footer stale — a note open in two splits, or the setting turned off while a
 * second pane showed a footer, until that editor happened to receive an
 * unrelated transaction.
 *
 * A dispatch with no changes and no selection is not an edit: it produces no
 * document change and nothing for the transaction filter to classify. It exists
 * only so each view runs its update cycle once.
 */
export function nudgeFooters(app: App): void {
  for (const leaf of app.workspace.getLeavesOfType('markdown')) {
    const view = leaf.view;
    if (!(view instanceof MarkdownView)) continue;
    const cm = (view.editor as unknown as { cm?: EditorView }).cm;
    if (cm) cm.dispatch({ effects: refreshFooter.of() });
  }
}
