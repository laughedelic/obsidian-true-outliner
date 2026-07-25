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

## Capabilities

### New Capabilities

- `node-selection-extension`: keyboard selection extension as a directional step along an
  ordered sequence of node covers — one node per press, symmetric shrink, and the
  block-versus-multi-cursor discriminator.

## Impact

- `src/plugin/keymap.ts`: two new handlers.
- New pure decision module for the cover sequence, built on `escalate.ts`'s geometry; no new
  cover math of its own.
- `src/select-all-ladder.ts` is untouched — the two features share the geometry beneath them,
  not the ladder.
- E2E: extension scenarios move out of `61-selection-enforcement.e2e.ts`, which no longer owns
  keyboard crossing.

## Sequencing

**Depends on `selection-as-subtree-set`**, and is much simpler because of it. Two things this
change would otherwise have had to carry disappear once escalation stops pulling ancestors into
a crossing selection:

- **No extension-origin state.** With an ancestor in the cover, the range's ends are that
  ancestor's bounds and the anchor node is unrecoverable, which forced a `StateField` with
  invalidation rules. Without the ancestor, the cover's start edge identifies the anchor node
  again, and the walk is a plain function of the current selection.
- **No modal discriminator.** A block selection stays one contiguous range, so "one range = a
  block selection, several = multi-cursor" is decidable by shape with no mode to enter or leave.

Independent of `content-space-caret`, which touches caret placement only.

## Out of scope

- Modal block-selection state, and the `Cmd`-click cherry-picking gesture (docs/research/13).
  The shape discriminator is deliberately the simplest thing that works; its known edge is
  recorded in design.md and revisited after real use.
- Structural keys over a multi-node selection (Tab indenting only the last node) — still filed,
  still separate, and now with a settled operand definition to build on.
- The two-transaction escalation flash.
