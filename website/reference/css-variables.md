# CSS variables

Every visual knob of the outline is a CSS custom property, defined on `body`, so a CSS snippet can retune it for the editor and the backlinks footer at once. A snippet's value always wins over the corresponding setting.

A snippet goes in `.obsidian/snippets/` and is enabled under **Settings → Appearance → CSS snippets**.

## The grid

One variable sets the step of the whole grid, and the others hold the lengths behind the width presets.

| Variable | Meaning |
| --- | --- |
| `--to-decor-unit` | One level's horizontal step. Every column on every surface derives from it, so overriding this one value moves the whole grid. |
| `--to-unit-compact` `--to-unit-balanced` `--to-unit-roomy` `--to-unit-wide` | The lengths behind the four **Outline width** presets (1.5625rem, 1.75rem, 2rem, 2.5rem). |
| `--to-unit-default` | What *Auto* resolves to: roomy on desktop, compact under `body.is-mobile`. |

```css
body {
  --to-decor-unit: 1.5rem;
}
```

The unit should be `rem`, not `em`: the value is resolved where it is used, and an `em` unit would grow inside a heading's larger font.

## Markers

Each mark drawn beside a node has its own size.

| Variable | Meaning |
| --- | --- |
| `--to-marker-icon-size` | Size of the kind icon. |
| `--to-fold-size` | Size of the fold chevron drawn on a node's marker. |
| `--to-zoom-mark-size` | Size of the marker at the start of the zoom trail. |

The marker column's width is derived from Obsidian's own `--checkbox-size`, so bullets, checkboxes and icons share one column on every platform.

## Guides

Guides have a colour, a thickness, and a contrast level for each strength choice.

| Variable | Meaning |
| --- | --- |
| `--to-guide-color` | Guide colour. Defaults derive from the theme's faintest text colour. |
| `--to-guide-width` | Guide thickness. |
| `--to-guide-intensity-subtle` `--to-guide-intensity-normal` `--to-guide-intensity-strong` | The contrast behind the three **Guide line strength** choices. |

```css
body {
  --to-guide-color: var(--color-accent);
  --to-guide-width: 2px;
}
```

## Position indicators

The highlight that follows the caret has a colour and a thickness.

| Variable | Meaning |
| --- | --- |
| `--to-decor-accent` | Colour of the highlighted guide and marker at the caret's position. Defaults to the theme accent. |
| `--to-trail-width` | Thickness of the highlighted stretch of a guide. |

## Backlinks footer

The footer shares the grid above and adds two variables of its own.

| Variable | Meaning |
| --- | --- |
| `--to-backlinks-group-max` | Height cap of one note's group, behind the **how tall one note's references may be** setting. |
| `--to-backlinks-mark` | Colour of the markers on lineage rows. Defaults to the theme's muted text. |

## Classes

Two families of classes are ours, and a selector on them is stable across releases.

- Outline chrome lives in classes prefixed `to-decor-` on the editor's lines.
- The footer lives under `.to-backlinks`.
- Anything without the prefix is Obsidian's own and follows Obsidian's rules.
