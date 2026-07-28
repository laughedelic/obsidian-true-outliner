import { describe, expect, it } from 'vitest';
import { parse } from '../src/parse';
import { walkNodes } from '../src/model';
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
    expect(text).toBe('Hello \n====\nworld\n');
    expect(cursor).toBe('Hello \n====\n'.length);
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
    expect(text).toBe('- note\n   text\n');
    const nodes = [...walkNodes(parse(text))];
    expect(nodes.length).toBe(1);
    expect(nodes[0]!.lines).toEqual(['- note', '   text']);
  });

  it('paragraph continuation is a plain newline, same node', () => {
    const src = 'alpha beta\n';
    const outcome = plan(src, { line: 0, ch: 5 }, 'continue');
    if (!outcome || !('plan' in outcome)) throw new Error('expected plan');
    const { text } = applyPlan(src, outcome.plan);
    expect(text).toBe('alpha\n beta\n'); // the space after "alpha" leads line 2
    expect([...walkNodes(parse(text))].length).toBe(1); // still one paragraph node
  });

  it('declines inside atoms', () => {
    expect(plan('```\ncode\n```\n', { line: 1, ch: 0 }, 'continue')).toBeNull();
  });
});
