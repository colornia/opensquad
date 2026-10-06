import { test } from "node:test";
import assert from "node:assert/strict";
import {
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
  mkdirSync,
  existsSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { MemoryStore, MemoryReadError } from "../src/memory/store";

test("memory reads distinguish missing, malformed and unreadable files without writing them", () => {
  const dir = mkdtempSync(join(tmpdir(), "opensquad-memory-read-"));
  try {
    const file = join(dir, "memory.json");
    assert.deepEqual(new MemoryStore(file).get("Alex"), {
      preferences: [],
      events: [],
    });
    assert.equal(existsSync(file), false);
    for (const content of [
      "{",
      "null",
      "[]",
      '{"Alex":{"preferences":[],"events":[null]}}',
    ]) {
      writeFileSync(file, content);
      assert.throws(
        () => new MemoryStore(file),
        (error: unknown) =>
          error instanceof MemoryReadError && error.reason === "invalid",
      );
      assert.equal(readFileSync(file, "utf8"), content);
    }
    const folder = join(dir, "not-a-file");
    mkdirSync(folder);
    assert.throws(
      () => new MemoryStore(folder),
      (error: unknown) =>
        error instanceof MemoryReadError && error.reason === "unreadable",
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("startup configuration errors name the setting and recovery without a stack trace", () => {
  const dir = mkdtempSync(join(tmpdir(), "opensquad-startup-"));
  try {
    const result = spawnSync(
      process.execPath,
      [resolve("node_modules/tsx/dist/cli.mjs"), resolve("src/index.ts")],
      {
        cwd: dir,
        encoding: "utf8",
        timeout: 10000,
        env: {
          ...process.env,
          MC_PORT: "70000",
          MC_AUTH: "offline",
          MC_USERNAME: "OpenSquad",
          MC_HOST: "127.0.0.1",
        },
      },
    );
    assert.equal(result.status, 1);
    assert.match(result.stderr, /MC_PORT.*65535/);
    assert.match(result.stderr, /\.env/);
    assert.ok(!result.stderr.includes("at "));
    assert.ok(!result.stderr.includes(dir));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("damaged memory stops startup with recovery instructions and leaves the original untouched", () => {
  const dir = mkdtempSync(join(tmpdir(), "opensquad-startup-memory-"));
  try {
    const file = join(dir, "memory.json");
    const content =
      '{"Alex": {"preferences": ["private preference"], "events": [null]}}';
    writeFileSync(file, content);
    const result = spawnSync(
      process.execPath,
      [resolve("node_modules/tsx/dist/cli.mjs"), resolve("src/index.ts")],
      {
        cwd: dir,
        encoding: "utf8",
        timeout: 10000,
        env: {
          ...process.env,
          MC_PORT: "25565",
          MC_AUTH: "offline",
          MC_USERNAME: "OpenSquad",
          MC_HOST: "127.0.0.1",
          MEMORY_PATH: file,
          COMMAND_PREFIX: "!bot",
        },
      },
    );
    assert.equal(result.status, 1);
    assert.match(result.stderr, /记忆文件.*备份/);
    assert.ok(!result.stderr.includes("private preference"));
    assert.ok(!result.stderr.includes(dir));
    assert.ok(!result.stderr.includes("at "));
    assert.equal(readFileSync(file, "utf8"), content);
    const doctor = spawnSync(
      process.execPath,
      [resolve("node_modules/tsx/dist/cli.mjs"), resolve("scripts/doctor.ts")],
      {
        cwd: dir,
        encoding: "utf8",
        timeout: 10000,
        env: {
          ...process.env,
          MC_PORT: "25565",
          MC_AUTH: "offline",
          MC_USERNAME: "OpenSquad",
          MC_HOST: "127.0.0.1",
          MEMORY_PATH: file,
          COMMAND_PREFIX: "!bot",
        },
      },
    );
    assert.equal(doctor.status, 1);
    assert.match(doctor.stderr, /记忆文件.*备份/);
    assert.ok(!doctor.stderr.includes(dir));
    assert.ok(!doctor.stdout.includes("正在检查服务器"));
    assert.equal(readFileSync(file, "utf8"), content);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
