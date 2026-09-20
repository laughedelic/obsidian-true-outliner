---
name: triage
description: How to classify an issue in this repository — which kind, area, priority and needs labels it takes, and what each one commits us to. Use when filing an issue, when triaging one, when re-verifying a stale claim, or whenever choosing a p0-p3 rung or a needs/ label.
---

# Triage

Classify an issue on four axes. The label set itself is declared in
[`.github/labels.yml`](../../../.github/labels.yml); this is the judgement behind it, which a
one-line description cannot carry.

Four axes, and an item wants all four before it is ready to pick up:

| Axis | Cardinality | Who sets it |
| --- | --- | --- |
| `kind/` | exactly one | derived from a PR's title prefix; chosen when an issue is filed |
| `area/` | one or more | derived from a PR's paths; chosen when an issue is filed |
| `p0`-`p3` | exactly one | chosen at triage |
| `needs/` | zero or one | chosen at triage, removed when it is answered |

## Priority is about consequence, not about surface

The question is what it costs to leave the defect alone for another month, not how visible it is
or how hard it looks. A tooling defect that costs rework on every change outranks a rendering
defect nobody has hit twice, because the first one is paid repeatedly and the second is not.

**`p0` — the outline stops being trustworthy, or we cannot ship.** Content the user did not edit
is rewritten or lost, `main` is red, or a release cannot be cut. The plugin's whole claim is that
structure cannot be corrupted, so a defect that rewrites untouched content contradicts the
product rather than disappointing it. A `p0` is the next thing worked on, ahead of whatever is
in flight.

Reaching for it needs care in one direction only. A defect that *looks* destructive but leaves
the file recoverable by undo is `p1`, not `p0`; a defect that silently rewrites lines the user
never visited is `p0` even where the shape that triggers it is rare, because the user has no
reason to look.

**`p1` — a core gesture fails on ordinary documents, or every change pays for it.** Enter, Tab,
Backspace, a move or a paste doing the wrong thing in a document shape people actually write. On
the tooling side: a flaky spec, a CI step that needs re-running, an agent instruction that
reliably produces work needing redo. The test for the tooling half is whether the cost recurs. A
spec that failed once and never again is `p3`; one that fails a run in five is `p1`, because
every contributor pays for it every time.

**`p2` — real, reproducible, and confined.** Visible in a specific document shape, under one
theme, or on one platform. Most of what the research notes turned up sits here.

**`p3` — cosmetic, rare, or hard to reach.** Worth keeping written down, not worth scheduling.
An item that has been `p3` for a year is a candidate for closing rather than for promotion.

Where two rungs are arguable, take the lower one and say why in a comment. An inflated priority
costs more than a missed one, because a list where everything is urgent orders nothing.

## What a `needs/` label promises

A `needs/` label names the one thing standing between the issue and someone starting work. It is
removed when that thing is answered, not when work begins.

- **`needs/repro`** — no concrete failure case. We cannot yet write down a document, a gesture and
  a result. This is the usual state of an externally reported issue, and the usual first reply
  asks for the drawn example the editing form asks for.
- **`needs/diagnosis`** — reproduced, mechanism not located. We can make it happen and cannot yet
  name the code that does it.
- **`needs/decision`** — diagnosed, blocked on a design choice. The fix is known and more than one
  answer is defensible, so implementing it would settle a question by accident. A decision that
  does not close by being worked on belongs in Discussions instead of here.
- **`needs/research`** — wants a measured note under `docs/research/` before it can be proposed.
  Reserved for work large enough that a proposal written without measurement would be guesswork.

No `needs/` label means the next person can start. That is the whole signal, so a label left on
after its question is answered is worse than none.

## Re-verify before trusting a claim

An issue is a claim about code, and code moves. The sweep recorded in
[`docs/research/follow-up-inventory.md`](../../../docs/research/follow-up-inventory.md) found three of fourteen
extracted rows already fixed and one disproved by re-measurement, against notes that were months
old rather than years.

So an issue carries the `main` SHA it was last reproduced against, in the project's `Verified on`
field, and a claim older than that SHA is re-measured before it is scheduled rather than after
someone has started on it.
