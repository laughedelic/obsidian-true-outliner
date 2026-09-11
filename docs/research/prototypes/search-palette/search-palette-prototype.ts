/**
 * PROTOTYPE — not for release. Two throwaway shells for a search palette, so the
 * shape of a `SuggestModal`-based palette and a custom `Modal`-based one can be
 * compared in real Obsidian before either is designed for real.
 *
 * The engine is the simplest thing that produces real results: a case-insensitive
 * substring match over every node's own lines, across every markdown file, using
 * the same parse and tree cache the backlinks footer uses. Results are grouped by
 * note and rendered as the footer renders a group — squashed lineage rows leading
 * to each hit — minus children and folding.
 */

import {
  type App,
  Component,
  Keymap,
  MarkdownView,
  Modal,
  SuggestModal,
  TFile,
  type Instruction,
} from 'obsidian';
import type { EditorView } from '@codemirror/view';
import type { OutlineDoc, OutlineNode } from '../model';
import { nodeStartLine } from '../locate';
import { SourceTreeCache } from './source-tree-cache';
import { buildRows, type FooterRow, type LineageSegment } from './footer-model';
import { renderLineageContent } from './lineage-row';
import { renderInline, segmentGlyph, segmentMarker, separatorGlyph } from './backlinks-footer';
import { applyLineChrome, lineChrome, MARKER_LEFT_SHIFT_EXPR } from './chrome-line';
import { buildMarkerIcon } from './decorations';
import type { LineageSeparator, SegmentIcons } from './mode-registry';
import { zoomTo } from './zoom-state';

// ---- Engine --------------------------------------------------------------------

type HitRow = Extract<FooterRow, { type: 'node' }>;

interface Group {
  readonly file: TFile;
  readonly doc: OutlineDoc;
  readonly hits: ReadonlySet<number>;
  /** Lineage rows and hit rows, in preorder. Descendant rows are dropped. */
  readonly rows: readonly FooterRow[];
}

const trees = new WeakMap<App, SourceTreeCache>();
function treesFor(app: App): SourceTreeCache {
  let cache = trees.get(app);
  if (!cache) {
    cache = new SourceTreeCache(app.vault);
    trees.set(app, cache);
  }
  return cache;
}

function nodeText(node: OutlineNode): string {
  return node.lines.join('\n');
}

async function search(app: App, query: string, only?: TFile): Promise<Group[]> {
  const q = query.trim().toLowerCase();
  if (q.length < 2) return [];
  const files = only ? [only] : app.vault.getMarkdownFiles();
  const groups: Group[] = [];
  for (const file of files) {
    const doc = await treesFor(app).get(file);
    const hits = new Set<number>();
    const visit = (nodes: readonly OutlineNode[]): void => {
      for (const node of nodes) {
        if (nodeText(node).toLowerCase().includes(q)) hits.add(node.id);
        visit(node.children);
      }
    };
    visit(doc.children);
    if (hits.size === 0) continue;
    const rows = buildRows(
      doc,
      (node) => hits.has(node.id),
      [],
      () => undefined,
      () => false,
    ).filter((row) => row.type === 'lineage' || (row.type === 'node' && hits.has(row.nodeId)));
    groups.push({ file, doc, hits, rows });
  }
  groups.sort((a, b) => b.file.stat.mtime - a.file.stat.mtime);
  return groups.slice(0, 40);
}

// ---- Shared rendering ------------------------------------------------------------

interface RenderOptions {
  readonly app: App;
  readonly component: Component;
  readonly icons: SegmentIcons;
  readonly separator: LineageSeparator;
  readonly query: string;
}

function markerSlot(icon: Element): HTMLElement {
  const el = createSpan({ cls: 'to-decor-marker-icon' });
  el.setCssProps({ '--to-marker-left': MARKER_LEFT_SHIFT_EXPR });
  // eslint-disable-next-line no-restricted-syntax -- detached DOM before mount
  el.appendChild(icon);
  return el;
}

/** Wraps every occurrence of the query in the rendered text in a `<mark>`. */
function highlight(el: HTMLElement, query: string): void {
  const q = query.trim().toLowerCase();
  if (!q) return;
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  const texts: Text[] = [];
  for (let n = walker.nextNode(); n; n = walker.nextNode()) texts.push(n as Text);
  for (const text of texts) {
    const value = text.data;
    const lower = value.toLowerCase();
    let at = lower.indexOf(q);
    if (at < 0) continue;
    const frag = document.createDocumentFragment();
    let last = 0;
    while (at >= 0) {
      frag.append(value.slice(last, at));
      frag.append(createEl('mark', { text: value.slice(at, at + q.length) }));
      last = at + q.length;
      at = lower.indexOf(q, last);
    }
    frag.append(value.slice(last));
    text.replaceWith(frag);
  }
}

function renderGroupHead(parent: HTMLElement, group: Group): void {
  const head = parent.createDiv({ cls: 'to-backlinks-group-head to-search-group-head' });
  head.createSpan({ cls: 'to-backlinks-group-name', text: group.file.basename });
  const folder = group.file.parent?.path ?? '';
  if (folder && folder !== '/') head.createSpan({ cls: 'to-backlinks-group-folder', text: folder });
  head.createSpan({ cls: 'to-backlinks-group-count', text: String(group.hits.size) });
}

function renderRow(parent: HTMLElement, group: Group, row: FooterRow, o: RenderOptions): HTMLElement {
  const el = parent.createDiv({ cls: 'to-backlinks-row' });
  el.dataset.kind = row.type === 'node' ? row.fact.kind : row.type;
  applyLineChrome(el, lineChrome(row.fact, { nativeBlocks: false }));
  const path = group.file.path;

  if (row.type === 'lineage') {
    renderLineageContent(el, row.segments, {
      icons: o.icons,
      separator: o.separator,
      kind: row.kind,
      marker: segmentMarker,
      glyph: segmentGlyph,
      separatorGlyph,
      renderSegment: (target, segment: LineageSegment) => {
        void renderInline(o.app, target, segment, path, o.component, { media: false });
      },
      onActivate: () => {},
    });
    return el;
  }
  if (row.type === 'property') return el;

  el.addClass('to-search-hit');
  // eslint-disable-next-line no-restricted-syntax -- detached DOM before mount
  el.appendChild(markerSlot(buildMarkerIcon(row.fact.kind)));
  const content = el.createSpan({ cls: 'to-backlinks-content' });
  const inner = content.createSpan();
  void renderInline(
    o.app,
    inner,
    { markdown: row.markdown, render: row.render },
    path,
    o.component,
    { media: false },
  ).then(() => highlight(inner, o.query));
  return el;
}

// ---- Opening a hit --------------------------------------------------------------

async function openHit(
  app: App,
  group: Group,
  row: HitRow,
  evt: MouseEvent | KeyboardEvent,
): Promise<void> {
  const wholeNote = evt.shiftKey;
  await app.workspace.openLinkText(group.file.path, '', Keymap.isModEvent(evt));
  const view = app.workspace.getActiveViewOfType(MarkdownView);
  if (!view || view.file?.path !== group.file.path) return;
  const doc = await treesFor(app).get(group.file);
  const line = nodeStartLine(doc, row.nodeId);
  if (line < 0) return;
  view.editor.setCursor({ line, ch: 0 });
  view.editor.scrollIntoView({ from: { line, ch: 0 }, to: { line, ch: 0 } }, true);
  if (wholeNote) return;
  const cm = (view.editor as unknown as { cm?: EditorView }).cm;
  if (!cm) return;
  cm.dispatch({ effects: zoomTo.of(cm.state.doc.line(line + 1).from) });
}

const INSTRUCTIONS: Instruction[] = [
  { command: '↑↓', purpose: 'navigate hits' },
  { command: '↵', purpose: 'open zoomed' },
  { command: 'shift ↵', purpose: 'open note' },
  { command: 'tab', purpose: 'this note only' },
  { command: 'esc', purpose: 'dismiss' },
];

// ---- Shell A: SuggestModal ----------------------------------------------------------

/** One suggestion per hit. The lineage rows that lead to it, and the group head
 * when it is the group's first hit, are drawn INSIDE the same suggestion item —
 * a `SuggestModal` has no other place to put them. */
interface Item {
  readonly group: Group;
  readonly lead: readonly FooterRow[];
  readonly hit: HitRow;
  readonly first: boolean;
}

function itemsOf(groups: readonly Group[]): Item[] {
  const items: Item[] = [];
  for (const group of groups) {
    let lead: FooterRow[] = [];
    let first = true;
    for (const row of group.rows) {
      if (row.type !== 'node') {
        lead.push(row);
        continue;
      }
      items.push({ group, lead, hit: row, first });
      lead = [];
      first = false;
    }
  }
  return items;
}

export class SuggestSearchPalette extends SuggestModal<Item> {
  private readonly component = new Component();
  private query = '';
  private scopeFile: TFile | null = null;

  constructor(
    app: App,
    private readonly look: { icons: SegmentIcons; separator: LineageSeparator },
    private readonly restyled: boolean,
  ) {
    super(app);
    this.setPlaceholder('Search the outline…');
    this.setInstructions(INSTRUCTIONS);
    this.modalEl.addClass('to-search-prompt', 'is-suggest');
    if (restyled) this.modalEl.addClass('is-restyled');
    this.scope.register([], 'Tab', (evt) => {
      evt.preventDefault();
      this.scopeFile = this.scopeFile ? null : (this.app.workspace.getActiveFile() ?? null);
      this.inputEl.dispatchEvent(new Event('input'));
      return false;
    });
  }

  override onOpen(): void {
    super.onOpen();
    this.component.load();
  }

  override onClose(): void {
    this.component.unload();
    super.onClose();
  }

  async getSuggestions(query: string): Promise<Item[]> {
    this.query = query;
    return itemsOf(await search(this.app, query, this.scopeFile ?? undefined));
  }

  renderSuggestion(item: Item, el: HTMLElement): void {
    el.addClass('to-search-item');
    const box = el.createDiv({ cls: 'to-backlinks to-search-results' });
    if (item.first) renderGroupHead(box, item.group);
    const o: RenderOptions = {
      app: this.app,
      component: this.component,
      icons: this.look.icons,
      separator: this.look.separator,
      query: this.query,
    };
    for (const row of item.lead) renderRow(box, item.group, row, o);
    renderRow(box, item.group, item.hit, o);
  }

  onChooseSuggestion(item: Item, evt: MouseEvent | KeyboardEvent): void {
    void openHit(this.app, item.group, item.hit, evt);
  }
}

// ---- Shell B: custom Modal ---------------------------------------------------------

interface Slot {
  readonly group: Group;
  readonly row: HitRow;
  readonly el: HTMLElement;
}

export class CustomSearchPalette extends Modal {
  private readonly component = new Component();
  private inputEl!: HTMLInputElement;
  private resultsEl!: HTMLElement;
  private chipEl!: HTMLElement;
  private slots: Slot[] = [];
  private active = -1;
  private scopeFile: TFile | null = null;
  private generation = 0;

  constructor(
    app: App,
    private readonly look: { icons: SegmentIcons; separator: LineageSeparator },
  ) {
    super(app);
    // The switcher's own shell classes, so the box sits and sizes like the
    // Quick Switcher rather than like a dialog.
    this.modalEl.removeClass('modal');
    this.modalEl.addClass('prompt', 'to-search-prompt', 'is-custom');
    for (const sel of ['.modal-close-button', '.modal-header-button', '.modal-header']) {
      this.modalEl.querySelector(sel)?.remove();
    }
    this.titleEl.remove();
    this.contentEl.remove();

    const input = this.modalEl.createDiv({ cls: 'prompt-input-container' });
    this.inputEl = input.createEl('input', {
      cls: 'prompt-input',
      attr: { type: 'text', placeholder: 'Search the outline…', spellcheck: 'false' },
    });
    this.chipEl = input.createDiv({ cls: 'to-search-chip', text: '' });
    this.chipEl.hide();
    this.resultsEl = this.modalEl.createDiv({ cls: 'prompt-results to-backlinks to-search-results' });
    const hints = this.modalEl.createDiv({ cls: 'prompt-instructions' });
    for (const i of INSTRUCTIONS) {
      const hint = hints.createDiv({ cls: 'prompt-instruction' });
      hint.createSpan({ cls: 'prompt-instruction-command', text: i.command });
      hint.createSpan({ text: i.purpose });
    }

    this.inputEl.addEventListener('input', () => void this.refresh());
    this.scope.register([], 'ArrowDown', (evt) => this.move(1, evt));
    this.scope.register([], 'ArrowUp', (evt) => this.move(-1, evt));
    this.scope.register(['Mod'], 'ArrowDown', (evt) => this.moveGroup(1, evt));
    this.scope.register(['Mod'], 'ArrowUp', (evt) => this.moveGroup(-1, evt));
    this.scope.register([], 'Enter', (evt) => this.choose(evt));
    this.scope.register(['Shift'], 'Enter', (evt) => this.choose(evt));
    this.scope.register(['Mod'], 'Enter', (evt) => this.choose(evt));
    this.scope.register([], 'Tab', (evt) => {
      evt.preventDefault();
      this.scopeFile = this.scopeFile ? null : (this.app.workspace.getActiveFile() ?? null);
      if (this.scopeFile) {
        this.chipEl.setText(`in: ${this.scopeFile.basename}`);
        this.chipEl.show();
      } else {
        this.chipEl.hide();
      }
      void this.refresh();
      return false;
    });
  }

  override onOpen(): void {
    this.component.load();
    this.inputEl.focus();
  }

  override onClose(): void {
    this.component.unload();
  }

  private async refresh(): Promise<void> {
    const generation = ++this.generation;
    const query = this.inputEl.value;
    const groups = await search(this.app, query, this.scopeFile ?? undefined);
    if (generation !== this.generation) return;
    this.resultsEl.empty();
    this.slots = [];
    const o: RenderOptions = {
      app: this.app,
      component: this.component,
      icons: this.look.icons,
      separator: this.look.separator,
      query,
    };
    for (const group of groups) {
      const card = this.resultsEl.createDiv({ cls: 'to-backlinks-group to-search-group' });
      renderGroupHead(card, group);
      const body = card.createDiv({ cls: 'to-backlinks-rows' });
      for (const row of group.rows) {
        const el = renderRow(body, group, row, o);
        if (row.type !== 'node') continue;
        const slot: Slot = { group, row, el };
        this.slots.push(slot);
        el.addEventListener('mousemove', () => this.setActive(this.slots.indexOf(slot), false));
        el.addEventListener('click', (evt) => void openHit(this.app, group, row, evt).then(() => this.close()));
      }
    }
    if (this.slots.length === 0 && query.trim().length >= 2) {
      this.resultsEl.createDiv({ cls: 'search-empty-state', text: 'No matches.' });
    }
    this.setActive(this.slots.length ? 0 : -1, true);
  }

  private setActive(index: number, scroll: boolean): void {
    if (this.active >= 0) this.slots[this.active]?.el.removeClass('is-active');
    this.active = index;
    const slot = this.slots[index];
    if (!slot) return;
    slot.el.addClass('is-active');
    if (scroll) slot.el.scrollIntoView({ block: 'nearest' });
  }

  private move(delta: number, evt: KeyboardEvent): boolean {
    evt.preventDefault();
    if (this.slots.length === 0) return false;
    const next = (this.active + delta + this.slots.length) % this.slots.length;
    this.setActive(next, true);
    return false;
  }

  private moveGroup(delta: number, evt: KeyboardEvent): boolean {
    evt.preventDefault();
    const current = this.slots[this.active]?.group;
    let i = this.active;
    for (let n = 0; n < this.slots.length; n++) {
      i = (i + delta + this.slots.length) % this.slots.length;
      if (this.slots[i]!.group !== current) break;
    }
    // Landing on a group's FIRST hit when moving backwards.
    if (delta < 0) {
      const g = this.slots[i]!.group;
      while (i > 0 && this.slots[i - 1]!.group === g) i--;
    }
    this.setActive(i, true);
    return false;
  }

  private choose(evt: KeyboardEvent): boolean {
    const slot = this.slots[this.active];
    if (!slot) return false;
    evt.preventDefault();
    void openHit(this.app, slot.group, slot.row, evt).then(() => this.close());
    return false;
  }
}
