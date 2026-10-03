# Implementation review

The checks for a partial or complete implementation, after the order in `SKILL.md` ("The
reviewer"). Work through all of them; each one that turns something up is a finding in the form
`SKILL.md` gives.

1. **The design against the code.** Does the code do what the design says? Did a decision change
   on the way without the design saying so? Find a case that breaks each, the code and the design
   alike.
2. **Reachability.** A defect the change calls latent, or out of reach, is checked through every
   gesture that reaches the code: #246's "latent" bug was reached by a delete and by a drag.
3. **The tests.**
   - Run them: `npx vitest run tests/` in the head worktree, and the change's case files with
     `npm run case -- <file>`.
   - **Revert the fix and see each new test fail**: in the head worktree,
     `git checkout <merge base> -- src/`, run the new tests, then `git checkout <sha> -- src/`. A
     test that still passes cannot fail.
   - **Mutate** each condition the fix adds (drop it, invert it, move its boundary) and see a test
     fail. #269 killed three mutations its tests let survive.
   - An e2e that could pass by timing alone: #273's ran the key and the command as two WebDriver
     calls, and passed on a slow runner with no fix.
4. **A differential sweep against the base**, where the change is in `src/*.ts`: the same inputs
   through the merge base's code and the head's, every difference counted and sorted. For a
   change in the plugin's CodeMirror or Obsidian wiring, run the same case files in both
   worktrees instead.
5. **Code and specs agree.** Each statement in the delta, and in each requirement the change
   cites, is true of the code; each behaviour the code changes is stated somewhere.
6. **Cost**, where a hot path changed: an operation on a large note (thousands of lines), head
   against base.
7. **The PR description's claims**, and the research notes the change updates, like any other
   claim.

## The sweep

A probe in the head worktree's `.scratch/` imports the same modules from both trees, runs one
entry point over the same inputs on both sides, and writes counts and one example of each kind of
difference. `tests/generators.ts` and `docs/research/prototypes/` hold inputs to start from.

```ts
// .claude/worktrees/review-<pr>-r<round>-head/.scratch/sweep.test.ts
import { test } from 'vitest';
import { writeFileSync } from 'node:fs';
import * as head from '../src/ops';
import * as base from '../../review-<pr>-r<round>-base/src/ops';
// …the same for parse, encode and model, from each tree

test('sweep', () => {
  const counts = { same: 0, intended: 0, regression: 0, neutral: 0 };
  const example: Record<string, string> = {};
  for (const input of INPUTS) {
    const h = runOn(head, input), b = runOn(base, input);
    if (h.text === b.text) { counts.same++; continue; }
    const kind = b.lost && !h.lost ? 'intended' : h.lost && !b.lost ? 'regression' : 'neutral';
    counts[kind]++;
    example[kind] ??= JSON.stringify({ input, base: b.text, head: h.text });
  }
  writeFileSync(new URL('./sweep.txt', import.meta.url), JSON.stringify({ counts, example }));
});
```

Run it with `npx vitest run .scratch/sweep.test.ts` from the head worktree. On #264 against its
parent, every move of every node of 28 documents through `moveSubtreesTo` gave 1 073 identical
results, 18 intended, 0 regressions and 1 neutral, in 3 s.

- **The entry point must reach the changed lines.** The same pair of trees through `parse` alone
  gave 0 differences in 20 000 inputs: #264's change runs inside an operation's re-parse.
- **A 0 counts for nothing until the sweep has been shown to find a difference**: make a
  deliberate change on the base side (append a line to `parse`'s input) and see every input
  differ, then undo it.
- Read every regression, and enough neutral differences to say what they are. The report gives
  the counts and one example of each kind.
