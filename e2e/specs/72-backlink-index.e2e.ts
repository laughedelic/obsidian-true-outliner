/**
 * The backlink index against a live Obsidian: reference classification, and the
 * invalidation that keeps the index honest as the vault changes.
 *
 * Split deliberately from the unit tests. Placing a reference in its source
 * note's tree is pure and is covered in `tests/projection-decorate.test.ts`,
 * where it runs deterministically with no app at all. What can only be checked
 * here is everything that depends on Obsidian's own metadata cache: how it
 * resolves a linktext, when it fires, and what it reports after a file is
 * created, edited, renamed or deleted.
 *
 * Assertions go through the index's serialisable query methods rather than
 * `place()`, whose predicate is a function and cannot cross the WebDriver
 * boundary.
 */

import { browser, expect } from '@wdio/globals';
import { obsidianPage } from 'wdio-obsidian-service';
import * as h from '../helpers.js';

const TARGET = 'Projects/Aurora Dashboard.md';
const SCRATCH = 'Backlinks/Scratch source.md';

interface RefRow {
  kind: string;
  sourcePath: string;
  line?: number;
  property?: string;
  original: string;
}

function referencesFrom(target: string, source: string): Promise<RefRow[]> {
  return browser.executeObsidian(
    ({ plugins }, t, s) =>
      JSON.parse(
        JSON.stringify((plugins.trueOutliner as any).backlinks.referencesFrom(t, s)),
      ) as RefRow[],
    target,
    source,
  );
}

function totals(target: string): Promise<{ references: number; notes: number }> {
  return browser.executeObsidian(
    ({ plugins }, t) => (plugins.trueOutliner as any).backlinks.totals(t),
    target,
  );
}

function sourcePaths(target: string): Promise<string[]> {
  return browser.executeObsidian(
    ({ plugins }, t) =>
      ((plugins.trueOutliner as any).backlinks.summaries(t) as { path: string }[])
        .map((s) => s.path)
        .sort(),
    target,
  );
}

/** Obsidian's metadata cache settles asynchronously after a write. */
async function waitForSources(target: string, predicate: (paths: string[]) => boolean) {
  await browser.waitUntil(async () => predicate(await sourcePaths(target)), {
    timeout: 8000,
    timeoutMsg: `index never settled; saw ${JSON.stringify(await sourcePaths(target))}`,
  });
}

async function writeNote(path: string, content: string): Promise<void> {
  await browser.executeObsidian(
    async ({ app }, p, c) => {
      const existing = app.vault.getAbstractFileByPath(p);
      if (existing) await app.vault.delete(existing);
      const dir = p.split('/').slice(0, -1).join('/');
      if (dir && !app.vault.getAbstractFileByPath(dir)) await app.vault.createFolder(dir);
      await app.vault.create(p, c);
    },
    path,
    content,
  );
}

async function deleteNote(path: string): Promise<void> {
  await browser.executeObsidian(async ({ app }, p) => {
    const f = app.vault.getAbstractFileByPath(p);
    if (f) await app.vault.delete(f);
  }, path);
}

describe('backlink index', function () {
  before(async function () {
    await obsidianPage.resetVault();
    await h.resetPluginState();
    // The index builds at layout-ready; a plugin reload means rebuilding it.
    await browser.executeObsidian(({ plugins }) => {
      (plugins.trueOutliner as any).backlinks.rebuild();
    });
  });

  afterEach(async function () {
    await h.dismissNotices();
  });

  after(async function () {
    await deleteNote(SCRATCH);
  });

  it('classifies a plain link as a note reference', async function () {
    const refs = await referencesFrom(TARGET, 'Journal/2026-07-07.md');
    expect(refs.length).toBeGreaterThan(0);
    expect(refs.every((r) => r.kind === 'note')).toBe(true);
    expect(refs[0]!.line).toBeGreaterThanOrEqual(0);
  });

  it('classifies a subpath link as an anchor reference', async function () {
    const refs = await referencesFrom(TARGET, 'Backlinks/Atoms and anchors.md');
    const anchors = refs.filter((r) => r.kind === 'anchor');
    expect(anchors.length).toBeGreaterThan(0);
    expect(anchors[0]!.original).toContain('#Current sprint');
  });

  it('classifies an alias link as a note reference, keeping the text as written', async function () {
    const refs = await referencesFrom(TARGET, 'Backlinks/Atoms and anchors.md');
    const alias = refs.find((r) => r.original.includes('|'));
    expect(alias).toBeDefined();
    expect(alias!.kind).toBe('note');
    expect(alias!.original).toContain('the dashboard');
  });

  it('distinguishes an embed from a link, and a property from both', async function () {
    const refs = await referencesFrom(TARGET, 'Backlinks/Severity study writeup.md');
    const kinds = refs.map((r) => r.kind).sort();
    expect(kinds).toContain('embed');
    expect(kinds).toContain('property');

    const property = refs.find((r) => r.kind === 'property')!;
    expect(property.property).toBe('project');
    // Frontmatter has no place in the block tree, so it carries no line.
    expect(property.line).toBeUndefined();

    const embed = refs.find((r) => r.kind === 'embed')!;
    expect(embed.line).toBeGreaterThanOrEqual(0);
  });

  it('does not report a note as its own backlink', async function () {
    expect(await referencesFrom(TARGET, TARGET)).toEqual([]);
    expect(await sourcePaths(TARGET)).not.toContain(TARGET);
  });

  it('does not report links that resolve elsewhere', async function () {
    // Sourdough Log links nothing; Kitchen Renovation links other notes.
    expect(await referencesFrom(TARGET, 'Notes/Sourdough Log.md')).toEqual([]);
  });

  it('picks up a newly added link without a reload', async function () {
    await writeNote(SCRATCH, 'Fresh note mentioning [[Aurora Dashboard]].\n');
    await waitForSources(TARGET, (paths) => paths.includes(SCRATCH));

    const refs = await referencesFrom(TARGET, SCRATCH);
    expect(refs).toHaveLength(1);
    expect(refs[0]!.kind).toBe('note');
  });

  it('drops a reference when the link is removed', async function () {
    await writeNote(SCRATCH, 'Fresh note mentioning [[Aurora Dashboard]].\n');
    await waitForSources(TARGET, (paths) => paths.includes(SCRATCH));

    await writeNote(SCRATCH, 'The link is gone now.\n');
    await waitForSources(TARGET, (paths) => !paths.includes(SCRATCH));
    expect(await referencesFrom(TARGET, SCRATCH)).toEqual([]);
  });

  it('evicts a deleted source note', async function () {
    await writeNote(SCRATCH, 'Doomed note linking [[Aurora Dashboard]].\n');
    await waitForSources(TARGET, (paths) => paths.includes(SCRATCH));

    await deleteNote(SCRATCH);
    await waitForSources(TARGET, (paths) => !paths.includes(SCRATCH));
  });

  it('re-keys a renamed source note to its new path', async function () {
    const renamed = 'Backlinks/Renamed source.md';
    await deleteNote(renamed);
    await writeNote(SCRATCH, 'Will be renamed, links [[Aurora Dashboard]].\n');
    await waitForSources(TARGET, (paths) => paths.includes(SCRATCH));

    await browser.executeObsidian(
      async ({ app }, from, to) => {
        const f = app.vault.getAbstractFileByPath(from);
        if (f) await app.fileManager.renameFile(f, to);
      },
      SCRATCH,
      renamed,
    );
    await waitForSources(
      TARGET,
      (paths) => paths.includes(renamed) && !paths.includes(SCRATCH),
    );

    expect(await referencesFrom(TARGET, SCRATCH)).toEqual([]);
    expect((await referencesFrom(TARGET, renamed)).length).toBe(1);
    await deleteNote(renamed);
  });

  it('reports totals that match the per-source counts', async function () {
    const paths = await sourcePaths(TARGET);
    const summed = (
      await Promise.all(paths.map((p) => referencesFrom(TARGET, p)))
    ).reduce((n, refs) => n + refs.length, 0);

    const t = await totals(TARGET);
    expect(t.notes).toBe(paths.length);
    expect(t.references).toBe(summed);
  });
});
