## 1. The wait

- [x] 1.1 Add `waitForCursor(line, ch)` to `e2e-tests/helpers.ts` beside `getCursor`, as the design
      describes: polls every 20 ms for `waitBudget(3000)`, rejects with the position asked for and
      the last one read. The third argument is the limit in milliseconds, for 1.2. Verified by
      `npm run typecheck:e2e` and by 2.1 and 2.2 passing.
- [x] 1.2 A case in `00-smoke` for the requirement's last three scenarios: with the caret read at
      `L:C`, the page moves it to `L:C+1` 300 ms after `waitForCursor(L, C+1)` begins and the wait
      resolves; `waitForCursor(L, C+2, 300)` rejects with a message naming `L:C+2` and `L:C+1`;
      `waitForCursor(L+1, C+1, 300)` rejects naming `L+1:C+1`; `waitForCursor(L, C+1, 300)`
      resolves, each of the two rejections within a bound well under the default limit. Verified by
      the case passing on both runs. Negative controls, recorded in the note's "What waiting does",
      each failing the case: a `timeoutMsg` string built in the `waitUntil` options, where `last` is
      still `undefined`; a helper that reads once; a helper that ignores `line`; a helper that
      ignores its limit.

## 2. The two cases

- [x] 2.1 `65-content-space-caret` D1 waits for the caret after its gap click. Verified by the spec
      passing under mobile emulation on the newest installer, loaded as the note's "Reproducing"
      describes: ten runs with the helper's first form and five with its final one, all green.
      Negative control: the unmodified read, whose ten loaded runs the note records at 7 failing.
- [x] 2.2 `66-content-space-caret-manual-pass`'s code-fence D8 waits for the caret after its gap
      click. Verified the same way, eight runs with the first form and four with the final one, all
      green. Negative control: the unmodified read, whose six loaded runs the note records at 3
      failing.
- [x] 2.3 The same two specs pass on the oldest installer and on desktop, so the wait costs neither
      run anything: `npm run test:e2e:narrow -- <spec>` for each, with and without `--mobile`.

## 3. The check

- [x] 3.1 Dispatch `newest-installer.yml` by hand on the branch head, and confirm the `selection`
      group on mobile emulation is green on D1 and D8. Verified by that run's job results, recorded
      in the note's "In CI on the newest installer".

## 4. Land

- [x] 4.1 `npm run lint`, `npm run typecheck:e2e` and `npm test` pass, and CI is green on the branch
      head: the desktop and mobile e2e matrix included.
- [x] 4.2 Sync the delta spec into `openspec/specs/e2e-verification/spec.md` and archive the change
      (`openspec archive gap-click-waits-for-caret`). No version bump: nothing under `src/` or
      `styles/` changes, and the PR is a `chore`. Verified by the `Landed` check on the ready PR.
- [x] 4.3 `openspec validate gap-click-waits-for-caret --strict` before the archive, and
      `openspec validate --specs --strict` after it.
