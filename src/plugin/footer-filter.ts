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
 * The values each axis can offer, over the note's WHOLE reference set.
 *
 * Not over the filtered set: an axis narrowed to what the current selection
 * admits would drop every value the reader has not picked, and a second value
 * could never be added to a selection.
 */
export function axesOf(sources: readonly SourceRefs[]): FilterAxes {
  const folders = new Map<string, number>();
  const kinds = new Map<ReferenceKind, number>();

  for (const source of sources) {
    const { folder } = splitPath(source.path);
    folders.set(folder, (folders.get(folder) ?? 0) + 1);
    for (const kind of new Set(source.refs.map((r) => r.kind))) {
      kinds.set(kind, (kinds.get(kind) ?? 0) + 1);
    }
  }

  return {
    folders: [...folders.entries()]
      .map(([value, notes]) => ({ value, notes }))
      .sort((a, b) => a.value.localeCompare(b.value)),
    kinds: KIND_ORDER.filter((k) => kinds.has(k)).map((value) => ({
      value,
      notes: kinds.get(value) ?? 0,
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
  const filtered = filterSources(sources, controls);
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
): AdmittedGroup[] {
  const axes = axesOf(sources);
  const folders = live(
    controls.folders,
    axes.folders.map((v) => v.value),
  );
  const kinds = live(
    controls.kinds,
    axes.kinds.map((v) => v.value),
  );
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
