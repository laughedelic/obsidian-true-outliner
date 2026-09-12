/**
 * Everything the plugin persists, and the one function that reads it back
 * safely. Pure module — no `obsidian` import — so the whole shape is
 * unit-testable.
 *
 * Each setting is declared once, in its feature's slice under `settings/`:
 * its key, its default, the values it may hold and the row the settings tab
 * shows for it. The persisted shape (`PluginData`), the defaults, the
 * allow-list `normalizePluginData` checks against and the tab's definitions
 * are all derived from the list below, so adding a setting is one entry in
 * its slice plus the accessor pair on the plugin that says what a change
 * does. The list itself changes when a feature area is added, not when a
 * setting is.
 *
 * Outline mode itself is NOT here: it is a per-tab CM6 state
 * (`outline-state.ts`), and what survives a restart is only the default a new
 * tab starts from (`outlineByDefault`). The per-path store this file used to
 * own retired with `per-tab-outline-mode`; `normalizePluginData`'s allow-list
 * is what drops its key from an upgrading install's `data.json`.
 */

import type { SettingRow } from "./settings/declare";
import { APPEARANCE_SETTINGS } from "./settings/appearance";
import { FOLDING_SETTINGS } from "./settings/folding";
import { FOOTER_SETTINGS } from "./settings/footer";
import { MODE_SETTINGS } from "./settings/mode";
import { SHELL_SETTINGS } from "./settings/shell";

/** Every setting, in the order the tab shows them. */
export const SETTINGS = [
  ...MODE_SETTINGS,
  ...FOLDING_SETTINGS,
  ...SHELL_SETTINGS,
  ...FOOTER_SETTINGS,
  ...APPEARANCE_SETTINGS,
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
