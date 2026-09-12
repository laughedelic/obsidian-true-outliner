/**
 * The outline's appearance settings, and the value types they hold.
 *
 * `MarkerVisibility` lives here (not decorations.ts, which imports `obsidian`
 * for `editorInfoField`) specifically so this module can stay pure — it's
 * really just a data type, not a decoration-rendering concern.
 */

import type { GuideHighlight, GuideVisibility, MarkerHighlight } from "../decorate";
import type { GuideIntensity, OutlineUnit } from "../chrome-tokens";
import { choice, toggle } from "./declare";

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
export type { GuideHighlight, MarkerHighlight } from "../decorate";

/**
 * Which of a line's ancestor guides the base layer draws
 * (`outline-appearance-settings`). Declared in decorate.ts beside the pure
 * filter that applies it, and re-exported here for the reason above.
 *
 * A different question from `GuideHighlight`, which accents guides that are
 * drawn: this one decides which exist to be accented at all.
 */
export type { GuideVisibility } from "../decorate";

/**
 * The appearance a reader picks from a preset rather than a length
 * (`outline-appearance-settings`). Declared in chrome-tokens.ts, beside the map
 * from each preset to the declaration holding its value — the numbers live in
 * the stylesheet and nothing here holds one.
 *
 * `auto` is the unit's default state, and means the plugin publishes nothing:
 * the step then resolves from the device-class default in the stylesheet.
 */
export type { GuideIntensity, OutlineUnit } from "../chrome-tokens";

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

export const APPEARANCE_SETTINGS = [
  OUTLINE_UNIT,
  GUIDE_VISIBILITY,
  GUIDE_HIDE_SINGLE_ROOT,
  GUIDE_INTENSITY,
  MARKER_VISIBILITY,
  GUIDE_HIGHLIGHT,
  MARKER_HIGHLIGHT,
] as const;
