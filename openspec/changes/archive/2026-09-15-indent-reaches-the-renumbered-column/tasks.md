## 1. Pin the defect

- [x] 1.1 Reproduce the CI failure with the reported seed and shrink the counterexample by
      hand to the smallest document that still shows it. Record it, the cause and the age of
      the defect in `docs/research/indent-under-a-renumbered-marker.md`, with a row in
      `docs/research/index.md`.
- [x] 1.2 Add `tests/depth-contract.test.ts` §1.5: indenting `- L2` out of `9. L0` / `9. L1` /
      `- L2` writes four columns under `10. L1` and lands at depth 1. Negative control: the
      unmodified operation writes three and leaves the node at depth 0.
- [x] 1.3 Add the narrowing mirror: indenting `- L2` out of `1. L0` / `10. L1` / `- L2` writes
      three columns under `2. L1`. Negative control: the unmodified operation writes four —
      the depth is right in both, which is why the property could not fail on it.

## 2. Encode against the target the operation leaves

- [x] 2.1 In `indentSurgery`, apply the departure level's renumbering before the destination
      encoding, read the target back out of that result, and derive `insertIndex`, the
      destination kind and the destination indentation from it. Verify 1.2 and 1.3 pass.
- [x] 2.2 Run `npx vitest run` and verify the closure, corpus, round-trip, renumbering and
      group suites still pass.
- [x] 2.3 Re-run `tests/depth-contract.test.ts` under the CI seed (`FC_SEED=-675483783`) and
      verify both properties pass.
- [x] 2.4 Run both depth properties, all four operations in both forms, over 25 random seeds
      at 3000 cases each, and verify no violations.

## 3. Make a property failure reproducible

- [x] 3.1 Add `tests/fast-check-seed.ts`, reading `FC_SEED` and configuring it globally when
      set, and register it as a vitest setup file. Verify that the CI seed reproduces the
      original failure against the unmodified operation, and that an unset variable leaves the
      seed random.

## 4. Close the change

- [x] 4.1 Run `npm run lint` and `npx tsc --noEmit`; verify both clean.
- [ ] 4.2 Run `openspec validate indent-reaches-the-renumbered-column --strict` — not run:
      the CLI is not installed in the container this change was implemented in. The delta was
      written against the main spec's own text and synced back into it as additions only.
