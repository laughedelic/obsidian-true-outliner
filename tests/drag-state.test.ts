import { describe, expect, it } from 'vitest';
import { EditorState } from '@codemirror/state';
import {
  dragLiftField,
  dragPreviewExtension,
  dragPreviewField,
  sameDestination,
  setDragLift,
  setDragPreview,
  type DragPreview,
} from '../src/plugin/drag-state';

const DOC = '# Top\n\n- one\n  - nested\n- two\n';

function fresh(): EditorState {
  return EditorState.create({ doc: DOC, extensions: [dragPreviewField] });
}

const preview = (over: Partial<DragPreview['destination']> = {}, seamLine = 4): DragPreview => ({
  seamLine,
  destination: { parentId: 'root', index: 1, depth: 0, firstLine: '- one', mark: { kind: 'list-item' }, ...over },
  parentLine: null,
  lineOffset: 0,
  runSize: 1,
});

describe('the drag preview field', () => {
  it('holds what an effect sets, and gives it back', () => {
    const state = fresh().update({ effects: setDragPreview.of(preview()) }).state;
    expect(state.field(dragPreviewField)).toEqual(preview());
  });

  it('clears on a document change rather than mapping', () => {
    // A seam is a line number and a destination is a node id, and a change
    // moves both. The gesture cancels outright on a write under the press, so
    // there is nothing left for a mapped preview to describe.
    const held = fresh().update({ effects: setDragPreview.of(preview()) }).state;
    const written = held.update({ changes: { from: 0, insert: 'x' } }).state;
    expect(written.field(dragPreviewField)).toBeNull();
  });

  it('survives a selection-only transaction', () => {
    // The pick-up collapses the selection to a cover, which must not take the
    // preview with it.
    const held = fresh().update({ effects: setDragPreview.of(preview()) }).state;
    const moved = held.update({ selection: { anchor: 3 } }).state;
    expect(moved.field(dragPreviewField)).toEqual(preview());
  });

  it('is cleared by an effect carrying null', () => {
    const held = fresh().update({ effects: setDragPreview.of(preview()) }).state;
    expect(held.update({ effects: setDragPreview.of(null) }).state.field(dragPreviewField)).toBeNull();
  });
});

describe('the lift', () => {
  const lifted = (): EditorState =>
    EditorState.create({ doc: DOC, extensions: [dragPreviewExtension()] }).update({
      effects: setDragLift.of(true),
    }).state;

  it('is raised and lowered by its effect, and starts lowered', () => {
    expect(EditorState.create({ doc: DOC, extensions: [dragPreviewExtension()] }).field(dragLiftField)).toBe(false);
    const up = lifted();
    expect(up.field(dragLiftField)).toBe(true);
    expect(up.update({ effects: setDragLift.of(false) }).state.field(dragLiftField)).toBe(false);
  });

  it('outlives a preview coming and going', () => {
    // The lift is the drag, the preview is the destination: a pointer over a
    // dead band clears the preview and the rows stay lifted.
    const held = lifted().update({ effects: setDragPreview.of(preview()) }).state;
    const dead = held.update({ effects: setDragPreview.of(null) }).state;
    expect(dead.field(dragPreviewField)).toBeNull();
    expect(dead.field(dragLiftField)).toBe(true);
  });

  it('survives a selection change and not a document change', () => {
    const up = lifted();
    expect(up.update({ selection: { anchor: 3 } }).state.field(dragLiftField)).toBe(true);
    expect(up.update({ changes: { from: 0, insert: 'x' } }).state.field(dragLiftField)).toBe(false);
  });
});

describe('the guard the tracker asks before dispatching', () => {
  it('reads a freshly built preview of the same destination as unchanged', () => {
    // Each pointer move resolves a new object, so identity would report a
    // change on every sample and the guard would do nothing at all.
    expect(sameDestination(preview(), preview())).toBe(true);
    const [one, two] = [preview(), preview()];
    expect(one).not.toBe(two);
  });

  it('sees a different column, index, parent or seam', () => {
    expect(sameDestination(preview(), preview({ depth: 1 }))).toBe(false);
    expect(sameDestination(preview(), preview({ index: 2 }))).toBe(false);
    expect(sameDestination(preview(), preview({ parentId: 7 }))).toBe(false);
    expect(sameDestination(preview(), preview({}, 5))).toBe(false);
  });

  it('does not read the mark the run will have', () => {
    // `firstLine` is what the preview DRAWS, derived from the same resolution;
    // two destinations that differ only there are the same destination, and
    // re-dispatching on it would be a rebuild for a redraw of the same glyph.
    expect(sameDestination(preview(), preview({ firstLine: '  - one' }))).toBe(true);
  });

  it('handles either side being absent', () => {
    expect(sameDestination(null, null)).toBe(true);
    expect(sameDestination(preview(), null)).toBe(false);
    expect(sameDestination(null, preview())).toBe(false);
  });
});

describe('how often a pointer run dispatches', () => {
  it('dispatches once per destination, not once per sample', () => {
    // The counter the guard exists for: a pointer emits moves far faster than
    // the destination changes under it, and a transaction per sample is a
    // rebuild per sample.
    const samples: DragPreview[] = [
      preview(),
      preview(),
      preview(),
      preview({ depth: 1 }),
      preview({ depth: 1 }),
      preview({ depth: 2 }),
      preview({ depth: 2 }),
      preview({ depth: 2 }),
    ];
    let current: DragPreview | null = null;
    let dispatched = 0;
    for (const next of samples) {
      if (sameDestination(current, next)) continue;
      current = next;
      dispatched++;
    }
    expect(dispatched).toBe(3);
    // Negative control: dispatching per move instead is one per sample.
    expect(samples.length).toBe(8);
  });

  it('dispatches again when the destination comes back', () => {
    // Not a "seen it before" cache: a pointer that leaves a column and returns
    // has changed the answer twice, and the preview has to follow both ways.
    const samples: DragPreview[] = [preview(), preview({ depth: 1 }), preview()];
    let current: DragPreview | null = null;
    let dispatched = 0;
    for (const next of samples) {
      if (sameDestination(current, next)) continue;
      current = next;
      dispatched++;
    }
    expect(dispatched).toBe(3);
  });
});
