import { describe, expect, it } from 'vitest';
import { parse } from '../src/parse';
import { walkNodes } from '../src/model';
import { escalateRange } from '../src/escalate';
import { planKey, type GrammarKey, type TxPlan } from '../src/plugin/grammar';

/** Apply a plan's changes (line/ch semantics) to text; return new text + cursor offset. */
function applyPlan(text: string, plan: TxPlan): { text: string; cursor: number } {
  const lines = text === '' ? [''] : text.split('\n');
  const offsets: number[] = [];
  let acc = 0;
  for (const line of lines) {
    offsets.push(acc);
    acc += line.length + 1;
  }
  const toOffset = (pos: { line: number; ch: number }): number =>
    (offsets[pos.line] ?? 0) + pos.ch;
  let out = text;
  for (const change of [...plan.changes].sort((a, b) => toOffset(b.from) - toOffset(a.from))) {
    out = out.slice(0, toOffset(change.from)) + change.text + out.slice(toOffset(change.to));
  }
  return { text: out, cursor: plan.selection };
}

function plan(text: string, cursor: { line: number; ch: number }, key: GrammarKey) {
  return planKey(text, cursor, key);
}

describe('grammar planner: structural keys', () => {
  it('Tab plans the indent op, preserving the user’s column', () => {
    const outcome = plan('First.\n\nSecond.\n', { line: 2, ch: 3 }, 'indent');
    expect(outcome && 'plan' in outcome).toBe(true);
    if (outcome && 'plan' in outcome) {
      const { text, cursor } = applyPlan('First.\n\nSecond.\n', outcome.plan);
      expect(text).toBe('First.\n\n- Second.\n');
      // Cursor preserves the user's column within "Second." (3 chars in)
      // rather than resetting to the node's content start.
      expect(text.slice(cursor - 3, cursor)).toBe('Sec');
      expect(outcome.plan.userEvent).toBe('input.structure.indent');
    }
  });

  it('Tab at a line’s very start still preserves the column (assoc boundary case)', () => {
    // Regression case: the cursor sits EXACTLY where the new marker gets
    // inserted (prefix=0). CM6's own default live-mapping assoc (-1) would
    // leave the cursor before the whole inserted marker; `mapCursorForward`
    // (assoc=1, matching history's own redo convention) must land it right
    // before "Second." instead, matching indent's semantic content-start
    // convention and staying consistent with what a later redo computes.
    const outcome = plan('First.\n\nSecond.\n', { line: 2, ch: 0 }, 'indent');
    expect(outcome && 'plan' in outcome).toBe(true);
    if (outcome && 'plan' in outcome) {
      const { text, cursor } = applyPlan('First.\n\nSecond.\n', outcome.plan);
      expect(text).toBe('First.\n\n- Second.\n');
      expect(text.slice(cursor, cursor + 7)).toBe('Second.');
    }
  });

  it('Shift+Tab plans the outdent op, preserving the user’s column', () => {
    const outcome = plan('- parent\n\t- child\n', { line: 1, ch: 7 }, 'outdent');
    expect(outcome && 'plan' in outcome).toBe(true);
    if (outcome && 'plan' in outcome) {
      const { text, cursor } = applyPlan('- parent\n\t- child\n', outcome.plan);
      expect(text).toBe('- parent\n- child\n');
      // "\t- child": content starts at ch 3, 4 chars in ("chil|d").
      expect(text.slice(cursor - 4, cursor)).toBe('chil');
      expect(outcome.plan.userEvent).toBe('input.structure.outdent');
    }
  });

  /**
   * The mapped position is the editor's main selection HEAD, which is a caret
   * only when the selection is empty. With a block selection the head is the
   * cover's end, and a subtree cover ends on the trailing gap line it owns —
   * so mapping it forward yielded a caret on a gap line, which
   * `content-space-caret` forbids. Reported from a real vault after the
   * column-preserving mapping landed.
   */
  it('Tab from a block cover’s head falls back to the op’s own cursor, not a gap line', () => {
    const text = 'First.\n\nSecond.\n';
    // Line 3 is the trailing gap "Second."'s subtree cover includes.
    const outcome = plan(text, { line: 3, ch: 0 }, 'indent');
    expect(outcome && 'plan' in outcome).toBe(true);
    if (outcome && 'plan' in outcome) {
      const { text: after, cursor } = applyPlan(text, outcome.plan);
      expect(after).toBe('First.\n\n- Second.\n');
      // Content start of the new list item — the op's own choice — and NOT
      // offset 18, the mapped gap-line position the unguarded mapping gave.
      expect(cursor).toBe('First.\n\n- '.length);
      expect(after.slice(cursor)).toBe('Second.\n');
    }
  });

  it('Tab with nothing above yields a notice, not a plan', () => {
    const outcome = plan('Only.\n', { line: 0, ch: 2 }, 'indent');
    expect(outcome && 'notice' in outcome && outcome.notice.length > 0).toBe(true);
  });

  it('Alt-arrows plan moves; cursor follows the node', () => {
    const outcome = plan('- a\n- b\n', { line: 1, ch: 2 }, 'move-up');
    if (!outcome || !('plan' in outcome)) throw new Error('expected plan');
    const { text, cursor } = applyPlan('- a\n- b\n', outcome.plan);
    expect(text).toBe('- b\n- a\n');
    expect(cursor).toBe(2); // content of "- b" on line 0
  });

  it('declines on preamble lines (stock behavior)', () => {
    expect(plan('---\nx: 1\n---\n\nText\n', { line: 1, ch: 0 }, 'indent')).toBeNull();
  });
});

describe('grammar planner: Enter (split)', () => {
  it('splits a list item mid-text', () => {
    const outcome = plan('- alpha beta\n', { line: 0, ch: 8 }, 'split');
    if (!outcome || !('plan' in outcome)) throw new Error('expected plan');
    const { text, cursor } = applyPlan('- alpha beta\n', outcome.plan);
    expect(text).toBe('- alpha \n- beta\n');
    expect(cursor).toBe('- alpha \n- '.length);
  });

  it('Enter at end of item creates an empty sibling', () => {
    const outcome = plan('- alpha\n', { line: 0, ch: 7 }, 'split');
    if (!outcome || !('plan' in outcome)) throw new Error('expected plan');
    const { text } = applyPlan('- alpha\n', outcome.plan);
    expect(text).toBe('- alpha\n- \n');
  });

  it('Enter mid-heading-text splits the title into the heading and a new paragraph child', () => {
    const outcome = plan('# Head\n\nBody.\n', { line: 0, ch: 3 }, 'split');
    if (!outcome || !('plan' in outcome)) throw new Error('expected plan');
    const { text, cursor } = applyPlan('# Head\n\nBody.\n', outcome.plan);
    expect(text).toBe('# H\n\nead\n\nBody.\n');
    expect(cursor).toBe('# H\n\nead'.length - 'ead'.length);
    const doc = parse(text);
    expect(doc.children[0]!.lines[0]).toBe('# H');
    expect(doc.children[0]!.children.map((n) => n.lines[0])).toEqual(['ead', 'Body.']);
  });

  it('Enter at the end of a heading widens the gap; typed text becomes a child paragraph', () => {
    const outcome = plan('# Head\n\nBody.\n', { line: 0, ch: 6 }, 'split');
    if (!outcome || !('plan' in outcome)) throw new Error('expected plan');
    const { text } = applyPlan('# Head\n\nBody.\n', outcome.plan);
    expect(text).toBe('# Head\n\n\n\nBody.\n');
  });

  it('Enter mid-title of a setext heading splits it, underline stays with the heading', () => {
    const outcome = plan('Hello world\n====\n', { line: 0, ch: 6 }, 'split');
    if (!outcome || !('plan' in outcome)) throw new Error('expected plan');
    const { text, cursor } = applyPlan('Hello world\n====\n', outcome.plan);
    // The blank line separates the heading from the new paragraph child.
    expect(text).toBe('Hello \n====\n\nworld\n');
    expect(cursor).toBe('Hello \n====\n\n'.length);
    const doc = parse(text);
    expect(doc.children[0]!.lines).toEqual(['Hello ', '====']);
    expect(doc.children[0]!.children.map((n) => n.lines[0])).toEqual(['world']);
  });

  it('Enter on a setext heading\'s underline line shows the rejection cue, changes nothing', () => {
    const outcome = plan('Head\n====\n', { line: 1, ch: 1 }, 'split');
    expect(outcome && 'notice' in outcome && outcome.notice.length > 0).toBe(true);
  });

  it('declines inside an atom (stock newline)', () => {
    expect(plan('```\ncode\n```\n', { line: 1, ch: 2 }, 'split')).toBeNull();
  });

  it('splitting a list item WITH children lands the remainder as its first child (amendment 2026-07-21)', () => {
    const src = '- parent text\n\t- child\n';
    const outcome = plan(src, { line: 0, ch: 9 }, 'split');
    if (!outcome || !('plan' in outcome)) throw new Error('expected plan');
    const { text, cursor } = applyPlan(src, outcome.plan);
    expect(text).toBe('- parent \n\t- text\n\t- child\n');
    expect(cursor).toBe('- parent \n\t- '.length);
  });
});

describe('grammar planner: Shift+Enter (continue)', () => {
  it('list item gains an aligned continuation line and stays ONE node', () => {
    const src = '- note text\n';
    const outcome = plan(src, { line: 0, ch: 6 }, 'continue');
    if (!outcome || !('plan' in outcome)) throw new Error('expected plan');
    const { text } = applyPlan(src, outcome.plan);
    // Exactly the content column: the whitespace at the break point goes with
    // neither line, so the continuation is aligned rather than one column past
    // it (`enter-and-shift-enter-grammar`; it read `   text` before).
    expect(text).toBe('- note\n  text\n');
    const nodes = [...walkNodes(parse(text))];
    expect(nodes.length).toBe(1);
    expect(nodes[0]!.lines).toEqual(['- note', '  text']);
  });

  it('paragraph continuation is a plain newline, same node', () => {
    const src = 'alpha beta\n';
    const outcome = plan(src, { line: 0, ch: 5 }, 'continue');
    if (!outcome || !('plan' in outcome)) throw new Error('expected plan');
    const { text } = applyPlan(src, outcome.plan);
    // The space after "alpha" is consumed rather than leading line 2.
    expect(text).toBe('alpha\nbeta\n');
    expect([...walkNodes(parse(text))].length).toBe(1); // still one paragraph node
  });

  it('declines inside atoms', () => {
    expect(plan('```\ncode\n```\n', { line: 1, ch: 0 }, 'continue')).toBeNull();
  });
});

describe('grammar planner: the empty-item ladder (Enter)', () => {
  /** Re-parse between presses, exactly as the editor does — ids are not stable
   * across ops, so each press must locate its target afresh. */
  function press(text: string, cursor: { line: number; ch: number }) {
    const outcome = plan(text, cursor, 'split');
    if (!outcome) throw new Error('declined');
    if ('notice' in outcome) return { notice: outcome.notice };
    const applied = applyPlan(text, outcome.plan);
    const before = applied.text.slice(0, applied.cursor);
    const line = before.split('\n').length - 1;
    return { text: applied.text, cursor: { line, ch: applied.cursor - (before.lastIndexOf('\n') + 1) } };
  }

  it('walks out one level per press, then leaves the list', () => {
    // The sequence is the behavior; three independent cases would not catch a
    // ladder that stops climbing.
    let state = press('- a\n\t- b\n\t\t- c\n', { line: 2, ch: 5 });
    expect(state.text).toBe('- a\n\t- b\n\t\t- c\n\t\t- \n');

    state = press(state.text!, state.cursor!);
    expect(state.text).toBe('- a\n\t- b\n\t\t- c\n\t- \n');

    state = press(state.text!, state.cursor!);
    expect(state.text).toBe('- a\n\t- b\n\t\t- c\n- \n');

    // Top level: nowhere left to outdent, so the marker goes and the caret is
    // left on a provisional position — prose from here on.
    state = press(state.text!, state.cursor!);
    expect(state.text).toBe('- a\n\t- b\n\t\t- c\n\n');
    expect([...walkNodes(parse(state.text!))].map((n) => n.lines[0])).toEqual([
      '- a',
      '\t- b',
      '\t\t- c',
    ]);
  });

  it('an empty TASK item takes the ladder rather than splitting', () => {
    const state = press('- a\n- [ ] \n', { line: 1, ch: 6 });
    expect(state.text).toBe('- a\n\n');
  });

  it('an empty item that can neither outdent nor unwrap shows the cue', () => {
    const state = press('- \n\t- kid\n', { line: 0, ch: 2 });
    expect(state.notice).toBeTruthy();
  });

  it('a non-empty item still splits', () => {
    const state = press('- alpha\n', { line: 0, ch: 7 });
    expect(state.text).toBe('- alpha\n- \n');
  });
});

describe('grammar planner: Shift+Enter on a heading drafts the next one', () => {
  it('creates a sibling at the same level', () => {
    const src = '## Foo\n';
    const outcome = plan(src, { line: 0, ch: 6 }, 'continue');
    if (!outcome || !('plan' in outcome)) throw new Error('expected plan');
    const { text, cursor } = applyPlan(src, outcome.plan);
    expect(text).toBe('## Foo\n## \n');
    expect(cursor).toBe('## Foo\n## '.length);
  });

  it('carries the remainder to the sibling', () => {
    const src = '## Foo bar\n';
    const outcome = plan(src, { line: 0, ch: 7 }, 'continue');
    if (!outcome || !('plan' in outcome)) throw new Error('expected plan');
    expect(applyPlan(src, outcome.plan).text).toBe('## Foo \n## bar\n');
  });

  it('a setext underline produces an ATX sibling too', () => {
    const src = 'Head\n====\n';
    const outcome = plan(src, { line: 1, ch: 2 }, 'continue');
    if (!outcome || !('plan' in outcome)) throw new Error('expected plan');
    expect(applyPlan(src, outcome.plan).text).toBe('Head\n====\n# \n');
  });
});

describe('grammar planner: atoms and thematic breaks', () => {
  it('a thematic break rejects both keys, so the stock newline never runs', () => {
    for (const key of ['split', 'continue'] as const) {
      const outcome = plan('---\n', { line: 0, ch: 2 }, key);
      expect(outcome && 'notice' in outcome && outcome.notice.length > 0).toBe(true);
    }
  });

  it('every other atom still declines, so stock supplies its own next line', () => {
    for (const src of ['> quoted\n', '```\ncode\n```\n', '| a | b |\n| - | - |\n']) {
      expect(plan(src, { line: 0, ch: 2 }, 'split')).toBeNull();
      expect(plan(src, { line: 0, ch: 2 }, 'continue')).toBeNull();
    }
  });
});

describe('grammar planner: provisional positions are distinguishable', () => {
  it('Enter and Shift+Enter at the same place produce different documents and different typed results', () => {
    // The property the whole design rests on (design D1). If a "minimal gap"
    // implementation ever lands, this is what fails: both keys leave the caret
    // at column 0 of the line below, and only the separation tells them apart.
    const src = 'thought\n\nnext\n';
    const at = { line: 0, ch: 7 };

    const enter = plan(src, at, 'split');
    const shiftEnter = plan(src, at, 'continue');
    if (!enter || !('plan' in enter)) throw new Error('expected plan');
    if (!shiftEnter || !('plan' in shiftEnter)) throw new Error('expected plan');

    const afterEnter = applyPlan(src, enter.plan);
    const afterShift = applyPlan(src, shiftEnter.plan);
    expect(afterEnter.text).not.toBe(afterShift.text);

    // Neither keypress creates a node: both are positions.
    const originalCount = [...walkNodes(parse(src))].length;
    expect([...walkNodes(parse(afterEnter.text))].length).toBe(originalCount);
    expect([...walkNodes(parse(afterShift.text))].length).toBe(originalCount);

    // Typing the same character yields a NEW node in one and a CONTINUATION
    // LINE in the other, decided by the parse alone.
    const typedAfterEnter =
      afterEnter.text.slice(0, afterEnter.cursor) + 'x' + afterEnter.text.slice(afterEnter.cursor);
    const typedAfterShift =
      afterShift.text.slice(0, afterShift.cursor) + 'x' + afterShift.text.slice(afterShift.cursor);

    const enterNodes = [...walkNodes(parse(typedAfterEnter))];
    expect(enterNodes.length).toBe(originalCount + 1);
    expect(enterNodes.map((n) => n.lines[0])).toContain('x');

    const shiftNodes = [...walkNodes(parse(typedAfterShift))];
    expect(shiftNodes.length).toBe(originalCount);
    expect(shiftNodes[0]!.lines).toEqual(['thought', 'x']);
  });

  it('a second press on a provisional position declines to stock, for both keys', () => {
    const src = 'thought\n\n\n\nnext\n';
    for (const key of ['split', 'continue'] as const) {
      expect(plan(src, { line: 2, ch: 0 }, key)).toBeNull();
    }
  });
});

describe('grammar planner: over a non-empty selection', () => {
  function planRange(
    text: string,
    from: { line: number; ch: number },
    to: { line: number; ch: number },
    key: GrammarKey,
  ) {
    return planKey(text, from, key, undefined, to);
  }

  it('a text range inside one node is replaced, then the node splits there', () => {
    const src = '- alpha beta gamma\n';
    // Select "beta " and press Enter.
    const outcome = planRange(src, { line: 0, ch: 8 }, { line: 0, ch: 13 }, 'split');
    if (!outcome || !('plan' in outcome)) throw new Error('expected plan');
    const { text, cursor } = applyPlan(src, outcome.plan);
    expect(text).toBe('- alpha \n- gamma\n');
    expect(cursor).toBe('- alpha \n- '.length);
  });

  it('a block selection of whole subtrees leaves one empty position where it was', () => {
    // The spec scenario: `- a` / [`- b` `- c`] / `- d` becomes `- a` / `- |` / `- d`.
    const src = '- a\n- b\n- c\n- d\n';
    const outcome = planRange(src, { line: 1, ch: 0 }, { line: 3, ch: 0 }, 'split');
    if (!outcome || !('plan' in outcome)) throw new Error('expected plan');
    const { text, cursor } = applyPlan(src, outcome.plan);
    expect(text).toBe('- a\n- \n- d\n');
    expect(cursor).toBe('- a\n- '.length);
  });

  it('an ordered run is renumbered across the removal', () => {
    // The raw removal does not renumber; the key's own operation does, because
    // it lands in the same sibling list.
    const src = '1. a\n2. b\n3. c\n';
    const outcome = planRange(src, { line: 1, ch: 0 }, { line: 2, ch: 0 }, 'split');
    if (!outcome || !('plan' in outcome)) throw new Error('expected plan');
    expect(applyPlan(src, outcome.plan).text).toBe('1. a\n2. \n3. c\n');
  });

  it('Shift+Enter over a selection replaces it and continues the node', () => {
    const src = '- alpha beta gamma\n';
    const outcome = planRange(src, { line: 0, ch: 8 }, { line: 0, ch: 13 }, 'continue');
    if (!outcome || !('plan' in outcome)) throw new Error('expected plan');
    const { text } = applyPlan(src, outcome.plan);
    expect(text).toBe('- alpha \n  gamma\n');
    expect([...walkNodes(parse(text))].length).toBe(1);
  });

  it('the whole gesture declines when the collapse point is out of jurisdiction', () => {
    // Stock behavior then replaces the selection itself, which is correct for a
    // position the grammar has no say over.
    const src = '```\ncode\nmore\n```\n';
    expect(planRange(src, { line: 1, ch: 0 }, { line: 2, ch: 0 }, 'split')).toBeNull();
  });

  it('the change set is minimal — untouched lines are not rewritten', () => {
    const src = '- keep\n- a\n- b\n- tail\n';
    const outcome = planRange(src, { line: 1, ch: 0 }, { line: 3, ch: 0 }, 'split');
    if (!outcome || !('plan' in outcome)) throw new Error('expected plan');
    // Neither the first nor the last line appears in any change's range.
    for (const change of outcome.plan.changes) {
      expect(change.from.line).toBeGreaterThan(0);
      expect(change.to.line).toBeLessThan(3);
    }
  });
});

describe('grammar planner: a whole-line selection takes its line boundary', () => {
  it('a cover ending at the last line’s END behaves like one ending at the next line’s start', () => {
    // The shape a real block selection produces (measured in e2e): the cover
    // ends at the end of "- c", not at the start of "- d". Removing only that
    // range leaves the newline behind as an empty line, the collapse point
    // lands on it, and the key would decline — which is how this reached the
    // browser as "the nodes vanish and no empty position appears".
    const src = '- a\n- b\n- c\n- d\n';
    const atLineEnd = planKey(src, { line: 1, ch: 0 }, 'split', undefined, { line: 2, ch: 3 });
    const atNextStart = planKey(src, { line: 1, ch: 0 }, 'split', undefined, { line: 3, ch: 0 });
    if (!atLineEnd || !('plan' in atLineEnd)) throw new Error('expected a plan');
    if (!atNextStart || !('plan' in atNextStart)) throw new Error('expected a plan');
    expect(applyPlan(src, atLineEnd.plan).text).toBe('- a\n- \n- d\n');
    expect(applyPlan(src, atLineEnd.plan)).toEqual(applyPlan(src, atNextStart.plan));
  });

  it('a partial-line selection keeps its own bounds', () => {
    // The extension is whole-line only: a character range must not swallow the
    // newline after it.
    const src = '- alpha beta\n- next\n';
    const outcome = planKey(src, { line: 0, ch: 8 }, 'split', undefined, { line: 0, ch: 12 });
    if (!outcome || !('plan' in outcome)) throw new Error('expected a plan');
    expect(applyPlan(src, outcome.plan).text).toBe('- alpha \n- \n- next\n');
  });
});

describe('grammar planner: a block selection is removed structurally', () => {
  /** The cover the editor itself produces for a line span. */
  function coverPlan(src: string, aLine: number, hLine: number) {
    const doc = parse(src);
    const cover = escalateRange(doc, {
      anchor: { line: aLine, ch: 0 },
      head: { line: hLine, ch: 0 },
    });
    return planKey(src, cover.anchor, 'split', undefined, cover.head);
  }

  it('the new node takes the KIND of what was selected, not of what follows', () => {
    // Reported from real use: selecting the last items of a list and pressing
    // Enter created a HEADING — the range's start pointed past the list, at the
    // heading after it. The deletion's own caret convention lands on the
    // preceding sibling instead, so the new node is a list item.
    const src = '1. a\n2. b\n3. c\n\n# H\n';
    const outcome = coverPlan(src, 1, 2);
    if (!outcome || !('plan' in outcome)) throw new Error('expected a plan');
    expect(applyPlan(src, outcome.plan).text).toBe('1. a\n2. \n# H\n');
  });

  it('selecting to the end of a document no longer declines', () => {
    // The range's start pointed at a gap line there, so the key fell through
    // to stock behavior and the nodes were simply deleted.
    const src = '1. a\n2. b\n3. c\n';
    const outcome = coverPlan(src, 1, 2);
    if (!outcome || !('plan' in outcome)) throw new Error('expected a plan');
    expect(applyPlan(src, outcome.plan).text).toBe('1. a\n2. ');
  });

  it('an ordered run renumbers around the replacement', () => {
    const src = '1. a\n2. b\n3. c\n4. d\n';
    const outcome = coverPlan(src, 1, 2);
    if (!outcome || !('plan' in outcome)) throw new Error('expected a plan');
    expect(applyPlan(src, outcome.plan).text).toBe('1. a\n2. \n3. d\n');
  });

  it('a bullet run is replaced by one empty bullet', () => {
    const src = '- a\n- b\n- c\n';
    const outcome = coverPlan(src, 0, 1);
    if (!outcome || !('plan' in outcome)) throw new Error('expected a plan');
    expect(applyPlan(src, outcome.plan).text).toBe('- \n- c\n');
  });
});

describe('grammar planner: splitting a line a Shift+Enter just made', () => {
  it('leaves no extra gap behind', () => {
    // Shift+Enter then Enter used to leave the upper half with a blank last
    // line — which is not a line of the node at all, it re-parses as a gap —
    // so the result differed from pressing Enter directly at the same point.
    const src = 'para text\n- child\n';
    const shifted = plan(src, { line: 0, ch: 4 }, 'continue');
    if (!shifted || !('plan' in shifted)) throw new Error('expected a plan');
    const afterShift = applyPlan(src, shifted.plan).text;
    expect(afterShift).toBe('para\ntext\n- child\n');

    const split = plan(afterShift, { line: 1, ch: 0 }, 'split');
    if (!split || !('plan' in split)) throw new Error('expected a plan');
    const viaTwoKeys = applyPlan(afterShift, split.plan).text;

    const direct = plan(src, { line: 0, ch: 4 }, 'split');
    if (!direct || !('plan' in direct)) throw new Error('expected a plan');
    expect(viaTwoKeys).toBe(applyPlan(src, direct.plan).text);
    expect(viaTwoKeys).toBe('para\n- text\n- child\n');
  });
});
