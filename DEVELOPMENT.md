# Development

## Testing a branch on mobile

Mobile has no vault folder to copy a build into, so a branch reaches a phone as a GitHub
prerelease that BRAT installs.

`.github/workflows/beta.yml` publishes one on every push to a branch other than `main`, versioned
`<next patch>-beta-<branch slug>.<run number>` — above the current release so BRAT prefers it,
below the next one so it never outranks a real release, and increasing per push so BRAT sees an
update (`scripts/beta-version.ts` derives it). The version is stamped into the built
`manifest.json` only; committing it would move the file that triggers the release workflow.

On the phone: BRAT → *Add beta plugin* → `laughedelic/obsidian-true-outliner`, then *Check for
updates* after each push. BRAT tracking "latest" takes the highest prerelease across every
branch, so two branches publishing at once serve whichever sorts higher — pin BRAT to a specific
version, or keep one branch at a time on beta.

Betas clean themselves up (`scripts/beta-cleanup.ts`): each push drops the branch's earlier
ones, and a deleted branch — a merge, usually — takes the rest with it, with a weekly sweep
behind that for anything missed. Only the `-beta-<slug>.<n>` shape is ever deleted, so releases
and hand-cut release candidates are out of reach.
