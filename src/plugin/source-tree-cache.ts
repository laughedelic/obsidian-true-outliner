/**
 * Parsed trees for notes OTHER than the one being edited, cached by path and
 * modification time.
 *
 * The sibling of `parsed-doc.ts`, which caches the open document keyed on CM6's
 * immutable `Text` — a key that only exists for a document loaded into an
 * editor. The footer needs trees for files that are not open, so it reads them
 * with `cachedRead` and keys on `path + mtime` instead: a file whose mtime has
 * not moved cannot have different content, and one whose mtime has moved must
 * be re-parsed. Same pattern, different key, deliberately not merged — one
 * cache serving two key types would have to branch on which kind it was holding.
 *
 * Parsing with OUR parser rather than reconstructing structure from
 * `CachedMetadata` is design decision D-E. Obsidian's cache would give hierarchy
 * for free, but it is Obsidian's tree: no paragraph-owns-following-list, no atom
 * kinds, no gap ownership. A second, subtly different tree model is exactly the
 * divergence this project exists to avoid.
 */

import type { TFile, Vault } from 'obsidian';
import type { OutlineDoc } from '../model';
import { parse } from '../parse';

interface Entry {
  readonly mtime: number;
  readonly doc: OutlineDoc;
}

export class SourceTreeCache {
  private readonly entries = new Map<string, Entry>();

  constructor(private readonly vault: Vault) {}

  /**
   * The parsed tree for `file`, from cache when its mtime is unchanged.
   *
   * `cachedRead` rather than `read`: this is display, never a read-modify-write,
   * and Obsidian's own guidance is that `read` is only for the latter.
   */
  async get(file: TFile): Promise<OutlineDoc> {
    const cached = this.entries.get(file.path);
    if (cached && cached.mtime === file.stat.mtime) return cached.doc;

    const doc = parse(await this.vault.cachedRead(file));
    this.entries.set(file.path, { mtime: file.stat.mtime, doc });
    return doc;
  }

  /** Drops one file's tree — on delete, or on rename, where the path key is
   * no longer the file's own. */
  forget(path: string): void {
    this.entries.delete(path);
  }

  clear(): void {
    this.entries.clear();
  }

  /** Entries currently held, for diagnostics and tests. */
  get size(): number {
    return this.entries.size;
  }
}
