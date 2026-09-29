import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  ISSUE_LABELS,
  ISSUE_TITLE,
  decide,
  greenComment,
  issueBody,
  redComment,
  reproduction,
} from '../scripts/scheduled-run-issue.ts';

const facts = {
  runUrl: 'https://github.com/o/r/actions/runs/7',
  failedJobs: ['desktop (folding)', 'mobile (smoke)'],
  requested: { app: 'latest', installer: 'latest' },
  sha: 'abc1234',
};

describe('decide', () => {
  it.each([
    ['failure', false, 'open'],
    ['failure', true, 'comment-red'],
    ['success', true, 'comment-green'],
    ['success', false, 'none'],
    ['cancelled', false, 'none'],
    ['cancelled', true, 'none'],
    ['skipped', true, 'none'],
  ] as const)('%s with open issue %s -> %s', (result, open, action) => {
    expect(decide(result, open)).toBe(action);
  });
});

describe('the issue', () => {
  it('uses only labels the repository declares', () => {
    const declared = new Set(
      [...readFileSync('.github/labels.yml', 'utf8').matchAll(/^- name: (\S+)$/gm)].map((m) => m[1]),
    );
    for (const label of ISSUE_LABELS) expect(declared, label).toContain(label);
  });

  it('takes one label from each axis it needs', () => {
    expect(ISSUE_LABELS.filter((l) => l.startsWith('kind/'))).toHaveLength(1);
    expect(ISSUE_LABELS.filter((l) => /^p[0-3]$/.test(l))).toHaveLength(1);
    expect(ISSUE_LABELS.filter((l) => l.startsWith('needs/'))).toHaveLength(1);
    expect(ISSUE_LABELS.some((l) => l.startsWith('area/'))).toBe(true);
  });

  it('names the run, the failed jobs and what was requested', () => {
    const body = issueBody(facts);
    expect(body).toContain(facts.runUrl);
    expect(body).toContain('- desktop (folding)');
    expect(body).toContain('- mobile (smoke)');
    expect(body).toContain('app `latest`, installer `latest`');
    expect(body).toContain('`abc1234`');
  });

  it('gives a command per failed job, with the platform and group', () => {
    const body = issueBody(facts);
    expect(body).toContain('OBSIDIAN_INSTALLER_VERSION=latest npm run test:e2e -- --group folding');
    expect(body).toContain('OBSIDIAN_INSTALLER_VERSION=latest npm run test:e2e:mobile -- --group smoke');
  });

  it('still reads when no job was reported as failed', () => {
    const body = issueBody({ ...facts, failedJobs: [] });
    expect(body).toContain('none reported as failed');
    expect(body).not.toContain('Run one group locally');
  });

  it('has a fixed title, which is how a later run finds it', () => {
    expect(ISSUE_TITLE).toBe('The weekly run on the newest installer is red');
  });
});

describe('reproduction', () => {
  it('is undefined for a job that is not a platform and group', () => {
    expect(reproduction('report', 'latest')).toBeUndefined();
  });
});

describe('the comments', () => {
  it('a red one lists the failed jobs, a green one says the issue stays open', () => {
    expect(redComment(facts)).toContain('Failed again');
    expect(redComment(facts)).toContain('- desktop (folding)');
    expect(greenComment(facts)).toContain('stays open');
  });
});
