# Follow-up inventory: what the research notes still carry

A triage pass over every note in `docs/research/`, taken on 2026-09-16 against `main` at
`03f83b5`, to answer one question: which of the deferred items are worth extracting into GitHub
issues, and which are better left where they are.

The decision was taken and is recorded at the end: we extract, and an extracted item's
diagnosis moves to its issue rather than being copied there. This file is the index of that
move — one row per live item, saying what it is, which note held it, and where it went. It is a
dated snapshot and does not track what happens afterward; an extracted item's issue does.

**The practice it was written against has since been retired.** A follow-up is now filed as an
issue in the session that finds it, and the parking lots are closed to new entries (AGENTS.md,
"A follow-up is an issue"). So this file is a migration record rather than a standing index: it
says where the backlog that had accumulated went, and what was deliberately left behind. It does
not need keeping current, and once the rows still marked live have moved or been re-read against
their notes, it can be retired with the practice it documents. Nothing here restates a diagnosis.

## What the sweep found

Forty-three notes, roughly 900 KB. The deferred items in them are heavily outnumbered by the
closed ones: `decoration-follow-ups.md` carries 18 entries marked graduated, closed, done or
decided against 23 still live; `selection-follow-ups.md` carries 24 resolved markers; of the 36
numbered open questions, 25 are decided, 4 are still marked open, and the rest are implementation
findings rather than questions. A parking lot entry is not deleted when it closes — it keeps its
measurements, because the measurement is what the entry was for.

That ratio is the first thing an extraction has to handle. Reading the notes top to bottom
produces about seventy item-shaped paragraphs; about forty-five of them are history.

Sixty-one items looked live at the end of the reading pass. One of them was not: validating
item 1 for extraction found it already fixed, months after the entry was written, which is the
whole argument for validating each row before it becomes a public claim. Sixty are live. They
sort into five groups by what should happen to each, not by severity.

## Tier 1 — defects, diagnosed and located

Each of these has a measured reproduction, and all but one a named mechanism — row 6, the viewport
jump, is reproduced and located but not yet diagnosed. The first six are user-visible enough that a
user would report them; the rest are polish or are confined to a shape that is hard to reach.

| # | Item | Note | State |
| --- | --- | --- | --- |
| 1 | ~~A structural key pressed inside a table cell parses the CELL's document~~ | selection-follow-ups, "only `table` captures focus" 1.3 | **already closed — validating it for extraction is what found that out.** `makeHandler` now calls `outlinePathOf` (`keymap.ts:83`), which now opens with the `isNestedEditor` guard (`:491`). The entry was written 2026-07-29 and the fix landed with Q27's work; the note is corrected in place |
| 2 | Mod-Backspace from the end of a childless paragraph that owns no trailing gap deletes the whole node. Classification reads an exact subtree cover off a range, and a caret-derived range is indistinguishable from a selection | selection-follow-ups, "an exact subtree cover is read off a caret-derived range"; delete-to-content-start | open question is whether the reading should require a non-empty selection — **extracted to [#115](https://github.com/laughedelic/obsidian-true-outliner/issues/115)** |
| 3 | Shift+Enter at the end of `-` (a marker with no trailing space) writes a column-0 line, so typing there makes a top-level paragraph belonging to no node | decoration-follow-ups; enter-and-shift-enter-catalogue S12 | verified live: `LIST_ITEM_RE` allows a marker at end-of-line, `LIST_CONT_RE` requires whitespace. Pinned by a test — **extracted to [#116](https://github.com/laughedelic/obsidian-true-outliner/issues/116)** |
| 4 | A non-list-item child of a list item is indented twice — our depth padding plus the child's own literal leading whitespace | decoration-follow-ups | from a real-vault report; the fix is a decoration decision, not a parse one — **extracted to [#117](https://github.com/laughedelic/obsidian-true-outliner/issues/117)** |
| 5 | Under the Minimal theme, indented callouts and code blocks overflow the reading column. Minimal sizes them with `max-width`, which does not recompute when our `margin-left` changes | decoration-follow-ups | measured live by computed style; bundled themes are unaffected because they use `width: auto` — **extracted to [#118](https://github.com/laughedelic/obsidian-true-outliner/issues/118)** |
| 6 | Toggling outline mode jumps the view to the top of a long document | decoration-follow-ups, "Other design ideas" | no diagnosis yet beyond the symptom — **extracted to [#143](https://github.com/laughedelic/obsidian-true-outliner/issues/143)** |
| 7 | ~~Shift+Tab on a provisional position leaves the caret off the place~~ | decoration-follow-ups | **filed, then closed as superseded ([#119](https://github.com/laughedelic/obsidian-true-outliner/issues/119)).** Re-measurement on main found the reported column did not exist on its line, so the Tab/Shift+Tab asymmetry was never there; the real defect was the TRAILING place ([#130](https://github.com/laughedelic/obsidian-true-outliner/issues/130)), fixed by `a-trailing-place-moves-with-its-node`. The entry is rewritten in its note |
| 8 | A structural key on a provisional position leaves the blank line in the file if the user then walks away | decoration-follow-ups | byte-identical to stock Obsidian; what makes it ours is that the model asserts something about that line |
| 9 | Renumbering can push a marker past the parser's nine-digit ceiling (`999999999.` → `1000000000.`), which re-parses as a paragraph | enter-and-shift-enter-catalogue | verified live: `\d{1,9}` in both `LIST_ITEM_RE` and `LIST_CONT_RE`. Closing it means deciding what an operation does at the ceiling — **extracted to [#120](https://github.com/laughedelic/obsidian-true-outliner/issues/120)** |
| 10 | Abandoning a position opened over a block selection leaves one stray blank line; after undo→redo the position returns unrecorded | enter-and-shift-enter-catalogue | two attempts to recognise a redo failed and were reverted; the recorded sequence was re-measured and corrected once already |
| 11 | Node-granular selection halves a node a provisional position bisects | decoration-follow-ups | attempted and withdrawn: the one state where the fix would show is the one state where the cleanup record is gone. Needs a `StateField` carrying the place through undo/redo |
| 12 | A node holding several references contributes its count to the header but one row to the footer, so the two disagree and the second reference has no place a reader can reach | decoration-follow-ups | verified live in `backlink-index.ts`; a model change, and the count/row contract belongs with `backlinks-controls`' counting rules — **extracted to [#121](https://github.com/laughedelic/obsidian-true-outliner/issues/121)** |
| 13 | The footer's own controls are below a touch target — around 11px for a row fold, against the editor's 24px under a coarse pointer | decoration-follow-ups, "Left in the lot by `better-folding-ux`" | a phone reader meets it on every row — **extracted to [#144](https://github.com/laughedelic/obsidian-true-outliner/issues/144)** |
| 14 | ~~A footer repaint replaces the control a keyboard reader has focused~~ | decoration-follow-ups, same | **already closed.** `search-hits-and-footer-content-filter` met the same defect on the search field, where it cost every character after the first, and fixed it for every control: a stable `data-focus-key` and `rememberFocus`/`restoreFocus` follow the key rather than the element. Corrected in its note |
| 15 | A lineage segment carries `role="link"` and may now contain a real `<a>`, which ARIA does not allow | structured-backlinks, open question 5 | behaviour is correct on both pointer and keyboard; the accessibility tree is not. Three ways out, none free — **extracted to [#145](https://github.com/laughedelic/obsidian-true-outliner/issues/145)** |
| 16 | Exiting a table's nested editor parks the caret on a gap line for one press | selection-follow-ups | the keypress never reaches our keymap; the obvious fix reopens a decided design point (D2's programmatic-placement exemption) — **extracted to [#146](https://github.com/laughedelic/obsidian-true-outliner/issues/146)** |
| 17 | Non-Latin IME input immediately after selecting a block loses its first keystroke to literal Latin insertion | selection-follow-ups | accepted limitation of the blur mechanism — **extracted to [#147](https://github.com/laughedelic/obsidian-true-outliner/issues/147)** |
| 18 | A residual flicker on the first switch into block-selection mode | selection-follow-ups, "KNOWN ISSUE" | two measurement-driven attempts did not reach it; the next instrument is named (observe when the raw-markdown reveal changes, not focus or class) — **extracted to [#148](https://github.com/laughedelic/obsidian-true-outliner/issues/148)** |
| 19 | A done task's strikethrough starts on the marker's own trailing space | decoration-follow-ups; marker-text-gap | closing it means a decoration that splits the content span |
| 20 | A tab-separated list marker's text does not follow the gutter | decoration-follow-ups; marker-text-gap | the multi-space half of this closed with `list-marker-content-column`; the tab exclusion is still live, and `decorations.ts` records why — an adaptive rule needs the marker span to be a flex container, which moves the bullet's dot off its column |
| 21 | Marker vertical alignment: an ordered item's fold chevron, and table/callout/embed markers that flex-centre against the whole block | decoration-follow-ups, "Vertical-alignment polish" | cosmetic; one of them needs ink extent no rect exposes |
| 22 | A folded widget-rendered node carries no fold chrome and loses its marker | decoration-follow-ups | measured, and identical before and after `decoration-line-inputs`. Gated on whether a folded embed is common enough to be worth a non-CM6 control |
| 23 | A list continuation's caret measures the text rather than the stated box, landing 4.38px past its own column | decoration-follow-ups | stock Obsidian geometry our own grid now states; the text half closed with `lists-on-the-outline-grid` |

## Tier 2 — decisions, not tasks

These do not close by someone implementing them. Each needs a choice made first, and several
have measurements attached that constrain the choice.

| # | Item | Note | What is blocking |
| --- | --- | --- | --- |
| 24 | Should a list following a paragraph be that paragraph's child? (Q34) | list-paragraph-mapping | four readings; the indentation encoding is ruled out on measurement; a spike with attachment disabled costs 27 of 825 tests. `reorder-absorption` settles none of it |
| 25 | Indented code blocks after an emptied list stack are not modelled (Q35) | open-questions; list-marker-content-column | two readings — model the block, or leave it. Settling it wants a survey of how often real vaults hold one |
| 26 | The affordance budget: four gestures, one 14px gutter, and a task whose mark is a checkbox already spoken for | decoration-follow-ups | the question to answer first is whether the gutter is the right place at all. Six reference outliners are tabulated; none of them has our problem |
| 27 | The marker layer's own off switch, and whether turning icons off should drop the reserved gutter | decoration-follow-ups, "Layer configurability" | guides got their off switch in `outline-appearance-settings`; markers are what is left |
| 28 | Whether the single-root guide qualifier should cascade | decoration-follow-ups, same | deliberately does not today, so the visible ladder never depends on content several levels away |
| 29 | Whether the guide click should be configurable between fold and zoom | decoration-follow-ups, "Left in the lot by `better-folding-ux`" | stated so a setting can be added without changing what the gesture means; nobody has asked |
| 30 | Whether `[ ]` is content or list chrome | enter-and-shift-enter-catalogue, E32 | a model question, deliberately untouched by the grammar change |
| 31 | What Obsidian's own "Fold heading" / "Fold indent" settings do | fold-mechanics | the instrument is condemned: `vault.setConfig` plus `updateOptions()` produced three mutually exclusive answers. Needs a human toggling the setting in a real vault |
| 32 | Why Escape on a covering selection takes two presses | selection-follow-ups, Track 2 | unexplained, and it blocks binding Escape to anything — the key is held unbound on purpose |
| 33 | Outline decorations in reading mode | surfaces-and-embedding, surface 3; decoration-follow-ups | the `getSectionInfo` join is public; four unknowns to spike (granularity, `null` returns, re-render cadence, guides across blocks) |
| 34 | Mirrors via embedded real editors | surfaces-and-embedding, surface 4 | recorded, not proposed: eight non-public touchpoints against the README's public-API promise |
| 35 | Collapsing gap lines | decoration-follow-ups | scope boundary already decided (visual only); should land with gap-line cursor transparency, not before |

## Tier 3 — feature work, already scoped

| # | Item | Note |
| --- | --- | --- |
| 36 | A heading section pasted into a list mangles (`paste-heading-section-reencoding`) | in flight — the change exists under `openspec/changes/`, with D1 deliberately open |
| 37 | Modal block selection: an entry/exit gesture, and `Cmd`-click cherry-picking | selection-follow-ups, Track 2 |
| 38 | Moving a node into its parent's SIBLING, instead of rejecting when siblings run out | selection-follow-ups | would remove most `no-sibling-*` rejections and make `cannot-reorder-across-scopes` rare |
| 39 | "Jump to block start/end" as its own binding | selection-follow-ups | deliberately not a second meaning on Home, for the reasons Q26 records |
| 40 | Enter and Shift+Enter over a non-empty selection, and over multiple cursors | enter-and-shift-enter-catalogue, D3/D4 | declines today, which is already better than silently discarding secondaries |
| 41 | RTL: direction-aware marker placement, and bidi-correct boundary crossings | decoration-follow-ups 5.9; selection-follow-ups | two notes, one subject; both say the fix is a design decision rather than a patch |
| 42 | Per-level heading markers, per-kind icons, style variants, and a uniform bullet set | decoration-follow-ups; experiment-5-block-markers | one appearance surface for lists and blocks, per native-list-decoration phase 3 |
| 43 | Document the CSS custom properties a snippet can retune | decoration-follow-ups | the specs require them to stay retunable and an e2e covers one; none of it is written where a reader would look |
| 44 | A zoomed list-item root keeps its within-list indentation | decoration-follow-ups | the fix is one negative margin on the content container, and the offset became computable once the grid landed |
| 45 | Viewport-limited decoration building | decoration-follow-ups | standard shape; worthwhile for multi-thousand-line documents, and it supplies the fixture item 55 needs |

## Tier 4 — verification and harness

| # | Item | Note |
| --- | --- | --- |
| 46 | A DOM test environment (jsdom) for the view-plugin layer | selection-follow-ups | unlocks `history-caret.ts`'s wiring, `MarginCompensation`, the `onDocumentKeyDown` replay path, and a regression net for the modifier-key guard (verified live: `MODIFIER_ONLY_KEYS` is a one-line early return with nothing asserting it) — **extracted to [#156](https://github.com/laughedelic/obsidian-true-outliner/issues/156)** |
| 47 | The backlinks footer's first read races Obsidian's own cache on CI | decoration-follow-ups; e2e-ci-budgets | three waits were tried and reverted; the shape that would work is named — per-spec-file setup, budget sized from the measured rate, a still resolved-link count as the criterion |
| 48 | The footer's default sort has no test | decoration-follow-ups | needs fixtures with controlled mtimes, staged in `run-e2e.mjs`; worth doing when the sort becomes configurable |
| 49 | A dev-mode raw-keydown readout | selection-follow-ups | the probe reports only keys we bind, and the failure that cost several sessions was a key we do not |
| 50 | The harness could report a refused structural command directly | refused-commands-in-e2e | specs infer a refusal from the buffer today, and a differential assertion compares two identical wrong answers |
| 51 | The remaining `setCursor` calls in `measure()` carry the same precondition hazard as the one already fixed | refused-commands-in-e2e | |
| 52 | A community-theme sweep as repeatable infrastructure | decoration-follow-ups | the hardening pass's probe was not kept; committing third-party theme CSS is the cost to weigh. Pairs with item 5 |
| 53 | `forceRedraw` → a real refresh API | decoration-follow-ups | revisit trigger stated: an Obsidian API that forces a view-plugin refresh, or a move to the swap-the-extension-array pattern |
| 54 | The settings setters repaint from behind their own data write | decoration-follow-ups | verified live in `main.ts`: `setMarkerVisibility`, `setGuideHighlight` and `setBacklinksFooter` each `await this.saveData` before `forceRedraw()`. Worth folding into item 53 rather than doing twice |
| 55 | The `.cm-gap` exclusion in the line-level-widget predicate has never fired | decoration-follow-ups | needs a multi-thousand-line fixture, which item 45 also wants |
| 56 | A real embed re-render is only approximated | decoration-follow-ups | not a known defect; the first thing to reproduce if a duplicated or vanished marker on an embed is ever reported |
| 57 | Re-measure the hot-file seams now that all four have landed | hot-file-seams, "Re-measuring" | `conflicts.mjs` with `REF` at the later commit; append conflicts should be gone |
| 58 | Watch the verdict-timing p95 at four rounds | decoration-follow-ups | the next honest step is reporting the distribution rather than widening the bar |

## Tier 5 — not ready to file: reproduction or measurement first

| # | Item | Note | Why not yet |
| --- | --- | --- | --- |
| 59 | The footer's occasional scroll jump when it exceeds roughly half the viewport | structured-backlinks, open question 4 | `foldKeepingPlace()` reduced it; what remains is consistent with the anchoring model but has not been caught failing under it, so the mechanism is correlation so far |
| 60 | The unexplained CI flake in S1's op sequence | refused-commands-in-e2e | the leading candidate — a caret perturbed between two commands — is unproven, and neither correction made reproduces what CI saw. Left open deliberately rather than closed with the most available story |
| 61 | `settle()` fails structurally at ~20% in narrow runs against a fresh vault, and not at all across six whole-group runs | refused-commands-in-e2e | the group-mode difference is unexplained; the footer's stability waits are unreliable on CI's mobile matrix beyond this case, which makes a red `mobile (backlinks)` weak evidence until the failing case has been read |

Not counted above, and worth stating so it is not mistaken for an open thread: whether a real
touch on the footer's icon can be lost the way the mobile job's synthesised tap is
(e2e-ci-budgets) is a question the harness cannot ask, and it stays with the mobile-safe-by-
construction decision rather than becoming a claim either way.

## The decision, and the extraction so far

The tracker is for our own development, not for contributors, and an extracted item's detail
**moves** rather than being copied: the issue holds the diagnosis, the measurements and the
candidate fixes, and the note keeps a brief mention with a link. The heading stays where an entry
was, so citations to it still resolve, and each parking lot says the convention at its head.

That reverses this pass's first recommendation, which was to link rather than copy on the grounds
that two copies drift. Moving instead of copying answers the drift objection directly — there is
only ever one copy — and it costs what the recommendation was protecting: a note no longer reads
end to end as a self-contained record, and the diagnosis is a click away rather than in front of
the next reader. That is the trade, taken deliberately.

### Extracted (2026-09-16)

| Issue | Item | Was in |
| --- | --- | --- |
| [#115](https://github.com/laughedelic/obsidian-true-outliner/issues/115) | Mod-Backspace at the end of a childless paragraph deletes the whole node | selection-follow-ups |
| [#116](https://github.com/laughedelic/obsidian-true-outliner/issues/116) | Shift+Enter on a marker with no trailing space opens a position outside every node | decoration-follow-ups |
| [#117](https://github.com/laughedelic/obsidian-true-outliner/issues/117) | A non-list-item child of a list item is indented twice | decoration-follow-ups |
| [#118](https://github.com/laughedelic/obsidian-true-outliner/issues/118) | Minimal-theme boxed atoms overflow the reading column when indented | decoration-follow-ups |
| [#119](https://github.com/laughedelic/obsidian-true-outliner/issues/119) | ~~Shift+Tab leaves the caret off the provisional position it moved~~ — closed as superseded, see below | decoration-follow-ups |
| [#120](https://github.com/laughedelic/obsidian-true-outliner/issues/120) | Renumbering past nine digits re-parses the item as a paragraph | enter-and-shift-enter-catalogue |
| [#121](https://github.com/laughedelic/obsidian-true-outliner/issues/121) | A node holding several references renders one footer row | decoration-follow-ups |

Each of the seven was checked against the source before filing, and each issue names the file
and line where the mechanism lives. Item 1 was checked the same way and came back closed, so it
was corrected in its note instead of filed.

### Extracted (2026-09-18)

| Issue | Item | Was in |
| --- | --- | --- |
| [#143](https://github.com/laughedelic/obsidian-true-outliner/issues/143) | Toggling outline mode jumps the view to the top | decoration-follow-ups |
| [#144](https://github.com/laughedelic/obsidian-true-outliner/issues/144) | The footer's controls are below a touch target | decoration-follow-ups |
| [#145](https://github.com/laughedelic/obsidian-true-outliner/issues/145) | A lineage segment is a link that can contain links | structured-backlinks |
| [#146](https://github.com/laughedelic/obsidian-true-outliner/issues/146) | Exiting a table's nested editor parks the caret on a gap line | selection-follow-ups |
| [#147](https://github.com/laughedelic/obsidian-true-outliner/issues/147) | Non-Latin IME input loses its first keystroke after a block selection | selection-follow-ups |
| [#148](https://github.com/laughedelic/obsidian-true-outliner/issues/148) | A residual flicker entering block-selection mode | selection-follow-ups |

### What the two days between the batches changed

Enough that the second batch had to be re-validated rather than filed from the first pass's
reading, and the same will hold for the third.

**Two extracted items closed.** [#116](https://github.com/laughedelic/obsidian-true-outliner/issues/116) dissolved: `a-marker-needs-a-space-to-be-a-marker`
made a marker require trailing whitespace, so `LIST_CONT_RE` is gone from `grammar.ts` and the bare
`-` line is a paragraph whose second line the keypress writes.
[#117](https://github.com/laughedelic/obsidian-true-outliner/issues/117) was fixed by `source-indentation-collapses`, which collapses a non-list line's own
source indentation so the depth rules position it alone. Both notes carry the closure with their
measurements, which is the parking lots' own convention and the reason the extraction convention
does not apply to a closed entry: there is no open issue for its detail to live in.

**Two more items closed without being filed.** Item 1 in the first batch, and item 14 here — the
footer's repaint dropping focus, fixed for every control by the search change that met it on the
search field. Two of the fourteen rows this pass has reached for turned out already done, both
found by validating rather than by reading.

**One filed item was overtaken, and then disproved.** [#119](https://github.com/laughedelic/obsidian-true-outliner/issues/119) named the outdent/place
defect from this note's reading. #129 corrected the diagnosis, [#130](https://github.com/laughedelic/obsidian-true-outliner/issues/130) pinned the trailing
place as measured, and `a-trailing-place-moves-with-its-node` (#132) fixed it — at which point
#119 had nothing left to describe and was closed as superseded. The correction is worth keeping:
the shape this note recorded was measured from a column that does not exist on its own line, so
the Tab/Shift+Tab asymmetry it reported was never real. Both keys were right on an interior place
and both were wrong on a trailing one. That is the sharpest illustration of the validation rule
below — the row was verified against the source before filing, and the source agreed with a
measurement that was itself wrong.

**One Tier 2 decision shipped.** Item 35, collapsing gap lines, is in as an opt-in setting
(`gap-line-hiding.md`), with its costs stated rather than solved — a run of blanks is
indistinguishable from one, and the loose/tight distinction disappears from the editor while
surviving in every other renderer of the file.

**And one filed issue had gone stale on its own.** [#120](https://github.com/laughedelic/obsidian-true-outliner/issues/120) cited a regex that no longer
exists; it is re-validated and rewritten around the ten places the nine-digit cap actually lives.
The lesson generalises past this one: an issue is the authoritative home only while someone keeps
it so, and the code moves underneath it either way.

### What the tracker buys, and what it does not

- *Ordering.* The notes say what each item costs and what it depends on, and say nothing about
  what comes first. A milestone does.
- *Cross-linking to PRs.* Marginal while one person is working, real once a stack is in flight.
- *A landing place for duplicate reports* is a future benefit, not a present one: the README says
  there is no release and no users yet.
- It does **not** buy a place for the measurements that are reference rather than work — the
  affordance-budget table of what six outliners do, the caret-measurement levers, the CI budget
  figures. Those stay in their notes whatever happens around them.

### What to extract next, and what not to

*Tier 1's user-visible half is filed.* What is left of the tier is rows 8, 10 and 11 — the three
provisional-place rows — and the place area has moved so far past this note that none of them
should be filed from what is written here. Between 2026-09-16 and 2026-09-19 that area took three
changes (#129, #132, #151) and produced five issues of its own, of which [#130](https://github.com/laughedelic/obsidian-true-outliner/issues/130) and
[#142](https://github.com/laughedelic/obsidian-true-outliner/issues/142) are already closed and [#152](https://github.com/laughedelic/obsidian-true-outliner/issues/152), [#153](https://github.com/laughedelic/obsidian-true-outliner/issues/153) and [#154](https://github.com/laughedelic/obsidian-true-outliner/issues/154) are live.
Row 8 in particular — a structural key leaving the blank line in the file — sits next to #153's
carried-place record without being the same thing, and row 11 wants the place-provenance
`StateField` that several of those issues circle. Read the rewritten entries in
`decoration-follow-ups` first; the rows here are older than they are.

*The open decisions* (24, 26, 33, 34) want a different shape. Item 25, Q35's unmodelled indented
code block, is no longer among them — it was filed independently as [#138](https://github.com/laughedelic/obsidian-true-outliner/issues/138) off the
`source-indentation-width` work, as a defect rather than a decision, which is a fair reading now
that the write side is closed and only the read side disagrees with Obsidian. An issue that cannot close is
tracker debt, and these do not close by being worked on. Discussions suit them better, and Q34
already has a measured cost table and four readings ready to put in front of a reader.

*The epics were decided the other way, and only one was filed.* An epic issue would sit between
two stages this repo already has — the note that holds the research, and the OpenSpec change plus
draft PR that holds the plan — for work nobody is currently changing, so it duplicates the proposal
without the staleness pressure that justified extracting the defects. [#156](https://github.com/laughedelic/obsidian-true-outliner/issues/156), the DOM test
environment, is the exception on every axis: infrastructure rather than a feature, small and
well-defined, unblocking four named things at once, and the kind of work nothing else forces.
Item 36 is past this stage entirely — `paste-heading-section-reencoding` already has a proposal,
design and tasks under `openspec/changes/`. The rest (37, 38, 41, 42) stay in their notes and go
straight to a change when picked up. For the "what is next" visibility they genuinely lacked,
[#157](https://github.com/laughedelic/obsidian-true-outliner/issues/157) indexes them in one place rather than six.

*Leave in the notes:* the polish rows (19–23), all of Tier 4 except 46, and all of Tier 5. Tier 5
especially: an issue reading "this flakes on CI and we do not know why" invites someone to close
it with the most available story, which is exactly what `refused-commands-in-e2e` declined to do.
One qualification on the polish rows: item 20's tab-marker half and item 23's caret measurement
both sit in code that `source-indentation-collapses` and `a-marker-needs-a-space-to-be-a-marker`
have since moved, so either wants re-measuring before it is filed rather than quoting the figures
here.

*Validate before each batch.* Three of the fourteen rows reached for so far were already fixed
when checked — item 1, item 14, and #116's mechanism dissolving under a parser change — and none
of the three announced itself in its note. The rows that rest on measurements against a running
Obsidian, several against builds now several versions old, each want one reproduction against the
current build before they become a claim about the plugin's behaviour.
