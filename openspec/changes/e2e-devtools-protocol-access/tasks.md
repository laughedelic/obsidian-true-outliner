## 1. The helper

- [ ] 1.1 Write `e2e-tests/cdp.ts` with `connectCdp`, `withCdp`, `send`, `on` and `close`, as the
      design describes. Verified by `npm run typecheck:e2e` and by 2.1's case passing on both
      runs.
- [ ] 1.2 Document the module's contract in its header comment: what it connects to, why nothing
      is cached, what `send` rejects on, and that enabling an event's domain is the caller's.
      Verified by reading the header against the design's decisions.

## 2. The smoke case

- [ ] 2.1 Write `e2e-tests/specs/01-devtools-protocol.e2e.ts`, one case that walks the
      requirement's scenarios: viewport evaluation compared with WebDriver's, a key `x` at the end
      of `- b`, a screenshot's size against the viewport, a console event from a WebDriver script,
      a `send` on a released connection, a `send` past its limit followed by one that completes,
      and a fresh connection after `browser.reloadObsidian()`. Verified by
      `npm run test:e2e:narrow -- 01-devtools-protocol` and again with `--mobile`, both passing.
      Negative controls: caching the address in a module variable must fail the reload step;
      dropping the close in `withCdp`'s `finally` must fail the released-connection step, since
      the connection is still open when the case sends on it; removing the limit's rejection must
      fail the limit step by hanging until the case's budget.
- [ ] 2.2 Check the target lookup in the same case: a handle carrying a `CDwindow-` prefix
      resolves to the page, and a handle that matches no target rejects with an error naming the
      handle and the ids found. Both go through `connectCdp`'s `handle` option. Verified by the
      case passing, and by its failing when the prefix handling is removed (first check) or when
      the lookup falls back to the first page target (second check). The fallback change is the
      one that no other step in the case can tell from the right lookup, since the session has one
      window.

## 3. Docs and the record

- [ ] 3.1 `docs/cloud-sessions.md` says to redirect a narrow run's output to a file. Verified by
      reading it against the "From inside a spec" paragraph on the starter.
- [ ] 3.2 Confirm the research note, its index row and the probes agree, and that the probes'
      README commands run as written. Verified by `node scripts/check-research-index.ts` and by
      copying one probe in and running it narrow.

## 4. Land

- [ ] 4.1 `npm test`, `npm run build`, `npm run typecheck:e2e`, `npm run typecheck:scripts` and
      `npm run lint` all pass, and a full `smoke` group run passes on both platforms in CI.
- [ ] 4.2 Sync the delta into `openspec/specs/e2e-verification/spec.md` and archive the change.
      No version bump: the change ships nothing. Verified by the `Landed` check on the ready PR.
- [ ] 4.3 `openspec validate e2e-devtools-protocol-access --strict`
