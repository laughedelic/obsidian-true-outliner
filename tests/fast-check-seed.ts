/**
 * Replaying a property run: `FC_SEED=<seed> npm test -- <file>`.
 *
 * fast-check draws a fresh seed per run and PRINTS it with every failure, so a
 * failed CI job already names the run that produced it. What it has no supported
 * way to do is take that seed back: `fc.assert`'s own `seed` option is written
 * per call site, and reproducing a failure meant editing the property or
 * standing up a throwaway vitest config alongside it. This reads the seed from
 * the environment instead, so the seed a failure reports is the seed a local run
 * can be given.
 *
 * Unset — every ordinary run, CI included — the seed stays random, which is the
 * point of the suite: the properties here are a SEARCH over documents, and a
 * pinned seed would freeze them into 3000 fixed fixtures that can never find
 * anything they did not find the day the seed was chosen. A shape one of them
 * draws is pinned as a deterministic case beside it (`depth-contract.test.ts`
 * §1.5), which is what keeps a found defect found.
 */

import fc from 'fast-check';

const seed = process.env.FC_SEED;
if (seed !== undefined && seed !== '') {
  const value = Number(seed);
  if (!Number.isFinite(value)) throw new Error(`FC_SEED is not a number: ${seed}`);
  fc.configureGlobal({ seed: value });
}
