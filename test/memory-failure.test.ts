import { test } from "node:test";
import assert from "node:assert/strict";
import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { MemoryStore, MemoryWriteError } from "../src/memory/store";
import { Controller } from "../src/planner/controller";
import { MockBrain } from "../src/brain";
import type { Skills } from "../src/skills";

test("failed memory writes preserve disk and in-memory state, and deletion can be retried", () => {
  const dir = mkdtempSync(join(tmpdir(), "opensquad-memory-failure-"));
  try {
    const path = join(dir, "memory.json");
    const memory = new MemoryStore(path);
    memory.remember("Alex", "likes mining");
    memory.remember("Steve", "likes building");
    const before = memory.get("Alex"),
      disk = readFileSync(path, "utf8");
    mkdirSync(`${path}.tmp`);
    for (const operation of [
      () => memory.remember("Alex", "new preference"),
      () => memory.event("Alex", "new event"),
      () => memory.forget("Alex"),
    ]) {
      assert.throws(
        operation,
        (error: unknown) =>
          error instanceof MemoryWriteError && !error.message.includes(dir),
      );
      assert.deepEqual(memory.get("Alex"), before);
      assert.equal(readFileSync(path, "utf8"), disk);
    }
    rmSync(`${path}.tmp`, { recursive: true });
    memory.forget("Alex");
    assert.deepEqual(new MemoryStore(path).get("Alex"), {
      preferences: [],
      events: [],
    });
    assert.deepEqual(new MemoryStore(path).get("Steve").preferences, [
      "likes building",
    ]);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("memory failure does not cancel a successful mode or disclose local paths in chat", async () => {
  const dir = mkdtempSync(join(tmpdir(), "opensquad-memory-feedback-"));
  try {
    const path = join(dir, "memory.json"),
      memory = new MemoryStore(path);
    memory.remember("Alex", "likes mining");
    mkdirSync(`${path}.tmp`);
    let stops = 0;
    const action = async () => "finished";
    const skills: Skills = {
      stop: async () => {
        stops++;
      },
      follow: async () => "Following Alex.",
      come: action,
      collect: action,
      give: action,
      protect: action,
      attack: action,
    };
    const messages: string[] = [];
    const controller = new Controller(
      skills,
      new MockBrain(),
      memory,
      (message) => messages.push(message),
    );
    await controller.handle("Alex", "跟着我");
    assert.match(messages[0], /跟上了/);
    assert.match(messages[1], /动作已完成.*没能保存/);
    assert.equal(stops, 1, "only the normal pre-action cleanup ran");
    await controller.handle("Alex", "状态");
    assert.match(messages.at(-1)!, /跟随 Alex/);
    await controller.handle("Alex", "忘记我");
    assert.match(messages.at(-1)!, /删除尚未完成/);
    assert.ok(!messages.some((message) => message.includes("已经删除")));
    assert.ok(
      messages.every(
        (message) => !message.includes(dir) && !message.includes("memory.json"),
      ),
    );
    assert.deepEqual(memory.get("Alex").preferences, ["likes mining"]);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("loading an oversized valid memory retains the documented record limits", () => {
  const dir = mkdtempSync(join(tmpdir(), "opensquad-memory-limits-"));
  try {
    const path = join(dir, "memory.json");
    writeFileSync(
      path,
      JSON.stringify({
        Alex: {
          preferences: Array.from({ length: 30 }, (_, i) => `preference ${i}`),
          events: Array.from({ length: 60 }, (_, i) => ({
            at: "2026-01-01T00:00:00Z",
            text: `event ${i}`,
          })),
        },
      }),
    );
    const memory = new MemoryStore(path).get("Alex");
    assert.equal(memory.preferences.length, 20);
    assert.equal(memory.events.length, 50);
    assert.equal(memory.preferences[0], "preference 10");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
