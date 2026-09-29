/**
 * Files a red scheduled run in the tracker, from the last job of
 * `.github/workflows/oldest-installer.yml`.
 *
 *   node scripts/report-scheduled-run.ts --result <needs.e2e.result> --run-id <id>
 *     --app <requested app> --installer <requested installer> [--dry-run]
 *
 * The repository, server and commit come from the environment Actions provides
 * (`GITHUB_REPOSITORY`, `GITHUB_SERVER_URL`, `GITHUB_SHA`), the token from `GH_TOKEN`.
 * `--dry-run` prints the calls it would make and makes none of the writes.
 *
 * What it does for each result is `decide` in `./scheduled-run-issue.ts`.
 */

import { execFileSync } from 'node:child_process';
import { parseArgs } from 'node:util';
import {
  ISSUE_LABELS,
  ISSUE_TITLE,
  decide,
  greenComment,
  issueBody,
  redComment,
  type RunFacts,
} from './scheduled-run-issue.ts';

const { values } = parseArgs({
  options: {
    result: { type: 'string' },
    'run-id': { type: 'string' },
    app: { type: 'string' },
    installer: { type: 'string' },
    'dry-run': { type: 'boolean', default: false },
  },
});
const { result, 'run-id': runId, app, installer } = values;
const dryRun = values['dry-run'];
if (result === undefined || runId === undefined || app === undefined || installer === undefined) {
  console.error('usage: node scripts/report-scheduled-run.ts --result <r> --run-id <id> --app <a> --installer <i> [--dry-run]');
  process.exit(2);
}

const repo = process.env.GITHUB_REPOSITORY;
if (!repo) {
  console.error('GITHUB_REPOSITORY is not set');
  process.exit(2);
}
const server = process.env.GITHUB_SERVER_URL ?? 'https://github.com';
const sha = process.env.GITHUB_SHA ?? 'unknown';

/** REST through `gh`, which reads its token from `GH_TOKEN`. */
const api = (endpoint: string, body?: unknown): unknown => {
  const args = ['api', endpoint];
  if (body !== undefined) args.push('--method', 'POST', '--input', '-');
  const out = execFileSync('gh', args, {
    encoding: 'utf8',
    input: body === undefined ? undefined : JSON.stringify(body),
    stdio: ['pipe', 'pipe', 'inherit'],
  });
  return out === '' ? undefined : JSON.parse(out);
};

const openIssue = (): number | undefined => {
  const issues = api(`repos/${repo}/issues?state=open&labels=${encodeURIComponent('area/ci')}&per_page=100`) as {
    number: number;
    title: string;
    pull_request?: unknown;
  }[];
  return issues.find((i) => i.pull_request === undefined && i.title === ISSUE_TITLE)?.number;
};

const failedJobs = (): string[] => {
  const { jobs } = api(`repos/${repo}/actions/runs/${runId}/jobs?per_page=100`) as {
    jobs: { name: string; conclusion: string | null }[];
  };
  return jobs.filter((j) => j.conclusion === 'failure').map((j) => j.name);
};

const existing = openIssue();
const action = decide(result, existing !== undefined);
const runUrl = `${server}/${repo}/actions/runs/${runId}`;
console.log(`result ${result}, open issue ${existing ?? 'none'}: ${action}`);
if (action === 'none') process.exit(0);

const facts: RunFacts = {
  runUrl,
  failedJobs: action === 'comment-green' ? [] : failedJobs(),
  requested: { app, installer },
  sha,
};

const write = (endpoint: string, body: unknown): void => {
  if (dryRun) console.log(`POST ${endpoint}\n${JSON.stringify(body, null, 2)}`);
  else api(endpoint, body);
};

if (action === 'open') {
  write(`repos/${repo}/issues`, { title: ISSUE_TITLE, body: issueBody(facts), labels: [...ISSUE_LABELS] });
} else {
  const body = action === 'comment-red' ? redComment(facts) : greenComment(facts);
  write(`repos/${repo}/issues/${existing}/comments`, { body });
}
