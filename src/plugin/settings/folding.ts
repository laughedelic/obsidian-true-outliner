/** Folding's settings. */

import { toggle } from "./declare";

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

export const FOLDING_SETTINGS = [REMEMBER_FOLDS] as const;
