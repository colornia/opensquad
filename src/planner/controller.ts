import { route } from "./router";
import type { Skills } from "../skills";
import type { Brain } from "../brain";
import { MemoryStore } from "../memory/store";
import { isChinese, chineseReply } from "./language";
import { interruptible } from "./cancellation";
export class Controller {
  private active?: AbortController;
  private running = false;
  private stopping?: Promise<void>;
  private completed?: Promise<void>;
  private stopRequests = 0;
  constructor(
    private skills: Skills,
    private brain: Brain,
    private memory: MemoryStore,
    private say: (text: string) => void,
    private timeout = 45000,
  ) {}
  private stopSkills(): Promise<void> {
    if (this.stopping) return this.stopping;
    const stopping = Promise.resolve().then(() => this.skills.stop());
    this.stopping = stopping;
    const clear = () => {
      if (this.stopping === stopping) this.stopping = undefined;
    };
    void stopping.then(clear, clear);
    return stopping;
  }
  private async waitForStop() {
    await this.stopping?.catch(() => {});
  }
  async handle(player: string, text: string) {
    const intent = route(text);
    const zh = isChinese(text);
    const say = (message: string) =>
      this.say(zh ? chineseReply(message) : message);
    if (intent.kind === "stop") {
      this.stopRequests++;
      this.active?.abort();
      try {
        await this.stopSkills();
        await this.completed;
        say("Stopped.");
      } catch {
        say("Couldn't stop cleanly. Wait for the current action or reconnect.");
      } finally {
        this.stopRequests--;
      }
      return;
    }
    if (this.running || this.stopping || this.stopRequests) {
      say("I am busy. Say stop before another command.");
      return;
    }
    this.running = true;
    let complete!: () => void;
    this.completed = new Promise<void>((resolve) => {
      complete = resolve;
    });
    const abort = new AbortController();
    this.active = abort;
    let timer: NodeJS.Timeout | undefined;
    let work: Promise<string> | undefined;
    let timedOut = false;
    try {
      if (intent.kind === "help") {
        say(
          zh
            ? "跟着我 | 停下 | 过来 | 收集 橡木 3 | 给我 橡木 3 | 保护我 | 攻击 | 记住 <偏好> | 回忆 | 忘记我"
            : "follow me | stop | come here | collect oak_log 3 | give me oak_log 3 | protect me | attack nearby hostile mobs | remember <preference> | memory | forget me",
        );
        return;
      }
      if (intent.kind === "remember") {
        this.memory.remember(player, intent.preference);
        say("I will remember that.");
        return;
      }
      if (intent.kind === "forget") {
        this.memory.forget(player);
        this.say(
          zh
            ? "已经删除你的本地偏好和合作记录。"
            : "Your local preferences and shared events have been deleted.",
        );
        return;
      }
      if (intent.kind === "recall") {
        const m = this.memory.get(player);
        this.say(
          zh
            ? `记住的偏好：${m.preferences.join("；") || "还没有"}。最近一起做的事：${
                m.events
                  .slice(-3)
                  .map((e) => chineseReply(e.text))
                  .join("；") || "还没有"
              }。`
            : `Preferences: ${m.preferences.join("; ") || "none"}. Recent events: ${
                m.events
                  .slice(-3)
                  .map((e) => e.text)
                  .join("; ") || "none"
              }.`,
        );
        return;
      }
      if (intent.kind === "chat") {
        const replyWork = interruptible(
          this.brain.reply(
            { player, text: intent.text, memory: this.memory.get(player) },
            abort.signal,
          ),
          abort.signal,
        );
        const reply = await replyWork;
        abort.signal.throwIfAborted();
        this.say(reply);
        return;
      }
      await this.stopSkills();
      abort.signal.throwIfAborted();
      const deadline = new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          timedOut = true;
          abort.abort();
          void this.stopSkills().catch(() => {});
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
      work = action();
      const result = await Promise.race([work, deadline]);
      abort.signal.throwIfAborted();
      this.memory.event(player, result);
      say(result);
    } catch (error) {
      say(
        timedOut
          ? "The action timed out. Finishing cleanup before another task."
          : abort.signal.aborted
            ? "Action stopped or timed out."
            : `Couldn't finish: ${error instanceof Error ? error.message : "unknown error"}`,
      );
      if (work && !abort.signal.aborted)
        await this.stopSkills().catch(() => {});
    } finally {
      if (timer) clearTimeout(timer);
      // A raced timeout must not release the adapter while the old skill's finally block is still running.
      if (work) await work.catch(() => {});
      await this.waitForStop();
      this.completed = undefined;
      if (this.active === abort) this.active = undefined;
      this.running = false;
      complete();
    }
  }
}
