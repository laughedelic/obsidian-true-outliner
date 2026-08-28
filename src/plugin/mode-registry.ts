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
export type MarkerVisibility =
  "all" | "with-children" | "headings-and-paragraphs";
export const DEFAULT_MARKER_VISIBILITY: MarkerVisibility = "all";

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
export type { GuideHighlight, MarkerHighlight } from "./decorate";
import type { GuideHighlight, MarkerHighlight } from "./decorate";
export const DEFAULT_GUIDE_HIGHLIGHT: GuideHighlight = "full";
export const DEFAULT_MARKER_HIGHLIGHT: MarkerHighlight = "current";

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
  /** Spike S1 apparatus (docs/research/19): mounts a content-free block widget
   * at the end of an outline note so its effect on the enforcement layer can be
   * measured with and without it, inside one running app. Not a feature; removed
   * when the spike closes. */
  debugFooterWidget: boolean;
}

export const DEFAULT_DATA: PluginData = {
  outlinePaths: [],
  coexistenceWarned: false,
  debugCrossCheck: false,
  markerVisibility: DEFAULT_MARKER_VISIBILITY,
  guideHighlight: DEFAULT_GUIDE_HIGHLIGHT,
  markerHighlight: DEFAULT_MARKER_HIGHLIGHT,
  debugFooterWidget: false,
};

/**
 * The states each enum field may hold, as a `Record` over the union rather than
 * an array: adding a state to the type without adding it here is a compile
 * error, so the runtime check cannot fall behind the type it guards.
 */
const KNOWN_MARKER_VISIBILITY: Record<MarkerVisibility, true> = {
  all: true,
  "with-children": true,
  "headings-and-paragraphs": true,
};
const KNOWN_GUIDE_HIGHLIGHT: Record<GuideHighlight, true> = {
  off: true,
  full: true,
  lineage: true,
};
const KNOWN_MARKER_HIGHLIGHT: Record<MarkerHighlight, true> = {
  off: true,
  current: true,
  lineage: true,
};

const oneOf = <T extends string>(
  known: Record<T, true>,
  value: unknown,
  fallback: T,
): T =>
  typeof value === "string" &&
  Object.prototype.hasOwnProperty.call(known, value)
    ? (value as T)
    : fallback;

/**
 * `PluginData` built from whatever is on disk: every KNOWN key taken from the
 * file when present and from `DEFAULT_DATA` when not, and nothing else carried
 * across.
 *
 * Picking rather than spreading is what makes removing a setting actually
 * remove it. `{ ...DEFAULT_DATA, ...(await loadData()) }` keeps every key the
 * file happens to hold — so a `data.json` written by a build that HAD a setting
 * keeps it on the object after the type is deleted, and the next
 * `saveData(this.data)` writes it straight back. `lists-on-the-outline-grid` is
 * the first change to retire a setting and found exactly that; an allow-list
 * means the next one is free.
 *
 * Every value is TYPE-CHECKED, not just picked. `data.json` is a plain file a
 * user can edit and an older build can have written, so a field can hold
 * anything: measured, `outlinePaths: 42` makes `hydrate`'s `new Set(paths)`
 * throw out of `onload` and the plugin never loads at all, while
 * `outlinePaths: "note.md"` quietly becomes one outline path per CHARACTER, and
 * an unknown enum state reaches a settings dropdown with no matching option. A
 * field that fails its check falls back to its default; it is not repaired and
 * not carried through.
 *
 * Unrecognized keys are dropped on the first save. Nothing is migrated: a
 * retired setting's values map onto whatever behaviour replaced it, which is
 * the change's business and not this function's.
 */
export function normalizePluginData(raw: unknown): PluginData {
  const stored = (raw ?? {}) as Record<string, unknown>;
  const bool = (value: unknown, fallback: boolean): boolean =>
    typeof value === "boolean" ? value : fallback;
  return {
    // Filtered rather than rejected wholesale: a file that picked up one bad
    // entry should lose that note's state, not every note's.
    outlinePaths: Array.isArray(stored.outlinePaths)
      ? stored.outlinePaths.filter(
          (path): path is string => typeof path === "string",
        )
      : [...DEFAULT_DATA.outlinePaths],
    coexistenceWarned: bool(
      stored.coexistenceWarned,
      DEFAULT_DATA.coexistenceWarned,
    ),
    debugCrossCheck: bool(stored.debugCrossCheck, DEFAULT_DATA.debugCrossCheck),
    debugFooterWidget: bool(
      stored.debugFooterWidget,
      DEFAULT_DATA.debugFooterWidget,
    ),
    markerVisibility: oneOf(
      KNOWN_MARKER_VISIBILITY,
      stored.markerVisibility,
      DEFAULT_DATA.markerVisibility,
    ),
    guideHighlight: oneOf(
      KNOWN_GUIDE_HIGHLIGHT,
      stored.guideHighlight,
      DEFAULT_DATA.guideHighlight,
    ),
    markerHighlight: oneOf(
      KNOWN_MARKER_HIGHLIGHT,
      stored.markerHighlight,
      DEFAULT_DATA.markerHighlight,
    ),
  };
}

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
