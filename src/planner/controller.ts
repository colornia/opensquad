import { route } from "./router";
import type { Skills } from "../skills";
import type { Brain } from "../brain";
import { MemoryStore } from "../memory/store";
export class Controller {
  private active?: AbortController;
  private running = false;
  constructor(
    private skills: Skills,
    private brain: Brain,
    private memory: MemoryStore,
    private say: (text: string) => void,
    private timeout = 45000,
  ) {}
  async handle(player: string, text: string) {
    const intent = route(text);
    if (intent.kind === "stop") {
      this.active?.abort();
      await this.skills.stop();
      this.say("Stopped.");
      return;
    }
    if (this.running) {
      this.say("I am busy. Say stop before another command.");
      return;
    }
    this.running = true;
    const abort = new AbortController();
    this.active = abort;
    let timer: NodeJS.Timeout | undefined;
    try {
      if (intent.kind === "help") {
        this.say(
          "follow me | stop | come here | collect oak_log 3 | give me oak_log 3 | protect me | attack nearby hostile mobs | remember <preference> | memory",
        );
        return;
      }
      if (intent.kind === "remember") {
        this.memory.remember(player, intent.preference);
        this.say("I will remember that.");
        return;
      }
      if (intent.kind === "recall") {
        const m = this.memory.get(player);
        this.say(
          `Preferences: ${m.preferences.join("; ") || "none"}. Recent events: ${
            m.events
              .slice(-3)
              .map((e) => e.text)
              .join("; ") || "none"
          }.`,
        );
        return;
      }
      if (intent.kind === "chat") {
        const reply = await this.brain.reply(
          { player, text: intent.text, memory: this.memory.get(player) },
          abort.signal,
        );
        abort.signal.throwIfAborted();
        this.say(reply);
        return;
      }
      await this.skills.stop();
      abort.signal.throwIfAborted();
      const deadline = new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          abort.abort();
          void this.skills.stop().catch(() => {});
          reject(new Error("Action timed out; stopped."));
        }, this.timeout);
      });
      const action = async () => {
        switch (intent.kind) {
          case "follow":
            return this.skills.follow(player);
          case "come":
            return this.skills.come(player);
          case "protect":
            return this.skills.protect(player);
          case "attack":
            return this.skills.attack();
          case "collect":
            return this.skills.collect(intent.item, intent.count, abort.signal);
          case "give":
            return this.skills.give(
              player,
              intent.item,
              intent.count,
              abort.signal,
            );
        }
        throw new Error("Unsupported action");
      };
      const result = await Promise.race([action(), deadline]);
      abort.signal.throwIfAborted();
      this.memory.event(player, result);
      this.say(result);
    } catch (error) {
      this.say(
        abort.signal.aborted
          ? "Action stopped or timed out."
          : `Couldn't finish: ${error instanceof Error ? error.message : "unknown error"}`,
      );
    } finally {
      if (timer) clearTimeout(timer);
      if (this.active === abort) this.active = undefined;
      this.running = false;
    }
  }
}
