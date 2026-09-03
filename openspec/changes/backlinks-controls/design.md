## Context

See proposal.md — Why. What matters here is the shape `backlinks-footer` shipped, because every
decision below is about where in that shape a control belongs.

**The index answers at two levels, and only one of them costs anything.** `BacklinkIndex` holds a
reverse map of target path → source path → `BacklinkReference[]`, built entirely from Obsidian's
in-memory metadata cache. `summaries()` and `referencesFrom()` read it with no file access;
`place()` is the only method that reads and parses a source note. Every value the two filter axes
need is already in the cheap level: a source's folder is `splitPath(path).folder`, and a
reference's kind is `BacklinkReference.kind`.

**The footer repaints from scratch.** `FooterController.render()` rebuilds a detached tree and
swaps it in with one mutation, then fills each group asynchronously through `fillGroup()`.
Diffing was considered and rejected there. A generation counter makes a late async fill give up
rather than write into a rebuilt DOM.

**A group's height cap is measured, not computed.** `fillGroup()` renders every row, awaits the
`MarkdownRenderer` promises, and only then compares `scrollHeight` to `clientHeight` — because
row height depends on how content wraps and is not knowable in advance. An overflow smaller than
one line removes the cap outright rather than clipping a row through its glyphs. The code carries
a recorded regression from measuring too early: a "Show more" that revealed nothing when pressed.

**Reading state is per note and not persisted.** `viewStates` keys collapse and expansion by
target path and `pruneFooterViewState()` drops entries when a tab closes — the answer research 18
records for its first open question.

**Cost is settled and is not a constraint here.** S5 (`docs/research/19`) measured index build at
0.2–0.3ms, placement of all sources at ~2ms, and every group resolving in the same frame as the
header. It names this change as the consumer of that finding: caps are a legibility decision.

**Settings cost two declarations each.** `TrueOutlinerSettingTab` declares every setting in
`getSettingDefinitions()` for Obsidian 1.13+ and again in `display()` as the documented pre-1.13
fallback, with defaults and coercion in `mode-registry.ts`. `minAppVersion` is 1.5.0.

## Goals / Non-Goals

**Goals:**

- One model that answers "which groups, in what order, how many" before any note is read, so the
  overall cap bounds work as well as length.
- Keep every mechanism `backlinks-footer` shipped that was chosen by measurement, and extend it
  rather than replace it.
- Suppression of Obsidian's own in-document backlinks that leaves no residue when the plugin is
  disabled, without a lifecycle hook to get wrong.

**Non-Goals:**

- A search index, or any matching over reference content. The controls are answered from data
  already in memory; anything else is a different change.
- Persisting filter state across sessions. Collapse state is not persisted, for a reason that
  applies to filters unchanged.
- Any change to `buildRows`, the projection, or the chrome contract. The controls decide *which*
  groups are built, never how a row renders.

## Decisions

### D1. The controls are a pure function over the summary layer

A new `src/plugin/footer-filter.ts` takes the summaries, the per-source references the reverse map
already holds, and a controls state, and returns the admitted groups in order, the true totals,
and the shortfall. It reads no files and touches no DOM, so it is unit-testable in
`tests/footer-filter.test.ts` without a vault.

This is possible only because both axes live in the cheap level (see Context). The alternative —
filtering after placement, where the placed tree is available — was rejected on two grounds. It
would make the overall cap unable to bound anything: every candidate note would have to be read
and parsed to discover whether it should be shown. And it would put the filter decision downstream
of an async boundary, so a group could appear and then vanish as its read resolved.

### D2. The overall cap admits whole groups, before placement

Groups are admitted in sort order while the running reference total stays within the cap; the
first group that would cross it is not admitted, and neither is anything after it. A single note
whose own references exceed the cap is admitted anyway, because refusing it would render a footer
that reports references and shows none — its own height bound is what limits it.

*Why not cut at exactly N references,* mid-group: a group is the unit a reader reads, and half a
note's tree is worse than none of it. The cut would also fall at a position determined by the
notes sorted before it, which has nothing to do with the note being cut.

The consequence is that the cap is a bound, not a quota — the footer usually shows slightly fewer
references than the cap allows. The header reports true totals regardless, so nothing about this
is visible as a discrepancy.

### D3. The per-note bound stays the group-height cap, and the rung is measured

`backlink-filtering` requires an omission cue "at the depth the omitted results would occupy".
That reads like a count cap, and an earlier draft of this design made it one. It should not be.

Row height depends on how content wraps, so N rows is not a bound on anything a reader perceives:
three wrapped rows can be three times the height of three short ones. The shipped height cap was
chosen for exactly this, and its measurement pass exists because the same fact makes the overflow
unknowable before layout.

The count the rung needs is available in that pass. `fillGroup()` already waits for the markdown
renders to settle and compares `scrollHeight` to `clientHeight`; the rows whose offset exceeds
`clientHeight` are the omitted ones, and the first of them carries the depth the rung sits at. So
the rung is a measured consequence of the existing cap rather than a second truncation mechanism,
and it replaces the bare chevron — one control that says how much is hidden and folds it open.

The rung renders after the capped body rather than inside it, or the clip would hide it too.

### D4. Filters and search are per-note view state; sort is a persisted preference

Filter selections and the search term join `ViewState`, keyed by target path and pruned with the
tab. They are about the reading being done, which is the argument research 18 already accepted for
collapse state — and the folder and kind values differ per note, so a selection is not portable
anyway.

Sort order is the exception and goes to plugin data. Its four values are note-independent, and a
reader who wants source-name order wants it in every footer, not in the one note where they set
it. It is set from the footer's dropdown and needs no settings-tab row.

### D5. "Load more" raises this note's cap and repaints

The model is a pure function of (summaries, controls), and its group order is stable, so raising
the cap yields a superset in the same order. "Load more" therefore adds a tranche to a per-note
cap override in `ViewState` and calls the existing `render()`.

*Why not append to the DOM:* the controller repaints from scratch by design, and appending would
introduce the second rendering path that decision exists to avoid. The spec's guarantee — nothing
already rendered is removed or reordered — is met by the model's stability, not by preserving DOM.

### D6. Core-backlinks suppression is one stylesheet rule keyed on our own footer

```css
.workspace-leaf-content:has(.to-backlinks.is-suppressing-core) .embedded-backlinks {
  display: none;
}
```

The condition this needs to express is "a view where our footer is rendering", and `:has()` states
exactly that, with the setting carried as a class on the footer element itself. Nothing is added to
a container and nothing has to be removed later: the rule lives in the stylesheet Obsidian unloads
with the plugin, which satisfies `plugin-shell`'s no-residue requirement by construction.

*Why not a class on the view container,* set when outline mode activates: it needs per-view
lifecycle management, it has to be reversed on unload for the residue requirement, and it would
suppress the core section in a note where our footer is switched off — where there is no
duplication and so no reason to suppress.

`:has()` is available: Chromium has supported it since 105, and `minAppVersion` 1.5.0 ships a
considerably later Electron. `.embedded-backlinks` is Obsidian's own class, so task 5.1 verifies
the selector against a running Obsidian rather than trusting it — and if it is ever renamed the
rule fails open, showing both sections, which is the safe direction.

### D7. Appearance settings are renderer-side declines; the model keeps one shape

`buildRows` keeps reporting `guideDepths` and every lineage segment whatever the appearance
settings say, and the renderer is the single site that declines to draw them. The model therefore
has one shape under test rather than one per setting combination, and a setting can never produce
a model state no test covers.

### D8. Both caps are dropdowns of named values

The settings tab is toggles and dropdowns, and a free-text number or CSS length would be the first
control inviting values whose layout nothing has looked at. So: overall cap as a count
(25 / 50 / 100 / no limit, default 50), per-note bound as a named height mapping to the existing
`--to-backlinks-group-max` (compact / standard / tall / unlimited, default standard = the shipped
16rem).

The defaults are legibility judgments, and S5 is why they can be: nothing about performance forces
them. Around fifty references is where a footer stops reading as a list and starts reading as a
document; 16rem is roughly eight to ten short rows, a card that can be taken in without scrolling
inside it.

## Risks / Trade-offs

- **`.embedded-backlinks` is Obsidian's internal class name** → checked against a running
  Obsidian before the rule is written (task 5.1) and pinned by e2e afterwards (task 7.3), rather
  than assumed. A rename fails open — both sections render, which is the state the setting exists
  to allow anyway.
- **A selected filter value can stop existing** when the note's references change under an open
  footer → a selection whose value is absent from the current axis is dropped, which returns that
  axis to admitting everything; this is the spec's deselect rule reaching the same state.
- **Sort order changes which groups the overall cap admits** → correct, and potentially surprising
  when a reader changes sort and the set changes rather than just the order. The shortfall
  statement always names the true totals, so the footer never implies it is showing everything.
- **Six new settings, twelve declarations** → accepted rather than abstracted. An abstraction over
  a settings tab that Obsidian will itself replace once `minAppVersion` clears 1.13 would be
  written to be deleted.
- **The rung depends on a measurement that runs after async renders settle** → it is computed in
  the pass that already gates the "Show more" control, so it cannot disagree with it; the recorded
  regression from measuring too early is what fixes its position in the sequence.

## Open Questions

- **Whether "no limit" on the overall cap should exist at all.** It is offered because a reader
  with a small vault should not meet a cap they never needed, but it is also the one value that
  makes a hub note's footer unbounded. Answerable after the defaults have been used against a real
  vault, and changing it touches one options list.
