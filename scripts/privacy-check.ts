import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const git = (...args: string[]) =>
  execFileSync("git", args, { encoding: "utf8", maxBuffer: 20 * 1024 * 1024 });
const patterns: [string, RegExp][] = [
  [
    "GitHub credential",
    /\b(?:gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{30,})\b/,
  ],
  ["API credential", /\bsk-(?:proj-)?[A-Za-z0-9_-]{24,}\b/],
  ["AWS access key", /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/],
  ["Private key", /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/],
  ["Personal Windows path", /[A-Za-z]:[\\/]Users[\\/][^\s"'<>]+/i],
  ["Personal Unix path", /\/(?:Users|home)\/[a-zA-Z0-9_.-]+\//],
];
const problems = new Set<string>();
function inspect(path: string, content: string, revision = "working tree") {
  if (
    /(^|\/)(?:\.env(?:\..+)?|memory\.json|.*(?:auth|token)[-_]?cache.*\.json)$/.test(
      path,
    ) &&
    path !== ".env.example"
  )
    problems.add(`${revision}: ${path}: private runtime file`);
  for (const [name, pattern] of patterns)
    if (pattern.test(content)) problems.add(`${revision}: ${path}: ${name}`);
  if (path === ".env.example" && /^\s*LLM_API_KEY\s*=\s*\S+/m.test(content))
    problems.add(`${revision}: ${path}: populated API key`);
}
for (const path of git("ls-files", "--cached", "--others", "--exclude-standard")
  .trim()
  .split("\n")
  .filter(Boolean))
  inspect(path, readFileSync(path, "utf8"));
if (process.argv.includes("--history")) {
  for (const revision of git("rev-list", "--all")
    .trim()
    .split("\n")
    .filter(Boolean)) {
    for (const path of git("ls-tree", "-r", "--name-only", revision)
      .trim()
      .split("\n")
      .filter(Boolean))
      inspect(path, git("show", `${revision}:${path}`), revision.slice(0, 7));
  }
}
if (problems.size) {
  for (const issue of problems) console.error(issue);
  process.exitCode = 1;
} else
  console.log(
    "PASS: no known credential patterns, personal paths or runtime memory files in scanned source.",
  );
