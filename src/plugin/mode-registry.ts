/**
 * Per-note outline-mode state, persisted in the plugin data store (decision
 * log Q2.6: files stay clean — no frontmatter, no markers). Pure module: the
 * plugin injects persistence, so this is unit-testable without Obsidian.
 *
 * `MarkerVariant` lives here (not decorations.ts, which imports `obsidian`
 * for `editorInfoField`) specifically so this module can stay pure — it's
 * really just a data type, not a decoration-rendering concern.
 */

/** See docs/research/07-decoration-experiments-plan.md, Experiment 5a's
 * placement round — decorations.ts imports this type back from here. */
export type MarkerVariant = 'A' | 'B' | 'C';
export const DEFAULT_MARKER_VARIANT: MarkerVariant = 'B';

export interface PluginData {
  outlinePaths: string[];
  coexistenceWarned: boolean;
  debugCrossCheck: boolean;
  /** Experiment 5a placement round (see docs/research/07-decoration-
   * experiments-plan.md) — a real, persisted setting so it can be tried
   * against a real vault without a rebuild. Not meant to survive past the
   * experiment: once a variant is picked, this whole setting goes away. */
  markerVariant: MarkerVariant;
}

export const DEFAULT_DATA: PluginData = {
  outlinePaths: [],
  coexistenceWarned: false,
  debugCrossCheck: false,
  markerVariant: DEFAULT_MARKER_VARIANT,
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
