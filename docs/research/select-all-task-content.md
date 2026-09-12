# Select All on a task item: where the first rung actually lands

Measured 12 September 2026 against `ebac7e7`, Obsidian 1.13 under the e2e harness, plus a probe
of the pure ladder over the same lines.

`progressive-select-all` states that the first Mod-A press on a list item selects its content
"excluding the leading indentation, marker character, and the single space after it". On a task
item the report from real-vault use reads the other way: the first press selects everything from
the dash to the end of the line.

## What the ladder computes

The first rung starts at `contentColumnCh`, which stops after the list marker and does not count
a task marker:

| line (caret in the text) | rung 1 |
| --- | --- |
| `- buy milk` | `buy milk`, ch 2–10 |
| `- [ ] buy milk` | `[ ] buy milk`, ch 2–14 |
| `- [x] buy milk` | `[x] buy milk`, ch 2–14 |
| `  - [ ] buy milk` (nested) | `[ ] buy milk`, ch 4–16 |
| `1. [ ] buy milk` | `[ ] buy milk`, ch 3–15 |
| `- [ ] ` (empty task) | `[ ] `, ch 2–6 |

So the ladder itself excludes the dash. The checkbox is inside the rung, by the spec's own words
and by a decision `select-all-ladder.ts` recorded when the task-marker boundary was introduced
for split and merge: `[ ]` stays content to the caret, to `contentColumnCh`'s other callers, and
to the ladder.

## What the editor settles on

Dispatching that rung in a real editor does not leave it there. A selection whose boundary sits
at ch 2 of a task line is moved to column 0 a tick later; every other boundary column holds:

| dispatched `{anchor, head}` on `- [ ] buy milk` | immediately after | settled (100 ms) |
| --- | --- | --- |
| `{2, 14}` | `{2, 14}` | `{0, 14}` |
| `{3, 14}` | `{3, 14}` | `{3, 14}` |
| `{5, 14}` | `{5, 14}` | `{5, 14}` |
| `{6, 14}` | `{6, 14}` | `{6, 14}` |

The same table holds with outline mode off, so this is Obsidian's own doing, not the plugin's
filter: the checkbox widget's mount dispatches a selection change with no `userEvent` that pulls
a boundary sitting at the list marker's end onto the marker. `content-space-caret` C8 records the
same dispatch for a caret, which the transaction filter clamps back off the marker
(`resolveForeignCursors`). A range boundary is not a caret and gets no such clamp, so the first
rung reads on screen exactly as reported: the whole line, dash included.

## What follows

Starting the rung after the task marker (`markerPrefixCh`, the boundary split and the Backspace
merge already use) is the only rung Obsidian renders as the item's text, and it is also what the
report asks for. The caret's own boundary stays after `- `: a caret is one position, the filter
already keeps it off the marker, and Home landing before the checkbox is a stated contract.

An empty task item — `- [ ] ` — has no text past its marker, so its first rung collapses to a
cursor; `nextRung` treats a rung the selection already equals as taken and climbs to the whole
line instead. That is the same rule that skips a lone child's sibling-run rung, and the change
pins it with a test rather than leaving it to fall out.
