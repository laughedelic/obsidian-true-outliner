## Why

Shift+Arrow selection extension was never designed. It is a by-product of per-transaction
escalation: the key moves a character cursor one line, and the transaction filter corrects
whatever crossing that produces. Measured on a real Obsidian instance (2026-07-25):

- Granularity depends on whether a blank line happens to sit between two nodes — one node per
  press in a loose list, **two** in a tight one, and a whole subtree from a parent.
- It can never shrink. `Shift+ArrowUp` after `Shift+ArrowDown` does nothing at all, because
  escalation is expand-only; the only way back is to click elsewhere.
- Upward and downward are asymmetric: the first `Shift+ArrowUp` takes two nodes where the first
  `Shift+ArrowDown` takes one.

None of this is a rule a user could state. This change replaces it with one: **one node per
press, in every document shape, in both directions.**

## What Changes

- **Shift+ArrowDown and Shift+ArrowUp become bound commands**, in the same high-precedence,
  outline-mode-gated keymap as the structural grammar, rather than corrections applied after
  a native command runs.
- **Extension is a step along an ordered sequence of covers** for the anchor node and
  direction: the anchor's own subtree first, then each successive node in content order, with
  steps that would not change the cover omitted so no press is a visible no-op.
- **Extension can shrink.** The opposite direction steps back along the same sequence, bottoming
  out at the anchor node's own subtree, then growing on the other side.
- **A block selection and a multi-cursor selection are told apart by shape**: one range extends
  as a whole, several ranges extend independently.
- **Block selection becomes a derived interaction mode, not three ad-hoc DOM corrections.** A
  keyboard extension press currently blurs and refocuses the editor once per keypress — both the
  character-level selection and the raw-markdown toggle are visible in the blink — which is why
  keyboard block selection flickers where a mouse drag does not. The fix is that two consecutive
  block selections never leave the mode, not that the transition is made less visible.
- **Extension and the Mod-A ladder compose in both directions**, because each reads only the
  current selection. Stated and tested rather than left to chance, since this change alters what
  selections exist for the ladder to climb from.

## Capabilities

### New Capabilities

- `node-selection-extension`: keyboard selection extension as a directional step along an
  ordered sequence of node covers — one node per press, symmetric shrink, and the
  block-versus-multi-cursor discriminator.

### Modified Capabilities

- `escalated-selection-decoration`: the blur-to-reveal mechanism it currently implements but
  deliberately leaves uncodified becomes a stated focus invariant. Scope was expanded into this
  change on purpose (2026-08-03): keyboard extension cannot look like mouse block selection
  while a refocus fires on every press, so shipping extension without it would mean shipping the
  flicker and then working around it.

## Impact

- `src/plugin/keymap.ts`: two new handlers, gated through `outlinePathOf` like every other
  binding there.
- `src/plugin/decorations.ts`: `SelectionDecorationPlugin`'s three focus-manipulation sites
  (`update`'s deferred blur, `onMouseUp`'s repeat of it, `onDocumentKeyDown`'s unconditional
  refocus) collapse to one focus policy.
- New pure decision module for the cover sequence, built on `escalate.ts`'s exported
  `forestCoverOf`/`coveredForestOf`; no new cover math of its own.
- `src/select-all-ladder.ts` is untouched — the two features share the geometry beneath them,
  not the ladder. Measured, not assumed: `nextRung` already answers correctly for every
  extension-shaped selection, including mixed-depth forests and backward orientation (design D10).
  What the change adds is coverage pinning that, plus D6's handling of the ladder's one non-cover
  rung.
- E2E: `61-selection-enforcement.e2e.ts:77` (`Shift+ArrowDown crossing a boundary escalates
  both nodes in full`) is the one keyboard-crossing assertion left there, deliberately, for
  this change to move — see tasks 3.1.

## Sequencing

**Depended on `selection-as-subtree-set`, which has landed** (#36, `d11a971`, archived
`2026-08-02`). Two things this change would otherwise have had to carry disappeared with the
ancestor pull-in:

- **No extension-origin state.** With an ancestor in the cover, the range's ends are that
  ancestor's bounds and the anchor node is unrecoverable, which forced a `StateField` with
  invalidation rules. Without the ancestor, the cover's start edge identifies the anchor node
  again, and the walk is a plain function of the current selection.
- **No modal discriminator.** A block selection stays one contiguous range, so "one range = a
  block selection, several = multi-cursor" is decidable by shape with no mode to enter or leave.

Both premises were measured rather than assumed, in that change's own suites: contiguity is a
property test over generated trees (its task 2.2), the ladder's rungs are fixpoints of the
rewritten escalation (2.4), and two cursors in adjacent siblings extended once no longer
collapse into a whole-document range (its e2e 6.2).

`caret-placement-policy` also landed (#33, archived `2026-07-30`). It settled the caret half of
the `filter: false` fact and **explicitly returned the selection half here** (its design.md's
own open questions): nothing re-normalizes an undo/redo-restored selection, so this change's
walk normalizes its own input. Now a decision, not an open question — design D6.

Independent of `content-space-caret`, which touches caret placement only.

## Out of scope

- **Stored** modal block-selection state, and the `Cmd`-click cherry-picking gesture
  (docs/research/13) — a mode with entry and exit gestures and a flag to keep in sync. The shape
  discriminator is deliberately the simplest thing that works; its known edge is recorded in
  design.md and revisited after real use.

  Not to be confused with what D9 now specifies. Block selection becomes a DERIVED interaction
  mode — computed from the selection, no flag, no entry or exit gesture — because the alternative
  is keeping the three DOM corrections that produce the keyboard flicker. Derived mode: in scope.
  Stored mode: still out.
- Structural keys over a multi-node selection (Tab indenting only the last node) — still filed,
  still separate, and now with a settled operand definition to build on.
- The two-transaction escalation flash. Still out of scope, and worth recording that it is NOT
  the cause of the keyboard-selection flicker this change now fixes — that was the initial
  suspect and it was wrong. Escalation runs inside `EditorState.transactionFilter` and returns
  `[tr, { selection }]`, which CM6 resolves into a single transaction; the flicker is the
  focus/refocus cycle in `decorations.ts` (design D9).
- Removing the blur mechanism itself, or making Live Preview keep its rendered form while
  focused. The CSS-only approach to that was tried and abandoned (docs/research/13). D9 states
  when focus changes, not how rendering responds to it.
