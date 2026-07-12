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
  it('Tab plans the indent op', () => {
    const outcome = plan('First.\n\nSecond.\n', { line: 2, ch: 3 }, 'indent');
    expect(outcome && 'plan' in outcome).toBe(true);
    if (outcome && 'plan' in outcome) {
      const { text, cursor } = applyPlan('First.\n\nSecond.\n', outcome.plan);
      expect(text).toBe('First.\n\n- Second.\n');
      expect(text.slice(cursor - 2, cursor)).toBe('- ');
      expect(outcome.plan.userEvent).toBe('input.structure.indent');
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

  it('Enter on a heading opens an empty child line below', () => {
    const outcome = plan('# Head\n\nBody.\n', { line: 0, ch: 3 }, 'split');
    if (!outcome || !('plan' in outcome)) throw new Error('expected plan');
    const { text, cursor } = applyPlan('# Head\n\nBody.\n', outcome.plan);
    expect(text).toBe('# Head\n\n\nBody.\n');
    expect(cursor).toBe('# Head\n'.length);
  });

  it('declines inside an atom (stock newline)', () => {
    expect(plan('```\ncode\n```\n', { line: 1, ch: 2 }, 'split')).toBeNull();
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
