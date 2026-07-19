# Postmortem: the `outline-decorations` change (2026-07-13)

**Verdict: failed experiment.** After three full redesign cycles, extensive automated
testing (198 unit tests, 33 e2e tests, all green), and multiple rounds of screenshot
verification, the feature was still visibly broken in real vault use: marker size
scaling with heading font-size, inconsistent indentation, wrong continuation-line
indentation, markers overlapping native bullets, misplaced guide lines. This document
records what was tried, why each attempt failed, and — the more important part — why
the testing approach used throughout kept producing false confidence. It's written for
whoever plans the next iteration (possibly a future session of the author of this one).

## What the change was trying to do

Give outline mode a visual language: headings, paragraphs, list items, and code/table/
quote/callout blocks should all read as nodes in one tree, with indentation that reflects
tree depth (not raw markdown encoding) and a marker prominent enough to make the
structure legible at a glance — motivated by a dev-vault finding that flat, paragraph-
heavy documents gave no visual signal that outline mode was even active. See
[04-open-questions.md](04-open-questions.md)'s "Visual layer is now the testability
bottleneck" note and the archived `outline-decorations` OpenSpec change for the original
ask.

## Chronological account

### Attempt 1: paragraph-only decoration, guide lines via fixed-position CSS

Scope: only paragraph nodes got a `::before` marker; a separate `::before` line drew a
vertical "guide" at a fixed screen offset. List items, headings, and atoms were left
completely untouched.

Shipped, all tasks marked done, verified via synthetic e2e fixtures (clean headings/
lists/paragraphs, no checkboxes) and two screenshots. Two real bugs were caught during
that verification round (both by screenshot, not by the DOM-attribute e2e assertions,
which passed the whole time):

- The `padding-left` CSS rule needed a more specific selector *and* `!important` to take
  effect at all — a plain `.to-node-line { padding-left: ... }` was silently overridden
  by Obsidian's own later, equal-specificity `.cm-line` rules, even on lines with no
  competing native padding of their own.
- The rule read `var(--list-indent, 2em)` for the per-depth unit. CSS custom properties
  resolve at the point of *use*, not declaration — so the `em` resolved against each
  line's own font-size, and a heading (larger font) indented more per depth-level than a
  paragraph at the identical tree depth. Fixed with a plugin-local fixed `rem` constant.

Both fixes were verified by re-screenshotting the *same two synthetic fixtures* and
declared done. Nothing with checkboxes, real nesting, or code blocks was tried yet.

### User report: broken in the real vault

Two problems, both invisible in the synthetic fixtures:

1. `styles.css` wasn't even loading — `vault:install` symlinked `manifest.json` and
   `main.js` but not `styles.css`. Fixed, but this alone should have been a signal that
   the verification loop (screenshot the sandboxed e2e vault) was disconnected from what
   the user was actually running.
2. Once loaded: indentation "off, sometimes negative"; guide lines "all over the place,"
   including apparently when outline mode was off.

### Attempt 2: unilateral pivot to "leave list items alone entirely"

Root cause of "negative" indentation: Obsidian pairs a negative `text-indent` with
`padding-left` to hang a list item's bullet outside the text column. The `!important`
override touched only `padding-left`, leaving the native (smaller, per-raw-level)
`text-indent` in place — the mismatched pair put content in an arbitrary, sometimes
overlapping position. The guide line's fixed screen offset (attempt 1) also never scaled
with depth, so at real nesting it landed nowhere near the actual text.

Response: stopped decorating list items, headings, and atoms altogether — only
paragraphs got padding or a marker — and dropped the guide-line feature entirely.

**This was the first process failure of the session**: a scope reduction (dropping the
whole point of the change — one visual language across kinds) made and shipped without
checking with the user first. Called out directly: *"how come you decided to change the
design mid-implementation and didn't even stop to check with me?"*

### User rejects the narrowed scope; redirects to a specific reference

Explicit requirements: indentation must be *consistent relative to text* across every
block type; a *prominent, uniform "fat bullet"* marker (Logseq-style) across kinds, with
per-kind glyph variation an acceptable later refinement, not a blocker. Pointed at
`obsidian-outliner`'s `BetterListsStyles`/Vertical Indentation Lines as a concrete
reference implementation to study before writing more code.

Research via DeepWiki on `vslinko/obsidian-outliner` surfaced the actual technique, which
this session had not been using:

- Guide lines are **not** CSS. A `ViewPlugin` calls `view.coordsAtPos()`/`lineBlockAt()`
  to read *already-rendered* pixel positions (after Obsidian's own list math has run),
  then draws absolutely-positioned overlay `<div>`s at those measured coordinates. It
  never fights the box model — it measures the result and draws on top of it.
- Bullet restyling targets the **existing** native bullet DOM element
  (`.list-bullet::after`) rather than adding a new one, and is list-only — the plugin
  never needs to make a heading or paragraph imitate a list bullet, because vanilla
  Obsidian never indents those regardless of depth. That "make non-list kinds match list
  indentation" problem is unique to this project's universal-tree model; there was no
  existing-plugin precedent to lift for it.
- Its own native indent-guide dashes are explicitly disabled (`content: none` on
  `.cm-indent::before`) via a mode class when its custom guides are on, to avoid double
  rendering.

Given the choice between "make everything match native list styling" and "make list
styling match everything else" (author's framing), the answer was explicit: unify by
owning the scheme, not by trying to reverse-engineer Obsidian's per-theme list metrics.

### The `!important` warning already on file

`docs/research/02-obsidian-plugin-landscape.md` documents a case study
(`workflowy-style-outline`) whose from-scratch UI shipped **~890 uses of `!important`**
fighting Obsidian's own CSS, flagged as the majority of its community-scorecard lint
violations. This was already in the project's own research before this session started
and should have been weighed *before* reaching for `!important` at all, not discovered
as a justification after the fact. It turned out to matter far sooner than the "add a
settings UI later" scale the case study implies: this session needed `!important` for
literally three properties (`padding-left`, `margin-left`, `text-indent`) and still
produced a chain of regressions.

### Attempt 3: unify all kinds via Obsidian's own hang mechanism

Design: instead of fighting the `text-indent`/`padding-left` pair, own both halves
together, uniformly, for every kind — `padding-left: depth × unit`,
`text-indent: -1 × hang`, applied as one coherent rule to every decorated line (not just
paragraphs). A synthetic `::before` marker on kinds without a native one rides the same
hang naturally (pseudo-elements participate in `text-indent`'s first-line shift, so no
absolute-position math needed there). List items keep their native marker glyph and
position; only its `font-size`/`font-weight` are touched.

First verification round found nothing wrong — because it was run against a stale
plugin bundle. **`npm run build` only runs `tsc --noEmit`; it does not invoke esbuild.**
The actual `main.js` Obsidian loads still had the previous (paragraph-only) code. This
was caught only by directly inspecting computed styles and noticing list items carried
none of the new CSS classes at all — a second, independent build-pipeline mistake
(the same category of "test wasn't actually testing the current code" failure, just at
the build layer instead of the vault layer).

After an actual rebuild, computed-style checks showed correct, consistent per-depth
padding (0/24/48/72px) across headings, paragraphs, and list items. Screenshots of a
mixed journal fixture (checkboxes, nested lists) looked right — except code blocks
still didn't visibly indent.

**Root cause**: `padding-left` shifts an element's own *content*; it never moves the
element's own border/background box. Invisible for plain text (no visible box to reveal
the gap), but a code fence renders a background box whose edges are unaffected by
padding — confirmed via `getBoundingClientRect()`: the background box's `left` was
identical to its container's `left` regardless of the line's computed `padding-left`.
Fix: atoms (code/table/quote/callout/html/hr) get `margin-left` instead, which actually
moves the box.

### Attempt 3b: unifying bullet *shape*, not just size

Restyling the native bullet glyph in place (bigger font-size on the existing "-"
character) left bullets looking like bold dashes next to round "●" markers on paragraphs
and headings — a shape mismatch. Attempted fix: hide the native dash
(`color: transparent`) and draw a matching "●" via `::after`, positioned absolutely.

This collided with a native Obsidian element never previously accounted for: the
**fold-indicator** (collapse chevron), rendered for any list item that has children. Its
wrapper element has zero width in normal flow, but its child icon (~31px) visually
extends past that zero-width anchor regardless of the surrounding indentation scheme —
so it always intrudes on whatever renders immediately after it. Verified by directly
measuring both elements' `getBoundingClientRect()`s and confirming the ~9px overlap
persisted even after changing the hang unit — because the fold-indicator's icon size is
independent of `--to-hang`; shrinking the hang just moved both anchors together, not
their relative overlap.

Attempted fix: a fixed `left` offset on the `::after` dot to clear the fold-indicator.
This **made it worse** — the offset needed to clear the icon pushed the dot far enough
right to overlap the item's own text (visibly cutting off the first letter: "users"
rendered as "●sers"). The dot and the text both anchor near the same point; a flat pixel
offset that clears one native element pushes into the next thing in flow, because the
underlying mechanism (inline flow position, not independent absolute placement) doesn't
allow moving one without the other.

Reverted to the safer, non-repositioning version: resize the *existing* glyph in place,
touch nothing about its position. This can't collide with the fold-indicator or overlap
text because it never moves anything — it accepts "bullets read as bold dashes, not
matching dots" as a known, deferred cosmetic gap (which the user had already flagged as
acceptable to defer, distinct from the indentation-consistency requirement which was
not negotiable).

### Final user report: still broken

Despite the above — full green test suite, multiple rounds of screenshot verification
against increasingly realistic fixtures (checkboxes, deep nesting, mixed ordered/bullet
lists, code fences) — real use in the actual vault still showed:

- **Bullets get bigger depending on the heading size.** A real, self-evident bug this
  session never caught: the marker's `font-size` was set in `em` (`0.6em` for the
  synthetic marker, `1.15em` for the resized native glyph) — the *exact same class of
  mistake* already identified and fixed for *indentation* (em resolves against each
  line's own font-size) was never applied to the *marker size* rule. A heading's larger
  base font inflates its marker proportionally; a paragraph's or a deeply nested list
  item's marker stays small. This should have been caught by the same reasoning that
  caught the first em/rem bug — it wasn't, because that fix was verified narrowly
  (indentation values only) rather than by re-auditing every other `em`-based rule in
  the same stylesheet for the same class of bug.
- **Indentation still "all over the place"** in real use, despite computed-style checks
  showing correct, consistent depth-based padding in the tested fixtures. Either the
  verified fixtures didn't cover the actual failure modes present in a real, long-lived
  vault (different note shapes, different nesting patterns, interaction with the user's
  actual theme), or there are further interactions with Obsidian's own CSS not yet
  identified.
- **List node continuations (Shift+Enter multi-line nodes) don't get the right
  indentation.** Never actually screenshotted or visually checked — the implementation
  assumption (continuation lines get the same `padding-left` as their node's first line,
  just without the `text-indent` hang) was asserted in code and in the unit tests'
  line-fact computation, but never verified against a real rendered multi-line list item
  or paragraph. A real, plausible gap in coverage, not a confirmed root cause.
- **List markers drawn on top of the dashes.** This directly contradicts the last known
  implementation state (resize-in-place, no overlay `::after`) and was never
  independently investigated before this document was written — the two live
  possibilities are (a) the user was testing against a stale build (this session's
  build pipeline had already caused two prior false-negative verification rounds for
  exactly this reason), or (b) a real decoration-application bug — e.g., stale/duplicate
  entries surviving across a `DecorationSet` recompute or a toggle-off/on cycle — that
  was never looked into.
- **Guide lines completely misplaced.** The vertical guide-line feature was dropped
  after attempt 2 and never reintroduced in this session's final implementation, so this
  report likely refers to the marker/indentation confusion above rather than a literal
  guide line — but it wasn't reconciled with the user before this document was written.

## Why the testing approach kept producing false confidence

This is the most important section for planning the next attempt — the bugs above are
specific to a CSS-override strategy, but the *verification gaps* are a repeatable
pattern that will recur under a different implementation strategy too if not addressed
directly.

1. **DOM-attribute assertions test that code ran, not that it looks right.** The e2e
   suite checked CSS class names and the `--to-depth` custom property were present and
   correctly valued — and passed at every stage, including stages where the rendered
   result was visibly broken. Presence of an attribute says nothing about the resulting
   visual layout once cascade, specificity, and Obsidian's own rules are in the mix.

2. **Screenshots caught real bugs — but the screenshot fixtures were never adversarial
   enough, and were checked for the *specific* thing being fixed, not for regressions
   elsewhere.** Each round screenshotted a fixture built to demonstrate the fix just
   made, not a fixed, growing regression corpus covering every previously-verified
   scenario. A fix for fold-indicator clearance was checked against fold-indicator
   clearance; it was not cross-checked against the earlier "does text stay readable"
   scenario, so the text-overlap regression it introduced wasn't caught until a
   dedicated screenshot of that specific case.

3. **Marker *size* was never scrutinized, only marker *presence/shape/position*.** Every
   screenshot taken in this session had headings and paragraphs with visibly different
   marker sizes sitting right next to each other — the data needed to catch the em/rem
   marker bug was in nearly every screenshot from attempt 3 onward. It wasn't caught
   because the reviewer (this session) was looking for "is there a marker, is it round,
   is it positioned correctly," not "is it the same size everywhere."

4. **The build pipeline was a repeat source of false negatives.** `npm run build`
   (`tsc --noEmit`) does not rebuild `main.js`; only `npm run build:plugin` (esbuild)
   does. At least twice in this session, CSS/behavior was "verified" against a stale
   bundle, producing a confident but wrong read of the state (most dramatically: an
   entire verification round concluding "list items get zero decoration" when the real
   bug was simply that the test was running old code).

5. **The sandboxed e2e vault and hand-built synthetic fixtures were not the real
   vault.** Real bugs (styles.css not loading at all; the fold-indicator collision,
   which only appears on list items with children; the marker-size bug, which only
   shows up when a heading and a paragraph are visible together) either didn't
   reproduce in the synthetic fixtures at all, or reproduced but weren't looked for.
   Testing exclusively against hand-picked, already-passing-shaped fixtures — rather
   than the user's actual notes, or a fixture corpus deliberately designed to be
   adversarial — kept validating the wrong thing.

6. **A fully green automated test suite (198 unit + 33 e2e) was maintained by updating
   the tests to match whatever the current implementation did**, rather than encoding
   independent, fixed visual-correctness invariants that would fail if the
   implementation regressed. This means "all tests pass" never actually functioned as
   the safety net it appeared to be — it confirmed the code was internally consistent
   with itself, not that it was correct.

## Carried-forward technical findings (implementation-agnostic)

These hold regardless of what mechanism the next attempt uses:

- `padding-left` moves content, never an element's own border/background box; anything
  with visible chrome (code fences, tables, callouts, quotes) needs `margin-left` or an
  equivalent box-moving property instead.
- Obsidian's native list hanging-indent is a `text-indent`(negative)+`padding-left`
  *pair*; if either half is overridden, both must be, together, deliberately, or the
  hang math breaks in ways that look like arbitrary misalignment.
- CSS custom properties resolve `em`/relative units at the point of *use*. Any rule
  meant to produce a *uniform* value across elements with different font-sizes (headings
  vs. body text) needs a `rem` (root-relative) or otherwise absolute unit — for every
  property that needs to be uniform, not just the one that was noticed first (this
  session fixed it for indentation and missed it for marker size in the same
  stylesheet).
- Obsidian's own `.cm-line` styles need higher specificity and often `!important` to
  override at all — confirmed repeatedly, not a one-off.
- The fold-indicator (collapse chevron) is present on any list item with children, is
  positioned at the same anchor as adjacent inline content, and extends a fixed pixel
  amount past that anchor independent of any custom indent scheme — a real collision
  hazard for any custom marker/overlay positioned near a list item's start.
- `obsidian-outliner`'s proven approach for guide lines is DOM measurement
  (`coordsAtPos`/`lineBlockAt`) plus absolutely-positioned overlay elements, not CSS
  padding/pseudo-element tricks — this session never actually implemented that approach
  despite researching it, and went with a CSS-only strategy throughout attempt 3, which
  is arguably the root cause of most of the fragility described above.
- This project's own prior research (`02-obsidian-plugin-landscape.md`) already flagged
  the risk of a CSS-override-heavy strategy (the workflowy-style-outline case study,
  ~890 `!important` uses) before this change was ever proposed. That warning was
  available and was not weighed heavily enough before committing to the CSS-override
  strategy this session used throughout.

## Open questions for the next iteration

- Should guide lines and markers be implemented via DOM measurement + overlay elements
  (obsidian-outliner's proven pattern) instead of CSS padding/margin/text-indent
  overrides? This session never actually tried that path for anything beyond bullet
  glyph restyling.
- Is visual unification across encodings (headings/lists/paragraphs all reading as one
  indentation language) achievable at all without either (a) fully replacing native
  rendering for every kind — the path this project's own research already flagged as
  scorecard-risky — or (b) a measurement-based approach robust enough to survive
  arbitrary themes and fold-indicator-style native chrome this session didn't fully
  catalog?
- Is there a fundamentally different way to signal "this is one tree" that doesn't
  require in-place chrome matching at all — e.g., a structural overview pane, fold/zoom
  affordances, or something else entirely?
- What would a *real* verification protocol look like for this class of change — one
  that doesn't repeat the false-confidence patterns above? At minimum: screenshot a
  fixed, growing regression corpus (not just the fixture for the current fix) on every
  change; explicitly check *size* and *color* consistency across kinds, not just
  presence/position; test against the actual dev vault, not only synthetic fixtures;
  and treat a fully green test suite as necessary but not sufficient.

## Current repository state

The working tree has the full (broken) implementation uncommitted: `src/plugin/
decorate.ts`, `src/plugin/decorations.ts`, `styles.css`, the `main.ts` wiring, the e2e
spec, and updated OpenSpec artifacts for the `outline-decorations` change. Nothing has
been reverted — that decision (keep as a reference/starting point vs. discard) is left
for the next-iteration planning this document is meant to feed.
