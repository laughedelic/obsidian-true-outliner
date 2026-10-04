import { describe, expect, it } from 'vitest';
import { freshnessProblem, landsSomething, versionProblems, type Kind } from '../scripts/landed-rules.ts';

const version = (kind: Kind | undefined, before: string, after: string, over: { ships?: boolean; editsManifest?: boolean } = {}) =>
  versionProblems({ kind, ships: true, editsManifest: true, before, after, ...over });

describe('the version a pull request lands with', () => {
  it('takes a patch bump above main for a fix that ships', () => {
    expect(version('bug', '0.14.4', '0.14.5')).toEqual([]);
  });

  // The case a duplicate bump produces: another PR moved main to the version this one chose.
  it('fails a head whose version equals main’s', () => {
    expect(version('bug', '0.14.5', '0.14.5')).toEqual([expect.stringContaining('not above main')]);
  });

  it('fails a head whose version is below main’s', () => {
    expect(version('bug', '0.14.5', '0.14.4')).toEqual([expect.stringContaining('not above main')]);
  });

  it('fails a fix that ships and leaves the manifest as main has it', () => {
    expect(version('bug', '0.14.5', '0.14.5', { editsManifest: false })).toEqual([expect.stringContaining('fix that ships')]);
  });

  it('takes a minor bump for a feature that ships, and refuses a patch', () => {
    expect(version('feature', '0.14.4', '0.15.0')).toEqual([]);
    expect(version('feature', '0.14.4', '0.14.5')).toEqual([expect.stringContaining('minor bump')]);
  });

  it('asks nothing of a chore that ships nothing', () => {
    expect(version('chore', '0.14.4', '0.14.4', { ships: false, editsManifest: false })).toEqual([]);
  });

  it('refuses a version that is not major.minor.patch', () => {
    expect(version('bug', '0.14', '0.14.5')).toEqual([expect.stringContaining('not major.minor.patch')]);
  });
});

describe('what has something to land', () => {
  it('counts an OpenSpec change, a main spec and the manifest', () => {
    expect(landsSomething('chore', ['openspec/changes/x/proposal.md'])).toBe(true);
    expect(landsSomething('chore', ['openspec/specs/zoom/spec.md'])).toBe(true);
    expect(landsSomething('chore', ['manifest.json'])).toBe(true);
  });

  it('counts the landing of a change, which deletes its open path and adds its archive', () => {
    expect(landsSomething('chore', ['openspec/changes/x/tasks.md', 'openspec/changes/archive/2026-10-04-x/tasks.md'])).toBe(true);
  });

  // The text of a change that already landed is not a change to land.
  it('does not count an edit to an archived change alone', () => {
    expect(landsSomething('chore', ['openspec/changes/archive/2026-10-03-x/design.md'])).toBe(false);
  });

  it('counts behaviour that ships under a feature or a fix, and not under a chore', () => {
    expect(landsSomething('bug', ['src/ops.ts'])).toBe(true);
    expect(landsSomething('feature', ['styles/10-editor.css'])).toBe(true);
    expect(landsSomething('chore', ['src/ops.ts'])).toBe(false);
  });

  it('counts nothing in a dependency update, tooling or docs', () => {
    expect(landsSomething('chore', ['package.json', 'package-lock.json'])).toBe(false);
    expect(landsSomething('chore', ['scripts/beta-version.ts', 'docs/research/x.md'])).toBe(false);
  });
});

describe('how current a pull request has to be', () => {
  const tip = '0123456789abcdef';

  it('holds a pull request that lands to the tip of main', () => {
    expect(freshnessProblem(true, false, tip)).toContain('0123456');
    expect(freshnessProblem(true, true, tip)).toBeUndefined();
  });

  // A dependency update one commit behind merges without a rebase and a CI run.
  it('does not hold one with nothing to land', () => {
    expect(freshnessProblem(false, false, tip)).toBeUndefined();
  });
});
