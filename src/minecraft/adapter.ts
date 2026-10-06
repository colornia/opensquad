import mineflayer, { Bot } from "mineflayer";
import { pathfinder, Movements, goals } from "mineflayer-pathfinder";
import { plugin as collectBlock } from "mineflayer-collectblock";
import type { Config } from "../config";
import type { Skills } from "../skills";
const HOSTILES = new Set([
  "zombie",
  "husk",
  "drowned",
  "skeleton",
  "stray",
  "wither_skeleton",
  "spider",
  "cave_spider",
  "creeper",
  "witch",
  "pillager",
  "vindicator",
  "evoker",
  "ravager",
  "phantom",
  "silverfish",
  "endermite",
  "slime",
  "magma_cube",
  "blaze",
  "hoglin",
  "zoglin",
  "breeze",
  "bogged",
]);
export class MinecraftAdapter implements Skills {
  readonly bot: Bot;
  private combatTimer?: NodeJS.Timeout;
  constructor(private config: Config) {
    this.bot = mineflayer.createBot({
      host: config.host,
      port: config.port,
      username: config.username,
      auth: config.auth,
      version: config.version,
      profilesFolder: config.authCachePath,
    });
    this.bot.loadPlugin(pathfinder);
    this.bot.loadPlugin(collectBlock);
    this.bot.on("spawn", () => {
      const movement = new Movements(this.bot);
      movement.canDig = false;
      movement.allow1by1towers = false;
      movement.allowParkour = false;
      this.bot.pathfinder.setMovements(movement);
      this.bot.collectBlock.movements = movement;
    });
    this.bot.on("end", () => {
      if (this.combatTimer) clearInterval(this.combatTimer);
    });
    this.bot.on("death", () => {
      void this.stop().catch(() => {});
    });
  }
  say(text: string) {
    for (const chunk of text
      .replace(/[\r\n\u0000-\u001f]/g, " ")
      .match(/.{1,200}/gu) ?? [])
      this.bot.chat(chunk.startsWith("/") ? `[AI] ${chunk}` : chunk);
  }
  private player(name: string) {
    const entity = this.bot.players[name]?.entity;
    if (!entity) throw new Error(`${name} is not visible. Move closer.`);
    return entity;
  }
  async stop() {
    if (this.combatTimer) clearInterval(this.combatTimer);
    this.combatTimer = undefined;
    this.bot.pathfinder.setGoal(null);
    this.bot.clearControlStates();
    this.bot.stopDigging();
    await this.bot.collectBlock.cancelTask();
  }
  async follow(name: string) {
    this.bot.pathfinder.setGoal(
      new goals.GoalFollow(this.player(name), 2),
      true,
    );
    return `Following ${name}.`;
  }
  async come(name: string) {
    const p = this.player(name).position;
    await this.bot.pathfinder.goto(new goals.GoalNear(p.x, p.y, p.z, 2));
    if (this.bot.entity.position.distanceTo(p) > 3)
      throw new Error(
        "I couldn't reach that spot. Try moving to an open area.",
      );
    return `I'm here, ${name}.`;
  }
  async collect(item: string, count: number, signal: AbortSignal) {
    // Explicit finite mapping: v0.1 does not craft, smelt or mine arbitrary structures.
    const sources: Record<string, string[]> = {
      cobblestone: ["stone", "cobblestone"],
      raw_iron: ["iron_ore", "deepslate_iron_ore"],
      coal: ["coal_ore", "deepslate_coal_ore"],
      diamond: ["diamond_ore", "deepslate_diamond_ore"],
      dirt: ["dirt", "grass_block"],
      sand: ["sand"],
      oak_log: ["oak_log"],
      birch_log: ["birch_log"],
      spruce_log: ["spruce_log"],
    };
    const names = Object.hasOwn(sources, item) ? sources[item] : undefined;
    if (!names)
      throw new Error(
        "Collect supports oak_log, birch_log, spruce_log, dirt, sand, cobblestone, coal, raw_iron, diamond.",
      );
    const previous = this.bot.pathfinder.movements;
    const gathering = new Movements(this.bot);
    gathering.allow1by1towers = false;
    gathering.allowParkour = false;
    for (const block of this.bot.registry.blocksArray)
      if (!names.includes(block.name)) gathering.blocksCantBreak.add(block.id);
    this.bot.collectBlock.movements = gathering;
    const wanted = Math.min(count, this.config.maxCollect);
    const total = () =>
      this.bot.inventory
        .items()
        .filter((i) => i.name === item)
        .reduce((n, i) => n + i.count, 0);
    const before = total();
    let attempts = 0;
    try {
      while (total() - before < wanted && attempts++ < wanted) {
        signal.throwIfAborted();
        const block = this.bot.findBlock({
          matching: (b) => names.includes(b.name),
          maxDistance: this.config.collectRadius,
        });
        if (!block) break;
        const tool = this.bot.pathfinder.bestHarvestTool(block);
        if (!block.canHarvest(tool?.type ?? null))
          throw new Error("I need a suitable tool in my inventory.");
        await this.bot.collectBlock.collect(block);
        signal.throwIfAborted();
      }
      return `Collected ${Math.max(0, total() - before)} ${item} (requested ${wanted}).`;
    } finally {
      this.bot.collectBlock.movements = previous;
      this.bot.pathfinder.setMovements(previous);
    }
  }
  async give(name: string, item: string, count: number, signal: AbortSignal) {
    const stacks = this.bot.inventory.items().filter((i) => i.name === item);
    const available = stacks.reduce((n, i) => n + i.count, 0);
    if (!available) throw new Error(`I have no ${item}.`);
    await this.come(name);
    signal.throwIfAborted();
    const player = this.player(name);
    if (player.position.distanceTo(this.bot.entity.position) > 3)
      throw new Error("You moved away; come closer for the handoff.");
    await this.bot.lookAt(player.position.offset(0, 1, 0));
    signal.throwIfAborted();
    let remaining = Math.min(count, available);
    const given = remaining;
    for (const stack of stacks) {
      signal.throwIfAborted();
      const n = Math.min(remaining, stack.count);
      if (n) await this.bot.toss(stack.type, stack.metadata, n);
      remaining -= n;
      if (!remaining) break;
    }
    return `Dropped ${given} ${item} beside ${name}; pick it up.`;
  }
  async protect(name: string) {
    this.player(name);
    this.combat(name);
    return `Protecting ${name} from nearby hostile mobs. Say stop to finish.`;
  }
  async attack() {
    this.combat();
    return "Attacking nearby hostile mobs. Say stop to finish.";
  }
  private combat(player?: string) {
    let busy = false;
    let lastAttack = 0;
    this.combatTimer = setInterval(() => {
      if (busy || !this.bot.entity) return;
      busy = true;
      void (async () => {
        const center = player
          ? this.bot.players[player]?.entity
          : this.bot.entity;
        if (!center) {
          this.bot.pathfinder.setGoal(null);
          return;
        }
        const target = Object.values(this.bot.entities)
          .filter(
            (e) =>
              HOSTILES.has(e.name ?? "") &&
              e.position.distanceTo(center.position) <=
                this.config.hostileRadius &&
              e.position.distanceTo(this.bot.entity.position) <=
                this.config.hostileRadius * 2,
          )
          .sort(
            (a, b) =>
              a.position.distanceTo(center.position) -
              b.position.distanceTo(center.position),
          )[0];
        if (target) {
          this.bot.pathfinder.setGoal(new goals.GoalFollow(target, 2), true);
          if (
            target.position.distanceTo(this.bot.entity.position) < 3 &&
            Date.now() - lastAttack >= 650
          ) {
            lastAttack = Date.now();
            this.bot.attack(target);
          }
        } else
          this.bot.pathfinder.setGoal(
            player ? new goals.GoalFollow(center, 2) : null,
            !!player,
          );
      })()
        .catch(() => {})
        .finally(() => {
          busy = false;
        });
    }, 250);
  }
}
