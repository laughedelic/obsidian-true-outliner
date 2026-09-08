/**
 * The appearance settings, published to the document as custom properties.
 *
 * This is the whole mechanism for the unit step, the guide's thickness and its
 * intensity: there is no decoration rebuild, no per-view sweep and no
 * `forceRedraw`. Every rule and every JS-built expression that consumes these
 * is a `var()`, so writing one property moves the grid in every open pane and
 * in the backlinks footer at once, on the next style recalculation. That is
 * strictly more than `forceRedraw` can do — it reaches the active view only —
 * and it is the payoff for keeping every value in CSS.
 *
 * A property of the settings' OWN (`--to-set-*`), never the token itself. The
 * declarations in styles.css consume these as their defaults, so a reader's
 * snippet overriding `--to-decor-unit` still wins over both the default and the
 * setting. Writing the token here as an inline style on `body` would instead
 * beat every stylesheet rule at any specificity, quietly demoting the snippet
 * route — a stated requirement — to whatever the plugin is not setting.
 *
 * A preset resolves to a `var()` REFERENCE, not to a length: the numbers live
 * once, in styles.css, beside the defaults that read the same declarations.
 *
 * `body` rather than the editor's own DOM, because the footer is not made of
 * `.cm-line`s and both surfaces inherit from there — the same reason the tokens
 * are declared at `body` in the first place.
 */

import {
  GUIDE_INTENSITY_VARS,
  GUIDE_THICKNESS_VARS,
  SETTING_VARS,
  UNIT_STEP_VARS,
  type GuideIntensity,
  type GuideThickness,
  type OutlineUnit,
} from './chrome-tokens';
import type { GuideVisibility } from './decorate';

/** The settings this layer publishes. Read fresh on every apply. */
export interface AppearanceSource {
  readonly outlineUnit: OutlineUnit;
  readonly guideThickness: GuideThickness;
  readonly guideIntensity: GuideIntensity;
  readonly guideVisibility: GuideVisibility;
}

/**
 * On `body` while the guide layer draws nothing at all.
 *
 * The one thing about visibility that is not a decoration: wherever we draw a
 * guide for a list level we suppress Obsidian's own indent guide for it, so
 * exactly one line renders per level. Drawing none removes the reason for that
 * suppression — there is nothing left to double up with — so the reader's own
 * Obsidian setting governs list levels again.
 *
 * A whole-layer statement, never per line: flipping suppression as the caret
 * moved would make native guides appear and disappear under the reader, so the
 * `'cursor'` mode keeps suppressing on every line and simply draws fewer of its
 * own.
 */
export const GUIDES_OFF_CLASS = 'to-guides-off';

/**
 * What each setting contributes, or `null` where the reader has chosen the
 * default and the stylesheet's own value should resolve.
 *
 * Publishing nothing for a default is what lets the unit's default differ by
 * device class at all: the branch lives in the stylesheet, and a property
 * written here would override it on both.
 */
function published(source: AppearanceSource): Record<string, string | null> {
  return {
    [SETTING_VARS.unit]:
      source.outlineUnit === 'auto' ? null : `var(${UNIT_STEP_VARS[source.outlineUnit]})`,
    [SETTING_VARS.guideWidth]:
      source.guideThickness === 'hairline'
        ? null
        : `var(${GUIDE_THICKNESS_VARS[source.guideThickness]})`,
    [SETTING_VARS.guideIntensity]:
      source.guideIntensity === 'normal'
        ? null
        : `var(${GUIDE_INTENSITY_VARS[source.guideIntensity]})`,
  };
}

/** Write the current choices, removing every property the reader left alone. */
export function applyAppearance(source: AppearanceSource, target: HTMLElement): void {
  for (const [name, value] of Object.entries(published(source))) {
    if (value === null) target.style.removeProperty(name);
    else target.style.setProperty(name, value);
  }
  target.classList.toggle(GUIDES_OFF_CLASS, source.guideVisibility === 'off');
}

/**
 * Leave the document exactly as we found it.
 *
 * Every name this layer can write, not just the ones currently written: an
 * unload has to clear a property whatever the settings say now, and a value
 * left behind on `body` would outlive the plugin that explains it.
 */
export function clearAppearance(target: HTMLElement): void {
  for (const name of Object.values(SETTING_VARS)) target.style.removeProperty(name);
  target.classList.remove(GUIDES_OFF_CLASS);
}
