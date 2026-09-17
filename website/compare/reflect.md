# Compared to Reflect

Reflect is a minimal, fast, end-to-end encrypted notes app around daily notes, backlinks and an AI assistant, at $10 a month. Its notes are nested bullets in Reflect's cloud with an offline cache and daily local backups. In 2026 a separate open-source rewrite, reflect-open, appeared as a local-first markdown-files app; how it relates to the paid product was unclear when checked. Checked September 2026.

## What Reflect got right

- **Speed and restraint.** A small feature set done quickly, with encryption by default.
- **Backlinks with context** and a calendar that feeds daily notes.
- **Backups that land on disk**, daily, in Reflect's JSON.

## Where it falls short

- **Cloud, encrypted, but cloud.** The working notes are on Reflect's servers; markdown export strips the links out of backlinks and tags.
- **Nested bullets, not an outliner.** Bullets indent, and that is where the outlining ends: no zoom, no node-level selection, no structural grammar across kinds.
- **Subscription only.** No free tier.

## What we take from it

That a notes tool can be small and fast, and that backlinks with context are worth having even in a minimal product.

## What we leave aside

A hosted store, encrypted or not. A subscription for the format.

## Head to head

| | Reflect | Obsidian + True Outliner |
| --- | --- | --- |
| Notes are plain files | –, JSON backups | ✓ |
| Nodes | nested bullets | every markdown block |
| Subtree moves | ✓ | ✓ |
| Selection by node, zoom, fold | partial | ✓ |
| Backlinks with structure | with context | ancestors and children |
| Encryption at rest | ✓ | the vault's disk, or Obsidian Sync's end-to-end encryption |
| Price | $10/mo, no free tier | free |
