import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { route, addressed } from "../src/planner/router";
import { MemoryStore } from "../src/memory/store";
import { Controller } from "../src/planner/controller";
import { MockBrain, createBrain } from "../src/brain";
import type { Skills } from "../src/skills";
import { chineseReply } from "../src/planner/language";
test("required intents route without a brain", () => {
  for (const [text, kind] of [
    ["follow me", "follow"],
    ["stop", "stop"],
    ["come here", "come"],
    ["protect me", "protect"],
    ["attack nearby hostile mobs", "attack"],
  ])
    assert.equal(route(text).kind, kind);
  assert.deepEqual(route("give me oak log 3"), {
    kind: "give",
    item: "oak_log",
    count: 3,
  });
  assert.deepEqual(route("collect diamond 999"), {
    kind: "collect",
    item: "diamond",
    count: 64,
  });
  assert.equal(addressed("!botany stop", "!bot", "OpenSquad"), null);
  assert.equal(addressed("!bot stop", "!bot", "OpenSquad"), "stop");
});
test("memory survives a restart and is bounded", () => {
  const dir = mkdtempSync(join(tmpdir(), "opensquad-"));
  try {
    const path = join(dir, "memory.json");
    const m = new MemoryStore(path);
    m.remember("__proto__", "mining");
    m.remember("Alex", "likes mining");
    for (let n = 0; n < 55; n++) m.event("Alex", `event ${n}`);
    const reload = new MemoryStore(path);
    assert.equal(reload.get("Alex").events.length, 50);
    assert.deepEqual(reload.get("Alex").preferences, ["likes mining"]);
    assert.deepEqual(reload.get("__proto__").preferences, ["mining"]);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
test("commands execute skills, report failures and stop an active action", async () => {
  const dir = mkdtempSync(join(tmpdir(), "opensquad-"));
  const messages: string[] = [];
  const calls: string[] = [];
  let release: () => void = () => {};
  const skills: Skills = {
    async stop() {
      calls.push("stop");
      release();
    },
    async follow(p) {
      calls.push(p);
      return "following";
    },
    async come() {
      throw new Error("not visible");
    },
    async collect(_i, _n, signal) {
      await new Promise<void>((r) => {
        release = r;
      });
      signal.throwIfAborted();
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
  };
  try {
    const controller = new Controller(
      skills,
      new MockBrain(),
      new MemoryStore(join(dir, "memory.json")),
      (s) => messages.push(s),
      1000,
    );
    await controller.handle("Alex", "follow me");
    assert.ok(calls.includes("Alex"));
    await controller.handle("Alex", "come here");
    assert.ok(messages.at(-1)?.includes("not visible"));
    const pending = controller.handle("Alex", "collect oak_log");
    await new Promise((r) => setImmediate(r));
    await controller.handle("Alex", "stop");
    await pending;
    assert.ok(messages.includes("Stopped."));
    assert.ok(!messages.includes("collected"));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
test("missing keys and provider failures retain a usable fallback", async () => {
  const oldProvider = process.env.BRAIN_PROVIDER,
    oldKey = process.env.LLM_API_KEY;
  const originalFetch = globalThis.fetch;
  try {
    process.env.BRAIN_PROVIDER = "openai-compatible";
    delete process.env.LLM_API_KEY;
    const context = {
      player: "Alex",
      text: "hello",
      memory: { preferences: [], events: [] },
    };
    assert.match(await createBrain().reply(context), /I'm here, Alex/);
    process.env.LLM_API_KEY = "test-only-key";
    globalThis.fetch = async () => {
      throw new Error("offline");
    };
    assert.match(await createBrain().reply(context), /I'm here, Alex/);
  } finally {
    globalThis.fetch = originalFetch;
    if (oldProvider === undefined) delete process.env.BRAIN_PROVIDER;
    else process.env.BRAIN_PROVIDER = oldProvider;
    if (oldKey === undefined) delete process.env.LLM_API_KEY;
    else process.env.LLM_API_KEY = oldKey;
  }
});
test("Chinese instructions route to the same skills", () => {
  assert.deepEqual(route("收集 橡木 3"), {
    kind: "collect",
    item: "oak_log",
    count: 3,
  });
  assert.deepEqual(route("给我 白桦木原木 2个"), {
    kind: "give",
    item: "birch_log",
    count: 2,
  });
  assert.deepEqual(route("收集 dirt 4"), {
    kind: "collect",
    item: "dirt",
    count: 4,
  });
  assert.equal(route("跟着我！").kind, "follow");
  assert.equal(route("忘记我").kind, "forget");
  assert.equal(route("forget Alex").kind, "chat");
  assert.equal(chineseReply("Following Alex."), "跟上了，Alex。");
  assert.match(
    chineseReply("Couldn't finish: I have no dirt."),
    /我背包里还没有 dirt/,
  );
});
test("forget removes only the current player and survives restart", () => {
  const dir = mkdtempSync(join(tmpdir(), "opensquad-"));
  try {
    const path = join(dir, "memory.json");
    const m = new MemoryStore(path);
    m.remember("Alex", "private preference");
    m.event("Alex", "private event");
    m.remember("Steve", "other player");
    m.forget("Alex");
    const reloaded = new MemoryStore(path);
    assert.deepEqual(reloaded.get("Alex"), { preferences: [], events: [] });
    assert.deepEqual(reloaded.get("Steve").preferences, ["other player"]);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
