// Real Mineflayer connection to an ephemeral local protocol server (no Java required).
import assert from "node:assert/strict";
import { once } from "node:events";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { MinecraftAdapter } from "../src/minecraft/adapter";
import { Controller } from "../src/planner/controller";
import { MemoryStore } from "../src/memory/store";
import { MockBrain } from "../src/brain";
import { addressed } from "../src/planner/router";
import { loadConfig } from "../src/config";
import mineflayer from "mineflayer";
const squid = require("flying-squid");
const defaults = require("flying-squid/config/default-settings.json");
async function main() {
  const dir = mkdtempSync(join(tmpdir(), "opensquad-smoke-"));
  const server = squid.createMCServer({
    ...defaults,
    host: "127.0.0.1",
    port: 0,
    version: "1.18.2",
    gameMode: 0,
    "online-mode": false,
    logging: false,
    worldFolder: undefined,
    generation: { name: "superflat", options: {} },
    "view-distance": 2,
  });
  let adapter: MinecraftAdapter | undefined;
  let alex: ReturnType<typeof mineflayer.createBot> | undefined;
  const watchdog = setTimeout(() => {
    console.error("Smoke timed out");
    process.exit(1);
  }, 45000);
  try {
    await server.waitForReady(10000);
    adapter = new MinecraftAdapter({
      ...loadConfig(),
      host: "127.0.0.1",
      port: server.listeningPort,
      auth: "offline",
      version: "1.18.2",
      username: "OpenSquad",
    });
    adapter.bot.on("error", console.error);
    const seen: string[] = [];
    const controller = new Controller(
      adapter,
      new MockBrain(),
      new MemoryStore(join(dir, "memory.json")),
      (t) => {
        seen.push(t);
        adapter!.say(t);
      },
    );
    adapter.bot.on("chat", (player, message) => {
      const text = addressed(message, "!bot", "OpenSquad");
      if (player !== "OpenSquad" && text !== null)
        void controller.handle(player, text);
    });
    await once(adapter.bot, "spawn");
    await new Promise((r) => setTimeout(r, 500));
    const botPlayer = server.players.find(
      (p: any) => p.username === "OpenSquad",
    );
    const cx = Math.floor(adapter.bot.entity.position.x / 16),
      cz = Math.floor(adapter.bot.entity.position.z / 16);
    for (let x = cx - 2; x <= cx + 2; x++)
      for (let z = cz - 2; z <= cz + 2; z++)
        await botPlayer.sendChunk(x, z, await server.overworld.getColumn(x, z));
    await adapter.bot.waitForChunksToLoad();
    alex = mineflayer.createBot({
      host: "127.0.0.1",
      port: server.listeningPort,
      auth: "offline",
      version: "1.18.2",
      username: "Alex",
    });
    alex.on("error", console.error);
    await once(alex, "spawn");
    await server.players
      .find((p: any) => p.username === "Alex")
      .teleport(adapter.bot.entity.position.offset(1, 0, 0));
    const visibleDeadline = Date.now() + 5000;
    while (!adapter.bot.players.Alex?.entity && Date.now() < visibleDeadline)
      await new Promise((r) => setTimeout(r, 50));
    assert.ok(
      adapter.bot.players.Alex?.entity,
      "teammate visible after teleport",
    );
    const received: string[] = [];
    alex.on("messagestr", (message) => received.push(message));
    const command = async (text: string, expected: string) => {
      const offset = received.length;
      alex!.chat(`!bot ${text}`);
      const deadline = Date.now() + 7000;
      while (
        !received.slice(offset).some((x) => x.includes(expected)) &&
        Date.now() < deadline
      )
        await new Promise((r) => setTimeout(r, 50));
      assert.ok(
        received.slice(offset).some((x) => x.includes(expected)),
        `${text}: expected ${expected}, got ${received.slice(offset).join("; ")}`,
      );
    };
    await command("remember likes mining", "I will remember that.");
    await command("follow me", "Following Alex.");
    await command("状态", "跟随 Alex");
    await command("stop", "Stopped.");
    await command("come here", "I'm here, Alex.");
    await command("protect me", "Protecting Alex");
    await command("stop", "Stopped.");
    await command(
      "attack nearby hostile mobs",
      "Attacking nearby hostile mobs.",
    );
    await command("stop", "Stopped.");
    await server.setBlock(
      server.overworld,
      adapter.bot.entity.position.floored().offset(2, 0, 0),
      server.registry.blocksByName.dirt.minStateId,
    );
    await new Promise((r) => setTimeout(r, 300));
    await command("collect dirt 1", "Collected");
    assert.ok(
      adapter.bot.inventory.items().some((i) => i.name === "dirt"),
      "collected dirt into inventory",
    );
    await command("背包", "泥土 ×1");
    await command("give me dirt 1", "Dropped 1 dirt");
    await server.setBlock(
      server.overworld,
      adapter.bot.entity.position.floored().offset(2, 0, 0),
      server.registry.blocksByName.oak_log.minStateId,
    );
    await new Promise((r) => setTimeout(r, 300));
    const dug = once(adapter.bot, "diggingCompleted", {
      signal: AbortSignal.timeout(7000),
    });
    alex.chat("!bot collect oak_log 16");
    await dug;
    await command("stop", "Stopped.");
    assert.equal(
      adapter.bot.pathfinder.isMining(),
      false,
      "mining stopped before acknowledgement",
    );
    await command("status", "Idle and ready");
    await command("收集 钻石 1", "这次没有拿到钻石");
    await command("follow me", "Following Alex.");
    await command("stop", "Stopped.");
    assert.deepEqual(
      new MemoryStore(join(dir, "memory.json")).get("Alex").preferences,
      ["likes mining"],
    );
    await command("跟着我", "跟上了，Alex。");
    await command("停下", "好，停下了。");
    await command("记住 我喜欢探索矿洞", "记住了");
    await command("回忆", "我喜欢探索矿洞");
    await command("忘记我", "已经删除你的本地偏好和合作记录。");
    assert.deepEqual(new MemoryStore(join(dir, "memory.json")).get("Alex"), {
      preferences: [],
      events: [],
    });
    console.log(
      "PASS: two real clients, chat round trips, follow/stop/come/protect/attack, dirt collection, handoff, persistent memory.",
    );
  } finally {
    clearTimeout(watchdog);
    if (adapter) {
      await adapter.stop();
      adapter.bot.quit();
    }
    alex?.quit();
    await new Promise((r) => setTimeout(r, 200));
    await server.destroy();
    rmSync(dir, { recursive: true, force: true });
  }
}
void main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
