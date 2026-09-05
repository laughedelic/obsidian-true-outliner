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

/**
 * The backlinks footer's controls, and the two caps that bound it.
 *
 * Named values rather than a free number or a CSS length: the settings tab is
 * toggles and dropdowns, and a typed-in figure would be the first control
 * offering a value whose layout nothing has looked at.
 *
 * The two caps are measured differently because they answer different
 * questions. The overall cap counts references, and bounds how many notes the
 * footer reads at all. The per-note bound is an EXTENT, because a row's
 * rendered height depends on how its content wraps and a count of rows does
 * not predict it (backlinks-controls design D2, D3).
 */
export type OverallCap = "25" | "50" | "100" | "none";
export const DEFAULT_OVERALL_CAP: OverallCap = "50";

/** Maps onto `--to-backlinks-group-max`, whose measurement is unchanged. */
export type GroupHeight = "compact" | "standard" | "tall" | "unlimited";
export const DEFAULT_GROUP_HEIGHT: GroupHeight = "standard";

/** References admitted across the whole footer. */
export const OVERALL_CAP_REFERENCES: Record<OverallCap, number> = {
  "25": 25,
  "50": 50,
  "100": 100,
  none: Number.POSITIVE_INFINITY,
};

/**
 * The `max-height` each named bound sets. `standard` is the value the footer
 * shipped with, so the default changes nothing. `none` is a real `max-height`
 * keyword, which is what makes "uncapped" one value in this map rather than a
 * branch at the point of use.
 */
export const GROUP_HEIGHT_CSS: Record<GroupHeight, string> = {
  compact: "10rem",
  standard: "16rem",
  tall: "28rem",
  unlimited: "none",
};

/** How much of a lineage row names itself (docs/research/18, D19). */
export type SegmentIcons = "all" | "own" | "none";
export const DEFAULT_SEGMENT_ICONS: SegmentIcons = "all";

/** What stands between two ancestors on a lineage row. */
export type LineageSeparator = "none" | "chevron";
export const DEFAULT_LINEAGE_SEPARATOR: LineageSeparator = "none";

/**
 * The group order. Persisted like the rest, but deliberately NOT a settings-tab
 * row: it is set from the footer's own dropdown, where the reader is looking
 * when they want it. Its values are note-independent, which is why it lives
 * here at all rather than in the per-note view state the filters use.
 */
export type { SortOrder } from "./footer-filter";
import type { SortOrder } from "./footer-filter";
export const DEFAULT_SORT_ORDER: SortOrder = "recent";
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
  /** Whether the backlinks footer renders below an outline note. A real
   * setting rather than a debug flag: a reader who does not want the section
   * needs a way to say so, and the footer's own e2e coverage needs a way to
   * measure the editor with and without it. */
  backlinksFooter: boolean;
  /** Group order, set from the footer's dropdown rather than the settings tab. */
  backlinksSort: SortOrder;
  /** Overall reference cap; `none` for no limit. */
  backlinksOverallCap: OverallCap;
  /** How tall one source note's group may be before it is capped. */
  backlinksGroupHeight: GroupHeight;
  /** Whether to hide Obsidian's own in-document backlinks section where our
   * footer renders. Presentational only, and reversible at any time. */
  backlinksSuppressCore: boolean;
  /** See `SegmentIcons`. */
  backlinksSegmentIcons: SegmentIcons;
  /** See `LineageSeparator`. */
  backlinksSeparator: LineageSeparator;
  /** Whether the footer body draws guide lines. The model reports
   * `guideDepths` either way; the renderer is the one site that declines. */
  backlinksGuides: boolean;
}

export const DEFAULT_DATA: PluginData = {
  outlinePaths: [],
  coexistenceWarned: false,
  debugCrossCheck: false,
  markerVisibility: DEFAULT_MARKER_VISIBILITY,
  guideHighlight: DEFAULT_GUIDE_HIGHLIGHT,
  markerHighlight: DEFAULT_MARKER_HIGHLIGHT,
  backlinksFooter: true,
  backlinksSort: DEFAULT_SORT_ORDER,
  backlinksOverallCap: DEFAULT_OVERALL_CAP,
  backlinksGroupHeight: DEFAULT_GROUP_HEIGHT,
  backlinksSuppressCore: true,
  backlinksSegmentIcons: DEFAULT_SEGMENT_ICONS,
  backlinksSeparator: DEFAULT_LINEAGE_SEPARATOR,
  backlinksGuides: false,
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
const KNOWN_SORT_ORDER: Record<SortOrder, true> = {
  recent: true,
  oldest: true,
  name: true,
  references: true,
};
const KNOWN_OVERALL_CAP: Record<OverallCap, true> = {
  "25": true,
  "50": true,
  "100": true,
  none: true,
};
const KNOWN_GROUP_HEIGHT: Record<GroupHeight, true> = {
  compact: true,
  standard: true,
  tall: true,
  unlimited: true,
};
const KNOWN_SEGMENT_ICONS: Record<SegmentIcons, true> = {
  all: true,
  own: true,
  none: true,
};
const KNOWN_LINEAGE_SEPARATOR: Record<LineageSeparator, true> = {
  none: true,
  chevron: true,
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
    backlinksFooter: bool(stored.backlinksFooter, DEFAULT_DATA.backlinksFooter),
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
    backlinksSort: oneOf(
      KNOWN_SORT_ORDER,
      stored.backlinksSort,
      DEFAULT_DATA.backlinksSort,
    ),
    backlinksOverallCap: oneOf(
      KNOWN_OVERALL_CAP,
      stored.backlinksOverallCap,
      DEFAULT_DATA.backlinksOverallCap,
    ),
    backlinksGroupHeight: oneOf(
      KNOWN_GROUP_HEIGHT,
      stored.backlinksGroupHeight,
      DEFAULT_DATA.backlinksGroupHeight,
    ),
    backlinksSuppressCore: bool(
      stored.backlinksSuppressCore,
      DEFAULT_DATA.backlinksSuppressCore,
    ),
    backlinksSegmentIcons: oneOf(
      KNOWN_SEGMENT_ICONS,
      stored.backlinksSegmentIcons,
      DEFAULT_DATA.backlinksSegmentIcons,
    ),
    backlinksSeparator: oneOf(
      KNOWN_LINEAGE_SEPARATOR,
      stored.backlinksSeparator,
      DEFAULT_DATA.backlinksSeparator,
    ),
    backlinksGuides: bool(
      stored.backlinksGuides,
      DEFAULT_DATA.backlinksGuides,
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
