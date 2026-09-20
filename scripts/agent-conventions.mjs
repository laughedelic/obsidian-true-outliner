#!/usr/bin/env node
// Claude Code hooks behind two conventions that instructions alone did not hold
// (docs/research/cloud-session-github-access.md):
//
// - Branches are named `feat/…`, `fix/…` or `chore/…`. A cloud session starts on a
//   `claude/<words>` branch the harness created, under a directive not to push
//   elsewhere without explicit permission. SessionStart grants it, in the session's
//   own context, and PreToolUse refuses a push or a PR that would put a `claude/*`
//   name on the remote — before the name is fixed by a PR, while a plain
//   `git branch -m` still fixes it.
// - PR descriptions carry no agent attribution. The GitHub MCP tool
//   `create_pull_request` appends a footer with the session URL outside the
//   `attribution` settings; PostToolUse strips it, and a rewritten body sticks.
//
// One script, dispatched on the event, so `.claude/settings.json` names one file.
// Node rather than bash because the hook input is JSON and `jq` is not a given.
import { execFileSync } from "node:child_process";

const HARNESS = /^(?:refs\/heads\/)?claude\//;
const TYPES = "`feat/<slug>`, `fix/<slug>` or `chore/<slug>`";

const input = JSON.parse(await readStdin());
const cwd = input.cwd || process.cwd();

switch (input.hook_event_name) {
  case "SessionStart":
    sessionStart();
    break;
  case "PreToolUse":
    preToolUse();
    break;
  case "PostToolUse":
    postToolUse();
    break;
}

// Stdout becomes the session's context. The grant is what the harness directive
// asks for and CLAUDE.md alone never gave: a session reading "never push to a
// different branch without explicit permission" needs the permission in front of
// it, on the branch it applies to.
function sessionStart() {
  const branch = currentBranch();
  if (!branch || !HARNESS.test(branch)) return;
  console.log(
    [
      `agent-conventions: this session is on \`${branch}\`, a name the harness chose.`,
      `Our branches are named ${TYPES} (CLAUDE.md, "Branching and PR stacks"), and this`,
      "repository grants the permission the harness's branch directive asks for: before the",
      "first push, rename the branch to the change's type and slug — `git branch -m <type>/<slug>`",
      "— and push that name with `git push -u origin <type>/<slug>`. A push or a PR on a",
      "`claude/*` head is refused by a hook. Once a PR exists the name is fixed.",
    ].join("\n"),
  );
}

function preToolUse() {
  const { tool_name: tool, tool_input: args = {} } = input;
  let target;
  if (tool === "Bash") {
    target = pushedHarnessBranch(String(args.command ?? ""));
  } else if (tool === "mcp__github__create_pull_request") {
    target = HARNESS.test(String(args.head ?? "")) ? args.head : undefined;
  } else if (tool?.startsWith("mcp__github__")) {
    // push_files, create_branch, create_or_update_file, delete_file all name the
    // branch they write to the same way.
    target = HARNESS.test(String(args.branch ?? "")) ? args.branch : undefined;
  }
  if (!target) return;
  deny(
    `\`${target}\` is the name the harness chose for this session, and a push or a PR would fix it. ` +
      `Our branches are named ${TYPES}. Rename first — \`git branch -m <type>/<slug>\` — ` +
      "and push that name; this repository grants the permission the harness directive asks for.",
  );
}

// The push targets of one command line, when any of them is a harness branch.
// Deletes are exempt: removing a `claude/*` branch is the convention, not a breach.
function pushedHarnessBranch(command) {
  for (const segment of command.split(/&&|\|\||;|\|/)) {
    const match = /\bgit\s+(?:-C\s+\S+\s+)?push\b(.*)$/.exec(segment);
    if (!match) continue;
    const words = match[1].trim().split(/\s+/).filter(Boolean);
    if (words.some((w) => w === "--delete" || w === "-d" || /^:/.test(w))) continue;
    const positional = words.filter((w) => !w.startsWith("-"));
    const refspecs = positional.slice(1);
    for (const spec of refspecs) {
      const [src, dst = src] = spec.split(":");
      if (HARNESS.test(dst)) return dst;
      if ((src === "HEAD" || src === "@") && dst === src) {
        const branch = currentBranch();
        if (branch && HARNESS.test(branch)) return branch;
      }
    }
    if (refspecs.length === 0) {
      const branch = currentBranch();
      if (branch && HARNESS.test(branch)) return branch;
    }
  }
}

// The MCP tool's footer is appended server-side at creation; a body rewritten
// afterwards keeps its text. `gh` does the rewrite where it is present and
// authenticated (the cloud session's proxy allows the PATCH); otherwise the
// session is told to do it with `update_pull_request`.
function postToolUse() {
  if (input.tool_name !== "mcp__github__create_pull_request") return;
  const { owner, repo } = input.tool_input ?? {};
  const number = /\/pull\/(\d+)|"number"\s*:\s*(\d+)/.exec(JSON.stringify(input.tool_response ?? ""));
  const pull = number?.[1] ?? number?.[2];
  if (!owner || !repo || !pull) return;
  const path = `repos/${owner}/${repo}/pulls/${pull}`;
  let body;
  try {
    body = execFileSync("gh", ["api", path, "--jq", ".body"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
  } catch {
    return block(`PR #${pull} was created with the MCP tool, which appends a \`Generated by [Claude Code]\` footer. ` +
      "Read its body with `pull_request_read` and rewrite it without the footer using `update_pull_request` (CLAUDE.md, \"Conventions\").");
  }
  const clean = stripFooter(body.replace(/\n$/, ""));
  if (clean === body.replace(/\n$/, "")) return;
  try {
    execFileSync("gh", ["api", "-X", "PATCH", path, "--input", "-"], {
      input: JSON.stringify({ body: clean }),
      stdio: ["pipe", "ignore", "ignore"],
    });
  } catch {
    return block(`PR #${pull} carries the harness's \`Generated by [Claude Code]\` footer and \`gh\` could not rewrite it. ` +
      "Rewrite the body without the footer using `update_pull_request` (CLAUDE.md, \"Conventions\").");
  }
}

function stripFooter(body) {
  return body.replace(/\s*(?:^|\n)(?:-{3,}\s*\n\s*)?_?Generated by \[Claude Code\]\([^)]*\)_?\s*$/, "");
}

function currentBranch() {
  try {
    return execFileSync("git", ["symbolic-ref", "--short", "-q", "HEAD"], {
      cwd,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return undefined;
  }
}

function deny(reason) {
  console.log(
    JSON.stringify({
      hookSpecificOutput: { hookEventName: "PreToolUse", permissionDecision: "deny", permissionDecisionReason: reason },
    }),
  );
}

function block(reason) {
  console.log(JSON.stringify({ decision: "block", reason }));
}

function readStdin() {
  return new Promise((resolve) => {
    let data = "";
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (chunk) => (data += chunk));
    process.stdin.on("end", () => resolve(data || "{}"));
  });
}
