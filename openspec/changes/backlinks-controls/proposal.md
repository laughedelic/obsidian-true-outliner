## Why

`backlinks-footer` puts every reference to a note under it, in tree context. That is the right
default for a note with six references and the wrong one for a hub note with four hundred: the
note ends up buried under its own backlinks, and every reference costs a file read and a parse
to place. It is also indiscriminate — a reader who wants only what the daily notes said, or
only the places that pointed at a specific heading, has no way to ask.

This change makes the footer answer to its reader: what to show, in what order, and how much
before it asks. It also settles the one place the plugin collides with Obsidian itself — the
core Backlinks plugin's own in-document section, which renders the same references with no
lineage directly below ours.

Design decisions are recorded in `docs/research/16-structured-backlinks.md` (D8, D10, D12,
D14, D15).

## What Changes

- **Filtering, on two axes with two visual shapes.** Round pills for source folders (a
  *where*), square icon chips for reference kinds (a *what*): Note, Anchor, Embed, Property.
  Both are **focus-on**: nothing selected means no filter, selecting one narrows to it. A reset
  clears filters and search together. The row stays behind a Filter toggle in the header, which
  carries a dot while any filter is active (D8, D14).
- **Sorting** as a dropdown — recently modified (default), oldest, note name, most references
  (D15).
- **Volume caps**, one overall and one per note, both configurable with defaults. The header
  always reports the true total; the body says what it is not showing (D10).
- **An incompleteness cue that is spatial, not just numeric**: an ellipsis rung at the depth
  the missing nodes would occupy, plus a fade dissolving the last card, so a truncated list is
  visibly running off rather than ending (D10).
- **Coexistence with core backlinks**: a setting, defaulting on, that hides Obsidian's own
  in-document backlinks section from our stylesheet. Turning it off restores both. There is no
  public API to read or change the core setting, so this is a deliberate one-way suppression
  the user can always reverse (D12).
- **A settings tab section** for the caps and the coexistence toggle.
- Not in this change: chronological mode (daily-notes filter with date-parsed sort), which is
  recorded as wanted and deferred (D15).

## Capabilities

### New Capabilities

- `backlink-filtering`: the filter and sort model — focus-on semantics, the two filter axes and
  what each admits, reset behaviour, sort orders, and how filtering interacts with the caps
  (whether a cap applies before or after a filter, and what the reported total means).

### Modified Capabilities

- `backlinks-footer`: gains the header control row, the truncated-list presentation (rung and
  fade), and the rule that the reported count is always the true total even when the body is
  capped. The footer's unfiltered, uncapped rendering from the prior change becomes the special
  case of no filter and a cap not reached.
- `plugin-shell`: gains settings for the two caps and the core-backlinks suppression, and the
  stylesheet rule that suppression depends on.

## Impact

- **New**: filter/sort/cap module under `src/plugin/`; settings-tab section.
- **Modified**: the footer view from `backlinks-footer`; `styles.css` (the suppression rule and
  the fade mask); plugin data shape for the new settings.
- **Depends on** `backlinks-footer` — this change assumes the index, the projection and the
  footer surface exist. It should not begin until that change's spike series has returned a
  verdict, because a negative verdict there moves the surface and invalidates the header
  design here.
- **Interop caution**: hiding another plugin's UI is impolite by default in the wrong
  direction. The setting exists so the choice is the user's; the default is argued in D12 and
  should be revisited if community-directory review objects.
