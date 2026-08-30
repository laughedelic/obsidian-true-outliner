/**
 * Which notes reference a given note, in what way, and where.
 *
 * Answers in two stages, because the two halves cost wildly different things:
 *
 * - **Which notes, and how many references each** comes from Obsidian's own
 *   metadata, already in memory. No file is read. This is what the footer paints
 *   on its first frame (design.md D-G).
 * - **Where each reference sits in its source note's tree** requires reading and
 *   parsing that note, and is done per source so the footer can render each
 *   group as it resolves rather than waiting for all of them.
 *
 * Enumeration walks every markdown file's cached metadata rather than
 * `resolvedLinks`. `resolvedLinks` is the cheaper reverse index, but it reports
 * only counts — not whether a reference was a plain link, an anchored link, an
 * embed, or a frontmatter property, and not where it sits. Since the detail has
 * to come from `getFileCache` anyway, and that is also an in-memory read, taking
 * both from the same place avoids the two disagreeing.
 *
 * Public API only: `getFileCache`, `parseLinktext`, `getFirstLinkpathDest`, the
 * four `metadataCache` events, `vault.on('rename')`. `getBacklinksForFile` is
 * not public and is deliberately not used.
 */

import { TFile, parseLinktext, type App, type CachedMetadata, type Reference } from 'obsidian';
import type { OutlineDoc, OutlineNode } from '../model';
import { nodeAtLine, nodeStartLine } from '../locate';
import type { NodePredicate } from '../project';
import { SourceTreeCache } from './source-tree-cache';

/**
 * What a reference addresses, and how it is written.
 *
 * `note` and `anchor` split on WHAT is addressed — the whole note, or a node
 * inside it. `embed` and `property` split on HOW it is written. The taxonomy
 * deliberately flattens two axes into one list because that is how a reader
 * thinks about them; see docs/research/18, D14.
 */
export type ReferenceKind = 'note' | 'anchor' | 'embed' | 'property';

export interface BacklinkReference {
  readonly kind: ReferenceKind;
  readonly sourcePath: string;
  /**
   * 0-indexed line in the source note. Absent for `property` references, which
   * live in frontmatter and have no position in the block tree at all — the
   * footer renders those without lineage for exactly this reason.
   */
  readonly line?: number | undefined;
  /** Frontmatter property name. Present iff `kind === 'property'`. */
  readonly property?: string | undefined;
  /** The link as written, alias and all. */
  readonly original: string;
}

/** One referencing note and how many references it contributes. Available with
 * no file reads. */
export interface SourceSummary {
  readonly path: string;
  readonly count: number;
}

/** A source note's references, placed in its tree. */
export interface PlacedSource {
  readonly path: string;
  readonly doc: OutlineDoc;
  /**
   * Nodes containing at least one reference — the predicate `project()` takes.
   *
   * Matches on node `id`, which a projection copies along with the rest of the
   * node, so the same predicate stays valid for the projected tree that
   * `collapseLineage` then walks. Matching on object identity would not: a
   * projection rebuilds any node whose children changed.
   */
  readonly matches: NodePredicate;
  /** Node id -> the kind of reference found in it. Keyed by NODE, because that
   * is what a row is: a line key would never match what the renderer asks. */
  readonly kinds: ReadonlyMap<number, ReferenceKind>;
  /**
   * Node id -> which of that node's OWN lines the reference sits on, counted
   * from the node's first line.
   *
   * A node whose lines are records rather than continuations — a table, a code
   * fence — renders one line, and this says which (D18). Node-local rather than
   * absolute because a projected tree's line numbers are its own.
   */
  readonly refLines: ReadonlyMap<number, number>;
  /** References with no position in the tree, in frontmatter order. */
  readonly properties: readonly BacklinkReference[];
}

export class BacklinkIndex {
  /** target path -> source path -> that source's references to it. */
  private readonly byTarget = new Map<string, Map<string, BacklinkReference[]>>();
  private readonly trees: SourceTreeCache;
  private built = false;

  constructor(private readonly app: App) {
    this.trees = new SourceTreeCache(app.vault);
  }

  /** Rebuilds from scratch. Cheap enough to be the startup path: every read is
   * from the in-memory metadata cache. */
  rebuild(): void {
    this.byTarget.clear();
    for (const file of this.app.vault.getMarkdownFiles()) this.addSource(file);
    this.built = true;
  }

  get isBuilt(): boolean {
    return this.built;
  }

  /** Re-indexes one source note; used for both creation and modification. */
  reindex(file: TFile): void {
    this.removeSource(file.path);
    this.addSource(file);
  }

  /** Forgets a source note entirely — deletion, or the old path after a rename. */
  removeSource(path: string): void {
    for (const [target, bySource] of this.byTarget) {
      if (bySource.delete(path) && bySource.size === 0) this.byTarget.delete(target);
    }
    this.trees.forget(path);
  }

  /** Everything that references `targetPath`, grouped by source note. No file
   * reads: this is the footer's first frame. */
  summaries(targetPath: string): SourceSummary[] {
    const bySource = this.byTarget.get(targetPath);
    if (!bySource) return [];
    return [...bySource.entries()].map(([path, refs]) => ({ path, count: refs.length }));
  }

  /** Every reference to `targetPath` from `sourcePath`, unplaced. */
  referencesFrom(targetPath: string, sourcePath: string): readonly BacklinkReference[] {
    return this.byTarget.get(targetPath)?.get(sourcePath) ?? [];
  }

  /** Total references and contributing notes — the header's counts. */
  totals(targetPath: string): { references: number; notes: number } {
    const summaries = this.summaries(targetPath);
    return {
      references: summaries.reduce((sum, s) => sum + s.count, 0),
      notes: summaries.length,
    };
  }

  /**
   * Reads and parses one source note and places its references in its tree.
   *
   * Per source on purpose: a hub note's sources resolve independently, so the
   * footer fills in group by group instead of blocking on the slowest read.
   * Returns `null` when the source no longer exists — a deletion that arrived
   * between the summary and this call is ordinary, not an error.
   */
  async place(targetPath: string, sourcePath: string): Promise<PlacedSource | null> {
    const refs = this.referencesFrom(targetPath, sourcePath);
    if (refs.length === 0) return null;

    // `getAbstractFileByPath` + instanceof rather than `getFileByPath`, which
    // needs Obsidian 1.5.7 and would raise our minAppVersion for no behaviour.
    const file = this.app.vault.getAbstractFileByPath(sourcePath);
    if (!(file instanceof TFile)) return null;

    const doc = await this.trees.get(file);
    const matchedIds = new Set<number>();
    const kinds = new Map<number, ReferenceKind>();
    const refLines = new Map<number, number>();
    for (const ref of refs) {
      if (ref.line === undefined) continue;
      const node = nodeAtLine(doc, ref.line);
      if (!node) continue;
      matchedIds.add(node.id);
      // A node can hold more than one reference; the first kind wins, which
      // only decides a marker and never whether the node is a reference at all.
      if (!kinds.has(node.id)) kinds.set(node.id, ref.kind);
      if (!refLines.has(node.id)) {
        refLines.set(node.id, ref.line - nodeStartLine(doc, node.id));
      }
    }

    return {
      path: sourcePath,
      doc,
      matches: (node: OutlineNode) => matchedIds.has(node.id),
      kinds,
      refLines,
      properties: refs.filter((r) => r.kind === 'property'),
    };
  }

  /** Drops parsed trees; the reverse map is untouched. */
  clearTrees(): void {
    this.trees.clear();
  }

  // ---- indexing ----------------------------------------------------------

  private addSource(file: TFile): void {
    const cache = this.app.metadataCache.getFileCache(file);
    if (!cache) return;
    for (const [targetPath, ref] of this.referencesIn(file, cache)) {
      let bySource = this.byTarget.get(targetPath);
      if (!bySource) {
        bySource = new Map();
        this.byTarget.set(targetPath, bySource);
      }
      const list = bySource.get(file.path);
      if (list) list.push(ref);
      else bySource.set(file.path, [ref]);
    }
  }

  /** Every reference `file` makes, paired with the path it resolves to. */
  private *referencesIn(
    file: TFile,
    cache: CachedMetadata,
  ): Generator<[string, BacklinkReference]> {
    const emit = (
      ref: Reference,
      kind: ReferenceKind,
      line: number | undefined,
      property?: string,
    ): [string, BacklinkReference] | undefined => {
      const target = this.resolve(ref.link, file.path);
      // A note linking to itself is not its own backlink.
      if (!target || target === file.path) return undefined;
      return [
        target,
        { kind, sourcePath: file.path, line, original: ref.original, property },
      ];
    };

    for (const link of cache.links ?? []) {
      const kind = this.hasSubpath(link.link) ? 'anchor' : 'note';
      const out = emit(link, kind, link.position.start.line);
      if (out) yield out;
    }
    for (const embed of cache.embeds ?? []) {
      const out = emit(embed, 'embed', embed.position.start.line);
      if (out) yield out;
    }
    for (const fm of cache.frontmatterLinks ?? []) {
      // No position: frontmatter is the document preamble, never a node.
      const out = emit(fm, 'property', undefined, fm.key);
      if (out) yield out;
    }
  }

  /** True when a linktext addresses something inside the note rather than the
   * note itself — a heading or a block id. */
  private hasSubpath(linktext: string): boolean {
    return parseLinktext(linktext).subpath.length > 0;
  }

  /** The vault path a linktext resolves to from `sourcePath`, or undefined when
   * it resolves to nothing (a link to a note that does not exist). */
  private resolve(linktext: string, sourcePath: string): string | undefined {
    const { path } = parseLinktext(linktext);
    const dest = this.app.metadataCache.getFirstLinkpathDest(path, sourcePath);
    return dest?.path;
  }
}
