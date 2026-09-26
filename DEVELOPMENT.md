# Development

## Testing a pull request on mobile

Mobile has no vault folder to copy a build into, so a pull request reaches a phone as a GitHub
prerelease that BRAT installs.

`.github/workflows/beta.yml` publishes one on every push to an open pull request, Dependabot's
aside, versioned `<next patch>-<commits>.g<hash>.<branch slug>` — `0.13.5-12.g7b57965.fix-foo` is
the 12th commit since the 0.13.4 release, at `7b57965`, on `fix/foo` (`scripts/beta-version.ts`
derives it). The next patch keeps a beta above the release it builds on and below the one that
will contain it. The version is stamped into the built `manifest.json` only; committing it would
move the file that triggers the release workflow.

On the phone: BRAT → *Add beta plugin* → `laughedelic/obsidian-true-outliner`, and pick the
pull request's version from the list. BRAT tracking "latest" takes the highest prerelease across
every pull request, and a pinned version never updates, so a new push means picking its version
again.

Betas clean themselves up (`scripts/beta-cleanup.ts`): each push drops the pull request's
earlier ones, a merged or closed pull request takes the rest with it, and a weekly sweep deletes
any beta whose branch heads no open pull request.
