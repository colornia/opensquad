import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";

const cli = resolve("node_modules/tsx/dist/cli.mjs");
const scanner = resolve("scripts/privacy-check.ts");
const credential = "gh" + "p_" + "testFixtureOnly".repeat(3);
function fixture() {
  const dir = mkdtempSync(join(tmpdir(), "opensquad-privacy-"));
  const env = {
    ...process.env,
    GIT_CONFIG_NOSYSTEM: "1",
    GIT_CONFIG_GLOBAL: join(dir, "empty-config"),
  };
  writeFileSync(env.GIT_CONFIG_GLOBAL, "");
  const git = (...args: string[]) =>
    execFileSync("git", args, { cwd: dir, env, encoding: "utf8" });
  git("init", "-q", "-b", "main");
  git("config", "user.name", "Test");
  git("config", "user.email", "test@example.invalid");
  git("config", "commit.gpgsign", "false");
  return {
    dir,
    git,
    scan: (history = false) =>
      spawnSync(
        process.execPath,
        [cli, scanner, ...(history ? ["--history"] : [])],
        {
          cwd: dir,
          env,
          encoding: "utf8",
          timeout: 10000,
        },
      ),
    dispose: () => rmSync(dir, { recursive: true, force: true }),
  };
}

test("privacy scan checks staged content even when the working copy has been cleaned", () => {
  const f = fixture();
  try {
    writeFileSync(join(f.dir, "note.txt"), credential);
    f.git("add", "note.txt");
    writeFileSync(join(f.dir, "note.txt"), "clean working copy");
    writeFileSync(
      join(f.dir, `${credential}.txt`),
      "a clean body with an unsafe filename",
    );
    const result = f.scan();
    assert.equal(result.status, 1);
    assert.match(result.stderr, /index.*note\.txt.*GitHub credential/);
    assert.match(result.stderr, /\[redacted\]\.txt/);
    assert.ok(
      !result.stderr.includes(credential),
      "findings never print the credential value",
    );
  } finally {
    f.dispose();
  }
});

test("history retains deleted credentials and supports Chinese filenames and UTF-8 content", () => {
  const f = fixture();
  try {
    const path = "合作记录.txt";
    writeFileSync(join(f.dir, path), `用于检查的中文内容\n${credential}\n`);
    f.git("add", path);
    f.git("commit", "-qm", "Add fixture");
    assert.match(f.scan().stderr, /合作记录\.txt.*GitHub credential/);
    f.git("rm", "-q", path);
    f.git("commit", "-qm", "Remove fixture");
    assert.equal(f.scan().status, 0);
    const result = f.scan(true);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /合作记录\.txt.*GitHub credential/);
    assert.ok(!result.stderr.includes(credential));
  } finally {
    f.dispose();
  }
});

test("historical example keys and tracked runtime files remain findings", () => {
  const f = fixture();
  try {
    const content = "LLM_API_KEY=fixture-example-value\n";
    writeFileSync(join(f.dir, "config.txt"), content);
    f.git("add", "config.txt");
    f.git("commit", "-qm", "Add config fixture");
    f.git("mv", "config.txt", ".env.example");
    f.git("commit", "-qm", "Rename fixture");
    f.git("rm", "-q", ".env.example");
    f.git("commit", "-qm", "Remove fixture");
    const history = f.scan(true);
    assert.equal(history.status, 1);
    assert.match(history.stderr, /\.env\.example.*populated API key/);
    writeFileSync(join(f.dir, ".env.private"), "MC_PORT=25565\n");
    f.git("add", ".env.private");
    const runtime = f.scan();
    assert.equal(runtime.status, 1);
    assert.match(runtime.stderr, /\.env\.private.*private runtime file/);
  } finally {
    f.dispose();
  }
});
