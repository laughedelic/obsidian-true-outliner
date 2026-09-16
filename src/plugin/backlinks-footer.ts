/**
 * The backlinks footer: every reference to the open note, in the tree of the
 * note it came from, below the note's own content.
 *
 * ## Mechanism (spikes S1 and S2, docs/research/backlinks-footer-spikes)
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
  MarkdownView,
  TFile,
  editorInfoField,
  getAllTags,
  type App,
} from 'obsidian';
import { isOutlineMode } from './outline-state';
import { nestedEditorField } from './nested-editor';
import { contentEndAnchor } from './zoom-scope';
import { chevronGlyph, glyph, makeDisclosure } from './chrome-controls';
import { markMatches, renderInline } from './inline-render';
import { renderGroupHead, renderRow, type LineageListOptions } from './lineage-list';
import { markerSlot } from './lineage-row';
import {
  OWN_CHROME_CLASS,
  applyLineChrome,
  lineChrome,
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
  admitByAxes,
  admitReferences,
  applyControls,
  orderAndCap,
  axesOf,
  type AdmittedGroup,
  type ControlsResult,
  type ControlsState,
  type FilterAxes,
  type SortOrder,
  type SourceRefs,
} from './footer-filter';
import {
  GROUP_HEIGHT_CSS,
  OVERALL_CAP_REFERENCES,
  SORT_ORDER_LABELS,
  type GroupHeight,
  type LineageSeparator,
  type OverallCap,
  type SegmentIcons,
} from './settings/footer';
import type { GuideVisibility } from './settings/appearance';
import type { PlacedReference, PlacedSource, ReferenceKind } from './backlink-index';
import type { BacklinkIndex } from './backlink-index';
import type { OutlineNode } from '../model';
import { nodeStartLine } from '../locate';

export const FOOTER_CLASS = 'to-backlinks';

export interface FooterSource {
  readonly app: App;
  readonly backlinks: BacklinkIndex;
  /** Whether the footer renders at all. */
  readonly backlinksFooter: boolean;
  /** Bumped when something outside editor state changes what the footer would
   * show — the setting, or the index. Outline mode is no longer one of them:
   * it lives in editor state now, so a mode toggle is a transaction the
   * footer's own field recomputes on. See `refreshBridge`. */
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
  /** The guide layer's own visibility. The footer keeps its own setting, and
   * additionally draws nothing while the layer is off — that switch is a
   * statement about the outline's chrome, not about one surface. Its other two
   * states have no referent here: a footer has no caret, and every row's
   * lineage begins at its source note's own root. */
  readonly guideVisibility: GuideVisibility;
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
   * Sources placed by the term-active counting pass, for the fills that follow
   * it. Null whenever no term is active, which is when nothing has been placed
   * ahead of the fills and `place()` is the fill's own first read.
   */
  private placedSources: Map<string, PlacedSource> | null = null;
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
    // Inside the footer, on `click` and NOT `pointerdown`, and that is not a
    // detail. Dismissing at pointerdown repaints the footer before the browser
    // has acted on the press — so clicking the search field while a menu was
    // open destroyed the input the press was about to focus, and the term the
    // reader then typed went into the note. Caught by the read-only spec, which
    // is what it is for. By `click` the focus has landed, and the repaint's own
    // focus restoration carries it across.
    //
    // OUTSIDE it, on `pointerdown`, because a click is not guaranteed to
    // arrive. A press the editor's own gestures take never becomes one: the
    // guide gesture folds at pointerdown, which re-renders the lines under the
    // pointer, and the browser then has no click to deliver — measured, the
    // document saw the press and the release and nothing else, and the popover
    // stayed open behind a fold the reader had just made. Nothing about the
    // focus hazard applies out there: the press belongs to the note, and the
    // footer has no element in it to destroy.
    this.el.doc.addEventListener('pointerdown', this.closeOnOutsidePress, true);
    this.el.doc.addEventListener('click', this.closeOnOutsideClick, true);
    this.component.load();
    void this.render();
  }

  /**
   * Whether this controller still has a place in the document.
   *
   * Its two dismissal listeners are on the DOCUMENT, so they keep firing after
   * the element they speak for has left it — and a controller with a detached
   * element contains nothing, so every press reads as "outside" and every
   * popover closes, including a press on an option inside the live footer.
   *
   * That state is reachable: folding a subtree takes the footer out of the
   * viewport, the widget is rebuilt when it comes back, and the controller that
   * was there before is not always told (measured: two live controllers, one of
   * them detached, both still listening). Guarded rather than disposed, because
   * a detached element is also the ordinary state of a block widget scrolled
   * out of view, which comes back.
   */
  private get placed(): boolean {
    return this.el.isConnected;
  }

  /** Bound once so it can be removed again; see the constructor. */
  private readonly closeOnOutsideClick = (event: Event): void => {
    if (!this.placed) return;
    const state = viewStates.get(this.targetPath);
    if (!state || state.openFacet === null) return;
    const target = event.target as HTMLElement | null;
    if (target && this.el.contains(target) && target.closest('.to-backlinks-facet-anchor')) return;
    state.openFacet = null;
    void this.render();
  };

  /** The same dismissal, for a press that lands outside the footer entirely —
   * where waiting for a click risks waiting for one that never comes. */
  private readonly closeOnOutsidePress = (event: Event): void => {
    if (!this.placed) return;
    const state = viewStates.get(this.targetPath);
    if (!state || state.openFacet === null) return;
    const target = event.target as HTMLElement | null;
    if (target && this.el.contains(target)) return;
    state.openFacet = null;
    void this.render();
  };

  destroy(): void {
    this.generation++;
    this.el.doc.removeEventListener('pointerdown', this.closeOnOutsidePress, true);
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
    const state = viewStateFor(this.targetPath);
    const sources = this.sourceRefs();
    const controls = this.controls(state);
    const axes = axesOf(sources, controls);
    // A selected value that stopped existing is DROPPED, not merely
    // discounted for this one pass. `filterSources` already treats it as
    // absent when deciding what to admit (`live()`), but the facet's own
    // checkbox, its active dot and its word all read `state.folders` /
    // `state.kinds` / `state.tags` DIRECTLY — a value only discounted at
    // filtering time would still draw as selected, and would silently
    // reactivate with no action from the reader if it ever reappeared
    // (design Risks: "a selection whose value is absent... is dropped").
    // `axes` already carries exactly the present values per axis, computed
    // from the sources rather than from any current selection, which is what
    // makes it the right thing to prune against.
    this.pruneDeadSelections(state, axes);

    // With no term the controls decide everything BEFORE a source note is
    // read: the folder is part of the path and the kind is on the reference,
    // so `place()` is never called for a group the cap did not admit. That is
    // what makes the cap's "an excluded note is never read" property true, and
    // it is unchanged by this change (design D1, D2).
    if (controls.search.trim().length === 0) {
      this.placedSources = null;
      this.paint(generation, state, axes, sources, applyControls(sources, controls));
      return;
    }

    // A term is answered from a source's CONTENT, which no summary carries, so
    // every axis-admitted source is placed and the term decides afterwards —
    // then the sort and the cap run over what it admitted (design D1).
    //
    // Nothing is painted while that happens. The footer on screen is the one
    // the previous pass built, so its totals stay up rather than being replaced
    // by a skeleton or a zero (docs/research/structured-backlinks, D11), and
    // the field the reader is typing into is never rebuilt under them.
    const counted = await this.countPlaced(generation, sources, controls);
    if (counted === null) return;
    this.paint(generation, state, axes, sources, orderAndCap(counted, controls));
  }

  /**
   * Places every axis-admitted source and asks the controls what each admits.
   *
   * Returns null when a later pass has started — the reader typed on — so a
   * stale answer never reaches the DOM. The reads run together rather than in
   * turn: they are independent, and a hub note's sources are the case this is
   * paid on.
   */
  private async countPlaced(
    generation: number,
    sources: readonly SourceRefs[],
    controls: ControlsState,
  ): Promise<AdmittedGroup[] | null> {
    const admitted = admitByAxes(sources, controls);
    const placedSources = await Promise.all(
      admitted.map((group) => this.source.backlinks.place(this.targetPath, group.path)),
    );
    if (generation !== this.generation) return null;

    const placed = new Map<string, PlacedSource>();
    const counted: AdmittedGroup[] = [];
    admitted.forEach((group, i) => {
      const source = placedSources[i];
      if (!source) return;
      placed.set(group.path, source);
      counted.push({ ...group, count: admitReferences(source, controls).count });
    });
    // Handed to `fillGroup` so a source read for the counts is not read again
    // for its rows.
    this.placedSources = placed;
    return counted;
  }

  /**
   * Draws the footer from a decided result.
   *
   * Both pipelines end here, so the header, the filter row, the group cards and
   * the tail are laid out by one piece of code whatever decided what goes in
   * them.
   */
  private paint(
    generation: number,
    state: ViewState,
    axes: FilterAxes,
    sources: readonly SourceRefs[],
    result: ControlsResult,
  ): void {
    this.component.unload();
    this.component.load();

    // Built DETACHED, then swapped in with a single mutation. The plugin's
    // DOM-insertion guard exists because appending into a live `.cm-line`
    // sends CM6's mutation observer into a feedback loop (outline-decorations
    // hardening 5.2, measured at 100%+ CPU). A block widget's own subtree is
    // not that case, but building off-tree and swapping once keeps the number
    // of mounted-DOM mutations at one either way, which is cheap insurance.
    const root = createDiv();

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
      renderGroupHead(card, {
        name,
        folder,
        count: group.count,
        collapsed,
        onToggle: () => {
          const groups = viewStateFor(this.targetPath).collapsedGroups;
          if (collapsed) groups.delete(group.path);
          else groups.add(group.path);
          void this.render();
        },
      });
      if (collapsed) continue;

      const body = card.createDiv({ cls: 'to-backlinks-rows' });
      // Capped by HEIGHT rather than by row count: what makes a group hard to
      // skim is how much of the screen it takes, and ten short rows take less
      // than three long ones. The threshold is a custom property so a setting
      // can drive it without this code knowing (docs/research/structured-backlinks, D10).
      body.toggleClass('is-capped', !state.expandedGroups.has(group.path));
      body.createDiv({ cls: 'to-backlinks-resolving', text: 'resolving…' });
      bodies.push({ path: group.path, body, card });
    }

    this.renderTail(root, result, this.controls(state).cap);

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
   * (docs/research/structured-backlinks, D10) — so the last card fades as well, and a list that
   * is complete gets none of the three.
   */
  private renderTail(root: HTMLElement, result: ControlsResult, effectiveCap: number): void {
    const { shortfall } = result;
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
    //
    // The increment is AT LEAST one tranche, but never less than what the very
    // next omitted group needs to fit. A fixed tranche alone can be smaller
    // than that group — a hub note with a 90-reference source right past a
    // 25-reference cap needs more than one click's worth just to reach it,
    // and every click in between repaints an IDENTICAL list, which reads as a
    // broken control rather than as "keep clicking". The label has to promise
    // the same number the click delivers, so this is computed once and used
    // for both. `admittedReferences` is what the cap actually let through
    // this render (never more than `effectiveCap`, per D2); raising the cap
    // to admitted + the next group's own size is exactly enough to cross it.
    const tranche = OVERALL_CAP_REFERENCES[this.source.backlinksOverallCap];
    const admittedReferences = result.totals.references - result.shortfall.references;
    const needed = result.nextOmittedReferences ?? 0;
    const minIncrement = Math.max(
      Number.isFinite(tranche) ? tranche : 0,
      admittedReferences + needed - effectiveCap,
    );
    const next = minIncrement > 0 ? `Load ${minIncrement} more` : 'Load more';
    more.createSpan({ cls: 'to-backlinks-more-count', text: next });
    more.setAttribute('aria-label', next);
    more.addEventListener('click', (event) => {
      event.stopPropagation();
      viewStateFor(this.targetPath).capBonus += minIncrement;
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
    // A term-active pass already read every source it admitted, to count them.
    // Reading again here would double the work the design budgets once per
    // keystroke (design D1, risks).
    const placed =
      this.placedSources?.get(sourcePath) ??
      (await this.source.backlinks.place(this.targetPath, sourcePath));
    if (generation !== this.generation || !placed) return;

    const state = viewStateFor(this.targetPath);
    // The controls narrowed this GROUP's admitted count upstream, but `place()`
    // knows nothing of them and locates every reference in the source. Undone
    // here: a node the controls do not admit stops being a hit — falling back
    // to plain lineage context if some OTHER node still matches, and
    // disappearing from the tree entirely if it does not — and an excluded
    // property reference is dropped outright. Without this, selecting Embed
    // still rendered Note and Property rows from the same source; only the
    // count read as embeds-only.
    //
    // The SAME function the counts came from (design D5). It used to be a
    // hand-rolled kind narrowing here and a separate one upstream, which is
    // exactly the pair the term would have made a trio of.
    const admitted = admitReferences(placed, this.controls(state));
    const hitOf = (node: OutlineNode): PlacedReference | undefined =>
      admitted.nodes.has(node.id) ? placed.refs.get(node.id) : undefined;
    const matches = (node: OutlineNode): boolean => admitted.nodes.has(node.id);
    const properties = admitted.properties;

    const rows = buildRows(
      placed.doc,
      matches,
      properties,
      hitOf,
      (node: OutlineNode) => state.expandedRows.has(`${sourcePath}:${node.id}`),
    );

    const built = createDiv();
    // Collected so the truncation measurement below happens against the rows as
    // they will actually be, not as they are a frame after being appended.
    const pending: Promise<void>[] = [];
    for (const row of rows) renderRow(built, sourcePath, row, pending, this.listOptions());
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
      // have occupied, saying how many there are (docs/research/structured-backlinks, D10).
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
   * Removes a selection whose value no longer exists among `axes`' own
   * values, from the STORED state rather than only from a computation over
   * it. See the call site's comment for why this has to reach the persisted
   * Sets and not just discount the value while filtering.
   *
   * Covered by a unit test at the model level (`footer-filter.test.ts`, "drops
   * a selected tag that stops existing") and by a negative control here
   * (revert this call, the render-layer behaviour it fixes fails) rather than
   * by a standing e2e case: the one written for it edited a fixture file and
   * waited on Obsidian's own metadata reindex, which measurably slows deep
   * into a long test session and made the case flake in the full suite while
   * passing every time in isolation. Not worth chasing further given the fix
   * is otherwise fully verified.
   */
  private pruneDeadSelections(state: ViewState, axes: FilterAxes): void {
    const prune = <T>(selected: Set<T>, present: readonly { readonly value: T }[]): void => {
      const live = new Set(present.map((v) => v.value));
      for (const value of selected) if (!live.has(value)) selected.delete(value);
    };
    prune(state.folders, axes.folders);
    prune(state.kinds, axes.kinds);
    prune(state.tags, axes.tags);
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

  /**
   * The term in force, or '' when none is.
   *
   * Read at RENDER time rather than passed down: a row is rendered from an
   * awaited `MarkdownRenderer` call, and a term captured when the pass started
   * would mark a row the reader has already retyped past. The generation guard
   * throws that row away either way; reading the live term means it was never
   * marked wrongly in the first place.
   */
  /**
   * What the shared list draws the footer's rows with.
   *
   * One place, rather than a branch inside the renderer: the settings, the view
   * state and the re-render a fold triggers are the footer's own, and the list
   * is told them rather than reaching for them. A second surface answers the
   * same shape differently and the rows come out identical.
   */
  private listOptions(): LineageListOptions {
    return {
      icons: this.source.backlinksSegmentIcons,
      separator: this.source.backlinksSeparator,
      // Two conditions, not one: its own setting, and the guide layer being
      // drawn at all. A reader who turned the layer off does not expect it here.
      guides: this.source.backlinksGuides && this.source.guideVisibility !== 'off',
      folds: {
        expanded: (sourcePath, nodeId) =>
          viewStateFor(this.targetPath).expandedRows.has(`${sourcePath}:${nodeId}`),
        toggle: (sourcePath, nodeId) => {
          const rows = viewStateFor(this.targetPath).expandedRows;
          const key = `${sourcePath}:${nodeId}`;
          if (rows.has(key)) rows.delete(key);
          else rows.add(key);
          void this.render();
        },
      },
      renderContent: (el, row, sourcePath) => this.renderContent(el, row, sourcePath),
      renderSegment: (el, segment, sourcePath) => this.renderSegment(el, segment, sourcePath),
      renderProperty: (el, markdown, sourcePath) => this.renderMarkdown(el, markdown, sourcePath),
      onActivateSegment: (segment, event, sourcePath) =>
        this.open(event, sourcePath, segment.nodeId),
      onActivateRow: (row, event, sourcePath) => this.open(event, sourcePath, row.nodeId),
    };
  }

  private activeTerm(): string {
    return viewStateFor(this.targetPath).search.trim();
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
   * this thing with nothing in it (docs/research/structured-backlinks, D9). One shape means one
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

    // The disclosure role lives on this title group, not on `head` itself —
    // `head` also carries the filter and sort buttons once `renderHeaderControls`
    // runs, and a `role="button"` ancestor of real `<button>` descendants is an
    // anti-pattern assistive tech is not required to handle: it may flatten or
    // misreport the buttons inside it. `head` stays the click target for the
    // whole row (D-fold), it just no longer claims the ARIA role for it.
    const title = head.createDiv({ cls: 'to-backlinks-head-title' });
    if (foldable) makeDisclosure(title, !collapsed, 'Structured backlinks');
    if (foldable) {
      const chevron = title.createSpan({ cls: 'to-backlinks-chevron' });
      // eslint-disable-next-line no-restricted-syntax -- detached DOM before mount
      chevron.appendChild(chevronGlyph(!collapsed));
    }
    // `title` is inside the off-tree root this pass is building; nothing here
    // is mounted until `swap`.
    // eslint-disable-next-line no-restricted-syntax -- detached DOM before mount
    title.appendChild(linkGlyph());
    // Two spans, one word each, swapped by the same container query the
    // facets already use — a narrow footer no longer wraps the title onto a
    // second line. Only one of the two is ever visible.
    title.createSpan({ cls: 'to-backlinks-title to-backlinks-title-full', text: 'Structured backlinks' });
    title.createSpan({ cls: 'to-backlinks-title to-backlinks-title-short', text: 'Backlinks' });

    const refs = `${totals.references} ${totals.references === 1 ? 'reference' : 'references'}`;
    const counts =
      totals.references > 0
        ? `${refs} · ${totals.notes} ${totals.notes === 1 ? 'note' : 'notes'}`
        : refs;
    title.createSpan({ cls: 'to-backlinks-totals to-backlinks-totals-full', text: counts });

    // The narrow form: both numbers with none of the words, the second one
    // bold so the pair still reads as two different counts rather than one
    // number with a stray dot in it. An icon per count was tried and dropped —
    // this footer already carries a mark for every axis and every kind, and a
    // third vocabulary for the same two numbers was more to parse, not less.
    const compact = title.createSpan({ cls: 'to-backlinks-totals to-backlinks-totals-compact' });
    compact.createSpan({ text: String(totals.references) });
    if (totals.references > 0) {
      compact.createSpan({ text: ' · ' });
      compact.createSpan({ cls: 'to-backlinks-totals-notes', text: String(totals.notes) });
    }

    if (!foldable) return;
    // The controls go AFTER the title group, as a sibling rather than a
    // descendant of it, and stop the click that folds the section, so
    // operating one never also collapses what it just changed.
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
    // `aria-expanded` says whether the ROW is open, which is a different fact
    // from whether it is narrowing anything — a screen-reader user with the
    // row closed heard the same "Show filters" whether or not results were
    // being held back, where a sighted reader had the dot. Said in the name
    // instead, so it reaches both.
    const active = this.isFiltering(state);
    filters.toggleClass('is-active', active);
    filters.setAttribute('aria-expanded', String(state.filtersOpen));
    const verb = state.filtersOpen ? 'Hide filters' : 'Show filters';
    filters.setAttribute('aria-label', active ? `${verb} (active)` : verb);
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
    button.setAttribute('aria-label', `Sort backlinks — ${SORT_ORDER_LABELS[current]}`);
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
    const list = menu.createDiv({ cls: 'to-backlinks-facet-list to-backlinks-sort-list' });
    for (const [value, label] of Object.entries(SORT_ORDER_LABELS)) {
      const chosen = value === current;
      // No box: a facet's box says "on or off", which is right for a set of
      // independent toggles and wrong for four mutually exclusive orders. One
      // row, and the chosen one reads as chosen from its own weight and colour
      // rather than from a mark beside it.
      const option = list.createEl('button', {
        cls: 'to-backlinks-facet-option to-backlinks-sort-option',
      });
      option.type = 'button';
      option.setAttribute('role', 'menuitemradio');
      option.setAttribute('aria-checked', String(chosen));
      option.toggleClass('is-selected', chosen);
      // Choosing an order closes the menu the option lived in, so the option
      // is gone by the next repaint — the same key as the trigger it opened
      // from hands focus back there instead of losing it (D-focus).
      option.dataset.focusKey = 'sort';
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
    search.placeholder = 'Filter…';
    search.value = state.search;
    search.setAttribute('aria-label', 'Filter references by content or source note name');
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
      // A narrowed set should not stay behind a cap the wider set consumed —
      // the same rule every other filter change follows. Escape is a filter
      // change like typing is, and had been missing this.
      current.capBonus = 0;
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
        // See the note on the Escape handler just above — the same rule.
        current.capBonus = 0;
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

    // One control at the row's end, and it is always there.
    //
    // It undoes all three axes and the term at once — each facet can clear its
    // own, but a reader who has narrowed three ways should not have to visit
    // three menus. An icon button rather than a labelled one: a fourth
    // rectangle at the end of three facets reads as another facet.
    //
    // It carries a SECOND action rather than coming and going, and the reason
    // is the row's shape. The search field is the one control that grows, so a
    // button appearing at the end took its width out of the field and shifted
    // every facet between them; reserving the space fixed the shift but left a
    // hole where the button was not. So the space is filled: with nothing
    // selected the same cross closes the row it sits in, which is the other
    // thing a reader wants from a control in that position and is what a cross
    // at the end of a row means anyway.
    const filtering = this.isFiltering(state);
    const slot = row.createDiv({ cls: 'to-backlinks-reset-slot' });
    const reset = slot.createEl('button', { cls: 'to-backlinks-reset' });
    reset.type = 'button';
    reset.dataset.focusKey = 'reset';
    // Which of the two it is, said in the DOM as well as in the label: the
    // glyph is the same either way, and a caller — a test, a stylesheet —
    // should not have to infer the mode from the state of three axes.
    reset.dataset.mode = filtering ? 'clear' : 'close';
    reset.toggleClass('is-clearing', filtering);
    reset.setAttribute('aria-label', filtering ? 'Clear filters and search' : 'Hide filters');
    // eslint-disable-next-line no-restricted-syntax -- detached DOM before mount
    reset.appendChild(clearGlyph());
    reset.addEventListener('click', (event) => {
      event.stopPropagation();
      const current = viewStateFor(this.targetPath);
      current.openFacet = null;
      if (!filtering) {
        current.filtersOpen = false;
        void this.render();
        return;
      }
      current.folders.clear();
      current.kinds.clear();
      current.tags.clear();
      current.search = '';
      current.folderQuery = '';
      current.tagQuery = '';
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
    // `aria-label` overrides the descendant text a sighted reader sees, so it
    // has to carry the same state — the bare axis word would tell a screen
    // reader "kind" no matter how many kinds are chosen.
    button.setAttribute('aria-label', this.facetWord(spec));
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
      // Multi-select keeps the menu open, so this same option is still in the
      // repainted list under the same value — a per-value key lets focus
      // survive the toggle instead of the reader landing back at the trigger.
      option.dataset.focusKey = `facet:${spec.axis}:${value.value}`;
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
  ): Promise<void> {
    await renderInline(
      this.source.app,
      el,
      { markdown, render: 'markdown' },
      sourcePath,
      this.component,
      { media: true },
    );
    markMatches(el, this.activeTerm());
  }

  /**
   * A node row's content, by the one of three ways it is to be rendered (D18).
   *
   * Only `markdown` reaches Obsidian, and by then the model has already removed
   * the node's block syntax — so the renderer is asked for inline content and
   * returns a single paragraph, which `unwrapBlocks` flattens.
   */
  private async renderContent(
    el: HTMLElement,
    row: Extract<FooterRow, { type: 'node' }>,
    sourcePath: string,
  ): Promise<void> {
    // An embed of the target, rendered inside the target's OWN footer, would
    // transclude the note into itself — the reader asked where it was
    // referenced, not to read it again. Rendered as a link instead, and marked.
    const markdown =
      row.referenceKind === 'embed' ? row.markdown.replace(/!\[\[/g, '[[') : row.markdown;
    // A reference row is a QUOTATION of the node, so an embed it contains is
    // part of what the node says and stays. Its height is bounded by the
    // stylesheet instead (design D7) — the model does not take a quotation's
    // content away to fix a layout problem.
    await renderInline(
      this.source.app,
      el,
      { markdown, render: row.render },
      sourcePath,
      this.component,
      { media: true },
    );
    markMatches(el, this.activeTerm());
  }

  /** One lineage segment's own content, by the same rule and the same renderer
   * a node row's takes — minus its media, which is the one thing a chain does
   * not inherit from a quotation (design D1). */
  private async renderSegment(
    el: HTMLElement,
    segment: LineageSegment,
    sourcePath: string,
  ): Promise<void> {
    await renderInline(this.source.app, el, segment, sourcePath, this.component, {
      media: false,
    });
    markMatches(el, this.activeTerm());
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
  if (!isOutlineMode(state)) return Decoration.none;
  const path = state.field(editorInfoField, false)?.file?.path;
  if (!path) return Decoration.none;

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
    // `state.doc.length` normally, and the end of the visible range while a
    // zoom scope is active: zoom's trailing hidden range ends AT `doc.length`,
    // and a block replacement swallows a widget anchored there, so the footer
    // would silently vanish on zoom. Re-anchoring is the only available fix —
    // measured in docs/research/zoom-hiding-mechanism, which also rules out shortening that range.
    }).range(contentEndAnchor(state)),
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
    if (row?.type === 'node' && row.isHit) references++;
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

/** Kind names as a reader would say them (docs/research/structured-backlinks, D14). */
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
