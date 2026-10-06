import type { Bot } from "mineflayer";
import { goals } from "mineflayer-pathfinder";

export type CompanionMode = "follow" | "protect" | "attack";

export class CompanionNavigation {
  private target?: Bot["entity"];
  private initialized = false;
  private lastAttack = -Infinity;

  constructor(
    private bot: Bot,
    private radius: number,
    private now = Date.now,
  ) {}

  update(mode: CompanionMode, hostiles: ReadonlySet<string>, player?: string) {
    const self = this.bot.entity;
    const center =
      mode === "attack" ? self : this.bot.players[player ?? ""]?.entity;
    let target: Bot["entity"] | undefined;
    if (self && center) {
      if (mode !== "follow") {
        target = Object.values(this.bot.entities)
          .filter(
            (entity) =>
              hostiles.has(entity.name ?? "") &&
              entity.position.distanceTo(center.position) <= this.radius &&
              entity.position.distanceTo(self.position) <= this.radius * 2,
          )
          .sort(
            (a, b) =>
              a.position.distanceTo(center.position) -
              b.position.distanceTo(center.position),
          )[0];
      }
      if (!target && mode !== "attack") target = center;
    }
    // GoalFollow tracks a moving entity itself; replacing it each tick resets pathfinding.
    if (!this.initialized || target !== this.target) {
      this.bot.pathfinder.setGoal(
        target ? new goals.GoalFollow(target, 2) : null,
        !!target,
      );
      this.target = target;
      this.initialized = true;
    }
    if (
      target &&
      self &&
      mode !== "follow" &&
      hostiles.has(target.name ?? "") &&
      target.position.distanceTo(self.position) < 3 &&
      this.now() - this.lastAttack >= 650
    ) {
      this.lastAttack = this.now();
      this.bot.attack(target);
    }
  }
}
