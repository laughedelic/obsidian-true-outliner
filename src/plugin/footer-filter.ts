/**
 * Which backlink groups the footer shows, in what order, and how many.
 *
 * Pure, and deliberately upstream of `BacklinkIndex.place()`. Everything the
 * controls need is in the index's cheap half — a source's folder is part of its
 * path and a reference's kind is on the reference itself — so the whole
 * decision is made before a source note is read (design D1). That is what lets
 * the overall cap bound the reads and not just the length: a group this module
 * does not admit is one `place()` is never called for.
 *
 * Nothing here imports `obsidian`, touches the DOM, or reads a file. The caller
 * assembles `SourceRefs[]` from `summaries()` and `referencesFrom()`.
 */

import type { BacklinkReference, ReferenceKind } from './backlink-index';
import { splitPath } from './footer-model';

/** The order groups appear in. `recent` is the default (docs/research/18, D15). */
export type SortOrder = 'recent' | 'oldest' | 'name' | 'references';

/** Kinds in the order D14 lists them, which is the order the chips sit in. */
const KIND_ORDER: readonly ReferenceKind[] = ['note', 'anchor', 'embed', 'property'];

/** One referencing note, with everything the controls read about it. */
export interface SourceRefs {
  readonly path: string;
  readonly mtime: number;
  readonly refs: readonly BacklinkReference[];
}

/**
 * What the reader has asked for. An empty selection on an axis means that axis
 * is not filtering, which is the whole of the focus-on rule.
 */
export interface ControlsState {
  readonly folders: ReadonlySet<string>;
  readonly kinds: ReadonlySet<ReferenceKind>;
  /** Matched against source note NAMES only. Empty admits everything. */
  readonly search: string;
  readonly sort: SortOrder;
  /** Overall reference cap. `Infinity` for no limit. */
  readonly cap: number;
}

export const NO_FILTER: ControlsState = {
  folders: new Set(),
  kinds: new Set(),
  search: '',
  sort: 'recent',
  cap: Number.POSITIVE_INFINITY,
};

/** One offerable filter value and how many notes contribute to it. */
export interface AxisValue<T> {
  readonly value: T;
  /**
   * Notes this value would show GIVEN the other axes' selections — so picking a
   * folder re-counts the kinds against that folder, and a kind absent from it
   * reads 0 rather than the number it had before the folder was picked.
   */
  readonly notes: number;
}

export interface FilterAxes {
  readonly folders: readonly AxisValue<string>[];
  readonly kinds: readonly AxisValue<ReferenceKind>[];
}

/** A group that survived the filters, with its FILTERED reference count. */
export interface AdmittedGroup {
  readonly path: string;
  readonly count: number;
  readonly mtime: number;
}

export interface ControlsResult {
  /** Admitted by the cap, in sort order. */
  readonly groups: readonly AdmittedGroup[];
  /** The whole filtered set, whether or not the cap admitted it. */
  readonly totals: { references: number; notes: number };
  /** What the cap held back — zero on both counts when nothing is omitted. */
  readonly shortfall: { references: number; notes: number };
}

/**
 * What each axis can offer, and how much each value would show.
 *
 * The two halves are computed over different sets, on purpose.
 *
 * WHICH values appear comes from the note's whole reference set. An axis
 * narrowed to what the current selection admits would drop every value the
 * reader has not picked, and a second value could never be added to a
 * selection — picking `Daily` would remove `Notes` and strand the reader in it.
 *
 * HOW MANY each would show comes from the set the OTHER axes admit, its own
 * excluded. That is what makes the counts answer the question a reader is
 * actually asking — "if I add this, what do I get" — so choosing a folder
 * re-counts the kinds against that folder, and a kind that folder does not
 * contain reads 0 instead of the number it had a moment ago. Excluding the
 * axis's own selection is what keeps its other values live: counting a kind
 * against the kind filter would show 0 for every kind not already picked.
 */
export function axesOf(
  sources: readonly SourceRefs[],
  controls: ControlsState = NO_FILTER,
): FilterAxes {
  const present = { folders: new Set<string>(), kinds: new Set<ReferenceKind>() };
  for (const source of sources) {
    present.folders.add(splitPath(source.path).folder);
    for (const ref of source.refs) present.kinds.add(ref.kind);
  }

  // Each axis counted against everything EXCEPT itself.
  const forFolders = filterSources(sources, controls, { folders: false });
  const forKinds = filterSources(sources, controls, { kinds: false });

  const folderNotes = new Map<string, number>();
  for (const group of forFolders) {
    const { folder } = splitPath(group.path);
    folderNotes.set(folder, (folderNotes.get(folder) ?? 0) + 1);
  }

  const kindNotes = new Map<ReferenceKind, number>();
  for (const group of forKinds) {
    const source = sources.find((s) => s.path === group.path);
    for (const kind of new Set(source?.refs.map((r) => r.kind) ?? [])) {
      kindNotes.set(kind, (kindNotes.get(kind) ?? 0) + 1);
    }
  }

  return {
    folders: [...present.folders]
      .sort((a, b) => a.localeCompare(b))
      .map((value) => ({ value, notes: folderNotes.get(value) ?? 0 })),
    kinds: KIND_ORDER.filter((k) => present.kinds.has(k)).map((value) => ({
      value,
      notes: kindNotes.get(value) ?? 0,
    })),
  };
}

/**
 * Applies the controls, in the order the requirements state them: filter, then
 * sort, then cap. The cap comes last because narrowing has to free budget
 * rather than leave it spent on references the filter excluded.
 */
export function applyControls(
  sources: readonly SourceRefs[],
  controls: ControlsState,
): ControlsResult {
  const filtered = filterSources(sources, controls, {});
  const ordered = sortGroups(filtered, controls.sort);
  const groups = admit(ordered, controls.cap);

  const references = ordered.reduce((sum, g) => sum + g.count, 0);
  const shown = groups.reduce((sum, g) => sum + g.count, 0);
  return {
    groups,
    totals: { references, notes: ordered.length },
    shortfall: { references: references - shown, notes: ordered.length - groups.length },
  };
}

/**
 * The two axes and the search term, combined conjunctively.
 *
 * The axes filter at different levels: a folder and a name are properties of
 * the source, so they admit or reject a whole group, while a kind is a property
 * of a reference, so it decides a group's COUNT and removes the group only when
 * it leaves nothing.
 *
 * A selection is intersected with the values actually present first. A value
 * can stop existing while the footer is open — the reference that carried it is
 * edited away — and a selection matching nothing would otherwise empty the
 * footer, where the requirement is that an axis with no live selection admits
 * everything.
 */
function filterSources(
  sources: readonly SourceRefs[],
  controls: ControlsState,
  { folders: useFolders = true, kinds: useKinds = true }: AxisSwitches,
): AdmittedGroup[] {
  const present = presentValues(sources);
  const folders = useFolders ? live(controls.folders, present.folders) : new Set<string>();
  const kinds = useKinds ? live(controls.kinds, present.kinds) : new Set<ReferenceKind>();
  const search = controls.search.trim().toLowerCase();

  const out: AdmittedGroup[] = [];
  for (const source of sources) {
    const { name, folder } = splitPath(source.path);
    if (folders.size > 0 && !folders.has(folder)) continue;
    if (search.length > 0 && !name.toLowerCase().includes(search)) continue;

    const count =
      kinds.size === 0 ? source.refs.length : source.refs.filter((r) => kinds.has(r.kind)).length;
    if (count === 0) continue;

    out.push({ path: source.path, count, mtime: source.mtime });
  }
  return out;
}

/** Which axes take part in a pass. An axis switched off admits everything,
 * which is how each axis's own counts are computed without itself. */
interface AxisSwitches {
  readonly folders?: boolean;
  readonly kinds?: boolean;
}

/** Every value each axis holds across the unfiltered set. */
function presentValues(sources: readonly SourceRefs[]): {
  folders: string[];
  kinds: ReferenceKind[];
} {
  const folders = new Set<string>();
  const kinds = new Set<ReferenceKind>();
  for (const source of sources) {
    folders.add(splitPath(source.path).folder);
    for (const ref of source.refs) kinds.add(ref.kind);
  }
  return { folders: [...folders], kinds: [...kinds] };
}

/** A selection narrowed to the values still on offer. */
function live<T>(selected: ReadonlySet<T>, present: readonly T[]): Set<T> {
  return new Set(present.filter((v) => selected.has(v)));
}

/**
 * Path is the TIE-BREAK, never the comparison. It used to be the whole of it,
 * which sorted by filename backwards and reported it as recency.
 */
function sortGroups(groups: readonly AdmittedGroup[], sort: SortOrder): AdmittedGroup[] {
  const byPath = (a: AdmittedGroup, b: AdmittedGroup): number => a.path.localeCompare(b.path);
  const compare: Record<SortOrder, (a: AdmittedGroup, b: AdmittedGroup) => number> = {
    recent: (a, b) => b.mtime - a.mtime || byPath(a, b),
    oldest: (a, b) => a.mtime - b.mtime || byPath(a, b),
    name: (a, b) => splitPath(a.path).name.localeCompare(splitPath(b.path).name) || byPath(a, b),
    references: (a, b) => b.count - a.count || byPath(a, b),
  };
  return [...groups].sort(compare[sort]);
}

/**
 * Groups admitted whole, in order, while the running total stays within the
 * cap (design D2).
 *
 * A group is the unit a reader reads, so a cap reached partway through one
 * would cut a note's tree at a position decided by the notes sorted before it.
 * The first group is admitted whatever its size: refusing it would leave a
 * footer reporting references and showing none, and its own height bound is
 * what limits how much of it is on screen.
 */
function admit(ordered: readonly AdmittedGroup[], cap: number): AdmittedGroup[] {
  const out: AdmittedGroup[] = [];
  let running = 0;
  for (const group of ordered) {
    if (out.length > 0 && running + group.count > cap) break;
    out.push(group);
    running += group.count;
  }
  return out;
}
