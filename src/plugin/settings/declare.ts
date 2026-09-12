/**
 * How a setting is declared: the two constructors every slice under this
 * directory uses, and the row shape the tab shows for a setting.
 */

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
export const toggle = <const D extends Declared & { readonly default: boolean }>(d: D) =>
  ({ ...d, control: "toggle" } as const);

export const choice = <
  const D extends Declared & {
    readonly default: string;
    readonly options: Readonly<Record<string, string>>;
  },
>(
  d: D & { readonly default: keyof D["options"] & string },
) => ({ ...d, control: "dropdown" } as const);
