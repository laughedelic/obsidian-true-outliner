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
  /** The cached tree for a path, without reading or parsing. Undefined when
   * nothing has parsed it yet — a caller that needs one on demand uses `get`. */
  peek(path: string): OutlineDoc | undefined {
    return this.entries.get(path)?.doc;
  }

  async get(file: TFile): Promise<OutlineDoc> {
    const cached = this.entries.get(file.path);
    if (cached && cached.mtime === file.stat.mtime) return cached.doc;

    // The mtime is taken BEFORE the read, and the result is only cached if the
    // file still carries it. Reading it afterwards files the text that was read
    // under whatever the file became while the read was in flight — a stale
    // parse under a current mtime, which nothing later invalidates because the
    // key looks fresh. It can also clobber a newer concurrent `get`.
    const readAt = file.stat.mtime;
    const doc = parse(await this.vault.cachedRead(file));
    // Changed under us: the parse is still correct for the text that was read,
    // so it is returned, but caching it would file yesterday's tree under
    // today's key. Leaving the entry absent costs one re-read and is the only
    // outcome that cannot be wrong.
    if (file.stat.mtime === readAt) this.entries.set(file.path, { mtime: readAt, doc });
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
