/**
 * Per-note outline-mode state, persisted in the plugin data store (decision
 * log Q2.6: files stay clean — no frontmatter, no markers). Pure module: the
 * plugin injects persistence, so this is unit-testable without Obsidian.
 *
 * `MarkerVisibility` lives here (not decorations.ts, which imports `obsidian`
 * for `editorInfoField`) specifically so this module can stay pure — it's
 * really just a data type, not a decoration-rendering concern.
 */

/**
 * Which nodes get a block marker at all (Experiment 5a follow-up: markers
 * read as "a crown on top of the guide line" for a branch, but add little
 * for a leaf — most leaf atom kinds already carry their own native visual
 * style, e.g. a code fence's background or a callout's colored bar).
 * - 'all' — every eligible kind's first line (status quo).
 * - 'with-children' — only nodes that actually have at least one child.
 *   Atom kinds are leaves by construction, so this always excludes them.
 * - 'headings-and-paragraphs' — only the two kinds that CAN ever have
 *   children in this tree model, regardless of whether a given instance
 *   currently does. Atoms never qualify (they can't have children at all);
 *   list items are already excluded from markers unconditionally.
 */
export type MarkerVisibility = 'all' | 'with-children' | 'headings-and-paragraphs';
export const DEFAULT_MARKER_VISIBILITY: MarkerVisibility = 'all';

export interface PluginData {
  outlinePaths: string[];
  coexistenceWarned: boolean;
  debugCrossCheck: boolean;
  /** Experiment 5a leaf-visibility round (see docs/research/07-decoration-
   * experiments-plan.md) — a real, persisted, user-facing setting so it can
   * be tried against a real vault without a rebuild. */
  markerVisibility: MarkerVisibility;
}

export const DEFAULT_DATA: PluginData = {
  outlinePaths: [],
  coexistenceWarned: false,
  debugCrossCheck: false,
  markerVisibility: DEFAULT_MARKER_VISIBILITY,
};

export class OutlineModeRegistry {
  private paths = new Set<string>();

  constructor(private readonly persist: (paths: string[]) => Promise<void>) {}

  hydrate(paths: readonly string[]): void {
    this.paths = new Set(paths);
  }

  isOutline(path: string): boolean {
    return this.paths.has(path);
  }

  async toggle(path: string): Promise<boolean> {
    const on = !this.paths.has(path);
    if (on) this.paths.add(path);
    else this.paths.delete(path);
    await this.save();
    return on;
  }

  async handleRename(oldPath: string, newPath: string): Promise<void> {
    if (!this.paths.has(oldPath)) return;
    this.paths.delete(oldPath);
    this.paths.add(newPath);
    await this.save();
  }

  async handleDelete(path: string): Promise<void> {
    if (!this.paths.delete(path)) return;
    await this.save();
  }

  snapshot(): string[] {
    return [...this.paths].sort();
  }

  private save(): Promise<void> {
    return this.persist(this.snapshot());
  }
}
