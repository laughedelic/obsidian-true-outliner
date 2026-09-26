import { readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

/**
 * An e2e budget is set where WebdriverIO's wrapper can read it.
 *
 * `@wdio/mocha-framework` wraps every case and hook in `executeAsync`
 * (`@wdio/utils`), which reads the runnable's timeout once, on entry, and races
 * the body against a timer of that length. A `this.timeout()` inside the body
 * moves mocha's own timer and leaves wdio's where it was, so a raise from there
 * is capped at whatever the runnable held on entry, and the case fails with a
 * bare `Error: Timeout` while its body keeps driving the editor into the next
 * case (docs/research/e2e-ci-budgets).
 *
 * A budget reaches wdio when it is on the runnable before wdio enters it: on
 * the Test that `it` returns, or in a `describe` body ahead of the cases and
 * hooks it covers. The mocha wdio loads copies a suite's budget onto a case or
 * a hook when that case or hook is declared, so a `describe`-level call after
 * one reaches nothing already declared.
 *
 * So `this.timeout(n)` is accepted only as a statement of a `describe` body
 * itself, before anything is declared in it, and `this.test.timeout(n)`
 * nowhere. A call inside a nested function is refused even where its `this` is
 * the suite's: an arrow defined in a `describe` body can be called from inside
 * a case, and where the call is written says nothing about when it runs. The
 * rule refuses a lowering from inside a body as well, although mocha's own
 * timer would honour that one.
 */

const E2E = join(__dirname, '..', 'e2e-tests');

/** The functions whose callback body is a SUITE, where `this` is mocha's suite
 * context and a budget reaches what is declared after it. */
const SUITE_FUNCTIONS = new Set(['describe', 'context', 'suite', 'xdescribe', 'xcontext']);

/** Every function that declares something a suite's budget is copied onto. */
const DECLARING = new Set([
  ...SUITE_FUNCTIONS,
  'it',
  'specify',
  'xit',
  'before',
  'beforeEach',
  'after',
  'afterEach',
]);

/** `describe`, `describe.only` and `describe.skip` all name `describe`. */
function calleeName(callee: ts.Expression): string | undefined {
  if (ts.isIdentifier(callee)) return callee.text;
  if (
    ts.isPropertyAccessExpression(callee) &&
    ts.isIdentifier(callee.expression) &&
    (callee.name.text === 'only' || callee.name.text === 'skip')
  ) {
    return callee.expression.text;
  }
  return undefined;
}

/** The function a call at `node` runs inside: the nearest enclosing function,
 * arrows included, since an arrow runs wherever it is called from. */
function enclosingFunction(node: ts.Node): ts.Node | undefined {
  for (let n = node.parent; n !== undefined; n = n.parent) {
    if (ts.isFunctionLike(n) || ts.isClassLike(n)) return n;
  }
  return undefined;
}

function isSuiteBody(fn: ts.Node): fn is ts.FunctionExpression {
  const call = fn.parent;
  if (!ts.isFunctionExpression(fn) || call === undefined || !ts.isCallExpression(call)) return false;
  const name = calleeName(call.expression);
  return name !== undefined && SUITE_FUNCTIONS.has(name) && call.arguments.includes(fn);
}

function declaresAnything(node: ts.Node): boolean {
  if (ts.isCallExpression(node)) {
    const name = calleeName(node.expression);
    if (name !== undefined && DECLARING.has(name)) return true;
  }
  return ts.forEachChild(node, declaresAnything) ?? false;
}

/** Whether a statement of `body` ahead of the one holding `node` declares a
 * case, a hook or a suite. */
function declaredBefore(body: ts.FunctionExpression, node: ts.Node): boolean {
  for (const statement of body.body.statements) {
    if (statement.pos <= node.pos && node.end <= statement.end) return false;
    if (declaresAnything(statement)) return true;
  }
  return false;
}

/** `this.timeout(n)` answers `this`; `this.test.timeout(n)` answers `test`. */
function budgetReceiver(node: ts.CallExpression): 'this' | 'test' | undefined {
  if (node.arguments.length === 0) return undefined;
  const callee = node.expression;
  if (!ts.isPropertyAccessExpression(callee) || callee.name.text !== 'timeout') return undefined;
  let target: ts.Expression = callee.expression;
  while (ts.isNonNullExpression(target) || ts.isParenthesizedExpression(target)) target = target.expression;
  if (target.kind === ts.SyntaxKind.ThisKeyword) return 'this';
  if (
    ts.isPropertyAccessExpression(target) &&
    target.name.text === 'test' &&
    target.expression.kind === ts.SyntaxKind.ThisKeyword
  ) {
    return 'test';
  }
  return undefined;
}

/** The 1-based lines of every budget set where wdio cannot read it. */
function unseenBudgets(source: string): number[] {
  const file = ts.createSourceFile('spec.ts', source, ts.ScriptTarget.Latest, true);
  const lines: number[] = [];
  const visit = (node: ts.Node): void => {
    if (ts.isCallExpression(node)) {
      const receiver = budgetReceiver(node);
      if (receiver !== undefined) {
        const owner = enclosingFunction(node);
        const seen =
          receiver === 'this' && owner !== undefined && isSuiteBody(owner) && !declaredBefore(owner, node);
        if (!seen) lines.push(file.getLineAndCharacterOfPosition(node.getStart(file)).line + 1);
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(file);
  return lines;
}

function e2eSources(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...e2eSources(path));
    else if (/\.m?ts$/.test(entry.name)) out.push(path);
  }
  return out;
}

describe('the rule, on the shapes it has to tell apart', () => {
  it('refuses a budget set from inside a case', () => {
    expect(unseenBudgets(`it('x', async function () {\n  this.timeout(180_000);\n});`)).toEqual([2]);
  });

  it('refuses one set on the case from inside it', () => {
    expect(unseenBudgets(`it('x', async function () {\n  this.test!.timeout(180_000);\n});`)).toEqual([2]);
  });

  it('refuses one set from inside a hook, which wdio wraps the same way', () => {
    expect(unseenBudgets(`before(async function () {\n  this.timeout(180_000);\n});`)).toEqual([2]);
  });

  it('refuses one set from an arrow inside a case, whose `this` is the case', () => {
    const src = `it('x', async function () {\n  const f = () => this.timeout(180_000);\n  f();\n});`;
    expect(unseenBudgets(src)).toEqual([2]);
  });

  it('refuses one set from a named function, whose caller it cannot see', () => {
    expect(unseenBudgets(`async function body(this: Mocha.Context) {\n  this.timeout(5);\n}`)).toEqual([2]);
  });

  it('refuses one set in a describe body after a case, a hook or a loop of cases', () => {
    expect(unseenBudgets(`describe('s', function () {\n  it('x', f);\n  this.timeout(120_000);\n});`)).toEqual([3]);
    expect(unseenBudgets(`describe('s', function () {\n  before(f);\n  this.timeout(120_000);\n});`)).toEqual([3]);
    const loop = `describe('s', function () {\n  for (const x of xs) it(x, f);\n  this.timeout(120_000);\n});`;
    expect(unseenBudgets(loop)).toEqual([3]);
  });

  it('accepts a budget declared on the case', () => {
    expect(unseenBudgets(`it('x', async function () {\n  await go();\n}).timeout(180_000);`)).toEqual([]);
  });

  it('accepts one set in a describe body ahead of what it covers, and in describe.only', () => {
    expect(unseenBudgets(`describe('s', function () {\n  this.timeout(120_000);\n  it('x', f);\n});`)).toEqual([]);
    expect(unseenBudgets(`describe.only('s', function () {\n  this.timeout(120_000);\n});`)).toEqual([]);
  });

  it('refuses one set from an arrow inside a describe body, which can run after the cases', () => {
    const src = `describe('s', function () {\n  const set = () => this.timeout(120_000);\n  it('x', async function () {\n    set();\n  });\n});`;
    expect(unseenBudgets(src)).toEqual([2]);
  });

  it('accepts reading the budget, which sets nothing', () => {
    expect(unseenBudgets(`it('x', async function () {\n  log(this.timeout());\n});`)).toEqual([]);
  });
});

describe('e2e budgets', () => {
  it('are set only where wdio reads them', () => {
    const offenders = e2eSources(E2E).flatMap((file) =>
      unseenBudgets(readFileSync(file, 'utf8')).map((line) => `${relative(join(E2E, '..'), file)}:${line}`),
    );
    expect(
      offenders,
      'declare a case budget on the case, it(...).timeout(ms); a hook takes its from the describe body, ahead of the hook',
    ).toEqual([]);
  });
});
