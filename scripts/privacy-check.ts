import { execFileSync } from "node:child_process";
import { lstatSync, readFileSync, readlinkSync } from "node:fs";

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
interface Location {
  path: string;
  revision: string;
}
const objects = new Map<string, Map<string, Location>>();
function report(location: Location, problem: string) {
  let path = location.path;
  for (const [, pattern] of patterns)
    path = path.replace(
      new RegExp(pattern.source, `${pattern.flags}g`),
      "[redacted]",
    );
  problems.add(`${location.revision}: ${JSON.stringify(path)}: ${problem}`);
}
function inspectLocation(location: Location) {
  const { path } = location;
  if (
    /(^|\/)(?:\.env(?:\..+)?|memory\.json|.*(?:auth|token)[-_]?cache.*\.json)$/.test(
      path,
    ) &&
    path !== ".env.example"
  )
    report(location, "private runtime file");
  for (const [name, pattern] of patterns)
    if (pattern.test(path)) report(location, name);
}
function inspectContent(content: string, locations: Location[]) {
  for (const [name, pattern] of patterns)
    if (pattern.test(content)) report(locations[0], name);
  const example = locations.find(
    (location) => location.path === ".env.example",
  );
  if (example && /^\s*LLM_API_KEY\s*=\s*\S+/m.test(content))
    report(example, "populated API key");
}
function addObject(sha: string, location: Location) {
  inspectLocation(location);
  if (/^0+$/.test(sha)) return;
  let locations = objects.get(sha);
  if (!locations) objects.set(sha, (locations = new Map()));
  if (!locations.has(location.path)) locations.set(location.path, location);
}
function inspectObjects() {
  const ids = [...objects.keys()];
  for (let start = 0; start < ids.length; start += 64) {
    const batch = ids.slice(start, start + 64);
    const output = execFileSync("git", ["cat-file", "--batch"], {
      input: `${batch.join("\n")}\n`,
      maxBuffer: 20 * 1024 * 1024,
    });
    let offset = 0;
    for (const expected of batch) {
      const end = output.indexOf(10, offset);
      if (end < 0) throw new Error("Incomplete Git object header");
      const [sha, type, rawSize] = output
        .subarray(offset, end)
        .toString("ascii")
        .split(" ");
      const size = Number(rawSize);
      offset = end + 1;
      if (
        sha !== expected ||
        type !== "blob" ||
        !Number.isSafeInteger(size) ||
        size < 0 ||
        offset + size >= output.length ||
        output[offset + size] !== 10
      )
        throw new Error("Invalid Git object response");
      // Git reports byte lengths; decode after slicing so Chinese content preserves framing.
      inspectContent(output.subarray(offset, offset + size).toString("utf8"), [
        ...objects.get(sha)!.values(),
      ]);
      offset += size + 1;
    }
    if (offset !== output.length)
      throw new Error("Unexpected Git object output");
  }
}
function main() {
  const submodules = new Set<string>();
  for (const entry of git("ls-files", "--stage", "-z")
    .split("\0")
    .filter(Boolean)) {
    const separator = entry.indexOf("\t");
    const [mode, sha, stage] = entry.slice(0, separator).split(" ");
    const path = entry.slice(separator + 1);
    if (mode === "160000") {
      submodules.add(path);
      continue;
    }
    addObject(sha, {
      path,
      revision: stage === "0" ? "index" : `index stage ${stage}`,
    });
  }
  for (const path of new Set(
    git("ls-files", "--cached", "--others", "--exclude-standard", "-z")
      .split("\0")
      .filter(Boolean),
  )) {
    if (submodules.has(path)) continue;
    const location = { path, revision: "working tree" };
    let content: string;
    try {
      content = lstatSync(path).isSymbolicLink()
        ? readlinkSync(path)
        : readFileSync(path, "utf8");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") continue;
      throw error;
    }
    inspectLocation(location);
    inspectContent(content, [location]);
  }
  const history = process.argv.includes("--history");
  if (history) {
    for (const revision of git("rev-list", "--all")
      .trim()
      .split("\n")
      .filter(Boolean))
      for (const entry of git("ls-tree", "-r", "-z", revision)
        .split("\0")
        .filter(Boolean)) {
        const separator = entry.indexOf("\t");
        const [, type, sha] = entry.slice(0, separator).split(" ");
        if (type === "blob")
          addObject(sha, {
            path: entry.slice(separator + 1),
            revision: revision.slice(0, 7),
          });
      }
  }
  inspectObjects();
  if (problems.size) {
    for (const issue of problems) console.error(issue);
    process.exitCode = 1;
  } else
    console.log(
      `PASS: no known credential patterns, personal paths or runtime memory files in working files, index${history ? " and local Git history" : ""}.`,
    );
}
try {
  main();
} catch {
  console.error("Privacy scan failed. Check repository access and retry.");
  process.exitCode = 1;
}
