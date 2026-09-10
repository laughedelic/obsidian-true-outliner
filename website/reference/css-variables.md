# CSS variables

Every visual knob of the outline is a CSS custom property, defined on `body`, so a CSS snippet can retune it for the editor and the backlinks footer at once. A snippet's value always wins over the corresponding setting.

Put a snippet in `.obsidian/snippets/` and enable it under **Settings → Appearance → CSS snippets**.

## The grid

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

Use `rem`, not `em`: the value is resolved where it is used, and an `em` unit would grow inside a heading's larger font.

## Markers

| Variable | Meaning |
| --- | --- |
| `--to-marker-icon-size` | Size of the kind icon. |
| `--to-fold-size` | Size of the fold chevron drawn on a node's marker. |
| `--to-zoom-mark-size` | Size of the marker at the start of the zoom trail. |

The marker column's width is derived from Obsidian's own `--checkbox-size`, so bullets, checkboxes and icons share one column on every platform.

## Guides

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

| Variable | Meaning |
| --- | --- |
| `--to-decor-accent` | Colour of the highlighted guide and marker at the caret's position. Defaults to the theme accent. |
| `--to-trail-width` | Thickness of the highlighted stretch of a guide. |

## Backlinks footer

| Variable | Meaning |
| --- | --- |
| `--to-backlinks-group-max` | Height cap of one note's group, behind the **how tall one note's references may be** setting. |
| `--to-backlinks-mark` | Colour of the markers on lineage rows. Defaults to the theme's muted text. |

## Classes

Outline chrome lives in classes prefixed `to-decor-` on the editor's lines, and the footer under `.to-backlinks`. A selector on those is stable across releases; anything without the prefix is Obsidian's own and follows Obsidian's rules.
