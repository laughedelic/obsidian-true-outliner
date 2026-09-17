# Compared to Tana

Tana made every node a typed object: a "supertag" gives a node fields, and fields feed live queries. In March 2026 the company split the product, keeping the existing app as **Tana Outliner** and pointing "Tana" at agentic meetings and collaboration. The Outliner's 2026 roadmap is reliability and paper cuts. Checked September 2026.

## What Tana got right

- **References as one node in many places.** A Tana reference is the node itself, shown elsewhere; edit it anywhere and it is edited everywhere. It is the cleanest answer to mirrors any outliner has.
- **Structure as data.** Supertags turn an outline into something queryable without leaving the outline.
- **The outliner audience is real.** When the company pivoted, it kept a standalone outliner because the people who came for outlining were not going anywhere. That audience is who this plugin is for.

## Where it falls short

- **Cloud only.** No local files, limited offline on mobile, and export loses what makes Tana Tana: supertag schemas and commands do not transfer, media exports as links.
- **Everything is a bullet.** Headings and prose are bullets with styles. Notes written as documents have no home.
- **The pivot.** Users report support silence after the split and doubt about the Outliner's future; the company itself said the rollout could have gone better. The notes live in that company's database.

## What we take from it

The clarity that outlining and note-taking are one activity, and that the outliner core deserves a product of its own rather than a mode inside something else. The reference model as the thing to aim at if mirrors are ever built without writing identifiers into files.

## What we leave aside

Typed nodes. Obsidian has properties and Dataview for structure-as-data, and an outliner built as a view of markdown gets them for free rather than reinventing them. A database as the source of truth.

## Head to head

| | Tana Outliner | Obsidian + True Outliner |
| --- | --- | --- |
| Notes are plain files | – | ✓ |
| Nodes | bullets, typed | every markdown block |
| Subtree moves, selection by node, zoom, fold | ✓ | ✓ |
| References and mirrors | ✓, one node in many places | Obsidian's `^id` links |
| Structured data | supertags, fields, queries | properties, Dataview, Bases |
| Backlinks with structure | ✓ | ✓ |
| Offline | limited | native |
| Price | free tier, Plus $8/mo, Pro $14/mo | free |
| Status | reliability roadmap after the 2026 split | early preview |

## Switching

Tana exports markdown, with or without fields and tags. Fields become text; supertags become tags. The bullets become an outline on arrival.
