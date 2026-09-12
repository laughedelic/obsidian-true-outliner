/**
 * Everything the plugin persists, each setting declared once, and the one
 * function that reads the file back safely. Pure module — no `obsidian`
 * import — so the whole shape is unit-testable.
 *
 * A declaration is the single place a setting exists: its key, its default,
 * the values it may hold and the row the settings tab shows for it. The
 * persisted shape (`PluginData`), the defaults, the allow-list
 * `normalizePluginData` checks against and the tab's definitions are all
 * derived from the list, so adding a setting is one entry here plus the
 * accessor pair on the plugin that says what a change does.
 *
 * Outline mode itself is NOT here: it is a per-tab CM6 state
 * (`outline-state.ts`), and what survives a restart is only the default a new
 * tab starts from (`outlineByDefault`). The per-path store this file used to
 * own retired with `per-tab-outline-mode`; `normalizePluginData`'s allow-list
 * is what drops its key from an upgrading install's `data.json`.
 *
 * `MarkerVisibility` lives here (not decorations.ts, which imports `obsidian`
 * for `editorInfoField`) specifically so this module can stay pure — it's
 * really just a data type, not a decoration-rendering concern.
 */

import type { SortOrder } from "./footer-filter";
import type { GuideHighlight, GuideVisibility, MarkerHighlight } from "./decorate";
import type { GuideIntensity, OutlineUnit } from "./chrome-tokens";

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
 * Which of a line's ancestor guides the base layer draws
 * (`outline-appearance-settings`). Declared in decorate.ts beside the pure
 * filter that applies it, and re-exported here for the reason above.
 *
 * A different question from `GuideHighlight`, which accents guides that are
 * drawn: this one decides which exist to be accented at all.
 */
export type { GuideVisibility } from "./decorate";

/**
 * The appearance a reader picks from a preset rather than a length
 * (`outline-appearance-settings`). Declared in chrome-tokens.ts, beside the map
 * from each preset to the declaration holding its value — the numbers live in
 * the stylesheet and nothing here holds one.
 *
 * `auto` is the unit's default state, and means the plugin publishes nothing:
 * the step then resolves from the device-class default in the stylesheet.
 */
export type { GuideIntensity, OutlineUnit } from "./chrome-tokens";

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

/** Maps onto `--to-backlinks-group-max`, whose measurement is unchanged. */
export type GroupHeight = "compact" | "standard" | "tall" | "unlimited";

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

/** How much of a lineage row names itself (docs/research/structured-backlinks, D19). */
export type SegmentIcons = "all" | "own" | "none";

/** What stands between two ancestors on a lineage row. */
export type LineageSeparator = "none" | "chevron";

/**
 * The group order. Persisted like the rest, but deliberately NOT a settings-tab
 * row: it is set from the footer's own dropdown, where the reader is looking
 * when they want it. Its values are note-independent, which is why it lives
 * here at all rather than in the per-note view state the filters use.
 */
export type { SortOrder } from "./footer-filter";

/**
 * How the status bar states the active tab's mode.
 *
 * A setting because the item cannot be dismissed the way the ribbon icon can:
 * Obsidian lets a user hide a ribbon icon from its own context menu, and offers
 * nothing equivalent for a plugin's status bar item, so "I don't want this one"
 * has to be answerable here.
 *
 * `icon` by default — the same glyph the ribbon carries, so the two surfaces
 * read as one control in two places, and narrower than a word in a bar where
 * width is shared with everything else.
 */
export type StatusBarMode = "none" | "text" | "icon";

// ---- Declarations ----------------------------------------------------------

/** The row the settings tab shows for a setting. A setting without one is
 * persisted but set from somewhere else. */
export interface SettingRow {
  readonly name: string;
  readonly desc: string;
}

interface Declared {
  readonly key: string;
  readonly row?: SettingRow;
}

/**
 * A choice's `options` carry every value it may hold with the label the tab
 * shows for it, so the one object is both the dropdown and the allow-list
 * `normalizePluginData` checks against. Written with `satisfies` against the
 * value type where one is exported, so a state added to the type without a
 * label is a compile error and the runtime check cannot fall behind the type
 * it guards.
 *
 * `const` type parameters keep each declaration's literal shape — which keys
 * its options hold, and whether it has a row — because `PluginData` and the
 * tab's row keys are read off those shapes.
 */
const toggle = <const D extends Declared & { readonly default: boolean }>(d: D) =>
  ({ ...d, control: "toggle" } as const);

const choice = <
  const D extends Declared & {
    readonly default: string;
    readonly options: Readonly<Record<string, string>>;
  },
>(
  d: D & { readonly default: keyof D["options"] & string },
) => ({ ...d, control: "dropdown" } as const);

/** The outline state every newly constructed editor starts in. The mode's
 * only persisted value: a tab's own state lives in CM6 state and dies with
 * it (`outline-state.ts`). */
const OUTLINE_BY_DEFAULT = toggle({
  key: "outlineByDefault",
  default: true,
  row: {
    name: "Open new tabs in outline mode",
    desc: "Whether a note opens outlined or as stock Obsidian. Applies to notes opened from now on — in a new tab, or in an existing tab that switches to another note. It never retoggles a tab that is already open, the way Obsidian’s own default view mode works. Toggle a single tab from the command palette (“Toggle outline mode”), the editor right-click menu, the ribbon icon, or the status bar item.",
  },
});

const STATUS_BAR_MODE = choice({
  key: "statusBarMode",
  default: "icon",
  options: {
    none: "Nothing",
    icon: "An icon",
    text: "Words",
  } satisfies Record<StatusBarMode, string>,
  row: {
    name: "Show outline mode in the status bar",
    desc: "What the status bar shows for the active tab, and whether it shows anything at all. Obsidian can hide the ribbon icon from its own right-click menu but offers no equivalent for a plugin’s status bar item, so this is where that chip is turned off. Desktop only — there is no status bar on mobile.",
  },
});

/** Whether a note's folds come back when it is reopened. Obsidian stores
 * them per file in workspace state; this decides whether we keep what it
 * restores (`better-folding-ux` D8). */
const REMEMBER_FOLDS = toggle({
  key: "rememberFolds",
  default: true,
  row: {
    name: "Remember folds",
    desc: "Whether a note reopens with the nodes you left folded. Fold state lives in Obsidian’s own workspace data, never in the note — a file is byte-identical whether its nodes are folded or not, and always readable without this plugin. Turn this off to have every note open fully expanded.",
  },
});

const COEXISTENCE_WARNED = toggle({ key: "coexistenceWarned", default: false });

const DEBUG_CROSS_CHECK = toggle({
  key: "debugCrossCheck",
  default: false,
  row: {
    name: "Debug: cross-check parser against metadata cache",
    desc: "Logs disagreements between the plugin parser and Obsidian metadata to the developer console when a structural command runs.",
  },
});

/** Whether the backlinks footer renders below an outline note. A real
 * setting rather than a debug flag: a reader who does not want the section
 * needs a way to say so, and the footer's own e2e coverage needs a way to
 * measure the editor with and without it. */
const BACKLINKS_FOOTER = toggle({
  key: "backlinksFooter",
  default: true,
  row: {
    name: "Show structured backlinks below notes",
    desc: "Renders every reference to the open note beneath it, each in the tree of the note it came from. Outline mode only.",
  },
});

/** Group order, set from the footer's dropdown rather than the settings tab;
 * the labels are that dropdown's. */
const BACKLINKS_SORT = choice({
  key: "backlinksSort",
  default: "recent",
  options: {
    recent: "Recently modified",
    oldest: "Oldest first",
    name: "Note name",
    references: "Most references",
  } satisfies Record<SortOrder, string>,
});
export const SORT_ORDER_LABELS: Readonly<Record<SortOrder, string>> = BACKLINKS_SORT.options;

/** Overall reference cap; `none` for no limit. */
const BACKLINKS_OVERALL_CAP = choice({
  key: "backlinksOverallCap",
  default: "50",
  options: {
    "25": "25 references",
    "50": "50 references",
    "100": "100 references",
    none: "No limit",
  } satisfies Record<OverallCap, string>,
  row: {
    name: "Backlinks: how many references to show",
    desc: "An upper bound on the whole footer. Notes are added whole and in order until the next one would cross it, so a note past the bound is never read. The header always reports the true total.",
  },
});

/** How tall one source note's group may be before it is capped. */
const BACKLINKS_GROUP_HEIGHT = choice({
  key: "backlinksGroupHeight",
  default: "standard",
  options: {
    compact: "Compact",
    standard: "Standard",
    tall: "Tall",
    unlimited: "Uncapped",
  } satisfies Record<GroupHeight, string>,
  row: {
    name: "Backlinks: how tall one note’s references may be",
    desc: "How much of the screen a single referencing note may take before the rest is folded away behind a control. A height rather than a number of references, because a reference’s height depends on how its content wraps.",
  },
});

/** Whether to hide Obsidian's own in-document backlinks section where our
 * footer renders. Presentational only, and reversible at any time. */
const BACKLINKS_SUPPRESS_CORE = toggle({
  key: "backlinksSuppressCore",
  default: true,
  row: {
    name: "Backlinks: hide Obsidian’s own in-document section",
    desc: "Hides Obsidian’s in-document backlinks section entirely in notes where this plugin renders its own — including unlinked mentions, which this plugin does not reproduce and has no way to hide selectively. Obsidian’s own Backlinks pane still shows both, unaffected. Presentational only: no other plugin’s settings are read or changed, and turning this off restores the section immediately.",
  },
});

const BACKLINKS_SEGMENT_ICONS = choice({
  key: "backlinksSegmentIcons",
  default: "all",
  options: {
    all: "Every ancestor",
    own: "Only the row’s own marker",
    none: "No markers",
  } satisfies Record<SegmentIcons, string>,
  row: {
    name: "Backlinks: markers on a lineage row",
    desc: "A lineage row names every ancestor between the source note and the reference. This chooses how many of them carry their own marker icon.",
  },
});

const BACKLINKS_SEPARATOR = choice({
  key: "backlinksSeparator",
  default: "none",
  options: {
    none: "Nothing",
    chevron: "A chevron",
  } satisfies Record<LineageSeparator, string>,
  row: {
    name: "Backlinks: what separates ancestors",
    desc: "What stands between two ancestors named on the same lineage row.",
  },
});

/** Whether the footer body draws guide lines. The model reports
 * `guideDepths` either way; the renderer is the one site that declines. */
const BACKLINKS_GUIDES = toggle({
  key: "backlinksGuides",
  default: false,
  row: {
    name: "Backlinks: draw guide lines in the footer",
    desc: "Draws the same indentation guides the editor uses down the footer’s own rows.",
  },
});

/** One tree level's step, as a preset. `auto` publishes nothing and lets the
 * stylesheet's own device-class default resolve. */
const OUTLINE_UNIT = choice({
  key: "outlineUnit",
  default: "auto",
  options: {
    auto: "Auto",
    compact: "Compact",
    balanced: "Balanced",
    roomy: "Roomy",
    wide: "Wide",
  } satisfies Record<OutlineUnit, string>,
  row: {
    name: "Outline width",
    desc: "How far one level of the outline steps to the right — in the editor and in the backlinks footer alike. “Auto” takes a narrower step on a phone or tablet, where the width is worth more, and a roomier one on a desktop. Every step keeps a child’s marker clear of its parent’s text; a CSS snippet setting --to-decor-unit still overrides whatever is chosen here.",
  },
});

const GUIDE_VISIBILITY = choice({
  key: "guideVisibility",
  default: "all",
  options: {
    all: "Every level",
    ancestors: "The levels the cursor is inside",
    subtree: "The levels inside the current node",
    off: "None",
  } satisfies Record<GuideVisibility, string>,
  row: {
    name: "Which indentation guides to draw",
    desc: "The vertical lines that connect a node to the levels above it. The two middle choices follow the cursor: the route down to the node it is in, or the ladder inside that node. Obsidian’s own indent guides stay hidden in outline mode whichever is chosen — they sit on columns this grid does not use.",
  },
});

/** Drop the outermost guide while the document has exactly one root — a
 * guide every line carries names nothing. Paint only: no line moves. */
const GUIDE_HIDE_SINGLE_ROOT = toggle({
  key: "guideHideSingleRoot",
  default: false,
  row: {
    name: "Hide the outermost guide under a single root",
    desc: "Where a whole note hangs off one top-level node — a single “# Title”, or any zoomed-in view — that node’s guide runs down every line while telling the reader nothing. This drops it and keeps every deeper level. Nothing moves: guides are painted, not laid out.",
  },
});

const GUIDE_INTENSITY = choice({
  key: "guideIntensity",
  default: "subtle",
  options: {
    subtle: "Subtle",
    normal: "Normal",
    strong: "Strong",
  } satisfies Record<GuideIntensity, string>,
  row: {
    name: "Guide line strength",
    desc: "How strongly a guide stands out, as a proportion of the theme’s own faintest text — so it stays right in a light theme and a dark one. A snippet can change the colour, and the line’s weight, itself.",
  },
});

/** Experiment 5a leaf-visibility round (see
 * docs/research/decoration-experiments-plan.md) — a real, persisted,
 * user-facing setting so it can be tried against a real vault without a
 * rebuild. */
const MARKER_VISIBILITY = choice({
  key: "markerVisibility",
  default: "all",
  options: {
    all: "All eligible kinds (status quo)",
    "with-children": "Only nodes that have children",
    "headings-and-paragraphs": "Only headings and paragraphs",
  } satisfies Record<MarkerVisibility, string>,
  row: {
    name: "Debug: block marker visibility (experiment 5a)",
    desc: "Which nodes get a block marker icon at all. Most leaf atom kinds (code, table, callout, quote, HTML, hr) already carry their own native visual style, so a marker may only be worth showing on branch nodes. Takes effect on the next edit or note switch.",
  },
});

const GUIDE_HIGHLIGHT = choice({
  key: "guideHighlight",
  default: "full",
  options: {
    off: "No highlight",
    full: "Whole guide of every ancestor",
    lineage: "Only the part leading down to the cursor",
  } satisfies Record<GuideHighlight, string>,
  row: {
    name: "Highlight guides at the cursor’s position",
    desc: "Which indentation guides to accent for the node the cursor is in. “Whole guide” accents each ancestor’s guide along its full length — everything the cursor is inside of. “Only the part leading down to the cursor” accents just the stretch of each guide between that ancestor and the next level, so the accent traces the route to the cursor instead.",
  },
});

const MARKER_HIGHLIGHT = choice({
  key: "markerHighlight",
  default: "current",
  options: {
    off: "No highlight",
    current: "The current node only",
    lineage: "The current node and all its ancestors",
  } satisfies Record<MarkerHighlight, string>,
  row: {
    name: "Highlight markers at the cursor’s position",
    desc: "Which block markers — or a list item’s native bullet or number — to accent. “The current node only” marks where the cursor is; adding the ancestors makes each level of the lineage visible, which is the only indication available inside a plain list, where there are no guides to accent.",
  },
});

/** Every setting, in the order the tab shows them. */
export const SETTINGS = [
  OUTLINE_BY_DEFAULT,
  STATUS_BAR_MODE,
  REMEMBER_FOLDS,
  COEXISTENCE_WARNED,
  DEBUG_CROSS_CHECK,
  BACKLINKS_FOOTER,
  BACKLINKS_SORT,
  BACKLINKS_OVERALL_CAP,
  BACKLINKS_GROUP_HEIGHT,
  BACKLINKS_SUPPRESS_CORE,
  BACKLINKS_SEGMENT_ICONS,
  BACKLINKS_SEPARATOR,
  BACKLINKS_GUIDES,
  OUTLINE_UNIT,
  GUIDE_VISIBILITY,
  GUIDE_HIDE_SINGLE_ROOT,
  GUIDE_INTENSITY,
  MARKER_VISIBILITY,
  GUIDE_HIGHLIGHT,
  MARKER_HIGHLIGHT,
] as const;

export type SettingDeclaration = (typeof SETTINGS)[number];
export type SettingKey = SettingDeclaration["key"];
/** The keys the settings tab offers a control for. */
export type SettingRowKey = Extract<SettingDeclaration, { row: SettingRow }>["key"];

/** A choice holds any of its options, not only the one it defaults to. */
export type PluginData = {
  -readonly [S in SettingDeclaration as S["key"]]: S extends { readonly options: infer O }
    ? keyof O & string
    : boolean;
};

export const DEFAULT_GROUP_HEIGHT: GroupHeight = BACKLINKS_GROUP_HEIGHT.default;

export const DEFAULT_DATA: PluginData = Object.fromEntries(
  SETTINGS.map((s) => [s.key, s.default]),
) as PluginData;

export function isSettingKey(key: string): key is SettingKey {
  return SETTINGS.some((s) => s.key === key);
}

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
 * anything, and an unchecked one reaches whatever consumes it: an unknown enum
 * state arrives at a settings dropdown with no matching option, and a
 * non-boolean default would decide every new tab's mode by truthiness. The
 * retired `outlinePaths` was the sharpest case measured — `42` made its
 * `new Set(paths)` throw out of `onload` so the plugin never loaded at all, and
 * `"note.md"` quietly became one outline path per CHARACTER. A field that fails
 * its check falls back to its default; it is not repaired and not carried
 * through.
 *
 * Unrecognized keys are dropped on the first save. Nothing is migrated: a
 * retired setting's values map onto whatever behaviour replaced it, which is
 * the change's business and not this function's.
 */
export function normalizePluginData(raw: unknown): PluginData {
  const stored = (raw ?? {}) as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const s of SETTINGS) {
    const value = stored[s.key];
    out[s.key] =
      s.control === "toggle"
        ? typeof value === "boolean"
          ? value
          : s.default
        : typeof value === "string" &&
            Object.prototype.hasOwnProperty.call(s.options, value)
          ? value
          : s.default;
  }
  return out as PluginData;
}

/**
 * The tab's rows, in Obsidian's declarative shape (`SettingDefinitionItem`),
 * derived here so the pre-1.13 `display()` fallback and the 1.13+ definitions
 * render the same list from the same source. Typed structurally rather than
 * against `obsidian`, which this module does not import.
 */
export interface SettingDefinition {
  readonly name: string;
  readonly desc: string;
  readonly control:
    | { readonly type: "toggle"; readonly key: SettingRowKey; readonly defaultValue: boolean }
    | {
        readonly type: "dropdown";
        readonly key: SettingRowKey;
        readonly defaultValue: string;
        readonly options: Readonly<Record<string, string>>;
      };
}

export function settingDefinitions(): SettingDefinition[] {
  const rows: SettingDefinition[] = [];
  for (const s of SETTINGS) {
    if (!("row" in s)) continue;
    const key = s.key;
    rows.push({
      ...s.row,
      control:
        s.control === "toggle"
          ? { type: "toggle", key, defaultValue: s.default }
          : { type: "dropdown", key, defaultValue: s.default, options: s.options },
    });
  }
  return rows;
}
