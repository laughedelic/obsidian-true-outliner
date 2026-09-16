/**
 * The cache the footer and the vault search share.
 *
 * What matters to both is identity, not equality: a note either of them has
 * already resolved is handed back as the SAME `OutlineDoc`, so the second
 * caller pays neither the read nor the parse, and neither can be holding a tree
 * the other has invalidated. The index's own half of that — that `treeCache`
 * hands out the instance it indexes with — is e2e's to cover, because
 * `backlink-index.ts` does `file instanceof TFile` and the `obsidian` package
 * is types-only, so this suite cannot load it. `decorate.test.ts` records the
 * same split for the same reason.
 */

import { describe, expect, it } from 'vitest';
import type { TFile, Vault } from 'obsidian';
import type { OutlineDoc, OutlineNode } from '../src/model';
import { SourceTreeCache } from '../src/plugin/source-tree-cache';

/** A file whose mtime the test moves by hand, since nothing here writes one. */
function fileAt(path: string, mtime: number): TFile {
  // eslint-disable-next-line obsidianmd/no-tfile-tfolder-cast -- a stand-in, not a
  // narrowing: `instanceof TFile` needs a runtime class and the `obsidian` package
  // is types-only, which is why this suite fakes what the cache reads.
  return { path, stat: { mtime } } as TFile;
}

/** A vault that answers with fixed text and counts what was asked of it. */
function vaultOf(contents: Record<string, string>): Vault & { reads: string[] } {
  const reads: string[] = [];
  return {
    reads,
    cachedRead: async (file: TFile) => {
      reads.push(file.path);
      return contents[file.path] ?? '';
    },
  } as unknown as Vault & { reads: string[] };
}

const NOTE = `# Heading

- alpha
    - beta
`;

describe('the shared tree cache', () => {
  it('hands a second caller the same tree, without reading again', async () => {
    const vault = vaultOf({ 'Notes/A.md': NOTE });
    const cache = new SourceTreeCache(vault);
    const file = fileAt('Notes/A.md', 1000);

    const first = await cache.get(file);
    const second = await cache.get(file);

    // Identity, not deep equality: two structurally equal trees would still be
    // two parses and two allocations, which is the cost one cache exists to
    // remove.
    expect(second).toBe(first);
    expect(vault.reads).toEqual(['Notes/A.md']);
  });

  /**
   * The negative control for sharing the instance at all, and the reason it is
   * not only about cost.
   *
   * Node ids are allocated per PARSE, from a counter that never restarts — so
   * two caches over one unchanged file hand out trees whose ids do not
   * correspond. A surface that addresses a node by id, as both the footer's
   * `treeFor` route and the palette's landing do, would be holding an id that
   * means nothing in the other's tree of the same note.
   */
  it('a second cache answers with a tree whose node ids are not the first’s', async () => {
    const vault = vaultOf({ 'Notes/A.md': NOTE });
    const mine = new SourceTreeCache(vault);
    const theirs = new SourceTreeCache(vault);
    const file = fileAt('Notes/A.md', 1000);

    const first = await mine.get(file);
    const second = await theirs.get(file);

    const ids = (doc: OutlineDoc): number[] => {
      const out: number[] = [];
      const walk = (nodes: readonly OutlineNode[]): void => {
        for (const node of nodes) {
          out.push(node.id);
          walk(node.children);
        }
      };
      walk(doc.children);
      return out;
    };

    expect(second).not.toBe(first);
    expect(ids(second)).not.toEqual(ids(first));
    expect(vault.reads).toEqual(['Notes/A.md', 'Notes/A.md']);
  });

  it('re-parses once the file’s mtime has moved, and not before', async () => {
    const vault = vaultOf({ 'Notes/A.md': NOTE });
    const cache = new SourceTreeCache(vault);

    const before = await cache.get(fileAt('Notes/A.md', 1000));
    const unchanged = await cache.get(fileAt('Notes/A.md', 1000));
    const after = await cache.get(fileAt('Notes/A.md', 2000));

    expect(unchanged).toBe(before);
    expect(after).not.toBe(before);
    expect(vault.reads).toEqual(['Notes/A.md', 'Notes/A.md']);
  });

  it('keeps one entry per path, so a whole-vault sweep is one entry per note', async () => {
    const vault = vaultOf({ 'A.md': NOTE, 'B.md': NOTE, 'C.md': NOTE });
    const cache = new SourceTreeCache(vault);

    for (const path of ['A.md', 'B.md', 'C.md', 'A.md', 'B.md']) {
      await cache.get(fileAt(path, 1000));
    }

    expect(cache.size).toBe(3);
    expect(vault.reads).toEqual(['A.md', 'B.md', 'C.md']);
  });
});
