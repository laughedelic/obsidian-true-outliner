# Follow-up inventory: what the research notes still carry

A triage pass over every note in `docs/research/`, taken on 2026-09-16 against `main` at
`03f83b5`, to answer one question: which of the deferred items are worth extracting into GitHub
issues, and which are better left where they are.

This is a dated snapshot for a decision, not a second parking lot. The parking lots
([decoration-follow-ups.md](decoration-follow-ups.md),
[selection-follow-ups.md](selection-follow-ups.md)) and the decision log
([open-questions.md](open-questions.md)) stay authoritative: they are amended in place when a
change touches them, and this file is not. Nothing below restates a diagnosis — each row points
at the note that holds it.

## What the sweep found

Forty-three notes, roughly 900 KB. The deferred items in them are heavily outnumbered by the
closed ones: `decoration-follow-ups.md` carries 18 entries marked graduated, closed, done or
decided against 23 still live; `selection-follow-ups.md` carries 24 resolved markers; of the 36
numbered open questions, 25 are decided, 4 are still marked open, and the rest are implementation
findings rather than questions. A parking lot entry is not deleted when it closes — it keeps its
measurements, because the measurement is what the entry was for.

That ratio is the first thing an extraction has to handle. Reading the notes top to bottom
produces about seventy item-shaped paragraphs; about forty-five of them are history.

Sixty-one items are live. They sort into five groups by what should happen to each, not by
severity.

## Tier 1 — defects, diagnosed and located

Each of these has a measured reproduction and a named mechanism. The first six are user-visible
enough that a user would report them; the rest are polish or are confined to a shape that is hard
to reach.

| # | Item | Note | State |
| --- | --- | --- | --- |
| 1 | A structural key pressed inside a table cell parses the CELL's document and rejects with our own message. `makeHandler` gates on outline mode and never calls `outlinePathOf`, so Tab, Shift+Tab, Alt+Arrow and Enter all run `planKey` against one cell's text. The command path is immune by construction | selection-follow-ups, "only `table` captures focus" 1.3 | quiet wrong answer, not an error |
| 2 | Mod-Backspace from the end of a childless paragraph that owns no trailing gap deletes the whole node. Classification reads an exact subtree cover off a range, and a caret-derived range is indistinguishable from a selection | selection-follow-ups, "an exact subtree cover is read off a caret-derived range"; delete-to-content-start | open question is whether the reading should require a non-empty selection |
| 3 | Shift+Enter at the end of `-` (a marker with no trailing space) writes a column-0 line, so typing there makes a top-level paragraph belonging to no node | decoration-follow-ups; enter-and-shift-enter-catalogue S12 | verified live: `LIST_ITEM_RE` allows a marker at end-of-line, `LIST_CONT_RE` requires whitespace. Pinned by a test |
| 4 | A non-list-item child of a list item is indented twice — our depth padding plus the child's own literal leading whitespace | decoration-follow-ups | from a real-vault report; the fix is a decoration decision, not a parse one |
| 5 | Under the Minimal theme, indented callouts and code blocks overflow the reading column. Minimal sizes them with `max-width`, which does not recompute when our `margin-left` changes | decoration-follow-ups | measured live by computed style; bundled themes are unaffected because they use `width: auto` |
| 6 | Toggling outline mode jumps the view to the top of a long document | decoration-follow-ups, "Other design ideas" | no diagnosis yet beyond the symptom |
| 7 | Shift+Tab on a provisional position leaves the caret on the line below the place it moved | decoration-follow-ups | measured, and asserted as-is in `tests/grammar.test.ts`, so a fix has to change that test deliberately |
| 8 | A structural key on a provisional position leaves the blank line in the file if the user then walks away | decoration-follow-ups | byte-identical to stock Obsidian; what makes it ours is that the model asserts something about that line |
| 9 | Renumbering can push a marker past the parser's nine-digit ceiling (`999999999.` → `1000000000.`), which re-parses as a paragraph | enter-and-shift-enter-catalogue | verified live: `\d{1,9}` in both `LIST_ITEM_RE` and `LIST_CONT_RE`. Closing it means deciding what an operation does at the ceiling |
| 10 | Abandoning a position opened over a block selection leaves one stray blank line; after undo→redo the position returns unrecorded | enter-and-shift-enter-catalogue | two attempts to recognise a redo failed and were reverted; the recorded sequence was re-measured and corrected once already |
| 11 | Node-granular selection halves a node a provisional position bisects | decoration-follow-ups | attempted and withdrawn: the one state where the fix would show is the one state where the cleanup record is gone. Needs a `StateField` carrying the place through undo/redo |
| 12 | A node holding several references contributes its count to the header but one row to the footer, so the two disagree and the second reference has no place a reader can reach | decoration-follow-ups | verified live in `backlink-index.ts`; a model change, and the count/row contract belongs with `backlinks-controls`' counting rules |
| 13 | The footer's own controls are below a touch target — around 11px for a row fold, against the editor's 24px under a coarse pointer | decoration-follow-ups, "Left in the lot by `better-folding-ux`" | a phone reader meets it on every row |
| 14 | A footer repaint replaces the control a keyboard reader has focused | decoration-follow-ups, same | measured; belongs with the footer's rendering model |
| 15 | A lineage segment carries `role="link"` and may now contain a real `<a>`, which ARIA does not allow | structured-backlinks, open question 5 | behaviour is correct on both pointer and keyboard; the accessibility tree is not. Three ways out, none free |
| 16 | Exiting a table's nested editor parks the caret on a gap line for one press | selection-follow-ups | the keypress never reaches our keymap; the obvious fix reopens a decided design point (D2's programmatic-placement exemption) |
| 17 | Non-Latin IME input immediately after selecting a block loses its first keystroke to literal Latin insertion | selection-follow-ups | accepted limitation of the blur mechanism |
| 18 | A residual flicker on the first switch into block-selection mode | selection-follow-ups, "KNOWN ISSUE" | two measurement-driven attempts did not reach it; the next instrument is named (observe when the raw-markdown reveal changes, not focus or class) |
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
| 46 | A DOM test environment (jsdom) for the view-plugin layer | selection-follow-ups | unlocks `history-caret.ts`'s wiring, `MarginCompensation`, the `onDocumentKeyDown` replay path, and a regression net for the modifier-key guard (verified live: `MODIFIER_ONLY_KEYS` is a one-line early return with nothing asserting it) |
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

## What is worth extracting

**Not all of it, and not by copying.** Three things argue against a wholesale extraction.

The notes are a diagnosis record, and the tracker would be a queue. Those are different
artifacts. An entry here carries its measurements, the attempts that failed, and — in several
cases — corrections where a re-measurement overturned the first reading. The two-transaction
escalation split was named as a confirmed root cause for months, and its own correction says the
framing "would have sent the next person to the same dead end"; `fold-mechanics` keeps two
overturned readings in place on purpose. That kind of amendment happens because the note is
where the work looks. An issue copied from a paragraph does not get amended, so the two
versions drift, and the stale one is the one with the notification badge.

Most of the volume is history. About forty-five of the seventy item-shaped paragraphs are
closed, and they are interleaved with the live ones rather than collected at the end, because
the file amends in place. An extraction that reads the notes linearly imports work that shipped.

`AGENTS.md` already routes deferred ideas to the parking lots, deliberately. Extraction should
add a thin index on top of that rule, not replace it.

**What GitHub buys that the notes do not,** in order of how much it is worth today:

- *A landing place for duplicate reports.* The strongest argument, and it is a future one: the
  README says there is no release and no users yet. Once there are, items 1–6 and 13–18 are what
  people will report, and a filed issue turns a second report into a comment instead of a new
  investigation.
- *Ordering.* The notes say what each item costs and what it depends on, and say nothing about
  what comes first. A milestone does.
- *Outside input on the open decisions.* Items 24–26 and 33–34 are genuinely open and would
  benefit from being read by someone who is not us. The README already points at Discussions,
  which is the better surface for these than issues.
- *Cross-linking to PRs.* Marginal while one person is working, real once a stack is in flight.

**The recommendation: about twenty-five, in three passes.**

*Pass one — the defects a user would report.* Items 1, 2, 3, 4, 5, 6, plus 13, 14, 15 (the
footer and lineage accessibility cluster), 16, 17, 18. Twelve issues. Each is one paragraph
stating the symptom and one link to the note that holds the diagnosis; nothing is copied. These
are the rows where the tracker's own affordances do work the note cannot.

*Pass two — the open decisions, as Discussions rather than issues.* Items 24, 25, 26, 33, 34.
Five threads. An issue that cannot close is tracker debt, and these will not close by being
worked on. Q34 in particular has a measured cost table and four readings already; the thread
wants readers, not an assignee.

*Pass three — the epics that structure the roadmap.* Items 36 (already has an OpenSpec change),
37, 38, 41 (RTL, which is two notes on one subject), 42, and 46 (the jsdom environment, which is
the highest-leverage item in Tier 4 — it unlocks four named things at once). Six issues, each a
placeholder for a change that will get its own proposal anyway.

**What to leave in the notes.** Everything in Tier 4 except item 46, everything in Tier 5, and
the polish rows 19–23. Their value is the measurement, and the measurement is already where the
next person will look — `AGENTS.md` tells them to read the relevant notes before touching
decorations, selection, or CM6 extensions. Filing them adds a row to a list without adding a
fact. Tier 5 specifically should not be filed: an issue that says "this flakes on CI and we do
not know why" invites someone to close it with the most available story, which is exactly what
`refused-commands-in-e2e` declined to do.

**Validate before filing.** Six of the Tier 1 rows were checked against the current source
during this pass and are live: item 3 (the two regexes still disagree), item 9 (`\d{1,9}` in
both), item 12 (`backlink-index.ts` keeps the first reference per node), item 20's tab half (the
gate widened to any spaced marker, so only the tab exclusion remains), item 46's premise (the
modifier guard has no test), and item 54. The rest rest on measurements taken against a running
Obsidian, several against builds now two versions old, and this project's own record shows how
often a re-measurement moves a reading. Each of those wants one reproduction against the current
build before it becomes a public claim about the plugin's behaviour.
