import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { MockBrain } from "../src/brain";
import { Controller } from "../src/planner/controller";
import { MemoryStore } from "../src/memory/store";
import type { Skills } from "../src/skills";

test("a negative mining preference does not produce a cave suggestion", async () => {
  const reply = await new MockBrain().reply({
    player: "Alex",
    text: "今天做什么",
    memory: { preferences: ["我不喜欢探索矿洞"], events: [] },
  });
  assert.ok(!reply.includes("可以一起探索矿洞"));
  assert.match(reply, /木材/);
});

test("basic chat distinguishes greetings, help and its conversation limits", async () => {
  const brain = new MockBrain();
  const context = {
    player: "Alex",
    text: "你好",
    memory: { preferences: [], events: [] },
  };
  assert.match(await brain.reply(context), /今天想一起做什么/);
  assert.match(
    await brain.reply({ ...context, text: "你能做什么？" }),
    /状态.*背包/,
  );
  assert.match(await brain.reply({ ...context, text: "谢谢" }), /不客气/);
  assert.match(
    await brain.reply({ ...context, text: "unrecognized conversation" }),
    /free-form conversation/,
  );
});

test("saved preferences shape suggestions without executing actions or writing conversation history", async () => {
  const dir = mkdtempSync(join(tmpdir(), "opensquad-basic-chat-"));
  try {
    const memory = new MemoryStore(join(dir, "memory.json"));
    memory.remember("Alex", "我喜欢探索矿洞");
    memory.event("Alex", "Collected 1 dirt (requested 1).");
    const before = memory.get("Alex");
    const unexpected = async (): Promise<string> => {
      throw new Error("Chat must not execute game skills");
    };
    const skills: Skills = {
      stop: async () => {
        throw new Error("Chat must not stop ongoing skills");
      },
      follow: unexpected,
      come: unexpected,
      collect: unexpected,
      give: unexpected,
      protect: unexpected,
      attack: unexpected,
    };
    const messages: string[] = [];
    const controller = new Controller(skills, new MockBrain(), memory, (text) =>
      messages.push(text),
    );
    await controller.handle("Alex", "今天做什么？");
    assert.match(messages.at(-1)!, /探索矿洞/);
    assert.match(messages.at(-1)!, /还没有开始执行/);
    await controller.handle("Alex", "上次一起做了什么？");
    assert.match(messages.at(-1)!, /泥土/);
    assert.deepEqual(memory.get("Alex"), before);
    await controller.handle("Alex", "忘记我");
    await controller.handle("Alex", "你记得我的偏好吗？");
    assert.match(messages.at(-1)!, /还没告诉我偏好/);
    await controller.handle("Alex", "今天做什么？");
    assert.match(messages.at(-1)!, /木材/);
    assert.ok(!messages.at(-1)!.includes("我记得你说过"));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
