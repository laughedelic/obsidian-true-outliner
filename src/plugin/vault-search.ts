/**
 * A query answered over every note in the vault, or over one of them.
 *
 * Progressive, because a whole-vault sweep is a cold read of every markdown file
 * and a palette that waits for the last one shows nothing until it arrives. Each
 * note's hits are handed back as they resolve, and the caller paints them.
 *
 * What this module does NOT decide is what a query means: `matchNodes` is the
 * grammar, shared with the footer and with whatever surface comes next, and the
 * walk is the corpus (`src/search.ts` says why those are separate). It reads the
 * matcher and adds nothing to it.
 *
 * Unit-testable on purpose: every `obsidian` import here is a type, so a fake
 * vault of stubbed files drives the whole thing. What needs a live Obsidian is
 * the palette that calls it.
 */

import type { TFile, Vault } from 'obsidian';
import type { OutlineDoc, OutlineNode } from '../model';
import { matchNodes, matchRanges } from '../search';
import type { Hit } from './footer-model';
import type { SourceTreeCache } from './source-tree-cache';

/** One note's hits, and the tree they were found in. */
export interface NoteHits {
  readonly file: TFile;
  readonly path: string;
  /** The tree the ids belong to — the caller's rows and its landing both resolve
   * against THIS parse, and a node id is only meaningful within one. */
  readonly doc: OutlineDoc;
  /** Node id -> where in that node the term is, in document order. */
  readonly hits: ReadonlyMap<number, Hit>;
}

export interface VaultSearchRequest {
  readonly query: string;
  /** One note, or every markdown note in the vault when null. */
  readonly only: TFile | null;
  /** How many notes' groups the caller will show. The walk continues past it to
   * count, so what it reports about the rest is true rather than a floor. */
  readonly groupCap: number;
  /** A note with hits, in recency order. Never called for a superseded query. */
  onGroup(group: NoteHits): void;
  /** The sweep finished. `beyondCap` is how many further notes hold hits and
   * were not handed over; zero when everything fit. */
  onDone(summary: { readonly beyondCap: number }): void;
}

/**
 * How many files the walk gets through before it lets the event loop run.
 *
 * A yield per file would make a warm sweep — every tree already cached, so every
 * `get` resolves without touching the disk — a queue of thousands of tasks; none
 * at all would make it a single block with the query field frozen inside it.
 */
const YIELD_EVERY = 25;

export class VaultSearch {
  /**
   * Bumped by every new query, every scope change and every cancellation.
   *
   * Checked at each point the walk suspends, and the walk RETURNS when it has
   * moved — it does not merely stop calling back. A guard that only silenced the
   * callbacks would leave a superseded sweep reading and parsing to the end, so
   * a fast typist would have one whole-vault sweep in flight per keystroke,
   * which is the opposite of what the guard is for.
   */
  private generation = 0;

  /**
   * `breathe` is the caller's, not this module's.
   *
   * It has to be a MACROTASK — a resolved promise only drains the microtask
   * queue, which is the same block with extra steps — and the timer a macrotask
   * comes from belongs to a window, which a palette in a popout window knows
   * and a search over a vault does not. Passing it in also keeps `window` out
   * of this file, which is what makes the walk drivable from the unit suite.
   */
  constructor(
    private readonly vault: Vault,
    private readonly trees: SourceTreeCache,
    private readonly breathe: () => Promise<void>,
  ) {}

  /** Abandons whatever is in flight, without starting anything. */
  cancel(): void {
    this.generation += 1;
  }

  async run(request: VaultSearchRequest): Promise<void> {
    const generation = (this.generation += 1);
    const live = (): boolean => generation === this.generation;

    // Ordered BEFORE the first tree resolves, not after the sweep. `mtime` is on
    // the `TFile` and costs no read, and taking the order first is what lets a
    // progressive paint append each group in its final place: sorting at the end
    // would either move rows already on screen or leave the cap admitting
    // whichever notes resolved first rather than the most recently modified.
    const files = request.only
      ? [request.only]
      : [...this.vault.getMarkdownFiles()].sort((a, b) => b.stat.mtime - a.stat.mtime);

    let shown = 0;
    let beyondCap = 0;

    for (let i = 0; i < files.length; i += 1) {
      if (i > 0 && i % YIELD_EVERY === 0) {
        await this.breathe();
        if (!live()) return;
      }

      const file = files[i];
      if (!file) continue;

      // A file that has gone since `getMarkdownFiles()` listed it is ordinary
      // rather than exceptional — a sweep of a synced vault of a few thousand
      // notes will meet one — and it is no reason to abandon the rest. The
      // backlink index treats a mid-flight deletion the same way.
      let doc;
      try {
        doc = await this.trees.get(file);
      } catch {
        if (!live()) return;
        continue;
      }
      // The read is the other place this suspends, and a query typed during one
      // is the common case rather than the rare one.
      if (!live()) return;

      const hits = hitsIn(doc, request.query);
      if (hits.size === 0) continue;

      // Past the cap the walk keeps going and keeps matching, because a count of
      // "how many more notes hold this" is what the tail promises and a walk that
      // stopped could only promise "at least the cap".
      if (shown < request.groupCap) {
        shown += 1;
        request.onGroup({ file, path: file.path, doc, hits });
      } else {
        beyondCap += 1;
      }
    }

    if (!live()) return;
    request.onDone({ beyondCap });
  }
}

/**
 * Every matching node in one tree, with where in it the term sits.
 *
 * Membership is `matchNodes`' and nothing else, so the palette and the footer
 * cannot disagree about what matched. The POSITION is this module's own work,
 * and it is what a row needs: `nodeContent` picks one line or cell out of a
 * node that has several — a fence shows its first non-fence line, a table its
 * first cell, a callout its title — so a hit anywhere else renders text the
 * query does not appear in, marked nowhere.
 *
 * The text is the occurrence AS WRITTEN rather than the query, because
 * `tableTextOf` finds its cell with a case-sensitive `includes` and a
 * lower-cased query would miss the cell it came from.
 *
 * A node can match while none of its own lines does: `matchNodes` tests the
 * lines joined by newlines, so a query spanning a line break matches the node
 * and no single line of it. Such a hit keeps its membership and takes the
 * node's first line, which is what a row would have shown anyway.
 */
function hitsIn(doc: OutlineDoc, query: string): Map<number, Hit> {
  const byId = new Map<number, OutlineNode>();
  const index = (nodes: readonly OutlineNode[]): void => {
    for (const node of nodes) {
      byId.set(node.id, node);
      index(node.children);
    }
  };
  index(doc.children);

  const hits = new Map<number, Hit>();
  for (const id of matchNodes(doc, query)) {
    // Indexed by the same walk `matchNodes` makes over the same tree, so every
    // id it answers with is one of these.
    const node = byId.get(id);
    if (node) hits.set(id, hitIn(node, query));
  }
  return hits;
}

/** Where the term first sits in a node's own lines. */
function hitIn(node: OutlineNode, query: string): Hit {
  for (const [line, text] of node.lines.entries()) {
    const [first] = matchRanges(text, query);
    if (first) return { line, text: text.slice(first.from, first.to) };
  }
  return { line: 0 };
}
