/**
 * Outline mode's settings: the default a new tab starts in, and how the
 * status bar states the active tab's mode.
 */

import { choice, toggle } from "./declare";

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

export const MODE_SETTINGS = [OUTLINE_BY_DEFAULT, STATUS_BAR_MODE] as const;
