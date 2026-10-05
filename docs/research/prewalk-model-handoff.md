---
type: "research"
description: "Prewalk, a hand-off from a frontier model to a cheaper one at the first edit with the context kept: how oh-my-pi implements it, what Claude Code can do in its place, and what it would have saved on the September sessions, priced from their per-model usage totals"
---

# Prewalk: handing a session from Opus to Sonnet

[Prewalk](https://stencil.so/blog/prewalk) lets a frontier model explore and plan, then switches the
session to a cheaper model at the first edit, keeping the whole context. Issue #345 asks how
oh-my-pi implements it, what Claude Code can do in its place, and what it would save here. Read on
2026-10-05.

## How oh-my-pi does it

Read from `can1357/oh-my-pi` at `1c0993c`, `packages/coding-agent/src/session/prewalk.ts` and the
three prompts it loads from `src/prompts/system/`. A `PrewalkCoordinator` runs at the end of every
assistant turn, where a turn is one model call and its tool results.

- **The planning instruction.** At the end of the first turn that makes no edit, it steers in a
  hidden message (`prewalk-plan.md`): stop exploring, write a complete plan in the next reply, then
  record 5–9 todo items, each a concrete step with its verification, and carry on. A one-line
  "continue, do not end the turn here" follows, so the model does not stop at the plan.
- **The trigger.** The first `edit` or `write` tool result, counted only once the todo gate is
  open: after a successful `todo` call (an errored one does not open it), or from the start when
  the `todo` tool is not active, as in a reduced tool set. A write through a device (LSP, `ast_edit`) counts only when it
  resolved to a write or exec tier, so read-only lookups do not switch the model mid-investigation.
- **The pruning.** At the switch, the plan message is spliced out of the live messages and the
  agent state, and it is never written to the session file, so it does not come back after a
  context rebuild. The plan and the todo list the model wrote stay.
- **The swap.** `setModelTemporary(target, thinkingLevel, { ephemeral: true })`: one-way, not saved
  to settings, and skipped when the target is the same model and thinking level. The default target
  is the `@smol` role. After the swap it steers in `prewalk-checklist.md`, three checks before
  claiming completion: every call site of a changed pattern, scope no wider than the issue, and the
  whole test file run rather than the one test.

It is armed by `--prewalk`, `--prewalk-into <model>`, `/prewalk`, the `prewalk.enabled` setting, or
per subagent through `prewalk` frontmatter. A resumed session is not armed by the setting.

The article's own figures, on SWE-Bench Pro: GPT-5.6 Sol handing to Luna reached 85% at $1.04 a
task, 97% of Sol's pass rate at 61% of its cost; Opus 4.8 handing to Gemini Flash 3.5 reached 78%,
92% of Opus at 53% of the cost. The frontier model ran a median of about 7 turns before the first
edit. It also reports that small models declared tasks done early without the todo list, and that
the item limit in the prompt was needed.

## What Claude Code can do

From the Claude Code docs ([model configuration](https://code.claude.com/docs/en/model-config),
[prompt caching](https://code.claude.com/docs/en/prompt-caching),
[skills](https://code.claude.com/docs/en/skills)):

| Mechanism | What it does | As a prewalk |
| --- | --- | --- |
| `/model sonnet` mid-session | Keeps the history; the next request reads none of it from cache | The hand-off itself, made by a person |
| `opusplan` | Opus in plan mode, Sonnet outside it; each toggle is a model switch | A hand-off at the end of plan mode, and back to Opus on every re-entry |
| Skill `model:` frontmatter | Switches for the rest of the current turn; the session model returns on the next prompt | One turn only: a cloud session's next wake (CI, a review) runs on Opus again and pays a full cache write to get there |
| Subagent `model:` | A fresh context, or with `context: fork` in a skill, still no conversation history | A spin-off, not a hand-off |
| Hooks | `PreModelSwitch` can confirm or block a switch; no hook can start one | Nothing |

No mechanism switches the model on the first edit by itself, and none needs pruning: a person
switching with `/model` leaves no hidden instruction behind. The Agent SDK may offer a mid-session
model change for routines; the SDK reference page was not read, so that is unconfirmed.

The cost of the switch is one cache write of the whole context at the new model's price: Claude
Code's main conversation uses the 1-hour cache on a subscription, written at 2× the input price,
so on Sonnet 5.5 a 150k-token context costs about $0.60 to switch.

## What the prices change

From the [pricing page](https://platform.claude.com/docs/en/about-claude/pricing), per million
tokens:

| | Input | 1-hour cache write | Cache read | Output |
| --- | --- | --- | --- | --- |
| Opus 5.5 | $4 | $8 | $0.20 | $20 |
| Sonnet 5.5 | $2 | $4 | $0.20 | $10 |

A cache read costs the same on both: Opus 5.5 reads at 0.05× its input price, Sonnet 5.5 at 0.1×.
Moving a session to Sonnet 5.5 halves its cache writes, input and output and leaves its reads
unchanged. The article's ratios came from pairs where reads also got cheaper, so they do not carry
over.

## What it would have saved

From the newest `result` event of each of the 90 sessions on this repository created 2026-09-01 to
10-01, which carries per-model cumulative totals. 34 were local sessions whose totals are not
visible this way, and six restarted their counters mid-session, so the figures are lower bounds.

| Model | Sessions | Cost | Writes | Reads | Output |
| --- | --- | --- | --- | --- | --- |
| Opus 5.5 | 15 | $1675 | 59% | 34% | 7% |
| Opus 5 | 20 | $695 | 23% | 70% | 7% |
| Sonnet 5.5 | 16 | $291 | 35% | 57% | 10% |
| Fable 5.1 | 6 | $265 | 58% | 26% | 16% |

The shares are priced from the token counts with writes at the 1-hour rate, which reproduces the
reported costs within 3%.

For the 13 Opus 5.5 sessions other than #205, a hand-off at the first edit would have saved about
$354 of $1186, 30%, assuming the context was 100k tokens at the first edit, 85% of the output came
after it, and the switch cost one Sonnet write. Moving the first edit to 200k changes the total by
about $10. The per-session figure ranges from 6% on short sessions to 44% on #204, and the high
ones are high because their writes are high: 74–87% of their cost, most of it the context rewritten
after the 1-hour cache expired between wakes, which #335 removes. #205, at $488 and 75% writes, is
that case alone.

So against running on Opus throughout, the hand-off saves up to about a third, less once #335
lands. Against running on Sonnet 5.5 throughout, which is how the October sessions run, it costs
more: up to the first edit, Opus writes the context at twice Sonnet's price (about $0.40–0.80 more
at 100–200k) and doubles the price of the planning output, and the switch adds one Sonnet write
(about $0.40–0.80). That is the price of having Opus do the exploring and planning, a dollar or two
a session.

## Recommendation

No tooling. Where Opus should plan, start the session on Opus and switch with `/model sonnet` once
the plan is written. The change lifecycle already has that point: the draft PR opens with the
proposal and is reviewed before any code, so the hand-off goes after the proposal review, with the
reviewed plan in the context. In a session that only implements a plan already reviewed, start on
Sonnet. A skill cannot make the switch hold across wakes, and `opusplan` returns to Opus whenever
plan mode is re-entered, so neither replaces the manual switch. oh-my-pi's verification checklist is
the part worth keeping: the `independent-review` skill and the PR's `tasks.md` already play that
role here.

## Not measured

- **Where the first edit falls.** The per-call usage that would place it is in each session's
  `assistant` events, at about 50 pages of 100 events a session, and in the maintainer's transcript
  archive. The 100k assumption is not read from either.
- **Whether Sonnet after an Opus plan does as well as Opus throughout here.** The article measures
  it on SWE-Bench Pro with other pairs. Of the six sessions switched by hand on 09-28/29, the
  outcomes were not compared.
- **The Agent SDK's mid-session model change**, for a routine that wants the hand-off without a
  person.
