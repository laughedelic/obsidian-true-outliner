# Ambient monitors: probes

The probes behind `docs/research/ambient-e2e-monitors.md`. Each is a spec kept as `.txt` so the
suite does not run it; copy it into `e2e-tests/specs/` and run it narrowly.

| File | What it reads | Run |
| --- | --- | --- |
| `hook-order.e2e.ts.txt` | The order of the spec's hooks, wdio's `beforeTest` and `afterTest`, and the body, over a passing, a failing, a timed-out and a skipped case, and whether a module the spec writes is seen by the config's hooks. Needs a one-line `e2e-tests/probe-state.ts` and a `beforeTest`/`afterTest` in the config that print the order (the header says how) | `npm run test:e2e:narrow -- 99-zz-hook-order` |
| `monitor-probe.e2e.ts.txt` | The DOM selection's rect against `coordsAtPos` across seventeen caret shapes; layout shift, scroll and the touched line span across twelve keystroke scenarios; rendered text columns against the grid on a mixed-kind note | `npm run test:e2e:narrow -- 99-zz-monitor-probe` (three `describe`s; add the name of one as the grep) |

The probes write their readings to `/tmp/claude-0/scratch/`; change `OUT` in `monitor-probe` to
another path when running elsewhere. The monitors the change ships are `e2e-tests/monitors.ts`.
