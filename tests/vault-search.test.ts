/**
 * The walk behind the search palette: what it hands back, in what order, and
 * what it stops doing when the query moves on.
 *
 * Drivable from here because `vault-search.ts` imports `obsidian` for types
 * only — a fake vault of stubbed files is the whole harness, and the reads it
 * records are what the generation guard is measured by.
 */

import { describe, expect, it } from 'vitest';
import type { TFile, Vault } from 'obsidian';
import type { OutlineNode } from '../src/model';
import { SourceTreeCache } from '../src/plugin/source-tree-cache';
import { VaultSearch, type NoteHits } from '../src/plugin/vault-search';

/**
 * A file stub, cast through `unknown`: this stands in for a `TFile` rather than
 * narrowing to one, and `instanceof TFile` — what narrowing would use — needs a
 * runtime class the types-only `obsidian` package does not ship.
 */
function fileAt(path: string, mtime: number): TFile {
  return { path, stat: { mtime } } as unknown as TFile;
}

interface FakeVault extends Vault {
  reads: string[];
}

/**
 * A vault whose `getMarkdownFiles` answers in the order given, which is how the
 * recency test tells sorting from luck.
 */
function vaultOf(notes: { path: string; mtime: number; text: string }[]): FakeVault {
  const reads: string[] = [];
  const files = notes.map((n) => fileAt(n.path, n.mtime));
  const text = new Map(notes.map((n) => [n.path, n.text]));
  return {
    reads,
    getMarkdownFiles: () => files,
    cachedRead: async (file: TFile) => {
      reads.push(file.path);
      return text.get(file.path) ?? '';
    },
  } as unknown as FakeVault;
}

/** The macrotask the walk yields on; the palette passes its own window's. */
const breathe = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

const searchOver = (vault: FakeVault): VaultSearch =>
  new VaultSearch(vault, new SourceTreeCache(vault), breathe);

/** Everything a run hands back, in the order it arrived. */
async function collect(
  search: VaultSearch,
  request: { query: string; only?: TFile | null; groupCap?: number },
): Promise<{ groups: NoteHits[]; done: { beyondCap: number } | null }> {
  const groups: NoteHits[] = [];
  let done: { beyondCap: number } | null = null;
  await search.run({
    query: request.query,
    only: request.only ?? null,
    groupCap: request.groupCap ?? 10,
    onGroup: (group) => groups.push(group),
    onDone: (summary) => {
      done = { beyondCap: summary.beyondCap };
    },
  });
  return { groups, done };
}

const NOTE = (body: string): string => `# Heading\n\n${body}\n`;

describe('vault search: what comes back', () => {
  it('reports a group per note that holds a hit, and none for the others', async () => {
    const vault = vaultOf([
      { path: 'A.md', mtime: 3, text: NOTE('- alpha TARGET') },
      { path: 'B.md', mtime: 2, text: NOTE('- nothing here') },
      { path: 'C.md', mtime: 1, text: NOTE('- gamma TARGET') },
    ]);
    const { groups, done } = await collect(searchOver(vault), { query: 'TARGET' });

    expect(groups.map((g) => g.path)).toEqual(['A.md', 'C.md']);
    expect(done).toEqual({ beyondCap: 0 });
  });

  it('orders by modification time however the vault lists its files', async () => {
    // Listed oldest first on purpose: without the sort this comes back in the
    // vault's order, and the assertion below is the whole difference.
    const vault = vaultOf([
      { path: 'oldest.md', mtime: 1, text: NOTE('- one TARGET') },
      { path: 'newest.md', mtime: 9, text: NOTE('- two TARGET') },
      { path: 'middle.md', mtime: 5, text: NOTE('- three TARGET') },
    ]);
    const { groups } = await collect(searchOver(vault), { query: 'TARGET' });

    expect(groups.map((g) => g.path)).toEqual(['newest.md', 'middle.md', 'oldest.md']);
  });

  it('searches one note alone when given one', async () => {
    const vault = vaultOf([
      { path: 'A.md', mtime: 2, text: NOTE('- alpha TARGET') },
      { path: 'B.md', mtime: 1, text: NOTE('- beta TARGET') },
    ]);
    const only = vault.getMarkdownFiles()[1]!;
    const { groups } = await collect(searchOver(vault), { query: 'TARGET', only });

    expect(groups.map((g) => g.path)).toEqual(['B.md']);
    expect(vault.reads).toEqual(['B.md']);
  });

  it('hands back the tree its ids belong to', async () => {
    const vault = vaultOf([{ path: 'A.md', mtime: 1, text: NOTE('- alpha TARGET') }]);
    const { groups } = await collect(searchOver(vault), { query: 'TARGET' });

    const group = groups[0]!;
    const ids = new Set<number>();
    const walk = (nodes: readonly OutlineNode[]): void => {
      for (const node of nodes) {
        ids.add(node.id);
        walk(node.children);
      }
    };
    walk(group.doc.children);
    // A node id means nothing outside the parse that assigned it, so the tree
    // travels with the hits rather than being re-read by the caller.
    for (const id of group.hits.keys()) expect(ids.has(id)).toBe(true);
  });
});

describe('vault search: where in a node the term is', () => {
  it('reports the fence line carrying the term, not the fence’s first', async () => {
    const vault = vaultOf([
      {
        path: 'A.md',
        mtime: 1,
        text: '# Heading\n\n```js\nconst a = 1;\nconst b = 2;\nconst TARGET = 3;\n```\n',
      },
    ]);
    const { groups } = await collect(searchOver(vault), { query: 'TARGET' });

    const hit = [...groups[0]!.hits.values()][0]!;
    // Without this the row renders `const a = 1;` — the fence's first non-fence
    // line — and the reader sees a hit with nothing marked in it.
    expect(hit.line).toBeGreaterThan(0);
    expect(hit.text).toBe('TARGET');
  });

  it('reports the occurrence as written, not the query as typed', async () => {
    const vault = vaultOf([{ path: 'A.md', mtime: 1, text: NOTE('- alpha Target Case') }]);
    const { groups } = await collect(searchOver(vault), { query: 'target' });

    const hit = [...groups[0]!.hits.values()][0]!;
    // `tableTextOf` finds its cell with a case-SENSITIVE `includes`, so handing
    // on the lower-cased query would miss the cell the hit came from.
    expect(hit.text).toBe('Target');
  });

  it('keeps a node whose match spans a line break, on its first line', async () => {
    // `matchNodes` tests the lines joined by newlines, so this node matches and
    // no single line of it does. Membership is the matcher's to decide; the
    // position falls back to where a row would have looked anyway.
    const vault = vaultOf([{ path: 'A.md', mtime: 1, text: NOTE('- one alpha\n  beta two') }]);
    const { groups } = await collect(searchOver(vault), { query: 'alpha\n  beta' });

    const hits = [...groups[0]!.hits.values()];
    expect(hits).toHaveLength(1);
    expect(hits[0]!.line).toBe(0);
  });
});

describe('vault search: the cap and its tail', () => {
  it('hands over the cap and counts the rest truly', async () => {
    const vault = vaultOf(
      [5, 4, 3, 2, 1].map((n) => ({ path: `${n}.md`, mtime: n, text: NOTE(`- n${n} TARGET`) })),
    );
    const { groups, done } = await collect(searchOver(vault), { query: 'TARGET', groupCap: 2 });

    expect(groups.map((g) => g.path)).toEqual(['5.md', '4.md']);
    // The walk carries on past the cap to count, so the tail says three rather
    // than "at least two".
    expect(done).toEqual({ beyondCap: 3 });
    expect(vault.reads).toHaveLength(5);
  });

  it('counts only the notes that hold hits', async () => {
    const vault = vaultOf([
      { path: 'a.md', mtime: 4, text: NOTE('- TARGET') },
      { path: 'b.md', mtime: 3, text: NOTE('- nothing') },
      { path: 'c.md', mtime: 2, text: NOTE('- TARGET') },
      { path: 'd.md', mtime: 1, text: NOTE('- nothing') },
    ]);
    const { done } = await collect(searchOver(vault), { query: 'TARGET', groupCap: 1 });

    expect(done).toEqual({ beyondCap: 1 });
  });
});

describe('vault search: a superseded query', () => {
  /** Enough files that the walk yields at least once mid-sweep. */
  const manyNotes = (count: number): { path: string; mtime: number; text: string }[] =>
    Array.from({ length: count }, (_, i) => ({
      path: `${String(i).padStart(3, '0')}.md`,
      mtime: count - i,
      text: NOTE(`- note ${i} TARGET`),
    }));

  it('stops reading at the first file it was already on', async () => {
    const vault = vaultOf(manyNotes(200));
    const search = searchOver(vault);

    const groups: string[] = [];
    let finished = false;
    const sweep = search.run({
      query: 'TARGET',
      only: null,
      groupCap: 1000,
      onGroup: (g) => groups.push(g.path),
      onDone: () => {
        finished = true;
      },
    });

    // Bumped before the first read resolves, which is what a keystroke during
    // the very first file does.
    search.cancel();
    await sweep;

    expect(finished).toBe(false);
    // Exactly one, not merely "fewer than 200": a guard that only dropped the
    // callbacks would have read all 200, and a loose bound would have been
    // satisfied by either.
    expect(vault.reads).toEqual(['000.md']);
    expect(groups).toEqual([]);
  });

  it('stops at its next yield when the query moves on mid-sweep', async () => {
    const vault = vaultOf(manyNotes(200));
    const search = searchOver(vault);

    let finished = false;
    const sweep = search.run({
      query: 'TARGET',
      only: null,
      groupCap: 1000,
      onGroup: () => {},
      onDone: () => {
        finished = true;
      },
    });

    // One macrotask in, so the walk is past its first `breathe()` and the guard
    // being measured is the one at the yield point rather than the one after a
    // read. `YIELD_EVERY` exists for this branch and nothing else covered it.
    await new Promise((resolve) => setTimeout(resolve, 5));
    const readSoFar = vault.reads.length;
    search.cancel();
    await sweep;

    expect(finished).toBe(false);
    expect(readSoFar).toBeGreaterThan(1);
    expect(readSoFar).toBeLessThan(200);
    // At most one more batch after the cancel: the walk ends at the yield it
    // was heading for, not at the end of the vault.
    expect(vault.reads.length).toBeLessThanOrEqual(readSoFar + 25);
  });

  it('lets the replacement finish, and reports only its results', async () => {
    const vault = vaultOf([
      { path: 'a.md', mtime: 2, text: NOTE('- alpha ONE') },
      { path: 'b.md', mtime: 1, text: NOTE('- beta TWO') },
    ]);
    const search = searchOver(vault);

    const stale: string[] = [];
    const first = search.run({
      query: 'ONE',
      only: null,
      groupCap: 10,
      onGroup: (g) => stale.push(g.path),
      onDone: () => stale.push('done'),
    });
    const { groups, done } = await collect(search, { query: 'TWO' });
    await first;

    expect(groups.map((g) => g.path)).toEqual(['b.md']);
    expect(done).toEqual({ beyondCap: 0 });
    expect(stale).not.toContain('done');
  });
});
