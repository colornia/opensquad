import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Controller } from "../src/planner/controller";
import { MemoryStore } from "../src/memory/store";
import { MockBrain, type Brain } from "../src/brain";
import type { Skills } from "../src/skills";

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => (resolve = r));
  return { promise, resolve };
}
const tick = () => new Promise<void>((r) => setImmediate(r));
function fixture(
  overrides: Partial<Skills>,
  timeout = 20,
  brain: Brain = new MockBrain(),
) {
  const dir = mkdtempSync(join(tmpdir(), "opensquad-cancel-"));
  const messages: string[] = [];
  const calls: string[] = [];
  const skills: Skills = {
    async stop() {
      calls.push("stop");
    },
    async follow() {
      calls.push("follow");
      return "following";
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
    ...overrides,
  };
  const memory = new MemoryStore(join(dir, "memory.json"));
  return {
    controller: new Controller(
      skills,
      brain,
      memory,
      (text) => messages.push(text),
      timeout,
    ),
    messages,
    calls,
    memory,
    dispose: () => rmSync(dir, { recursive: true, force: true }),
  };
}
test("session invalidation discards delayed action and stop feedback", async () => {
  const started = deferred<void>(),
    unwind = deferred<void>();
  const f = fixture(
    {
      async collect() {
        started.resolve();
        await unwind.promise;
        return "old collection finished";
      },
    },
    10000,
  );
  try {
    const job = f.controller.handle("Alex", "collect dirt");
    await started.promise;
    const stop = f.controller.handle("Alex", "stop");
    await tick();
    f.controller.invalidate();
    unwind.resolve();
    await Promise.all([job, stop]);
    assert.deepEqual(
      f.messages,
      [],
      "no old-session feedback after death or disconnect",
    );
    assert.deepEqual(f.memory.get("Alex").events, []);
    await f.controller.handle("Alex", "status");
    assert.match(f.messages.at(-1)!, /Idle/);
    await f.controller.handle("Alex", "follow me");
    assert.equal(f.messages.at(-1), "following");
  } finally {
    unwind.resolve();
    f.dispose();
  }
});

test("session invalidation silences canceled chat while the next session remains usable", async () => {
  const answer = deferred<string>();
  const f = fixture({}, 10000, { reply: () => answer.promise });
  try {
    const job = f.controller.handle("Alex", "hello");
    await tick();
    f.controller.invalidate();
    await job;
    assert.deepEqual(f.messages, []);
    await f.controller.handle("Alex", "follow me");
    answer.resolve("old model reply");
    await tick();
    assert.deepEqual(f.messages, ["following"]);
  } finally {
    answer.resolve("cleanup");
    f.dispose();
  }
});

test("help and memory remain available during collection and stop cleanup", async () => {
  const started = deferred<void>(),
    unwind = deferred<void>();
  const f = fixture(
    {
      async collect(_item, _count, signal) {
        started.resolve();
        await unwind.promise;
        signal.throwIfAborted();
        return "collected";
      },
    },
    10000,
  );
  try {
    f.memory.remember("Alex", "likes mining");
    f.memory.remember("Steve", "private preference for Steve");
    const before = f.memory.get("Alex");
    const job = f.controller.handle("Alex", "collect dirt");
    await started.promise;
    await f.controller.handle("Alex", "帮助");
    assert.match(f.messages.at(-1)!, /停下.*背包/);
    await f.controller.handle("Alex", "memory");
    assert.match(f.messages.at(-1)!, /likes mining/);
    assert.ok(!f.messages.at(-1)!.includes("Steve"));
    assert.equal(f.calls.filter((call) => call === "stop").length, 1);
    const stop = f.controller.handle("Alex", "stop");
    await tick();
    await f.controller.handle("Alex", "help");
    assert.match(f.messages.at(-1)!, /follow me/);
    await f.controller.handle("Alex", "回忆");
    assert.match(f.messages.at(-1)!, /likes mining/);
    assert.deepEqual(f.memory.get("Alex"), before);
    unwind.resolve();
    await Promise.all([job, stop]);
  } finally {
    unwind.resolve();
    f.dispose();
  }
});

test("timeout keeps the adapter reserved until a late action finishes cleanup", async () => {
  const cleanup = deferred<void>();
  const started = deferred<void>();
  const f = fixture({
    async collect(_item, _count, signal) {
      started.resolve();
      await cleanup.promise;
      signal.throwIfAborted();
      return "stale success";
    },
  });
  try {
    const job = f.controller.handle("Alex", "collect dirt");
    await started.promise;
    const stopCount = f.calls.filter((x) => x === "stop").length;
    await f.controller.handle("Alex", "给我3个泥土2个");
    assert.match(f.messages.at(-1)!, /数量只写一次/);
    assert.equal(f.calls.filter((x) => x === "stop").length, stopCount);
    assert.equal(f.memory.get("Alex").events.length, 0);
    await f.controller.handle("Alex", "状态");
    assert.ok(f.messages.some((x) => x.includes("收集资源")));
    assert.equal(
      f.calls.filter((x) => x === "stop").length,
      stopCount,
      "status does not interrupt the task",
    );
    await new Promise((r) => setTimeout(r, 40));
    assert.ok(f.messages.some((x) => x.includes("timed out")));
    await f.controller.handle("Alex", "follow me");
    assert.ok(!f.calls.includes("follow"));
    cleanup.resolve();
    await job;
    await f.controller.handle("Alex", "follow me");
    assert.ok(f.calls.includes("follow"));
    assert.ok(!f.messages.includes("stale success"));
    assert.ok(
      !f.memory.get("Alex").events.some((x) => x.text === "stale success"),
    );
  } finally {
    cleanup.resolve();
    f.dispose();
  }
});
test("stop is coalesced and only confirms completion after the old task settles", async () => {
  const cleanup = deferred<void>();
  const started = deferred<void>();
  const stopDone = deferred<void>();
  let stopCalls = 0;
  const f = fixture(
    {
      async stop() {
        stopCalls++;
        if (stopCalls > 1) await stopDone.promise;
      },
      async collect(_item, _count, signal) {
        started.resolve();
        await cleanup.promise;
        signal.throwIfAborted();
        return "stale";
      },
    },
    1000,
  );
  try {
    const job = f.controller.handle("Alex", "collect dirt");
    await started.promise;
    const stop1 = f.controller.handle("Alex", "stop"),
      stop2 = f.controller.handle("Alex", "stop");
    await tick();
    assert.equal(stopCalls, 2);
    assert.ok(!f.messages.includes("Stopped."));
    stopDone.resolve();
    await tick();
    assert.ok(!f.messages.includes("Stopped."));
    await f.controller.handle("Alex", "follow me");
    assert.ok(!f.calls.includes("follow"));
    cleanup.resolve();
    await Promise.all([job, stop1, stop2]);
    assert.ok(f.messages.includes("Stopped."));
    await f.controller.handle("Alex", "follow me");
    assert.ok(f.calls.includes("follow"));
  } finally {
    stopDone.resolve();
    cleanup.resolve();
    f.dispose();
  }
});
test("a canceled chat cannot send its late reply", async () => {
  const answer = deferred<string>();
  const dir = mkdtempSync(join(tmpdir(), "opensquad-chat-"));
  const messages: string[] = [];
  const skills: Skills = {
    async stop() {},
    async follow() {
      return "follow";
    },
    async come() {
      return "come";
    },
    async collect() {
      return "collect";
    },
    async give() {
      return "give";
    },
    async protect() {
      return "protect";
    },
    async attack() {
      return "attack";
    },
  };
  try {
    const controller = new Controller(
      skills,
      { reply: () => answer.promise },
      new MemoryStore(join(dir, "memory.json")),
      (s) => messages.push(s),
    );
    const job = controller.handle("Alex", "hello");
    await tick();
    await controller.handle("Alex", "stop");
    await controller.handle("Alex", "follow me");
    assert.ok(
      messages.includes("follow"),
      "canceled model reply no longer blocks game commands",
    );
    answer.resolve("late reply");
    await job;
    assert.ok(!messages.includes("late reply"));
  } finally {
    answer.resolve("cleanup");
    rmSync(dir, { recursive: true, force: true });
  }
});
