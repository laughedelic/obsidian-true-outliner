import { describe, expect, it } from 'vitest';
import {
  applyControls,
  axesOf,
  NO_FILTER,
  type ControlsState,
  type SourceRefs,
} from '../src/plugin/footer-filter';
import type { BacklinkReference, ReferenceKind } from '../src/plugin/backlink-index';

const ref = (kind: ReferenceKind, original = '[[Target]]'): BacklinkReference => ({
  kind,
  sourcePath: 'unused',
  line: 0,
  original,
});

/** A referencing note: its path, its mtime, and one reference per kind given. */
const src = (path: string, mtime: number, ...kinds: ReferenceKind[]): SourceRefs => ({
  path,
  mtime,
  refs: kinds.map((k) => ref(k)),
});

const controls = (over: Partial<ControlsState> = {}): ControlsState => ({ ...NO_FILTER, ...over });

const paths = (r: { groups: readonly { path: string }[] }): string[] => r.groups.map((g) => g.path);

// A fixture with two folders, three kinds, and distinct mtimes.
const VAULT: SourceRefs[] = [
  src('Daily/2026-01-03.md', 300, 'note', 'note'),
  src('Daily/2026-01-01.md', 100, 'anchor'),
  src('Notes/Brief.md', 200, 'note', 'embed', 'embed'),
];

describe('axes', () => {
  it('offers only the values actually present, with contributing note counts', () => {
    const axes = axesOf(VAULT);
    expect(axes.folders).toEqual([
      { value: 'Daily', notes: 2 },
      { value: 'Notes', notes: 1 },
    ]);
    // No `property` anywhere in the fixture, so it is not offered at all.
    expect(axes.kinds).toEqual([
      { value: 'note', notes: 2 },
      { value: 'anchor', notes: 1 },
      { value: 'embed', notes: 1 },
    ]);
  });

  it('offers one kind when every reference is of that kind', () => {
    const axes = axesOf([src('A.md', 1, 'note'), src('B.md', 2, 'note', 'note')]);
    expect(axes.kinds).toEqual([{ value: 'note', notes: 2 }]);
  });

  it('names the vault root as the empty folder', () => {
    expect(axesOf([src('Root.md', 1, 'note')]).folders).toEqual([{ value: '', notes: 1 }]);
  });
});

describe('focus-on semantics', () => {
  it('admits everything when no axis has a selection', () => {
    const result = applyControls(VAULT, controls());
    expect(result.totals).toEqual({ references: 6, notes: 3 });
    expect(result.shortfall).toEqual({ references: 0, notes: 0 });
  });

  it('narrows to a selected folder', () => {
    const result = applyControls(VAULT, controls({ folders: new Set(['Notes']) }));
    expect(paths(result)).toEqual(['Notes/Brief.md']);
    expect(result.totals).toEqual({ references: 3, notes: 1 });
  });

  it('counts only references of a selected kind, and drops a group left with none', () => {
    const result = applyControls(VAULT, controls({ kinds: new Set<ReferenceKind>(['embed']) }));
    expect(paths(result)).toEqual(['Notes/Brief.md']);
    expect(result.groups[0]?.count).toBe(2);
  });

  it('restores an axis when its last value is deselected', () => {
    const selected = applyControls(VAULT, controls({ folders: new Set(['Notes']) }));
    const cleared = applyControls(VAULT, controls({ folders: new Set() }));
    expect(paths(selected)).toHaveLength(1);
    expect(paths(cleared)).toHaveLength(3);
  });

  it('combines the axes conjunctively', () => {
    const result = applyControls(
      VAULT,
      controls({ folders: new Set(['Daily']), kinds: new Set<ReferenceKind>(['note']) }),
    );
    expect(paths(result)).toEqual(['Daily/2026-01-03.md']);
    expect(result.groups[0]?.count).toBe(2);
  });

  it('drops a selection whose value no longer exists rather than emptying the footer', () => {
    const result = applyControls(VAULT, controls({ folders: new Set(['Archive']) }));
    expect(paths(result)).toHaveLength(3);
  });
});

describe('search', () => {
  it('matches source note names, case-insensitively', () => {
    expect(paths(applyControls(VAULT, controls({ search: 'brief' })))).toEqual(['Notes/Brief.md']);
  });

  it('does not reach reference content', () => {
    const withText: SourceRefs[] = [
      { path: 'A.md', mtime: 1, refs: [ref('note', '[[Target|quarterly review]]')] },
    ];
    expect(paths(applyControls(withText, controls({ search: 'quarterly' })))).toEqual([]);
    expect(paths(applyControls(withText, controls({ search: 'A' })))).toEqual(['A.md']);
  });

  it('does not match the folder part of a path', () => {
    expect(paths(applyControls(VAULT, controls({ search: 'Daily' })))).toEqual([]);
  });

  it('combines with an axis', () => {
    const result = applyControls(
      VAULT,
      controls({ search: '2026-01', kinds: new Set<ReferenceKind>(['anchor']) }),
    );
    expect(paths(result)).toEqual(['Daily/2026-01-01.md']);
  });

  it('admits everything when the term is blank', () => {
    expect(paths(applyControls(VAULT, controls({ search: '   ' })))).toHaveLength(3);
  });
});

describe('sort', () => {
  it('defaults to most recently modified first', () => {
    expect(paths(applyControls(VAULT, controls()))).toEqual([
      'Daily/2026-01-03.md',
      'Notes/Brief.md',
      'Daily/2026-01-01.md',
    ]);
  });

  it('reverses for oldest first', () => {
    expect(paths(applyControls(VAULT, controls({ sort: 'oldest' })))).toEqual([
      'Daily/2026-01-01.md',
      'Notes/Brief.md',
      'Daily/2026-01-03.md',
    ]);
  });

  it('orders by note name, not by path', () => {
    expect(paths(applyControls(VAULT, controls({ sort: 'name' })))).toEqual([
      'Daily/2026-01-01.md',
      'Daily/2026-01-03.md',
      'Notes/Brief.md',
    ]);
  });

  it('orders by reference count, most first', () => {
    expect(paths(applyControls(VAULT, controls({ sort: 'references' })))).toEqual([
      'Notes/Brief.md',
      'Daily/2026-01-03.md',
      'Daily/2026-01-01.md',
    ]);
  });

  it('uses path only as the tie-break', () => {
    const tied = [src('Zed.md', 500, 'note'), src('Abe.md', 500, 'note')];
    expect(paths(applyControls(tied, controls()))).toEqual(['Abe.md', 'Zed.md']);
  });

  it('admits the same groups with the same counts whatever the order', () => {
    const shape = (s: ControlsState['sort']): [string, number][] =>
      applyControls(VAULT, controls({ sort: s }))
        .groups.map((g): [string, number] => [g.path, g.count])
        .sort();
    expect(shape('oldest')).toEqual(shape('recent'));
    expect(shape('name')).toEqual(shape('recent'));
    expect(shape('references')).toEqual(shape('recent'));
  });
});

describe('the overall cap', () => {
  it('admits whole groups and stops before the one that would cross', () => {
    const result = applyControls(VAULT, controls({ cap: 4 }));
    // 2 then 3 would be 5; the second group is refused rather than cut.
    expect(paths(result)).toEqual(['Daily/2026-01-03.md']);
    expect(result.shortfall).toEqual({ references: 4, notes: 2 });
  });

  it('admits nothing after the group it stopped at', () => {
    // Under `oldest` the 1-reference group leads, so a cap of 2 could fit the
    // trailing group but must not reach past the one it refused.
    const result = applyControls(VAULT, controls({ sort: 'oldest', cap: 2 }));
    expect(paths(result)).toEqual(['Daily/2026-01-01.md']);
  });

  it('admits a single group that exceeds the cap on its own', () => {
    const result = applyControls([src('Hub.md', 1, 'note', 'note', 'note')], controls({ cap: 1 }));
    expect(paths(result)).toEqual(['Hub.md']);
    expect(result.shortfall).toEqual({ references: 0, notes: 0 });
  });

  it('reports true totals, not the rendered subset', () => {
    const result = applyControls(VAULT, controls({ cap: 1 }));
    expect(result.totals).toEqual({ references: 6, notes: 3 });
  });

  it('reports totals for the FILTERED set when a filter is active', () => {
    const result = applyControls(VAULT, controls({ folders: new Set(['Daily']), cap: 1 }));
    expect(result.totals).toEqual({ references: 3, notes: 2 });
  });

  it('frees budget when a filter narrows the set', () => {
    const capped = applyControls(VAULT, controls({ cap: 3 }));
    const narrowed = applyControls(VAULT, controls({ cap: 3, folders: new Set(['Notes']) }));
    expect(capped.shortfall.references).toBeGreaterThan(0);
    // The whole of the narrowed set now fits inside the same cap.
    expect(narrowed.shortfall).toEqual({ references: 0, notes: 0 });
  });

  it('admits everything when there is no limit', () => {
    const result = applyControls(VAULT, controls());
    expect(paths(result)).toHaveLength(3);
    expect(result.shortfall).toEqual({ references: 0, notes: 0 });
  });
});

describe('the empty-controls case', () => {
  it('reproduces the unfiltered footer: every group, recency order, no shortfall', () => {
    const result = applyControls(VAULT, NO_FILTER);
    const byRecency = [...VAULT].sort((a, b) => b.mtime - a.mtime).map((s) => s.path);
    expect(paths(result)).toEqual(byRecency);
    expect(result.groups.map((g) => g.count)).toEqual([2, 3, 1]);
    expect(result.shortfall).toEqual({ references: 0, notes: 0 });
  });

  it('is dormant for a note with no references', () => {
    const result = applyControls([], NO_FILTER);
    expect(result.groups).toEqual([]);
    expect(result.totals).toEqual({ references: 0, notes: 0 });
  });
});
