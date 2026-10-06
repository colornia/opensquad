import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Controller } from "../src/planner/controller";
import { MemoryStore } from "../src/memory/store";
import type { Skills } from "../src/skills";

test("inventory and status queries do not interrupt modes, call the brain or write events", async () => {
  const dir = mkdtempSync(join(tmpdir(), "opensquad-query-"));
  const messages: string[] = [];
  let stops = 0,
    brainCalls = 0;
  const skills: Skills = {
    async stop() {
      stops++;
    },
    async follow() {
      return "Following Alex.";
    },
    async come() {
      return "came";
    },
    async collect() {
      return "collected";
    },
    async give() {
      return "given";
    },
    async protect() {
      return "protecting";
    },
    async attack() {
      return "attacking";
    },
    inventory: () => [
      { name: "dirt", count: 3 },
      { name: "oak_log", count: 2 },
    ],
  };
  try {
    const memory = new MemoryStore(join(dir, "memory.json"));
    const controller = new Controller(
      skills,
      {
        async reply() {
          brainCalls++;
          return "hello";
        },
      },
      memory,
      (t) => messages.push(t),
    );
    await controller.handle("Alex", "跟着我");
    const previous = stops;
    await controller.handle("Alex", "状态");
    assert.match(messages.at(-1)!, /跟随 Alex/);
    await controller.handle("Alex", "背包");
    assert.match(messages.at(-1)!, /泥土 ×3.*橡木原木 ×2/);
    await controller.handle("Alex", "帮助");
    assert.match(messages.at(-1)!, /停下.*背包/);
    await controller.handle("Alex", "回忆");
    assert.match(messages.at(-1)!, /跟上了，Alex/);
    assert.ok(!messages.at(-1)!.includes("。。"));
    assert.equal(stops, previous);
    assert.equal(brainCalls, 0);
    assert.equal(memory.get("Alex").events.length, 1);
    controller.invalidate();
    await controller.handle("Alex", "状态");
    assert.match(messages.at(-1)!, /空闲/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
