/**
 * What a scheduled run on the newest installer files in the tracker, as pure
 * functions: whether to act, and the words. `report-scheduled-run.ts` makes the
 * API calls.
 */

/** Fixed, because it is how a later run finds the issue an earlier one opened. */
export const ISSUE_TITLE = 'The weekly run on the newest installer is red';

/**
 * One label per axis, all declared in `.github/labels.yml` — the label set is
 * the tracker's write surface, so a new label is added there and nowhere else.
 * `p2` because one red weekly run does not make every change pay for it;
 * `needs/diagnosis` because the failure reproduced in CI and its cause has not
 * been located (`.agents/skills/triage`).
 */
export const ISSUE_LABELS = ['kind/bug', 'area/ci', 'area/testing', 'p2', 'needs/diagnosis'] as const;

/** What the run does next: file, add to the open issue, note a pass, or nothing. */
export type Action = 'open' | 'comment-red' | 'comment-green' | 'none';

/**
 * `result` is the matrix job's `needs.<job>.result`. Only `failure` files: a
 * cancelled run says nothing about the build, and a skipped one did not run.
 */
export function decide(result: string, hasOpenIssue: boolean): Action {
  if (result === 'failure') return hasOpenIssue ? 'comment-red' : 'open';
  if (result === 'success' && hasOpenIssue) return 'comment-green';
  return 'none';
}

/** A matrix job's name is `<platform> (<group>)`. */
const JOB_NAME = /^(desktop|mobile) \((.+)\)$/;

/** The command that runs one failed job's group. */
export function reproduction(jobName: string, installer: string): string | undefined {
  const m = JOB_NAME.exec(jobName);
  if (!m) return undefined;
  const [, platform, group] = m;
  const script = platform === 'mobile' ? 'test:e2e:mobile' : 'test:e2e';
  return `OBSIDIAN_INSTALLER_VERSION=${installer} npm run ${script} -- --group ${group}`;
}

export interface RunFacts {
  runUrl: string;
  failedJobs: string[];
  /** The words the run was asked for, not what they resolved to. */
  requested: { app: string; installer: string };
  sha: string;
}

const jobList = (jobs: string[]): string =>
  jobs.length === 0 ? '- none reported as failed; see the run' : jobs.map((j) => `- ${j}`).join('\n');

export function issueBody(facts: RunFacts): string {
  const commands = facts.failedJobs
    .map((j) => reproduction(j, facts.requested.installer))
    .filter((c): c is string => c !== undefined);
  return [
    `The scheduled run on the newest installer failed: ${facts.runUrl}`,
    '',
    `Requested: app \`${facts.requested.app}\`, installer \`${facts.requested.installer}\`. Each job's summary row names the versions it resolved.`,
    '',
    'Failed jobs:',
    jobList(facts.failedJobs),
    '',
    ...(commands.length > 0 ? ['Run one group locally:', '', ...commands.map((c) => `    ${c}`), ''] : []),
    `Verified on \`main\` at \`${facts.sha}\`.`,
    '',
    'A later red run comments here, and a green run says so without closing the issue: whoever looks into this closes it.',
  ].join('\n');
}

export function redComment(facts: RunFacts): string {
  return [`Failed again: ${facts.runUrl}`, '', 'Failed jobs:', jobList(facts.failedJobs)].join('\n');
}

export function greenComment(facts: Pick<RunFacts, 'runUrl'>): string {
  return `Passed: ${facts.runUrl}\n\nThis issue stays open until someone has looked into the earlier failure.`;
}
