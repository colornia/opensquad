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
    // This chat-only player is positioned by the server; prevent stale client movement after teleport.
    alex.physicsEnabled = false;
    await once(alex, "spawn");
    const placePlayer = async () => {
      const player = server.players.find((p: any) => p.username === "Alex");
      const position = adapter!.bot.entity.position.offset(1, 0, 0);
      await player.teleport(position);
      // The fixture's nearby broadcast can miss an observer during initial visibility updates.
      botPlayer._client.write("entity_teleport", {
        entityId: player.id,
        x: position.x,
        y: position.y,
        z: position.z,
        yaw: 0,
        pitch: 0,
        onGround: true,
      });
      const deadline = Date.now() + 5000;
      while (
        (adapter!.bot.players.Alex?.entity?.position.distanceTo(position) ??
          Infinity) > 0.1 &&
        Date.now() < deadline
      )
        await new Promise((r) => setTimeout(r, 50));
      assert.ok(
        (adapter!.bot.players.Alex?.entity?.position.distanceTo(position) ??
          Infinity) <= 0.1,
        "player teleport observed at the correct position",
      );
    };
    await placePlayer();
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
    // Combat acceptance uses stationary participants; movement is checked separately below.
    adapter.bot.physicsEnabled = false;
    await placePlayer();
    await command("protect me", "Protecting Alex");
    const waitFor = async (
      check: () => boolean,
      message: string,
      details?: () => unknown,
    ) => {
      const deadline = Date.now() + 5000;
      while (!check() && Date.now() < deadline)
        await new Promise((r) => setTimeout(r, 50));
      assert.ok(
        check(),
        `${message}${details ? `: ${JSON.stringify(details())}` : ""}`,
      );
    };
    const attacks: number[] = [];
    botPlayer._client.on(
      "use_entity",
      (packet: { mouse: number; target: number }) => {
        if (packet.mouse === 1) attacks.push(packet.target);
      },
    );
    const spawnMob = (name: string) => {
      const type = server.registry.entitiesByName[name];
      // Flying Squid's helper uses a legacy mob table; supply the current protocol entry.
      server.registry.mobs[type.id] ??= type;
      const mob = server.spawnMob(
        type.id,
        server.overworld,
        adapter!.bot.entity.position.offset(1, 0, 1),
      );
      // This fixture checks protocol hits, not mob locomotion. Keep the initial target in reach.
      mob.calculatePhysics = async () => ({
        position: mob.position,
        onGround: true,
      });
      return mob;
    };
    const cow = spawnMob("cow");
    await waitFor(
      () => !!adapter!.bot.entities[cow.id],
      "passive mob visible through protocol",
    );
    await new Promise((r) => setTimeout(r, 800));
    assert.equal(
      attacks.length,
      0,
      "protection does not attack the cow or player",
    );
    const zombie = spawnMob("zombie");
    await waitFor(
      () => !!adapter!.bot.entities[zombie.id],
      "zombie visible through protocol",
    );
    assert.equal(adapter.bot.entities[zombie.id].name, "zombie");
    await waitFor(
      () => attacks.includes(zombie.id) && zombie.health < 20,
      "protection sends an attack and damages the nearby zombie",
      () => ({
        attacks,
        health: zombie.health,
        name: adapter!.bot.entities[zombie.id]?.name,
        distance: adapter!.bot.entities[zombie.id]?.position.distanceTo(
          adapter!.bot.entity.position,
        ),
        serverPosition: zombie.position,
        botPosition: adapter!.bot.entity.position,
        clientZombie: adapter!.bot.entities[zombie.id]?.position,
        playerPosition: adapter!.bot.players.Alex?.entity?.position,
        goal: (
          adapter!.bot.pathfinder.goal as { entity?: { name?: string } } | null
        )?.entity?.name,
      }),
    );
    zombie.destroy();
    await waitFor(
      () =>
        (adapter!.bot.pathfinder.goal as { entity?: unknown } | null)
          ?.entity === adapter!.bot.players.Alex?.entity,
      "protection returns to following after the hostile disappears",
    );
    await command("stop", "Stopped.");
    const afterStop = attacks.length;
    const waitingZombie = spawnMob("zombie");
    await waitFor(
      () => !!adapter!.bot.entities[waitingZombie.id],
      "second hostile visible",
    );
    await new Promise((r) => setTimeout(r, 800));
    assert.equal(attacks.length, afterStop, "stop prevents further combat");
    await command(
      "attack nearby hostile mobs",
      "Attacking nearby hostile mobs.",
    );
    await waitFor(
      () => attacks.includes(waitingZombie.id) && waitingZombie.health < 20,
      "attack mode damages the nearby zombie",
      () => ({
        attacks,
        health: waitingZombie.health,
        distance: adapter!.bot.entities[waitingZombie.id]?.position.distanceTo(
          adapter!.bot.entity.position,
        ),
      }),
    );
    await command("stop", "Stopped.");
    assert.ok(
      attacks.every((id) => id === zombie.id || id === waitingZombie.id),
      "only hostile entities were attacked",
    );
    waitingZombie.destroy();
    cow.destroy();
    adapter.bot.physicsEnabled = true;
    console.log(
      "PASS: protection and attack packets damage zombies; passive mobs stay untouched; stop halts combat; protection returns to following.",
    );
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
    alex.quit();
    const leaveDeadline = Date.now() + 5000;
    while (adapter.bot.players.Alex?.entity && Date.now() < leaveDeadline)
      await new Promise((r) => setTimeout(r, 50));
    assert.ok(!adapter.bot.players.Alex?.entity, "player left visibility");
    await new Promise((r) => setTimeout(r, 300));
    assert.equal(
      adapter.bot.pathfinder.goal,
      null,
      "follow paused after player left",
    );
    alex = mineflayer.createBot({
      host: "127.0.0.1",
      port: server.listeningPort,
      auth: "offline",
      version: "1.18.2",
      username: "Alex",
    });
    alex.on("error", console.error);
    alex.physicsEnabled = false;
    alex.on("messagestr", (message) => received.push(message));
    await once(alex, "spawn");
    await placePlayer();
    const returnDeadline = Date.now() + 5000;
    while (!adapter.bot.players.Alex?.entity && Date.now() < returnDeadline)
      await new Promise((r) => setTimeout(r, 50));
    assert.ok(
      adapter.bot.players.Alex?.entity,
      "player visible after rejoining",
    );
    await new Promise((r) => setTimeout(r, 300));
    assert.equal(
      (adapter.bot.pathfinder.goal as { entity?: unknown } | null)?.entity,
      adapter.bot.players.Alex.entity,
      "follow resumed with the new player entity without another command",
    );
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
