/**
 * Per-note outline-mode state, persisted in the plugin data store (decision
 * log Q2.6: files stay clean — no frontmatter, no markers). Pure module: the
 * plugin injects persistence, so this is unit-testable without Obsidian.
 *
 * `MarkerVisibility` lives here (not decorations.ts, which imports `obsidian`
 * for `editorInfoField`) specifically so this module can stay pure — it's
 * really just a data type, not a decoration-rendering concern.
 */

/**
 * Which nodes get a block marker at all (Experiment 5a follow-up: markers
 * read as "a crown on top of the guide line" for a branch, but add little
 * for a leaf — most leaf atom kinds already carry their own native visual
 * style, e.g. a code fence's background or a callout's colored bar).
 * - 'all' — every eligible kind's first line (status quo).
 * - 'with-children' — only nodes that actually have at least one child.
 *   Atom kinds are leaves by construction, so this always excludes them.
 * - 'headings-and-paragraphs' — only the two kinds that CAN ever have
 *   children in this tree model, regardless of whether a given instance
 *   currently does. Atoms never qualify (they can't have children at all);
 *   list items are already excluded from markers unconditionally.
 */
export type MarkerVisibility = 'all' | 'with-children' | 'headings-and-paragraphs';
export const DEFAULT_MARKER_VISIBILITY: MarkerVisibility = 'all';

/**
 * The two position-indicator axes (hierarchy-position-indicators). Re-exported
 * from decorate.ts, whose pure `computePositionTrail` is the one place that
 * gives each state its meaning — declared there rather than here so the types
 * sit next to the walk that implements them, and re-exported here so
 * `PluginData` stays a single, complete description of what is persisted.
 *
 * Two independent axes rather than one combined setting: guides answer "how did
 * I get here" and markers answer "where am I", and the useful combinations
 * cross them. `markers: 'lineage'` with `guides: 'off'` is the only rendering
 * that says anything inside a pure list, where no guide column exists at all.
 * Each axis is a three-state enum rather than a pair of toggles, so its own two
 * renderings can never double up on the same level.
 */
export type { GuideHighlight, MarkerHighlight } from './decorate';
import type { GuideHighlight, MarkerHighlight } from './decorate';
export const DEFAULT_GUIDE_HIGHLIGHT: GuideHighlight = 'full';
export const DEFAULT_MARKER_HIGHLIGHT: MarkerHighlight = 'current';

/**
 * EXPERIMENTAL (docs/research/16-native-list-decoration.md) — how much of a
 * list's own geometry outline mode takes over from Obsidian.
 *
 * - `'native'` is today's behaviour and the default: native list rendering is
 *   untouched, so a pure list is byte-identical to outline-mode-off. List
 *   levels step by Obsidian's `--list-indent` (2.25em by default, 1.5x our own
 *   unit) and their guides sit on native columns, which is why lists read as a
 *   different layout from every other kind.
 * - `'grid'` pushes our own `--to-decor-unit` into `--list-indent` so a list
 *   level steps by exactly one unit, and moves the native list guide onto the
 *   same column our own gradient draws. Obsidian recomputes its hanging indent
 *   from the new width, so wrapped rows follow for free.
 * - `'own-guides'` is `'grid'` plus taking the guide itself: the native list
 *   guide is switched off and our gradient draws every list level, so a list
 *   guide is the same line, colour and column a block guide is.
 *
 * The caret trail does NOT yet reach those levels under any of these values.
 * `computePositionTrail` still skips list-item ancestors in both guide styles,
 * which is correct while the base layer has no list column to draw on and is
 * exactly what the `lists-on-the-outline-grid` change removes — measured to
 * light up as soon as it does, but not part of this demo.
 *
 * Anything past `'native'` deliberately breaks `outline-decorations`' "a pure
 * list renders byte-identical to outline-mode-off" requirement, which is why
 * this is a setting to look at rather than a change already made.
 */
export type ListLayout = 'native' | 'grid' | 'own-guides';
export const DEFAULT_LIST_LAYOUT: ListLayout = 'native';

/**
 * EXPERIMENTAL — where a list item's own marker sits relative to its depth
 * column. Every other kind centres its marker ON the column; a native bullet
 * sits about 14px to the right of it, which is the offset that reads as
 * "the guide does not come from the bullet". `'column'` pulls the marker back
 * onto the column and pushes the item's text out to the same gutter a block
 * line uses. Ordered markers are wider than the gutter, so they start on the
 * column rather than centring on it — see the research doc.
 *
 * Task lines are untouched by this setting in either direction: a checkbox is
 * wider than the gutter and is a real click target, and measured it does not
 * move between the two values (55.33px at both). It also does not reach its own
 * column — 7.33px right of it — which is a mismatch the demo shows rather than
 * solves.
 */
export type ListBullet = 'native' | 'column';
export const DEFAULT_LIST_BULLET: ListBullet = 'native';

export interface PluginData {
  outlinePaths: string[];
  coexistenceWarned: boolean;
  debugCrossCheck: boolean;
  /** Experiment 5a leaf-visibility round (see docs/research/07-decoration-
   * experiments-plan.md) — a real, persisted, user-facing setting so it can
   * be tried against a real vault without a rebuild. */
  markerVisibility: MarkerVisibility;
  /** See `GuideHighlight`. */
  guideHighlight: GuideHighlight;
  /** See `MarkerHighlight`. */
  markerHighlight: MarkerHighlight;
  /** See `ListLayout`. */
  listLayout: ListLayout;
  /** See `ListBullet`. */
  listBullet: ListBullet;
}

export const DEFAULT_DATA: PluginData = {
  outlinePaths: [],
  coexistenceWarned: false,
  debugCrossCheck: false,
  markerVisibility: DEFAULT_MARKER_VISIBILITY,
  guideHighlight: DEFAULT_GUIDE_HIGHLIGHT,
  markerHighlight: DEFAULT_MARKER_HIGHLIGHT,
  listLayout: DEFAULT_LIST_LAYOUT,
  listBullet: DEFAULT_LIST_BULLET,
};

export class OutlineModeRegistry {
  private paths = new Set<string>();

  constructor(private readonly persist: (paths: string[]) => Promise<void>) {}

  hydrate(paths: readonly string[]): void {
    this.paths = new Set(paths);
  }

  isOutline(path: string): boolean {
    return this.paths.has(path);
  }

  async toggle(path: string): Promise<boolean> {
    const on = !this.paths.has(path);
    if (on) this.paths.add(path);
    else this.paths.delete(path);
    await this.save();
    return on;
  }

  async handleRename(oldPath: string, newPath: string): Promise<void> {
    if (!this.paths.has(oldPath)) return;
    this.paths.delete(oldPath);
    this.paths.add(newPath);
    await this.save();
  }

  async handleDelete(path: string): Promise<void> {
    if (!this.paths.delete(path)) return;
    await this.save();
  }

  snapshot(): string[] {
    return [...this.paths].sort();
  }

  private save(): Promise<void> {
    return this.persist(this.snapshot());
  }
}
