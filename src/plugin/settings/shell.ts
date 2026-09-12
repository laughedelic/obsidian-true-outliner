/**
 * The plugin shell's own: whether the conflicting-plugins warning has been
 * shown, and the parser cross-check.
 */

import { toggle } from "./declare";

const COEXISTENCE_WARNED = toggle({ key: "coexistenceWarned", default: false });

const DEBUG_CROSS_CHECK = toggle({
  key: "debugCrossCheck",
  default: false,
  row: {
    name: "Debug: cross-check parser against metadata cache",
    desc: "Logs disagreements between the plugin parser and Obsidian metadata to the developer console when a structural command runs.",
  },
});

export const SHELL_SETTINGS = [COEXISTENCE_WARNED, DEBUG_CROSS_CHECK] as const;
