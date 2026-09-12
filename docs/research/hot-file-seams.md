# Hot files: where concurrent PRs collide, and which splits would stop it

Measured 2026-09-12 against `main` at `3e994a5` — its whole first-parent history, 115 commits
from 2026-07-12, of which 65 are merged PRs and 50 direct commits — with docs, OpenSpec, lockfile
and version files left out throughout. The question is which of the files most PRs touch can be
restructured so that branches open at the same time stop colliding in them, without spreading
one feature's edit over several files and without a behaviour change.

**Status: proposal.** Nothing has moved yet. The plan at the end is ordered against the PRs open
on the measurement date, one PR per seam, each off `main`.

**What the plan rests on: churn measures shared attention, not collisions.** Git merges hunk by
hunk, so two branches editing different functions of one file merge cleanly, and most of the hot
files' churn did. Of the 26 textual conflicts that concurrently open PRs met in these files, 14
were both PRs editing the same code — chiefly the decoration pipeline's two consumers — and 4
were import lines. Only 4 were two unrelated features appending at one shared point, the kind a
feature-owned file removes, and every pair that met one of those also collided in shared code
elsewhere. The plan is sized to that: splits only at the append points upcoming work will reach,
one refactor that turns a setting's sixteen declaration sites into one, and, for the pipeline, a
single builder of what both consumers read rather than a file boundary.

## The churn table

How many of the 115 commits touched each file:

| File | Lines | Churn |
| --- | --- | --- |
| `e2e/helpers.ts` | 2691 | 31 |
| `src/plugin/decorations.ts` | 3443 | 28 |
| `src/plugin/main.ts` | 2008 | 25 |
| `styles.css` | 3735 | 20 |
| `src/ops.ts` | 2061 | 20 |
| `src/plugin/keymap.ts` | 1063 | 15 |
| `src/plugin/mode-registry.ts` | 425 | 10 |
| `src/plugin/backlinks-footer.ts` | 2309 | 8 |

```bash
git log --format='%H' -120 --first-parent 3e994a5 | while read c; do git show --name-only --format='' $c; done | sort | uniq -c | sort -rn
```

## Method

Three measurements past churn, scripted under [prototypes/hot-file-seams/](prototypes/hot-file-seams/)
and run from the repository root:

```bash
export SEAMS_DIR=/tmp/seams REF=3e994a5
mkdir -p "$SEAMS_DIR"
gh pr list --state merged --limit 130 --json number,title,createdAt,mergedAt > "$SEAMS_DIR/merged-prs.json"
node docs/research/prototypes/hot-file-seams/heatmap.mjs
node docs/research/prototypes/hot-file-seams/groups.mjs
node docs/research/prototypes/hot-file-seams/conflicts.mjs
```

1. **A region heatmap** (`heatmap.mjs`). Every hunk in a hot file is credited to the declarations
   it touched, read from the TypeScript AST of the file as the commit left it (and as its parent
   held it, for removed lines): top-level declarations, class members, the individual statements
   of `onload` and of the settings tab's `display`, and top-level rules for CSS.
2. **Co-change between candidate modules** (`groups.mjs`). Regions are grouped into the modules a
   split would create: `decorations.ts` along its own section banners, `helpers.ts` along its
   banner sections, `main.ts` by responsibility (settings, command families, mode indicators, the
   extension list). A commit that touches more than one group is an edit a split would spread
   over several files.
3. **Simulated conflicts** (`conflicts.mjs`). For every pair of PRs whose lifetimes overlapped —
   `a` landed while `b` was open — take `b`'s version of a hot file just before `b` landed,
   reverse `a`'s change on it, and apply `b`'s change to the result. The hunks that no longer
   apply are what a rebase of `b` over `a` meets as conflicts. It works from squashed diffs, so a
   branch's intermediate states go unseen: it measures the overlap of what each PR finally
   changed.

## How often concurrent PRs met

51 pairs of PRs were open at the same time among the 46 that touched a hot file. 41 of those
pairs shared at least one hot file, and 17 would have met a textual conflict in at least one;
five more cannot be evaluated, because a later commit rewrote the lines the first PR changed.

The history agrees that rebasing was routine: 38 of the 65 PRs were force-pushed at least once
(85 force-pushes, an upper bound on rebases since an amend counts too), and 6 merged `main` into
themselves (18 merge commits, 11 of them on #69).

| File | Overlapping pairs editing it | Clean | Conflict | Not evaluable | Commits spanning >1 candidate module |
| --- | --- | --- | --- | --- | --- |
| `src/plugin/decorations.ts` | 12 | 2 | 7 | 3 | 25 of 28 |
| `styles.css` | 14 | 6 | 5 | 3 | 6 of 20 |
| `src/plugin/main.ts` | 11 | 5 | 4 | 2 | 13 of 25 |
| `e2e/helpers.ts` | 21 | 17 | 3 | 1 | 8 of 31 |
| `src/plugin/backlinks-footer.ts` | 8 | 5 | 2 | 1 | 4 of 8 |
| `src/ops.ts` | 8 | 3 | 2 | 3 | 14 of 20 |
| `src/plugin/keymap.ts` | 4 | 1 | 2 | 1 | 10 of 15 |
| `src/plugin/mode-registry.ts` | 4 | 2 | 1 | 1 | 7 of 10 |

The most-churned file is where churn costs least: 17 of the 21 overlapping pairs that both
edited `e2e/helpers.ts` replay cleanly, because each spec adds or changes helpers of its own.
`decorations.ts` is the opposite case: 25 of its 28 commits span more than one of the modules a
split would create.

## The 26 conflicts, by kind

Read from each pair's rejected hunks:

| Kind | Count | Where |
| --- | --- | --- |
| Both PRs changed the same code | 14 | `decorations.ts` ×6 (`computeDecorations`, `factsFor`, the guide-depth helpers, `MarginCompensation`), `styles.css` ×2 (editor rules), `main.ts` ×2 (`runOp`, the mode-toggle repaint), `ops.ts` ×2 (the Enter family, `move`), `backlinks-footer.ts` (the rows zoom reworked to reuse), `e2e/helpers.ts` (mode helpers one PR wrote and the other reformatted) |
| Import lines only | 4 | `decorations.ts`, `main.ts`, `keymap.ts`, `backlinks-footer.ts` |
| Unrelated features appending at one point | 4 | `styles.css` ×3 — the file's tail twice (the mode indicators' block, then folding's; the footer's rules, then zoom's trail) and the token block at its head (appearance tokens, then folding's, with one same-line edit besides); `mode-registry.ts` (the per-tab mode's settings, then the appearance settings) |
| One feature area appending at one point | 2 | `e2e/helpers.ts`: two decoration PRs adding rendered-layout readers after the same helper, twice |
| Mixed | 2 | `keymap.ts` (the per-tab mode, then folding) and `main.ts` (the per-tab mode, then appearance): import lines plus an insertion beside code the other had changed |

A split by feature would have removed the four append conflicts, and no pair would have ended
conflict-free: every pair that met one also conflicted in shared code — #75 → #79 in the mode
helpers, #71 → #69 in `MarginCompensation` and the footer's rows, #78 → #79 and #75 → #78 in the
decoration pipeline.

## The decoration pipeline: two consumers, one set of inputs

Six of the seven `decorations.ts` conflicts have one shape. Two consumers render the same
per-line chrome: `computeDecorations`, a CM6 line decoration for each plain line, and
`MarginCompensation`, a DOM patch for each widget-rendered line that a `Decoration.line` cannot
reach ([decoration-lessons](decoration-lessons.md), "CodeMirror 6"). Each builds its own inputs for a render —
`factsFor`, `visibilityContext`, `positionTrail`, the guide hover and `litGuideOn` — so a feature
that adds an input threads it through both. In #75 → #78 the appearance settings threaded
`visibilityContext` into both, through lines the per-tab mode had just changed; in #78 → #79
folding threaded its hover and `lit` into both, on top of that.

Separating the two consumers into files would turn each of these into a two-file edit without
making it a different edit. What removes the collision is the rule the lessons note keeps
arriving at — "when two things must move together, make it impossible to change one without the
other": one builder computes a render's line inputs, both consumers read them, and a new input is
added once. That is a refactor of the plugin's most fragile code rather than a move, and it is
proposed below as a change of its own.

## The append points

**Settings.** `guideIntensity`, the most recent enum setting, is spelled out at 16 sites across
two files. In `mode-registry.ts` there are 7: the type's re-export and import, its default
constant, the `PluginData` field, the `DEFAULT_DATA` entry, the `KNOWN_*` record and the
`normalizePluginData` entry. In `main.ts` there are 9: the type import, the label map, the getter,
the setter, the `SETTING_*` constant, the `getSettingDefinitions` entry, the `getControlValue` and
`setControlValue` cases, and the pre-1.13 `display()` block. A boolean setting takes 10. The
settings code in `main.ts` changed in 10 commits from five scopes (decorations, backlinks,
folding, outline-mode, settings), each appending at every site, and the definitions list and the
`display()` fallback are kept in step by hand, as the comment above them asks.

**The stylesheet's tail.** 10 of the 20 commits to `styles.css` appended at the end of the file (a
hunk reaching its last line). What followed the editor's own chrome sits in contiguous blocks, in
landing order:

| Block | Starts at | Lines, about |
| --- | --- | --- |
| Tokens, editor decorations, selection chrome, rules shared with the footer | line 1 | 1466 |
| Backlinks footer | the comments above `.to-backlinks` (line 1497) | 1710 |
| Zoom trail and the zoomed editor | the comments above `.to-zoom-trail` (line 3203) | 160 |
| Mode indicators | the comments above `.true-outliner-mode-status` (line 3354) | 55 |
| Folding | the guide-hover banner (line 3393) | 343 |

The rules the footer shares with the editor stay in the first block by design — the "Two
surfaces, one rule" comment near its head.

**`e2e/helpers.ts` sections.** Its 130 exports sit under 11 banner sections, and commits add a
helper inside the section it belongs to — only 2 of 31 appended at the end of the file — which is
why most overlapping edits replay cleanly. Two sections are one feature's each. *Folding* (lines
919–1584, 35 exports) is called by the `90`-series specs and `77`, and itself calls only
`runCommand`, `waitBudget` and `clickAtPoint`; its last three exports, `commandHotkeys`,
`commandRegistered` and `commandAvailable`, are generic and called by `10`, `11`, `40`, `80` and
`91`. *Decorations (rendered layout)* (lines 2029–2524, 18 exports) calls nothing else in the
file. Six footer-only helpers sit in the general sections although
[`e2e/footer.ts`](../../e2e/footer.ts) exists for them: `pinBacklinksCapOff`,
`waitForBacklinkIndexReady`, `waitForMetadataCache`, `resizeLeafForFooter`, `clickClear` and
`modClickAt`, called only by `74`–`79`.

**`main.ts`'s composition root.** The import block changed in 21 of 25 commits and the extension
list in 10, and neither caused more than an import-line conflict. The list's order is a contract
its comments explain — the nested-editor gate first, the mode field before whatever gates on it,
the two block-decoration producers last — which is a reason to keep it in one place.

## Git mechanics that constrain a move

- **Squash-only.** The repository allows squash merges and nothing else, so a PR is one commit on
  `main`, and "a pure move in its own commit" means a PR that contains nothing else: the moved
  lines, the import and export lines that re-point them, and the call sites.
- **`blame -C` follows a byte-identical move and loses a re-indented one.** Measured in a scratch
  repository: `git blame -C` attributes lines moved unchanged into another file to their original
  commit and file; the same lines moved with their indentation changed are attributed to the
  moving commit, with or without `-w`. Top-level declarations — helpers, module functions, CSS
  rules — move unchanged. A class member cannot leave its class unchanged, since its indentation
  and its `this.` both change, which is why the settings seam is two PRs: a reshape in place, then
  a pure move of the declarations it produces.
- **A rebase follows a rename, not a move.** An in-flight edit to moved code meets a conflict in
  the old file and is re-applied by hand. No piece of a split `styles.css` reaches git's default
  50% rename-similarity threshold (the largest, the footer's, is 46% of the file), so even
  `log --follow` loses the thread there. Both are reasons to move only code no open PR is editing.
- **esbuild's CSS bundler rewrites the stylesheet.** Measured on `styles.css`: `esbuild --bundle`
  turns 167,438 bytes with 202 comments into 37,052 bytes with one, and reformats expressions.
  Joining the parts is therefore plain concatenation, which makes the build output byte-identical
  to today's file.

## Proposed seams

| # | Seam | What changes | The measurement behind it | Kind |
| --- | --- | --- | --- | --- |
| 1 | Stylesheet parts per feature | `styles.css` becomes `styles/NN-*.css`, joined by the build | 3 of the 4 cross-feature append conflicts; 10 of 20 commits appended at the end | pure move, plus a build step |
| 2 | Settings declared once, per feature | one declaration per setting, from which its ten or sixteen sites derive; then each feature's slice moves to its own module | the `mode-registry.ts` append conflict; 16 sites per enum setting; the hand-kept sync between definitions and fallback | reshape PR, then pure-move PR |
| 3 | One builder of a render's line inputs | `computeDecorations` and `MarginCompensation` read inputs computed once | 6 of the 7 `decorations.ts` conflicts | refactor, not a move |
| 4 | *Optional:* one feature's e2e helpers beside its specs | *Folding* → `e2e/folding.ts`; the six footer-only helpers → `e2e/footer.ts` | no conflict in the window; a feature's helpers stop sharing a file with everyone's | pure move |

### 1. Stylesheet parts

- The parts are `styles/10-editor.css`, `20-backlinks-footer.css`, `30-zoom.css`,
  `40-mode-indicators.css` and `50-folding.css`, cut at the block boundaries above. Filename
  order is concatenation order is today's source order, so the cascade does not move; as with
  `scripts/spec-groups.mjs`, the numeric prefix means adding a part edits no list.
- `esbuild.config.mjs` concatenates the parts into the root `styles.css` Obsidian loads. In watch
  mode the parts are declared to esbuild's watcher (a plugin's `watchFiles`), so editing one
  rebuilds.
- The root `styles.css` becomes a build output and is gitignored like `main.js`. The release
  workflow already builds before collecting assets, and `install-to-vault` copies the root file
  after a build; neither changes.
- The PR's own check: the concatenation is byte-identical to the file it replaces.
- `tests/styles.test.ts` reads the parts; its balanced-braces case runs per part, which also
  narrows the merge-resolution failure it exists for to one file.
- The website's live demo imports `../../../styles.css` directly (#89) and needs the build output,
  or the parts, instead.
- From then on a feature's own rules and tokens go in its own part; rules it shares with the
  editor stay in `10-editor.css`. Moving existing tokens out of the head block would reorder
  declarations, and is not part of the move.

### 2. Settings declared once

- Each setting is declared once — key, name, description, control and labels, default, the
  values it may hold, and what a change does — and `PluginData`, `DEFAULT_DATA`,
  `normalizePluginData`, `getSettingDefinitions`, `getControlValue`, `setControlValue` and the
  `display()` fallback derive from the declarations. `coexistenceWarned` and `backlinksSort`
  persist without a settings row.
- The slices, in today's tab order: mode (`outlineByDefault`, `statusBarMode`), folding
  (`rememberFolds`), debug (`debugCrossCheck`), footer (its seven), appearance (`outlineUnit`,
  `guideVisibility`, `guideHideSingleRoot`, `guideIntensity`, `markerVisibility`,
  `guideHighlight`, `markerHighlight`). The list of slices changes when a feature area is added,
  not when a setting is.
- The reshape PR changes code in place — class members change shape, so blame on those lines
  goes to it — and the move PR after it is pure.
- The net: the persisted-plugin-data cases in `tests/plugin.test.ts`, e2e `41`, `59` and `11`, and
  one new unit case pinning the derived definitions (keys, order, defaults, options) to today's.
  Its negative control: reorder a slice.
- **Open for review:** whether the plugin keeps a typed getter per setting — the `*Source`
  interfaces the extensions take (`DecorationSource`, `FooterSource`, `AppearanceSource` and
  others) read them — or a settings object satisfies those interfaces instead; and where a
  change's effect lives (`updateOptions`, `publishAppearance`, `forceRedraw`, `repaintFooters`,
  `refreshIndicators`).
- Left alone: the setters that repaint behind their own data write stay parked in
  [decoration-follow-ups](decoration-follow-ups.md); reordering them is a behaviour change.

### 3. One builder of a render's line inputs

- One function computes a render's per-line inputs — facts, guide visibility, the position trail,
  the hover, folded chrome — and both `computeDecorations` and `MarginCompensation` read what it
  returns, so a new input is added in one place.
- Not a move: it restructures the code [decoration-lessons](decoration-lessons.md) asks to keep in one place,
  and the same rule is the argument for it — today two call sites derive the same per-line values
  independently.
- A change of its own, with its design reviewed before any code, and the decorations e2e group,
  `tests/decorate.test.ts` and `tests/projection-decorate.test.ts` as the net.

### 4. Optional e2e moves

- *Folding* moves to `e2e/folding.ts`; the three generic command helpers at its end stay in
  `helpers.ts`, under *Commands*. `footer.ts` gains the six footer-only helpers.
- Specs import the module the way they import `footer.ts` (`import * as footer from
  '../footer.js'`), so a call site changes from `h.clearFolds` to `fold.clearFolds` — mechanical,
  and the one test edit besides import paths.
- It would have prevented no conflict in the window. What it buys is a feature's helpers no
  longer sharing a file with everyone else's; taking it is a judgement, not a finding.

### Not proposed

- **Splitting `decorations.ts`.** 25 of its 28 commits span candidate modules; the core co-changed
  with the marker code 18 times and with `MarginCompensation` 15; its conflicts are same-code. The
  leaves that could move — the marker icons the footer also draws, the fold-chrome widgets (one
  commit), the selection chrome (never edited alone) — had no conflict in the window.
- **Splitting `ops.ts`** (14 of 20 commits span candidate modules; both conflicts same-code) or
  **`keymap.ts`** (10 of 15; imports and `makeHandler`).
- **`backlinks-footer.ts`.** Its two conflicts were zoom reworking the footer's rows, and the open
  search changes (#94, #95) plan their own seams there (`search.ts`, `lineage-list.ts`).
- **`main.ts`'s command families and mode indicators.** Their conflicts were same-code (`runOp`,
  the mode-toggle repaint), and moving them means reshaping class members and losing blame for no
  measured conflict.
- **`e2e` layout helpers.** Both conflicts a layout module could have hosted were between two
  decoration PRs, which one file still hosts.
- **`e2e` mode helpers:** 4 commits.

## Order against open work (2026-09-12)

Three PRs landed after `3e994a5`, on the measurement date, and no longer block anything: #98,
#99 (coverage tooling) and #101 (the research-note renaming, which rewrote one-line doc paths in
comments of every hot file — the reason it had to land before any move).

| PR | State | What it touches here | Effect on the plan |
| --- | --- | --- | --- |
| #88–#91 | draft stack | the website; #89's demo imports `styles.css` and the extensions from `src/plugin/` | seam 1 waits for the stack's CSS import or joins the stack; no proposed move relocates an extension the demo imports |
| #93, #94, #95 | drafts, plans only | will add CSS (#94 names `styles.css`), footer specs `77`/`78`, commands in `main.ts` | seam 1 lands before #94 writes CSS, so the search surfaces start in parts of their own |

1. This PR: the note and the plan.
2. Seam 1, the stylesheet parts: after the website stack's CSS import, before #94's CSS.
3. Seam 2, settings: the reshape, then the move; nothing open blocks it.
4. Seam 3, the line-input builder: its design reviewed first; nothing open blocks it.
5. Seam 4, if taken: whenever no open PR edits the moved helpers or the specs calling them
   (#94's plan edits `77` and `78`).

AGENTS.md's stacking test — overlapping files mean stack — already catches two branches that both
reach the pipeline. After seams 1 and 2 it stops flagging pairs whose only overlap was an append
point, so fewer stacks are forced. Each seam's PR adds the matching convention to AGENTS.md as its
mechanism lands: a feature's stylesheet part, its settings slice, its e2e helpers.

## Re-measuring

`conflicts.mjs` over the window after the seams land is the test of this reading. The append
conflicts should be gone, and the pipeline's same-code conflicts should shrink only once seam 3
lands. Append conflicts that persist mean the parts are cut wrong; pipeline conflicts that
persist after seam 3 mean the builder does not hold what features actually add.
