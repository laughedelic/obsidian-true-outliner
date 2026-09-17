/**
 * The search palette: a query over the vault or one note, its hits shown under
 * the lineage that leads to them, and the reader landed on whichever they pick.
 *
 * A custom `Modal` rather than a `SuggestModal` (design D1). A suggestion list
 * is a list of ITEMS and the palette's unit is a HIT under rows of context that
 * belong to no item — the prototype had to draw a group's head and its lineage
 * inside the first suggestion, which made a row's identity depend on where it
 * happened to fall. Here the results are a document and the keyboard moves over
 * the hits in it.
 *
 * The rows themselves are `lineage-list.ts`'s, the same function the backlinks
 * footer draws through, so a lineage row means one thing across the plugin.
 * What this surface answers differently is in `listOptions` below: no folds, no
 * group collapse, and a row that is an option in a listbox rather than a link.
 */

import { Component, MarkdownView, Modal, Scope, type App, type TFile } from 'obsidian';
import type { OutlineDoc, OutlineNode } from '../model';
import { nodeStartLine } from '../locate';
import { buildRows } from './footer-model';
import { markMatches, renderInline } from './inline-render';
import { renderGroupHead, renderRow, type LineageListOptions } from './lineage-list';
import type { SourceTreeCache } from './source-tree-cache';
import { VaultSearch, type NoteHits } from './vault-search';
import { viewFor } from './view-registry';
import { isOutlineMode } from './outline-state';
import { zoomCleared, zoomTo } from './zoom-state';
import { zoomScope } from './zoom-scope';
import type { LineageSeparator, SegmentIcons } from './settings/footer';

export const PALETTE_CLASS = 'to-search-palette';

/**
 * The floor below which the palette does not search (design D9).
 *
 * One character matches nearly every node in a vault and paints a wall the
 * reader has to type past. Two is the prototype's floor and nothing measured
 * since has argued with it.
 */
export const MIN_QUERY = 2;

/** How many notes' groups are shown before the tail speaks for the rest. */
const GROUP_CAP = 20;

/**
 * How long the landing waits for the view registry to carry a freshly opened
 * leaf, before opening the note unzoomed (design D6).
 *
 * `ViewRegistryPlugin` registers on the first update where its DOM is
 * connected, which for a leaf created a moment ago has not happened when
 * `openFile` resolves — so a new tab, the case `Mod`-confirm exists for, is
 * exactly the case a single lookup misses. Bounded because a view that will
 * never register — a note opened in reading view — must not leave the caller
 * waiting on it.
 */
const REGISTRY_FRAMES = 12;

/** What the palette needs from the plugin around it. */
export interface SearchPaletteSource {
  readonly app: App;
  readonly trees: SourceTreeCache;
  readonly backlinksSegmentIcons: SegmentIcons;
  readonly backlinksSeparator: LineageSeparator;
}

/** One hit on screen: the row drawn for it, and what landing on it needs. */
interface Slot {
  readonly group: NoteHits;
  readonly nodeId: number;
  readonly el: HTMLElement;
}

const HINTS: readonly { key: string; means: string }[] = [
  { key: '↑↓', means: 'hit' },
  { key: '⌘↑↓', means: 'group' },
  { key: '↵', means: 'open zoomed' },
  { key: '⇧↵', means: 'open note' },
  { key: '⇥', means: 'this note' },
];

export class SearchPalette extends Modal {
  private readonly component = new Component();
  private readonly search: VaultSearch;

  private queryEl!: HTMLInputElement;
  private scopeEl!: HTMLButtonElement;
  private resultsEl!: HTMLElement;
  private stateEl!: HTMLElement;
  private tailEl!: HTMLElement;

  /** The note the palette was opened from, or null when it was not opened from
   * one. Captured once, so a background note-switch cannot change what "this
   * note" means while the palette is open. */
  private readonly openedFrom: TFile | null;
  private narrowed = false;

  private slots: Slot[] = [];
  private active = -1;
  /** Bumped per query and scope change, so a group arriving for an older one
   * paints nothing. The walk has its own guard; this one owns the DOM. */
  private painting = 0;
  private rowId = 0;

  constructor(private readonly source: SearchPaletteSource) {
    super(source.app);
    // The walk's yield is this window's timer: a palette in a popout window
    // must not resume on the main window's.
    this.search = new VaultSearch(
      source.app.vault,
      source.trees,
      () => new Promise((resolve) => this.modalEl.win.setTimeout(resolve, 0)),
    );
    // Not `getActiveFile()`, which "will return the most recently active file"
    // when the current view is not a `FileView` — from the graph view that
    // would offer to narrow to whichever note was open last, and from a canvas
    // to a file this plugin cannot parse (design D7).
    this.openedFrom = source.app.workspace.getActiveViewOfType(MarkdownView)?.file ?? null;

    this.buildShell();
    this.registerKeys();
  }

  override onOpen(): void {
    this.component.load();
    this.queryEl.focus();
    this.paint();
  }

  override onClose(): void {
    this.search.cancel();
    this.component.unload();
    this.contentEl.empty();
  }

  // ---- the shell ---------------------------------------------------------

  /**
   * Obsidian's own prompt, with the dialog chrome taken off.
   *
   * The `prompt` classes are borrowed rather than reimplemented so the box
   * sits, sizes and scrolls like the Quick Switcher — a search surface that
   * looked like a settings dialog would be the only one in the app that did.
   */
  private buildShell(): void {
    this.modalEl.removeClass('modal');
    this.modalEl.addClass('prompt', PALETTE_CLASS);
    for (const selector of ['.modal-close-button', '.modal-header-button', '.modal-header']) {
      this.modalEl.querySelector(selector)?.remove();
    }
    this.titleEl.remove();
    this.contentEl.remove();

    const inputRow = this.modalEl.createDiv({ cls: 'prompt-input-container' });
    this.queryEl = inputRow.createEl('input', {
      cls: 'prompt-input',
      attr: {
        type: 'text',
        placeholder: 'Search outline…',
        spellcheck: 'false',
        role: 'combobox',
        'aria-expanded': 'true',
        'aria-autocomplete': 'list',
        'aria-controls': `${PALETTE_CLASS}-results`,
      },
    });

    // Present in BOTH scopes, because on a phone the hints row is hidden and
    // this is the only way to switch (design D7). Outside the tab order: focus
    // stays in the field, and the key is its keyboard route — a control the
    // keyboard can reach and cannot use is worse than one it cannot reach.
    this.scopeEl = inputRow.createEl('button', {
      cls: `${PALETTE_CLASS}-scope`,
      attr: { type: 'button' },
    });
    this.scopeEl.tabIndex = -1;
    this.scopeEl.addEventListener('click', () => this.toggleScope());

    this.resultsEl = this.modalEl.createDiv({
      cls: `prompt-results ${PALETTE_CLASS}-results to-lineage-list`,
      attr: { id: `${PALETTE_CLASS}-results`, role: 'listbox' },
    });
    this.stateEl = this.modalEl.createDiv({ cls: `${PALETTE_CLASS}-state` });
    this.tailEl = this.modalEl.createDiv({ cls: `${PALETTE_CLASS}-tail` });

    const hints = this.modalEl.createDiv({ cls: 'prompt-instructions' });
    for (const hint of HINTS) {
      const row = hints.createDiv({ cls: 'prompt-instruction' });
      row.createSpan({ cls: 'prompt-instruction-command', text: hint.key });
      row.createSpan({ text: hint.means });
    }

    this.queryEl.addEventListener('input', () => this.paint());
    this.renderScopeControl();
  }

  private registerKeys(): void {
    // On the modal's own `Scope`, which Obsidian pushes while it is open and
    // pops when it closes, so nothing here outlives the palette.
    this.scope = new Scope(this.app.scope);
    this.scope.register([], 'Escape', () => {
      this.close();
      return false;
    });
    this.scope.register([], 'ArrowDown', (event) => this.moveHit(1, event));
    this.scope.register([], 'ArrowUp', (event) => this.moveHit(-1, event));
    this.scope.register(['Mod'], 'ArrowDown', (event) => this.moveGroup(1, event));
    this.scope.register(['Mod'], 'ArrowUp', (event) => this.moveGroup(-1, event));
    this.scope.register([], 'Enter', (event) => this.confirm(event));
    this.scope.register(['Shift'], 'Enter', (event) => this.confirm(event));
    this.scope.register(['Mod'], 'Enter', (event) => this.confirm(event));
    this.scope.register([], 'Tab', (event) => {
      event.preventDefault();
      this.toggleScope();
      return false;
    });
  }

  // ---- scope -------------------------------------------------------------

  private toggleScope(): void {
    if (!this.openedFrom) return;
    this.narrowed = !this.narrowed;
    this.renderScopeControl();
    this.paint();
  }

  /**
   * Two appearances of one control: an offer while the vault is active, the
   * note's name once narrowed.
   *
   * Labelling the default instead ("Vault") would fill the row to report that
   * nothing has changed; showing nothing would leave a phone with no way into
   * the narrowed scope at all (design D7).
   */
  private renderScopeControl(): void {
    if (!this.openedFrom) {
      this.scopeEl.hide();
      return;
    }
    this.scopeEl.show();
    this.scopeEl.empty();
    this.scopeEl.toggleClass('is-narrowed', this.narrowed);
    if (this.narrowed) {
      this.scopeEl.createSpan({ text: this.openedFrom.basename });
      this.scopeEl.createSpan({ cls: `${PALETTE_CLASS}-scope-key`, text: '✕' });
      this.scopeEl.setAttribute('aria-label', `Searching ${this.openedFrom.basename}. Search the whole vault`);
    } else {
      this.scopeEl.createSpan({ text: 'This note' });
      this.scopeEl.createSpan({ cls: `${PALETTE_CLASS}-scope-key`, text: '⇥' });
      this.scopeEl.setAttribute('aria-label', `Search ${this.openedFrom.basename} only`);
    }
  }

  // ---- painting ----------------------------------------------------------

  private paint(): void {
    const painting = (this.painting += 1);
    const query = this.queryEl.value;
    this.resultsEl.empty();
    this.slots = [];
    this.active = -1;
    this.tailEl.setText('');
    this.queryEl.removeAttribute('aria-activedescendant');

    if (query.trim().length < MIN_QUERY) {
      // Below the floor is the same picture as nothing typed: no results, and
      // the hints saying what the keys do.
      this.search.cancel();
      this.stateEl.setText('');
      return;
    }

    // "Searching" rather than "no matches": before the sweep reaches a note
    // that holds one, the two are the same picture, and saying the latter would
    // say it on every keystroke.
    this.stateEl.setText('Searching…');

    void this.search.run({
      query,
      only: this.narrowed ? this.openedFrom : null,
      groupCap: GROUP_CAP,
      onGroup: (group) => {
        if (painting !== this.painting) return;
        this.stateEl.setText('');
        this.appendGroup(group, query);
      },
      onDone: ({ beyondCap }) => {
        if (painting !== this.painting) return;
        this.stateEl.setText(this.slots.length === 0 ? 'No matches.' : '');
        // Stated only now: a number that climbed as notes resolved would not be
        // a count of what is not shown.
        if (beyondCap > 0) {
          this.tailEl.setText(
            beyondCap === 1 ? '1 more note holds matches' : `${beyondCap} more notes hold matches`,
          );
        }
      },
    });
  }

  /**
   * One note's group, appended in the order the walk hands it over.
   *
   * Appended and never re-sorted: the walk takes its recency order before it
   * resolves anything, so each group arrives already in its final place. The
   * active hit is left where it is — a group arriving must not discard the
   * reader's navigation — and only the first group to arrive claims it.
   */
  private appendGroup(group: NoteHits, query: string): void {
    const card = this.resultsEl.createDiv({ cls: 'to-lineage-group' });
    const { name, folder } = splitNotePath(group.path);
    renderGroupHead(card, { name, folder, count: group.hits.size, collapsed: false });
    const body = card.createDiv({ cls: 'to-lineage-rows' });

    const pending: Promise<void>[] = [];
    const rows = buildRows(
      group.doc,
      (node) => group.hits.has(node.id),
      [],
      (node) => group.hits.get(node.id),
      () => false,
      { descendantDepth: 0 },
    );

    for (const row of rows) {
      const el = renderRow(body, group.path, row, pending, this.listOptions(query));
      if (row.type !== 'node' || !row.isHit) continue;
      const slot: Slot = { group, nodeId: row.nodeId, el };
      this.slots.push(slot);
      el.id = `${PALETTE_CLASS}-hit-${(this.rowId += 1)}`;
      el.setAttribute('role', 'option');
      el.setAttribute('aria-selected', 'false');
      // Pointer MOVEMENT, not the pointer merely being over the row: scrolling
      // the active hit into view under a still pointer would otherwise hand the
      // choice straight back to whatever the row landed under.
      el.addEventListener('mousemove', () => this.setActive(this.slots.indexOf(slot), false));
      el.addEventListener('click', (event) => void this.land(slot, event));
    }

    if (this.active < 0 && this.slots.length > 0) this.setActive(0, false);
  }

  /** What the shared list draws the palette's rows with. */
  private listOptions(query: string): LineageListOptions {
    const { app } = this.source;
    return {
      icons: this.source.backlinksSegmentIcons,
      separator: this.source.backlinksSeparator,
      // The palette is a list of places, not a quotation of a tree: at a
      // modal's scale the stripes crowd rows that are only ever a few deep.
      guides: false,
      // No descendants were asked for, so there is nothing to fold.
      folds: null,
      renderContent: async (el, row, sourcePath) => {
        await renderInline(app, el, { markdown: row.markdown, render: row.render }, sourcePath, this.component, {
          media: false,
        });
        markMatches(el, query);
      },
      renderSegment: async (el, segment, sourcePath) => {
        await renderInline(app, el, segment, sourcePath, this.component, { media: false });
        markMatches(el, query);
      },
      renderProperty: async (el, markdown, sourcePath) => {
        await renderInline(app, el, { markdown, render: 'markdown' }, sourcePath, this.component, {
          media: false,
        });
        markMatches(el, query);
      },
      // A lineage segment names an ancestor; activating one lands on it the
      // same way activating a hit does.
      onActivateSegment: (segment, event, sourcePath) => {
        const slot = this.slots.find((s) => s.group.path === sourcePath);
        if (slot) void this.land({ ...slot, nodeId: segment.nodeId }, event);
      },
      // The palette's rows are options in a listbox it drives itself, so the
      // list does not make them links.
      onActivateRow: null,
    };
  }

  // ---- the keyboard model ------------------------------------------------

  private setActive(index: number, scroll: boolean): void {
    const previous = this.slots[this.active];
    if (previous) {
      previous.el.removeClass('is-active');
      previous.el.setAttribute('aria-selected', 'false');
    }
    this.active = index;
    const slot = this.slots[index];
    if (!slot) {
      this.queryEl.removeAttribute('aria-activedescendant');
      return;
    }
    slot.el.addClass('is-active');
    slot.el.setAttribute('aria-selected', 'true');
    this.queryEl.setAttribute('aria-activedescendant', slot.el.id);
    if (scroll) slot.el.scrollIntoView({ block: 'nearest' });
  }

  /** The ends stop rather than wrap: over a capped list of many groups the move
   * from the last hit to the first scrolls the whole results area and looks the
   * same as a move by one row (design D8). */
  private moveHit(delta: number, event: KeyboardEvent): boolean {
    event.preventDefault();
    if (this.slots.length === 0) return false;
    const next = Math.min(Math.max(this.active + delta, 0), this.slots.length - 1);
    this.setActive(next, true);
    return false;
  }

  private moveGroup(delta: number, event: KeyboardEvent): boolean {
    event.preventDefault();
    if (this.slots.length === 0) return false;
    const current = this.slots[this.active]?.group;
    let index = this.active;
    while (index + delta >= 0 && index + delta < this.slots.length) {
      index += delta;
      if (this.slots[index]?.group !== current) break;
    }
    // A group is entered at its FIRST hit whichever direction the move came
    // from, so the key means the same thing both ways.
    const group = this.slots[index]?.group;
    while (index > 0 && this.slots[index - 1]?.group === group) index -= 1;
    this.setActive(index, true);
    return false;
  }

  private confirm(event: KeyboardEvent): boolean {
    const slot = this.slots[this.active];
    if (!slot) return false;
    event.preventDefault();
    void this.land(slot, event);
    return false;
  }

  // ---- landing on a hit --------------------------------------------------

  /**
   * Opens the hit's note, puts the caret on it, and zooms unless asked not to.
   *
   * The leaf is TAKEN rather than read back: `openLinkText` answers
   * `Promise<void>` and hands back neither leaf nor view, so a landing built on
   * it can only ask what happens to be active afterwards — which is a different
   * question with a different answer in a new tab (design D6).
   */
  private async land(slot: Slot, event: MouseEvent | KeyboardEvent): Promise<void> {
    const unzoomed = event.shiftKey;
    const newTab = event.ctrlKey || event.metaKey;
    const { workspace } = this.source.app;

    this.close();

    const leaf = workspace.getLeaf(newTab);
    await leaf.openFile(slot.group.file);
    const view = leaf.view instanceof MarkdownView ? leaf.view : null;
    if (!view) return;

    const line = nodeStartLine(slot.group.doc, slot.nodeId);
    if (line < 0) return;
    view.editor.setCursor({ line, ch: 0 });
    view.editor.scrollIntoView({ from: { line, ch: 0 }, to: { line, ch: 0 } }, true);

    const cm = await this.registeredView(view);
    if (!cm || !isOutlineMode(cm.state)) return;

    // Withholding a zoom is not the same as leaving whatever zoom was already
    // there. A reader who was zoomed into one part of a note and searched their
    // way to another would otherwise land inside the old scope — with the caret
    // on a line that scope hides, which is the one place the caret may not be.
    const rootLine = unzoomed ? -1 : zoomRootLine(slot.group.doc, slot.nodeId);
    if (rootLine < 0) {
      if (zoomScope(cm.state)) cm.dispatch({ effects: zoomCleared.of(null) });
      return;
    }
    cm.dispatch({ effects: zoomTo.of(cm.state.doc.line(rootLine + 1).from) });
  }

  /** The `EditorView` for a leaf that may have mounted a moment ago. */
  private async registeredView(view: MarkdownView): Promise<ReturnType<typeof viewFor>> {
    for (let frame = 0; frame < REGISTRY_FRAMES; frame += 1) {
      const cm = viewFor(view);
      if (cm) return cm;
      await nextFrame(view.containerEl.win);
    }
    return undefined;
  }
}

/**
 * The line the zoom takes as its root: the hit when it has children, its parent
 * when it does not.
 *
 * A childless hit zoomed to itself shows one line and nothing else, which is
 * the finding the prototype surfaced. A childless TOP-LEVEL hit has no parent
 * to take, and -1 here leaves the note unzoomed — the same rule, applied where
 * the only alternatives are a zoom to one line and no zoom at all.
 */
function zoomRootLine(doc: OutlineDoc, nodeId: number): number {
  const found = findWithParent(doc.children, nodeId, undefined);
  if (!found) return -1;
  const { node, parent } = found;
  if (node.children.length > 0) return nodeStartLine(doc, node.id);
  return parent ? nodeStartLine(doc, parent.id) : -1;
}

function findWithParent(
  nodes: readonly OutlineNode[],
  id: number,
  parent: OutlineNode | undefined,
): { node: OutlineNode; parent: OutlineNode | undefined } | undefined {
  for (const node of nodes) {
    if (node.id === id) return { node, parent };
    const inside = findWithParent(node.children, id, node);
    if (inside) return inside;
  }
  return undefined;
}

/** A note's own name and the folder above it, for a group's head. */
function splitNotePath(path: string): { name: string; folder: string } {
  const cut = path.lastIndexOf('/');
  const file = cut < 0 ? path : path.slice(cut + 1);
  return {
    name: file.replace(/\.md$/, ''),
    folder: cut < 0 ? '' : path.slice(0, cut),
  };
}

const nextFrame = (win: Window): Promise<void> =>
  new Promise((resolve) => win.requestAnimationFrame(() => resolve()));
