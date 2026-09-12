/**
 * The backlinks footer's settings, and the value types they hold.
 */

import type { SortOrder } from "../footer-filter";
import { choice, toggle } from "./declare";

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
export type { SortOrder } from "../footer-filter";

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

export const DEFAULT_GROUP_HEIGHT: GroupHeight = BACKLINKS_GROUP_HEIGHT.default;

export const FOOTER_SETTINGS = [
  BACKLINKS_FOOTER,
  BACKLINKS_SORT,
  BACKLINKS_OVERALL_CAP,
  BACKLINKS_GROUP_HEIGHT,
  BACKLINKS_SUPPRESS_CORE,
  BACKLINKS_SEGMENT_ICONS,
  BACKLINKS_SEPARATOR,
  BACKLINKS_GUIDES,
] as const;
