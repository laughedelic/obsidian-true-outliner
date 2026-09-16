import { describe, expect, it } from 'vitest';
import {
  admitByAxes,
  admitReferences,
  applyControls,
  axesOf,
  NO_FILTER,
  orderAndCap,
  type ControlsState,
  type SourceRefs,
} from '../src/plugin/footer-filter';
import type {
  BacklinkReference,
  PlacedReference,
  PlacedSource,
  ReferenceKind,
} from '../src/plugin/backlink-index';
import type { OutlineNode } from '../src/model';
import { parse } from '../src/parse';
import {
  DEFAULT_GROUP_HEIGHT,
  GROUP_HEIGHT_CSS,
  OVERALL_CAP_REFERENCES,
} from '../src/plugin/settings/footer';

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
  tags: [],
});

/** The same, carrying tags — the axis where one note answers to several values. */
const tagged = (
  path: string,
  mtime: number,
  tags: string[],
  ...kinds: ReferenceKind[]
): SourceRefs => ({ ...src(path, mtime, ...kinds), tags });

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

describe('axis counts answer "if I add this, what do I get"', () => {
  it('re-counts the other axis against a selected folder', () => {
    // `Daily` holds two notes: one of kind `note`, one of kind `anchor`. The
    // `embed` references all live under `Notes`, so within `Daily` there are
    // none — and the chip has to say so rather than keep the count it had.
    const axes = axesOf(VAULT, controls({ folders: new Set(['Daily']) }));
    expect(axes.kinds).toEqual([
      { value: 'note', notes: 1 },
      { value: 'anchor', notes: 1 },
      { value: 'embed', notes: 0 },
    ]);
  });

  it('keeps a zeroed value on offer rather than removing it', () => {
    const axes = axesOf(VAULT, controls({ folders: new Set(['Daily']) }));
    expect(axes.kinds.map((k) => k.value)).toEqual(['note', 'anchor', 'embed']);
  });

  it('does not count an axis against its own selection', () => {
    // Picking `embed` must not zero `note` and `anchor`, or no second kind
    // could ever be added to the selection.
    const axes = axesOf(VAULT, controls({ kinds: new Set<ReferenceKind>(['embed']) }));
    expect(axes.kinds.find((k) => k.value === 'note')?.notes).toBe(2);
    expect(axes.kinds.find((k) => k.value === 'anchor')?.notes).toBe(1);
  });

  it('re-counts folders against a selected kind', () => {
    const axes = axesOf(VAULT, controls({ kinds: new Set<ReferenceKind>(['embed']) }));
    expect(axes.folders).toEqual([
      { value: 'Daily', notes: 0 },
      { value: 'Notes', notes: 1 },
    ]);
  });

  it('re-counts both axes against the search term', () => {
    const axes = axesOf(VAULT, controls({ search: 'brief' }));
    expect(axes.folders).toEqual([
      { value: 'Daily', notes: 0 },
      { value: 'Notes', notes: 1 },
    ]);
    expect(axes.kinds.find((k) => k.value === 'anchor')?.notes).toBe(0);
  });

  it('is the unfiltered count when nothing is selected', () => {
    expect(axesOf(VAULT, NO_FILTER)).toEqual(axesOf(VAULT));
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

  // Every axis widens on a second selected value — a source is admitted
  // whenever its value is IN the selected set, so a second folder or a second
  // kind is exactly the same set-membership OR the tag axis uses (D9's own
  // "the only one" claim named this as tag-specific and was wrong to; review
  // caught it).
  it('a second folder widens too, the same rule the tag axis uses', () => {
    const one = applyControls(VAULT, controls({ folders: new Set(['Notes']) }));
    const two = applyControls(VAULT, controls({ folders: new Set(['Notes', 'Daily']) }));
    expect(paths(one)).toHaveLength(1);
    expect(paths(two)).toHaveLength(3);
  });

  it('a second kind widens too, for the same reason', () => {
    const one = applyControls(VAULT, controls({ kinds: new Set<ReferenceKind>(['anchor']) }));
    const two = applyControls(
      VAULT,
      controls({ kinds: new Set<ReferenceKind>(['anchor', 'note']) }),
    );
    expect(paths(one)).toEqual(['Daily/2026-01-01.md']);
    expect(paths(two).sort()).toEqual([
      'Daily/2026-01-01.md',
      'Daily/2026-01-03.md',
      'Notes/Brief.md',
    ]);
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

describe('the tag axis', () => {
  // Two folders, and tags that deliberately cut ACROSS them, so a tag result is
  // not reachable by a folder selection.
  const TAGGED: SourceRefs[] = [
    tagged('Daily/mon.md', 400, ['standup', 'review'], 'note'),
    tagged('Daily/tue.md', 300, ['standup'], 'anchor'),
    tagged('Notes/spec.md', 200, ['review'], 'note'),
    tagged('Notes/idle.md', 100, [], 'embed'),
  ];

  it('offers the tags actually present, with contributing note counts', () => {
    expect(axesOf(TAGGED).tags).toEqual([
      { value: 'review', notes: 2 },
      { value: 'standup', notes: 2 },
    ]);
  });

  it('offers nothing when no contributing note is tagged', () => {
    expect(axesOf(VAULT).tags).toEqual([]);
  });

  it('narrows to a selected tag', () => {
    const result = applyControls(TAGGED, controls({ tags: new Set(['review']) }));
    expect(paths(result).sort()).toEqual(['Daily/mon.md', 'Notes/spec.md']);
  });

  it('widens on a second tag, the same OR-within-an-axis rule every axis follows', () => {
    const one = applyControls(TAGGED, controls({ tags: new Set(['review']) }));
    const two = applyControls(TAGGED, controls({ tags: new Set(['review', 'standup']) }));
    // A note carrying EITHER is admitted. Folder and kind widen on a second
    // selected value too (see focus-on semantics, 'a second folder widens too', above) — what is
    // distinct about tags is not this, it is that a SINGLE note can satisfy
    // two tag values at once, which is why the check is `.some()` rather than
    // a single membership test (design D9).
    expect(paths(one)).toHaveLength(2);
    expect(paths(two).sort()).toEqual(['Daily/mon.md', 'Daily/tue.md', 'Notes/spec.md']);
  });

  it('still combines with the other axes conjunctively', () => {
    const result = applyControls(
      TAGGED,
      controls({ tags: new Set(['review', 'standup']), kinds: new Set<ReferenceKind>(['anchor']) }),
    );
    expect(paths(result)).toEqual(['Daily/tue.md']);
  });

  it('drops an untagged note whenever any tag is selected', () => {
    const result = applyControls(TAGGED, controls({ tags: new Set(['review', 'standup']) }));
    expect(paths(result)).not.toContain('Notes/idle.md');
  });

  it('counts a tag against the OTHER axes, its own excluded', () => {
    // Within `Notes`, `standup` has nothing — but `review` keeps its live count,
    // and both stay on offer.
    const axes = axesOf(TAGGED, controls({ folders: new Set(['Notes']) }));
    expect(axes.tags).toEqual([
      { value: 'review', notes: 1 },
      { value: 'standup', notes: 0 },
    ]);
  });

  it('does not count the tag axis against its own selection', () => {
    const axes = axesOf(TAGGED, controls({ tags: new Set(['review']) }));
    expect(axes.tags.find((t) => t.value === 'standup')?.notes).toBe(2);
  });

  it('re-counts the other axes against a selected tag', () => {
    const axes = axesOf(TAGGED, controls({ tags: new Set(['standup']) }));
    expect(axes.folders).toEqual([
      { value: 'Daily', notes: 2 },
      { value: 'Notes', notes: 0 },
    ]);
  });

  it('drops a selected tag that stops existing', () => {
    const result = applyControls(TAGGED, controls({ tags: new Set(['gone']) }));
    expect(paths(result)).toHaveLength(4);
  });
});

describe('search', () => {
  it('matches source note names, case-insensitively', () => {
    expect(paths(applyControls(VAULT, controls({ search: 'brief' })))).toEqual(['Notes/Brief.md']);
  });

  it('does not reach reference content', () => {
    const withText: SourceRefs[] = [
      { path: 'A.md', mtime: 1, refs: [ref('note', '[[Target|quarterly review]]')], tags: [] },
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

  it('names the size of the group a fixed tranche might still be too small for', () => {
    // "Load more" raises the cap by a fixed tranche, which can be smaller
    // than the very group it means to reveal — this is what lets the
    // renderer raise the cap by ENOUGH instead of by one tranche regardless.
    const result = applyControls(VAULT, controls({ cap: 4 }));
    expect(result.nextOmittedReferences).toBe(3);
  });

  it('reports no next omission once nothing is held back', () => {
    const result = applyControls(VAULT, controls());
    expect(result.nextOmittedReferences).toBeNull();
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

describe('the cap settings', () => {
  it('gives every overall-cap option a reference count', () => {
    expect(Object.values(OVERALL_CAP_REFERENCES).every((n) => n > 0)).toBe(true);
    expect(OVERALL_CAP_REFERENCES.none).toBe(Number.POSITIVE_INFINITY);
  });

  it('gives every group-height option a value the stylesheet accepts', () => {
    for (const value of Object.values(GROUP_HEIGHT_CSS)) {
      expect(value).toMatch(/^(?:\d+(?:\.\d+)?rem|none)$/);
    }
  });

  it('leaves the shipped group height as the default', () => {
    expect(GROUP_HEIGHT_CSS[DEFAULT_GROUP_HEIGHT]).toBe('16rem');
  });

  it('caps nothing at the no-limit setting', () => {
    const result = applyControls(VAULT, controls({ cap: OVERALL_CAP_REFERENCES.none }));
    expect(result.shortfall).toEqual({ references: 0, notes: 0 });
  });
});

/**
 * A placed source, built from real markdown so the term is answered against a
 * real tree rather than a stub that could agree with the matcher by accident.
 */
function placedSource(path: string, markdown: string, refs: BacklinkReference[]): PlacedSource {
  const doc = parse(markdown);
  const nodeAt = (line: number): OutlineNode | undefined => {
    let seen = 0;
    const walk = (nodes: readonly OutlineNode[]): OutlineNode | undefined => {
      for (const node of nodes) {
        const own = node.lines.length;
        if (line >= seen && line < seen + own) return node;
        seen += own + node.trailingGap.length;
        const below = walk(node.children);
        if (below) return below;
      }
      return undefined;
    };
    return walk(doc.children);
  };

  const placed = new Map<number, PlacedReference>();
  const matched = new Set<number>();
  const references = refs.map((r) => {
    if (r.line === undefined) return { ref: r };
    const node = nodeAt(r.line);
    if (!node) return { ref: r };
    matched.add(node.id);
    if (!placed.has(node.id)) {
      placed.set(node.id, { kind: r.kind, text: r.original, kinds: new Set([r.kind]) });
    }
    return { ref: r, nodeId: node.id };
  });

  return {
    path,
    doc,
    matches: (node: OutlineNode) => matched.has(node.id),
    refs: placed,
    properties: refs.filter((r) => r.kind === 'property'),
    references,
  };
}

const SOURCE_NOTE = `# Rollout log

- planning the migration mentions [[Target]]
  - a child row says persimmon
    - a folded descendant says chrysalis
- an unrelated bullet mentions [[Target]] too
`;

/** Two line-bearing references in different nodes, plus one property. */
function rollout(): PlacedSource {
  return placedSource('Notes/Rollout log.md', SOURCE_NOTE, [
    { kind: 'note', sourcePath: 'Notes/Rollout log.md', line: 2, original: '[[Target]]' },
    { kind: 'embed', sourcePath: 'Notes/Rollout log.md', line: 5, original: '[[Target]]' },
    {
      kind: 'property',
      sourcePath: 'Notes/Rollout log.md',
      property: 'related',
      original: '[[Target]] quince',
    },
  ]);
}

describe('admitting references within a placed group', () => {
  it('admits everything when no kind and no term is set', () => {
    const admitted = admitReferences(rollout(), controls());
    expect(admitted.count).toBe(3);
    expect(admitted.nodes.size).toBe(2);
    expect(admitted.properties).toHaveLength(1);
  });

  it('narrows by kind alone, as fillGroup used to by hand', () => {
    const admitted = admitReferences(rollout(), controls({ kinds: new Set(['embed']) }));
    expect(admitted.count).toBe(1);
    expect(admitted.nodes.size).toBe(1);
    expect(admitted.properties).toHaveLength(0);
  });

  it('narrows by term alone, against the content the footer shows', () => {
    const admitted = admitReferences(rollout(), controls({ search: 'migration' }));
    expect(admitted.count).toBe(1);
    expect(admitted.nodes.size).toBe(1);
  });

  it('admits a reference whose match is in a child the footer renders', () => {
    expect(admitReferences(rollout(), controls({ search: 'persimmon' })).count).toBe(1);
  });

  it('does not admit a reference whose only match is folded away', () => {
    expect(admitReferences(rollout(), controls({ search: 'chrysalis' })).count).toBe(0);
  });

  it('admits every reference in the group when the note NAME matches', () => {
    const admitted = admitReferences(rollout(), controls({ search: 'rollout' }));
    expect(admitted.count).toBe(3);
  });

  it('combines kind and term conjunctively', () => {
    const both = controls({ kinds: new Set<ReferenceKind>(['note']), search: 'migration' });
    expect(admitReferences(rollout(), both).count).toBe(1);
    const mismatched = controls({ kinds: new Set<ReferenceKind>(['embed']), search: 'migration' });
    expect(admitReferences(rollout(), mismatched).count).toBe(0);
  });

  it('answers a property reference on its own text', () => {
    const admitted = admitReferences(rollout(), controls({ search: 'quince' }));
    expect(admitted.count).toBe(1);
    expect(admitted.properties).toHaveLength(1);
    expect(admitted.nodes.size).toBe(0);
  });

  it('counts references, not the nodes holding them', () => {
    const twoInOneNode = placedSource('Notes/Pair.md', '- one node, two links to [[Target]]\n', [
      { kind: 'note', sourcePath: 'Notes/Pair.md', line: 0, original: '[[Target]]' },
      { kind: 'note', sourcePath: 'Notes/Pair.md', line: 0, original: '[[Target]]' },
    ]);
    const admitted = admitReferences(twoInOneNode, controls({ search: 'two links' }));
    expect(admitted.count).toBe(2);
    expect(admitted.nodes.size).toBe(1);
  });
});

/**
 * The term-active pipeline, run end to end over its pure pieces: the axes admit
 * from summaries, every admitted group is placed, the term decides within each,
 * and only then does the sort and the cap run (design D1).
 *
 * Composed here exactly as `render` composes it, so the ORDER of the three
 * steps is what these tests are about — a pipeline that capped first would pass
 * every other assertion in this file.
 */
function termPipeline(
  sources: readonly SourceRefs[],
  placedByPath: Map<string, PlacedSource>,
  state: ControlsState,
): ReturnType<typeof orderAndCap> {
  const counted = admitByAxes(sources, state).map((group) => {
    const placed = placedByPath.get(group.path);
    return { ...group, count: placed ? admitReferences(placed, state).count : 0 };
  });
  return orderAndCap(counted, state);
}

const THREE_SOURCES: SourceRefs[] = [
  src('Notes/Alpha.md', 300, 'note', 'note'),
  src('Notes/Beta.md', 200, 'note'),
  src('Notes/Gamma.md', 100, 'note'),
];

function threePlaced(): Map<string, PlacedSource> {
  const one = (path: string, body: string, lines: number[]): [string, PlacedSource] => [
    path,
    placedSource(
      path,
      body,
      lines.map((line) => ({ kind: 'note' as const, sourcePath: path, line, original: '[[Target]]' })),
    ),
  ];
  return new Map([
    // Both references in ONE node, so the group's count is 2 where a count of
    // nodes would read 1 — the distinction `admitReferences` keeps.
    one('Notes/Alpha.md', '- alpha body mentions zebra [[Target]] and [[Target]]\n', [0, 0]),
    one('Notes/Beta.md', '- beta body, nothing else [[Target]]\n', [0]),
    one('Notes/Gamma.md', '- gamma body mentions zebra [[Target]]\n', [0]),
  ]);
}

describe('the term-active pipeline', () => {
  const placed = threePlaced();

  it('counts only the references the term admits', () => {
    const result = termPipeline(THREE_SOURCES, placed, controls({ search: 'zebra' }));
    // Two in Alpha, one in Gamma. Beta holds one that the term does not admit.
    expect(result.totals).toEqual({ references: 3, notes: 2 });
  });

  it('drops a group with no admitted reference', () => {
    const result = termPipeline(THREE_SOURCES, placed, controls({ search: 'zebra' }));
    expect(paths(result)).toEqual(['Notes/Alpha.md', 'Notes/Gamma.md']);
  });

  it('applies the cap to what the term admitted, not the other way round', () => {
    // A cap of 2 stops the ordinary pass at Alpha, so Gamma — last by mtime —
    // is never read. With a term only Gamma answers, it is what the footer is
    // for, and the cap has room for it precisely because the term ran first.
    const state = controls({ search: 'gamma body', cap: 2 });
    expect(paths(termPipeline(THREE_SOURCES, placed, state))).toEqual(['Notes/Gamma.md']);

    // The same cap, with no term: Gamma sits beyond it and is not shown.
    expect(paths(applyControls(THREE_SOURCES, controls({ cap: 2 })))).toEqual(['Notes/Alpha.md']);
  });

  it('leaves the ordinary pass untouched when the term is empty', () => {
    const state = controls({ cap: 10 });
    expect(termPipeline(THREE_SOURCES, placed, state)).toEqual(applyControls(THREE_SOURCES, state));
  });
});
