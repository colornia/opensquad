import { test } from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import type { Bot } from "mineflayer";
import { bindChatSession } from "../src/minecraft/chat-session";

test("the shared chat entry checks readiness, addressing and player permission across sessions", () => {
  const bot = Object.assign(new EventEmitter(), { username: "ActualProfile" });
  const calls: [string, string][] = [];
  const spawns: boolean[] = [];
  let invalidations = 0;
  const dispose = bindChatSession(
    bot as Bot,
    {
      async handle(player, text) {
        calls.push([player, text]);
      },
      invalidate() {
        invalidations++;
      },
    },
    { prefix: "!team", allowedPlayers: ["Alex"] },
    {
      ready: (returning) => spawns.push(returning),
    },
  );
  bot.emit("chat", "Alex", "!team follow me");
  assert.deepEqual(calls, []);
  bot.emit("spawn");
  for (const [player, text] of [
    ["ActualProfile", "!team stop"],
    ["Steve", "!team stop"],
    ["Alex", "unaddressed conversation"],
    ["Alex", "!teammate stop"],
  ])
    bot.emit("chat", player, text);
  assert.deepEqual(calls, []);
  bot.emit("chat", "Alex", "ActualProfile: follow me");
  assert.deepEqual(calls, [["Alex", "follow me"]]);
  bot.emit("death");
  bot.emit("chat", "Alex", "!team stop");
  assert.equal(calls.length, 1);
  bot.emit("spawn");
  bot.emit("chat", "Alex", "!team status");
  assert.equal(calls.at(-1)?.[1], "status");
  assert.deepEqual(spawns, [false, true]);
  bot.emit("respawn");
  bot.emit("chat", "Alex", "!team stop");
  assert.equal(calls.length, 2);
  bot.emit("spawn");
  assert.deepEqual(
    spawns,
    [false, true, false],
    "a later spawn without death is not labeled respawned",
  );
  bot.emit("end");
  bot.emit("chat", "Alex", "!team stop");
  assert.equal(calls.length, 2);
  assert.equal(invalidations, 3);
  dispose();
  for (const event of ["spawn", "death", "respawn", "end", "chat"])
    assert.equal(bot.listenerCount(event), 0);
});

test("unrestricted private-server chat reports asynchronous controller errors locally", async () => {
  const bot = Object.assign(new EventEmitter(), { username: "OpenSquad" });
  const failure = new Error("test controller failure");
  const errors: unknown[] = [];
  const dispose = bindChatSession(
    bot as Bot,
    {
      async handle() {
        throw failure;
      },
      invalidate() {},
    },
    { prefix: "!bot", allowedPlayers: [] },
    { error: (error) => errors.push(error) },
  );
  bot.emit("spawn");
  bot.emit("chat", "Steve", "!bot help");
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(errors, [failure]);
  dispose();
});
