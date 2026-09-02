# backlink-index Specification

## Purpose
Defines what counts as a reference to a note, how the set of references to any note is
discovered and kept current from Obsidian's public metadata, and what freshness and cost
guarantees that answer carries. It exists so every surface showing references — the footer
today, other surfaces later — agrees on what a reference is and never reaches for private
Obsidian internals to find one.
## Requirements
### Requirement: Four kinds of reference, classified by what they address and how they are written

A reference to a target note SHALL be any of:

- **Note** — a link whose destination resolves to the target with no subpath.
- **Anchor** — a link whose destination resolves to the target with a heading or block subpath.
- **Embed** — an embedding reference to the target, with or without a subpath.
- **Property** — a link to the target appearing in the source note's frontmatter.

Each reference SHALL be reported with its kind, its source note, and — for every kind except
Property — the position in the source note's text at which it occurs. A Property reference
SHALL be reported with the frontmatter property name that contains it, and SHALL NOT be
reported with a text position, because it has none in the block tree.

A single source note MAY contribute several references of several kinds; each is reported
separately.

#### Scenario: A plain link is a Note reference

- **WHEN** a source note contains a link resolving to the target with no subpath
- **THEN** one reference of kind Note is reported for that source, with the link's position

#### Scenario: A heading or block link is an Anchor reference

- **WHEN** a source note links to a heading in the target, and elsewhere links to a block id in
  the target
- **THEN** two references of kind Anchor are reported for that source

#### Scenario: An embed is distinguished from a link

- **WHEN** a source note embeds the target rather than linking to it
- **THEN** the reference is reported with kind Embed, not Note or Anchor

#### Scenario: A frontmatter link is a Property reference with a property name

- **WHEN** a source note's frontmatter contains a link to the target under a property
- **THEN** one reference of kind Property is reported, carrying that property's name and no text
  position

#### Scenario: A link to a different note is not a reference

- **WHEN** a source note links to a note other than the target
- **THEN** no reference to the target is reported for that link

#### Scenario: A note referencing itself is not its own backlink

- **WHEN** the target note contains a link to itself
- **THEN** that link is not reported as a reference to the target

**Covered by**: `e2e/specs/72-backlink-index.e2e.ts` ("classifies a plain link as a note
reference", "classifies a subpath link as an anchor reference", "classifies an alias link as a
note reference, keeping the text as written", "distinguishes an embed from a link, and a
property from both").

### Requirement: References are discovered through public metadata only

The index SHALL derive references exclusively from Obsidian's public metadata and vault APIs.
It SHALL NOT call undocumented methods, patch Obsidian internals, or read Obsidian's own
backlink structures.

#### Scenario: No private API is used to find references

- **WHEN** the plugin is built and linted
- **THEN** no call to an undocumented backlink API and no monkey-patch of an Obsidian internal
  appears in the index

**Covered by**: `e2e/specs/72-backlink-index.e2e.ts` ("does not report a note as its own
backlink", "does not report links that resolve elsewhere") for the behaviour, and
`eslint-plugin-obsidianmd` in CI for the API-surface half — a private-API reach is a lint
failure rather than a test failure, which is the check that can actually see it.

### Requirement: The index stays current with the vault

The index SHALL reflect vault changes without requiring a reload: creating, editing, renaming
or deleting a note SHALL be reflected in the references reported for any affected target, once
Obsidian's own metadata has settled.

When a source note is deleted or ceases to reference a target, its references SHALL no longer be
reported for that target.

#### Scenario: A newly added link appears

- **WHEN** a link to the target is added to another note and that note is saved
- **THEN** a reference from that note is reported for the target without a reload

#### Scenario: A removed link disappears

- **WHEN** the only link to the target in a source note is deleted
- **THEN** no reference from that note is reported for the target

#### Scenario: A deleted source note is evicted

- **WHEN** a note that referenced the target is deleted from the vault
- **THEN** no reference from that note is reported, and no attempt is made to read it

#### Scenario: A renamed source note is reported under its new path

- **WHEN** a note that references the target is renamed
- **THEN** its references are reported under the new path and not under the old one

**Covered by**: `e2e/specs/72-backlink-index.e2e.ts` ("picks up a newly added link without a
reload", "drops a reference when the link is removed", "evicts a deleted source note",
"re-keys a renamed source note to its new path") and `e2e/specs/75-footer-behaviour.e2e.ts`
("drops a source’s group when that source stops referencing" — the index updating is not the
same as the footer repainting, and the second was a real defect found on a green first).

### Requirement: Reference context comes from the plugin's own parse of the source

To place a reference in its source note's tree, the index SHALL parse the source note's text
with the plugin's own parser, not reconstruct structure from Obsidian's metadata cache.

A source note's parsed tree MAY be cached, and the cache SHALL be invalidated when the source
note's content changes, so a reference is never placed using a stale tree.

#### Scenario: Placement uses the plugin's tree model

- **WHEN** a reference sits in a list that follows a paragraph, which the plugin's model treats
  as that paragraph's children
- **THEN** the reference is reported with the paragraph as its ancestor, matching what the
  editor would show for the same note in outline mode

#### Scenario: An edited source is re-parsed

- **WHEN** a source note's content changes and its references are requested again
- **THEN** the returned context reflects the new content

**Covered by**: `tests/footer-model.test.ts` ("keeps a list under the paragraph that owns it" —
the case where our tree and Obsidian's metadata disagree and the footer follows ours) and
`e2e/specs/73-footer-render.e2e.ts` (rows rendered from the plugin's own parse of a real vault).

### Requirement: Answering for a target is bounded and interruptible

The set of source notes referencing a target, and the number of references from each, SHALL be
answerable without reading any source note's content.

Placing those references in their trees requires reading and parsing each source, and SHALL be
performed per source so that a consumer may render what has resolved so far and continue
receiving the rest.

#### Scenario: Counts are available without file reads

- **WHEN** the references to a target are requested
- **THEN** the referencing notes and their per-note reference counts are available before any
  source note's content has been read

#### Scenario: Context resolves per source

- **WHEN** a target is referenced by many notes
- **THEN** each source's placed references become available independently, rather than only
  after all sources have been parsed

**Covered by**: `e2e/specs/76-footer-cost.e2e.ts` (spike S5: index build and summaries against
per-source placement, asserting the no-read half is far cheaper than the per-source half) and
`e2e/specs/75-footer-behaviour.e2e.ts` ("paints counts before context, and never fabricates
rows while resolving").

