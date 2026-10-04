import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

// The script is run as the harness runs it: a `PreToolUse` payload on stdin, a decision on stdout.
// `AGENT_CONVENTIONS_SCRIPT` points the same rows at a mutated copy, which is how each condition's
// rows are shown to fail without it.
const SCRIPT = path.resolve(process.env.AGENT_CONVENTIONS_SCRIPT ?? 'scripts/agent-conventions.ts');

type Decision = 'deny' | 'allow';
type Row = [label: string, payload: Record<string, unknown>, expected: Decision];

const bash = (command: string): Record<string, unknown> => ({ tool_name: 'Bash', tool_input: { command } });
const tool = (name: string, input: Record<string, unknown> = {}): Record<string, unknown> => ({ tool_name: name, tool_input: input });

let repos: string;
let feature: string;
let harness: string;

beforeAll(() => {
  repos = mkdtempSync(path.join(tmpdir(), 'agent-conventions-'));
  const init = (name: string, branch: string): string => {
    const dir = path.join(repos, name);
    execFileSync('git', ['init', '-q', '-b', branch, dir]);
    execFileSync('git', ['-C', dir, '-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-q', '--allow-empty', '-m', 'x']);
    return dir;
  };
  feature = init('feature', 'feat/x');
  harness = init('harness', 'claude/foo');
});

afterAll(() => rmSync(repos, { recursive: true, force: true }));

function decide(cwd: string, payload: Record<string, unknown>): Decision {
  const input = JSON.stringify({ hook_event_name: 'PreToolUse', cwd, ...payload });
  const out = execFileSync('node', [SCRIPT], { input, encoding: 'utf8' });
  if (/"permissionDecision":\s*"deny"/.test(out)) return 'deny';
  expect(out.trim()).toBe('');
  return 'allow';
}

const MERGE: Row[] = [
  ['MCP merge_pull_request', tool('mcp__github__merge_pull_request', { pullNumber: 1 }), 'deny'],
  ['MCP enable_pr_auto_merge', tool('mcp__github__enable_pr_auto_merge', { pullNumber: 1 }), 'deny'],
  ['MCP disable_pr_auto_merge', tool('mcp__github__disable_pr_auto_merge', { pullNumber: 1 }), 'deny'],
  ['gh pr merge 12 --squash', bash('gh pr merge 12 --squash'), 'deny'],
  ['gh -R o/r pr merge 12', bash('gh -R laughedelic/obsidian-true-outliner pr merge 12'), 'deny'],
  ['gh --repo o/r pr merge 12', bash('gh --repo o/r pr merge 12'), 'deny'],
  ['an env prefix', bash('GH_TOKEN=x gh pr merge --auto 12'), 'deny'],
  ['after another command', bash('npm test && gh pr merge 12'), 'deny'],
  ['in a subshell', bash('(cd /tmp && gh pr merge 12)'), 'deny'],
  ['gh stack merge', bash('gh stack merge --yes --squash'), 'deny'],
  ['gh api -X PUT …/merge', bash('gh api -X PUT repos/o/r/pulls/12/merge'), 'deny'],
  ['gh api --method PUT … -f', bash('gh api --method PUT repos/o/r/pulls/12/merge -f merge_method=squash'), 'deny'],
  ['gh api --method=put', bash('gh api --method=put repos/o/r/pulls/12/merge'), 'deny'],
  ['gh api …/merge -f (an implied POST)', bash('gh api repos/o/r/pulls/12/merge -f merge_method=squash'), 'deny'],
  ['gh api -XPUT …/ccr/auto_merge', bash('gh api -XPUT repos/o/r/pulls/12/ccr/auto_merge'), 'deny'],
  ['gh api -X PUT …/pulls/12/auto-merge', bash('gh api -X PUT repos/o/r/pulls/12/auto-merge'), 'deny'],
  ['the last of two method flags sends the PUT', bash('gh api -X GET -X PUT repos/o/r/pulls/12/merge'), 'deny'],
  ['the last of two long method flags sends the PUT', bash('gh api --method GET --method=PUT repos/o/r/pulls/12/merge'), 'deny'],
  ['a full URL', bash('gh api -X PUT https://api.github.com/repos/o/r/pulls/12/merge'), 'deny'],
  ['the number in a variable', bash('gh api -X PUT "repos/{owner}/{repo}/pulls/$PR/merge"'), 'deny'],
  ['the number in ${PR} with a field', bash('gh api -X PUT repos/o/r/pulls/${PR}/merge -f merge_method=squash'), 'deny'],
  ['a query string', bash('gh api -X PUT "repos/o/r/pulls/999999/merge?merge_method=squash"'), 'deny'],
  ['a for loop', bash('for n in 1 2; do gh pr merge $n --squash; done'), 'deny'],
  ['if … then', bash('if true; then gh pr merge 1; fi'), 'deny'],
  ['a brace group', bash('{ gh pr merge 1; }'), 'deny'],
  ['a negation', bash('! gh pr merge 1'), 'deny'],
  ['time', bash('time gh pr merge 1'), 'deny'],
  ['env', bash('env GH_REPO=o/r gh pr merge 1'), 'deny'],
  ['command', bash('command gh pr merge 1'), 'deny'],
  ['an absolute path', bash('/usr/local/bin/gh pr merge 1'), 'deny'],
  ['xargs', bash('echo 1 | xargs gh pr merge'), 'deny'],
  ['a flag between pr and merge', bash('gh pr -R o/r merge 1'), 'deny'],
  ['a line continuation', bash('gh pr \\\nmerge 12'), 'deny'],
  ['the --repo=value form', bash('gh --repo=o/r pr merge 1'), 'deny'],
  ['a glued -R value', bash('gh -Ro/r pr merge 1'), 'deny'],
  ['a double-quoted line continuation', bash('gh pr "mer\\\nge" 1'), 'deny'],
  ['-F makes a POST', bash('gh api repos/o/r/pulls/12/merge -F sha=x'), 'deny'],
  ['--field makes a POST', bash('gh api repos/o/r/pulls/12/merge --field sha=x'), 'deny'],
  ['--raw-field makes a POST', bash('gh api repos/o/r/pulls/12/merge --raw-field sha=x'), 'deny'],
  ['--input makes a POST', bash('gh api repos/o/r/pulls/12/merge --input -'), 'deny'],
  ['a glued -f value makes a POST', bash('gh api repos/o/r/pulls/12/merge -fmerge_method=squash'), 'deny'],
  ['sudo with an option value that is gh', bash('sudo -u gh gh pr merge 1'), 'deny'],
  ['env with a directory named gh', bash('env -C ~/src/gh gh pr merge 1'), 'deny'],
  ['gh pr merge --help is refused too: the rule takes any flags', bash('gh pr merge --help'), 'deny'],
  ['gh pr merge --disable-auto is refused too', bash('gh pr merge --disable-auto 999999'), 'deny'],
  ['a flag value that reads like --disable-auto', bash('gh pr merge 1 --body --disable-auto'), 'deny'],
  ['env with an option and its value', bash('env -u FOO gh pr merge 1'), 'deny'],
  ['xargs with an option and its value', bash('echo 1 | xargs -n 1 gh pr merge'), 'deny'],
  ['sudo with an option and its value', bash('sudo -u root gh pr merge 1'), 'deny'],
  ['timeout and its duration', bash('timeout 5 gh pr merge 1'), 'deny'],
  ['an assignment whose value is a substitution', bash('GH_TOKEN=$(cat tok) gh pr merge 1'), 'deny'],

  ['gh pr view', bash('gh pr view 12'), 'allow'],
  ['gh pr create', bash('gh pr create --draft'), 'allow'],
  ['gh pr comment that mentions a merge', bash('gh pr comment 1 --body ready pr merge'), 'allow'],
  ['gh api …/pulls/12', bash('gh api repos/o/r/pulls/12'), 'allow'],
  ['a read of …/merge', bash('gh api repos/o/r/pulls/12/merge'), 'allow'],
  ['a GET with a field', bash('gh api -X GET repos/o/r/pulls/12/merge -f x=1'), 'allow'],
  ['the DELETE that turns auto-merge off', bash('gh api -X DELETE repos/o/r/pulls/12/ccr/auto_merge'), 'deny'],
  ['the DELETE on the standard auto-merge route', bash('gh api -X DELETE repos/o/r/pulls/12/auto-merge'), 'deny'],
  ['the last of two method flags is a GET', bash('gh api -X PUT -X GET repos/o/r/pulls/12/merge'), 'allow'],
  ['a field whose value ends in a merge path', bash('gh api repos/o/r/issues/1/comments -f body=see/pulls/1/merge'), 'allow'],
  ['a quoted field with a merge path', bash('gh api repos/o/r/issues/1/comments -f body="see /pulls/1/merge"'), 'allow'],
  ['a write to a path that only ends in auto_merge', bash('gh api -X PUT repos/o/r/contents/docs/auto_merge -f message=x -f content=eA=='), 'allow'],
  ['a write to a ref named auto_merge', bash('gh api -X PATCH repos/o/r/git/refs/heads/auto_merge -f sha=x'), 'allow'],
  ['a write to a contents path that ends in a merge route', bash('gh api -X PUT repos/o/r/contents/pulls/1/merge -f message=x'), 'allow'],
  ['--method=GET on a merge route', bash('gh api --method=GET repos/o/r/pulls/12/merge'), 'allow'],
  ['--method=DELETE on an auto-merge route', bash('gh api --method=DELETE repos/o/r/pulls/12/ccr/auto_merge'), 'deny'],
  ['a lower-case delete', bash('gh api -X delete repos/o/r/pulls/12/ccr/auto_merge'), 'deny'],
  ['a field whose value is a bare merge path', bash('gh api repos/o/r/issues/1/comments -f body=repos/o/r/pulls/1/merge'), 'allow'],
  ['a write below a merge route', bash('gh api -X PUT repos/o/r/pulls/1/merge/x -f a=b'), 'allow'],
  ['git merge', bash('git merge main'), 'allow'],
  ['a commit message', bash('git commit -m "gh pr merge"'), 'allow'],
  ['a commit message with an operator', bash("git commit -m 'x && gh pr merge 1'"), 'allow'],
  ['a comment that mentions a merge', bash('gh issue comment 1 -b "pr merge"'), 'allow'],
  ['MCP update_pull_request_branch', tool('mcp__github__update_pull_request_branch', { pullNumber: 1 }), 'allow'],
];

const LEXER: Row[] = [
  ['a newline ends a command: a merge', bash('echo hi\ngh pr merge 12'), 'deny'],
  ['a newline ends a command: a push', bash('echo hi\ngit push origin claude/x'), 'deny'],
  ['a command after a heredoc is read', bash("cat > f <<'EOF'\nhello\nEOF\ngh pr merge 12"), 'deny'],
  ['a command after a <<- heredoc is read', bash('cat <<-EOF\n\thi\n\tEOF\ngh pr merge 1'), 'deny'],
  ['a command after a <<\\EOF heredoc is read', bash('cat <<\\EOF > f\nbody\nEOF\ngh pr merge 1'), 'deny'],
  ['an apostrophe in a comment hides no merge', bash("# don't wait for CI\ngh pr merge 424242"), 'deny'],
  ['an apostrophe in a trailing comment', bash("npm test # it's fine\ngh pr merge 424242"), 'deny'],
  ['an apostrophe in a comment hides no push', bash("# we can't rename yet\ngit push origin claude/x"), 'deny'],
  ['a comment that ends in a backslash continues nothing', bash('# retry \\\ngit push origin claude/x'), 'deny'],
  ['a << in a comment opens no here-document', bash('echo a # <<EOF\ngh pr merge 999999\nEOF'), 'deny'],
  ['a # inside a word starts no comment', bash('echo a#b; gh pr merge 1'), 'deny'],
  ['a merge after a here-string', bash('cat <<< hi; gh pr merge 1'), 'deny'],
  ['a push on a later line after a here-string', bash('jq -r .number <<< "$json"\nnpm test && git push origin claude/x'), 'deny'],
  ['a merge on a later line after a here-string', bash('jq -r .number <<< "$json"\nnpm test && gh pr merge 999999'), 'deny'],
  ['a merge between a here-string word and a later line of that word', bash('cat <<< EOF\ngh pr merge 1\nEOF'), 'deny'],
  ['a push on a later line after an arithmetic shift', bash('echo $((1<<2))\ngit push origin claude/x'), 'deny'],
  ['an unterminated heredoc is read as commands', bash('cat <<EOF\ngh pr merge 1'), 'deny'],
  ['a heredoc body that names a merge', bash("cat > f <<'EOF'\nnpm test && gh pr merge 12\ngh pr merge 12\nEOF"), 'allow'],
  ['a heredoc body that names a push', bash("cat > f <<'EOF'\ngit push origin claude/x\nEOF"), 'allow'],
  ['a <<\\EOF heredoc body that names a merge', bash('cat <<\\EOF > f\ngh pr merge 1\nEOF'), 'allow'],
  ['a <<- body with a tab-indented terminator that names a merge', bash('cat <<-EOF\n\tgh pr merge 1\n\tEOF'), 'allow'],
  ['a <<"EOF" body that names a merge', bash('cat <<"EOF"\ngh pr merge 1\nEOF'), 'allow'],
  ['two here-documents on a line', bash('cat <<A <<B\nx\nA\ngh pr merge 1\nB'), 'allow'],
  ['a commit message heredoc that names a merge', bash('git commit -m "$(cat <<\'EOF\'\ngh pr merge 1\nEOF\n)"'), 'allow'],
];

const EARLIER: Row[] = [
  ['git push origin claude/x', bash('git push origin claude/x'), 'deny'],
  ['git push origin HEAD:claude/x', bash('git push origin HEAD:claude/x'), 'deny'],
  ['git push origin fix/x', bash('git push origin fix/x'), 'allow'],
  ['git push origin :claude/old (a delete)', bash('git push origin :claude/old'), 'allow'],
  ['send_later, own_followup', tool('mcp__claude-code-remote__send_later', { initiation: 'own_followup' }), 'deny'],
  ['send_later, human_request', tool('mcp__claude-code-remote__send_later', { initiation: 'human_request' }), 'allow'],
  ['create_pull_request from a claude/* head', tool('mcp__github__create_pull_request', { head: 'claude/x' }), 'deny'],
  ['create_pull_request from a fix/* head', tool('mcp__github__create_pull_request', { head: 'fix/x' }), 'allow'],
];

describe('the merge rule', () => {
  it.each(MERGE)('%s', (_label, payload, expected) => {
    expect(decide(feature, payload)).toBe(expected);
  });
});

describe('the shell lexer both rules share', () => {
  it.each(LEXER)('%s', (_label, payload, expected) => {
    expect(decide(feature, payload)).toBe(expected);
  });
});

describe('the rules that were already there', () => {
  it.each(EARLIER)('%s', (_label, payload, expected) => {
    expect(decide(feature, payload)).toBe(expected);
  });

  it('refuses a bare push from a checkout on a harness branch, and allows it from a feature branch', () => {
    expect(decide(harness, bash('git push'))).toBe('deny');
    expect(decide(feature, bash('git push'))).toBe('allow');
  });

  it('reads a push on a later line against the checkout it runs in', () => {
    expect(decide(harness, bash('echo hi\ngit push'))).toBe('deny');
    expect(decide(feature, bash('git push origin feat/y\necho claude/w'))).toBe('allow');
  });
});
