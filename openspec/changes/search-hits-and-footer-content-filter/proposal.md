## Why

The backlinks footer's free-text field matches source note NAMES and nothing else. A reader
looking at a hub note's four hundred references who remembers a phrase from one of them has no
way to ask for it, and the footer already renders exactly the text they remember — the
referencing node, its ancestors, its children. `backlinks-controls` made the name-only rule
deliberately, because matching content "would need the parsed tree of every candidate note" and
placement's cost was still assumed rather than measured (`docs/research/18`, D8). It has since
been measured: placing every source of the hub fixture takes about 2ms (`docs/research/19`, S5),
and a substring pass over fifty thousand nodes takes 12ms (`docs/research/31`). The rule was a
cost decision, and the cost is gone.

This is also the first of the search changes planned in `docs/research/31`: the same
"which nodes match this text, shown in their tree" that a search palette and an in-note filter
will need, delivered first on the surface that already exists. What lands here — the matcher and
the generalised hit model — is what those two build on.

## What Changes

- **The footer's search term matches reference content.** A reference is admitted when the term
  occurs in what the footer shows for it: the referencing node's own text, the first line of
  each ancestor in its lineage, or the one level of children the footer renders beneath it — or,
  as today, in the source note's name. A property reference matches on the property's own text.
  Content the footer would not show — deeper descendants behind a fold — does not count.
- **The term is evaluated after placement and before the cap.** Every source the axes admit is
  placed so the term can be answered against its tree; the overall cap then applies to what the
  term admits, so narrowing still frees cap budget. The requirement that a capped-out note is
  never read holds only while no term is active.
- **Matches are marked in the rows.** The matched text is visibly marked inside the row it occurs
  in, with a mark distinct from an author's own `==highlight==`.
- **A matcher in the mapping core**, one place that defines what a query means — for now a
  trimmed, case-insensitive, literal substring — so the palette and the in-note filter apply the
  same grammar rather than each growing its own. Fuzziness, quoted phrases and operators are
  later layers of that one module.
- **The footer's row model speaks of hits, not references.** A row is marked as a HIT with an
  optional backlink kind, rather than as a reference of a kind, so a search backend can feed the
  same rows the backlink index does. No visible behaviour changes from this.
- The field's placeholder stops promising "by note name".

## Capabilities

### New Capabilities

_None._ The matcher is internal until a surface other than the footer consumes it; its grammar
is stated in `backlink-filtering`'s term requirement, which is where a reader meets it.

### Modified Capabilities

- `backlink-filtering`: the search term reaches reference content as well as the source note's
  name, with the content it reaches defined; the overall cap's "never read" guarantee becomes
  conditional on no term being active; the term's grammar is stated.
- `backlinks-footer`: gains the requirement that a term's matches are marked in the rows.

## Non-goals

- Fuzzy matching, word splitting, quoted phrases, exclusion, or any operator. The grammar is a
  literal substring, and the module that defines it is where those arrive later.
- Ranking. Group order stays the selected sort.
- Narrowing the footer to the zoomed node while zoomed. Still deferred, as `backlinks-footer`
  records; the term filter is a prerequisite it names, not the feature itself.
- Any surface other than the footer: the search palette and the in-note filter are their own
  changes (`docs/research/31`, plan), and this change only prepares what they read.
- Reading-mode rendering of the footer.

## Impact

- **New**: `src/search.ts` — the matcher: what a query means, and whether a node, a reference
  in its tree, or a plain text matches it.
- **Modified**: `src/plugin/footer-model.ts` (hit vocabulary), `src/plugin/footer-filter.ts`
  (the term moves after placement; per-reference admission), `src/plugin/backlinks-footer.ts`
  (render flow places before it counts when a term is active; match marking), `styles.css`
  (the mark).
- **Tests**: `tests/footer-filter.test.ts`, `tests/footer-model.test.ts`, a new
  `tests/search.test.ts`, and `e2e/specs/77-footer-controls.e2e.ts`.
- **Docs**: `docs/research/18` D8 gains the note that its name-only rule is superseded and why.

## Sequencing

Off `main`. `search-palette` stacks on this change: it reads the matcher and the hit model and
rewrites the footer file this change also edits. `in-note-outline-filter` waits for this change
to merge and takes the matcher from `main`.
