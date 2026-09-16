import { describe, expect, it } from 'vitest';
import { EditorState, type Extension } from '@codemirror/state';
import { outlineStateExtension } from '../src/plugin/outline-state';
import {
  filterQuerySet,
  filterCleared,
  outlineFilterStateExtension,
  unguardedFilterVisibleSpans as filterVisibleSpans,
  unguardedOutlineFilter as outlineFilter,
} from '../src/plugin/outline-filter-state';

/**
 * `- target` sits two levels down, so its path is what keeps `# Top` and
 * `## Mid` visible, and `- alpha` is a non-matching sibling with a child of its
 * own — the thing a filter must hide.
 */
const DOC = ['# Top', '', '## Mid', '', '- alpha', '  - one', '- target', '  - two', '', '## Other', '', '- three', ''].join('\n');

function extensions(): Extension {
  return [outlineStateExtension({ outlineByDefault: true }), outlineFilterStateExtension()];
}

function stateWith(doc: string, query?: string): EditorState {
  const base = EditorState.create({ doc, extensions: extensions() });
  return query === undefined ? base : base.update({ effects: filterQuerySet.of(query) }).state;
}

/** The text of every line the filter keeps, in document order. */
function visibleLines(state: EditorState): string[] | null {
  const spans = filterVisibleSpans(state);
  if (!spans) return null;
  const lines = state.doc.toString().split('\n');
  return spans.flatMap((s) => lines.slice(s.fromLine, s.toLine));
}

describe('outline filter state: what a query decides', () => {
  it('keeps a match and the path to it, and nothing else', () => {
    expect(visibleLines(stateWith(DOC, 'target'))).toEqual(['# Top', '## Mid', '- target']);
  });

  it("hides a match's children unless they match themselves", () => {
    // `  - two` is `- target`'s child and does not contain the query.
    expect(visibleLines(stateWith(DOC, 'target'))).not.toContain('  - two');
  });

  it('renders the note whole below the threshold', () => {
    expect(visibleLines(stateWith(DOC, 't'))).toBeNull();
    // Trimmed, because the matcher trims: a letter and a space is one character.
    expect(visibleLines(stateWith(DOC, 't '))).toBeNull();
  });

  it('clearing restores the whole note', () => {
    const filtered = stateWith(DOC, 'target');
    const cleared = filtered.update({ effects: filterCleared.of(null) }).state;
    expect(visibleLines(cleared)).toBeNull();
    expect(outlineFilter(cleared)).toBeNull();
  });

  it('a second query re-decides the set from the document as it then is', () => {
    const first = stateWith(DOC, 'target');
    const second = first.update({ effects: filterQuerySet.of('alpha') }).state;
    expect(visibleLines(second)).toEqual(['# Top', '## Mid', '- alpha']);
  });
});

describe('outline filter state: what editing does to a frozen match set', () => {
  it('an anchor survives an edit inside its own match', () => {
    const state = stateWith(DOC, 'target');
    const at = state.doc.toString().indexOf('- target') + '- target'.length;
    const edited = state.update({ changes: { from: at, insert: ' more' } }).state;
    expect(visibleLines(edited)).toEqual(['# Top', '## Mid', '- target more']);
  });

  it('editing the query out of a match keeps it visible', () => {
    // The whole point of freezing: the node the reader is editing does not
    // vanish from under the caret when its text stops matching.
    const state = stateWith(DOC, 'target');
    const from = state.doc.toString().indexOf('target');
    const edited = state.update({ changes: { from, to: from + 'target'.length, insert: 'gone' } })
      .state;
    expect(visibleLines(edited)).toEqual(['# Top', '## Mid', '- gone']);
  });

  it('typing the query into a hidden node does not reveal it', () => {
    const state = stateWith(DOC, 'target');
    const at = state.doc.toString().indexOf('- alpha') + '- alpha'.length;
    const edited = state.update({ changes: { from: at, insert: ' target' } }).state;
    expect(visibleLines(edited)).not.toContain('- alpha target');
  });

  it('an anchor deleted with its node is dropped', () => {
    const state = stateWith(DOC, 'target');
    const text = state.doc.toString();
    const from = text.indexOf('- target');
    const to = text.indexOf('  - two');
    const edited = state.update({ changes: { from, to, insert: '' } }).state;
    // Nothing matched is left, so the filter has nothing to show and the note
    // renders whole — an editor with no visible line takes no caret and no
    // keystroke can bring a match back to it.
    expect(visibleLines(edited)).toBeNull();
  });

  it('a moved match brings its new ancestors', () => {
    // The path is read from the current parse, not frozen: indenting the match
    // under `- alpha` makes `- alpha` part of what keeps it reachable.
    const state = stateWith(DOC, 'target');
    const from = state.doc.toString().indexOf('- target');
    const edited = state.update({ changes: { from, insert: '  ' } }).state;
    expect(visibleLines(edited)).toEqual(['# Top', '## Mid', '- alpha', '  - target']);
  });
});

describe('outline filter state: a query that matches nothing', () => {
  it('keeps the last set that matched, and reports the miss', () => {
    const matched = stateWith(DOC, 'target');
    const missed = matched.update({ effects: filterQuerySet.of('targetx') }).state;
    expect(visibleLines(missed)).toEqual(['# Top', '## Mid', '- target']);
    expect(outlineFilter(missed)).toMatchObject({ query: 'targetx', matched: false });
  });

  it('renders the note whole when nothing has matched yet', () => {
    const missed = stateWith(DOC, 'nosuchtext');
    expect(visibleLines(missed)).toBeNull();
    expect(outlineFilter(missed)?.matched).toBe(false);
  });

  it('removing the missing character returns the same matches', () => {
    const matched = stateWith(DOC, 'target');
    const missed = matched.update({ effects: filterQuerySet.of('targetx') }).state;
    const back = missed.update({ effects: filterQuerySet.of('target') }).state;
    expect(visibleLines(back)).toEqual(visibleLines(matched));
    expect(outlineFilter(back)?.matched).toBe(true);
  });

  it('counts what matched, for the panel to report', () => {
    expect(outlineFilter(stateWith(DOC, 'target'))?.anchors?.length).toBe(1);
  });

  it('matches a node OWN LINES verbatim, markers and indentation included', () => {
    // Three, not two: `- target` and `- three` are the obvious pair, and
    // `  - two` is the third, matched on the marker inside its own indentation.
    // `matchNodes` answers against `node.lines` joined, not against a rendered
    // preview, so a query can reach syntax Live Preview does not show. The
    // consequence for marking is design D6's, and the probe for it is task 1.1a.
    expect(outlineFilter(stateWith(DOC, '- t'))?.anchors?.length).toBe(3);
  });
});

describe('outline filter state: a node created beside a match', () => {
  it('a new sibling from a visible node holds no anchor of its own', () => {
    // The measurement behind design D2's added-anchor rule: mapping alone does
    // not make a created node visible, because it contains no anchor. What the
    // rule has to cover is recorded in docs/research/outline-filter-spike.md
    // and implemented once the gesture catalogue (task 1.2) says which
    // transactions produce one.
    const state = stateWith(DOC, 'target');
    const at = state.doc.toString().indexOf('- target') + '- target'.length;
    const edited = state.update({ changes: { from: at, insert: '\n- fresh' } }).state;
    expect(visibleLines(edited)).not.toContain('- fresh');
  });
});
