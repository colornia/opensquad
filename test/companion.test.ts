import { test } from "node:test";
import assert from "node:assert/strict";
import type { Bot } from "mineflayer";
import { CompanionNavigation } from "../src/minecraft/companion";
import { Vec3 } from "vec3";

function fixture() {
  const entity = (name: string, x: number) => ({
    name,
    height: 1.8,
    position: new Vec3(x, 0, 0),
  });
  const player = entity("player", 1);
  const zombie = entity("zombie", 2);
  const cow = entity("cow", 0);
  const goals: unknown[] = [],
    hits: unknown[] = [];
  const bot = {
    blockAt: (_position: Vec3) => ({ shapes: [] }) as object | null,
    world: { raycast: () => null as unknown },
    entity: entity("player", 0),
    players: { Alex: { entity: player as typeof player | undefined } },
    entities: { 1: zombie, 2: cow } as Record<number, typeof zombie>,
    pathfinder: {
      setGoal(goal: unknown) {
        goals.push(goal);
      },
    },
    attack(target: unknown) {
      hits.push(target);
    },
  };
  let time = 0;
  return {
    bot,
    player,
    zombie,
    cow,
    entity,
    goals,
    hits,
    navigation: new CompanionNavigation(bot as unknown as Bot, 12, () => time),
    advance: (ms: number) => {
      time += ms;
    },
  };
}
const hostile = new Set(["zombie"]);

test("missing chunk data cannot establish a clear attack line", () => {
  const f = fixture();
  f.bot.blockAt = () => null;
  f.navigation.update("attack", hostile);
  assert.equal(f.hits.length, 0);
  f.bot.blockAt = () => ({ shapes: [] });
  f.navigation.update("attack", hostile);
  assert.equal(f.hits.length, 1);
});

test("a short diagonal crossing into an unloaded chunk blocks an attack", () => {
  const f = fixture();
  f.bot.entity.position = new Vec3(15.9, 0, 15.9);
  f.zombie.position = new Vec3(16.1, 0, 16.2);
  f.bot.blockAt = (position) =>
    Math.floor(position.x / 16) === 0 && Math.floor(position.z / 16) === 1
      ? null
      : {};
  f.navigation.update("attack", hostile);
  assert.equal(f.hits.length, 0);
});

test("blocked attacks wait for visibility without consuming the attack cooldown", () => {
  const f = fixture();
  f.bot.world.raycast = () => ({ shapes: [[0, 0, 0, 1, 1, 1]] });
  f.navigation.update("attack", hostile);
  assert.equal(f.hits.length, 0);
  f.bot.world.raycast = () => null;
  f.navigation.update("attack", hostile);
  assert.equal(
    f.hits.length,
    1,
    "the first clear attack can happen immediately",
  );
  f.navigation.update("attack", hostile);
  assert.equal(f.hits.length, 1, "visible attacks still honor cooldown");
});

test("protection retains its dynamic goal, attacks at cooldown and returns to the player", () => {
  const f = fixture();
  f.navigation.update("protect", hostile, "Alex");
  f.navigation.update("protect", hostile, "Alex");
  assert.equal(f.goals.length, 1, "stable target does not reset pathfinding");
  assert.deepEqual(f.hits, [f.zombie]);
  f.advance(649);
  f.navigation.update("protect", hostile, "Alex");
  assert.equal(f.hits.length, 1);
  f.advance(1);
  f.navigation.update("protect", hostile, "Alex");
  assert.equal(f.hits.length, 2);
  delete f.bot.entities[1];
  f.navigation.update("protect", hostile, "Alex");
  assert.equal((f.goals.at(-1) as { entity: unknown }).entity, f.player);
  assert.ok(!f.hits.includes(f.cow), "passive mobs remain untouched");
});

test("follow pauses for an invisible player and resumes with the replacement entity", () => {
  const f = fixture();
  f.navigation.update("follow", hostile, "Alex");
  f.bot.players.Alex.entity = undefined;
  f.navigation.update("follow", hostile, "Alex");
  assert.equal(f.goals.at(-1), null);
  f.navigation.update("follow", hostile, "Alex");
  assert.equal(f.goals.length, 2);
  const returned = f.entity("player", 4);
  f.bot.players.Alex.entity = returned;
  f.navigation.update("follow", hostile, "Alex");
  assert.equal((f.goals.at(-1) as { entity: unknown }).entity, returned);
  assert.equal(f.hits.length, 0);
});

test("combat ignores out-of-range hostiles and pauses if the protected player disappears", () => {
  const f = fixture();
  f.bot.entities[1] = f.entity("zombie", 40);
  f.navigation.update("attack", hostile);
  assert.equal(f.goals.at(-1), null);
  assert.equal(f.hits.length, 0);
  f.bot.entities[1] = f.zombie;
  f.bot.players.Alex.entity = undefined;
  f.navigation.update("protect", hostile, "Alex");
  assert.equal(f.hits.length, 0);
});
