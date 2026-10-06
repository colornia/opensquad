import { route, type Intent } from "./router";
import type { Skills } from "../skills";
import type { Brain } from "../brain";
import { MemoryStore, MemoryWriteError } from "../memory/store";
import { isChinese, chineseReply, chineseItemName } from "./language";
import { interruptible } from "./cancellation";
export class Controller {
  private active?: AbortController;
  private running = false;
  private stopping?: Promise<void>;
  private completed?: Promise<void>;
  private stopRequests = 0;
  private task?: Intent;
  private mode?: { kind: "follow" | "protect" | "attack"; player: string };
  constructor(
    private skills: Skills,
    private brain: Brain,
    private memory: MemoryStore,
    private say: (text: string) => void,
    private timeout = 45000,
  ) {}
  private stopSkills(): Promise<void> {
    if (this.stopping) return this.stopping;
    this.mode = undefined;
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
  invalidate() {
    this.mode = undefined;
    this.active?.abort();
  }
  private status(zh: boolean) {
    if (this.stopRequests || this.stopping || this.active?.signal.aborted)
      return zh
        ? "我正在收尾，停稳后才能接新任务。"
        : "Finishing cleanup before another task.";
    if (this.running && this.task) {
      const names: Record<string, string> = {
        collect: "收集资源",
        give: "交付物品",
        come: "走到你身边",
        follow: "启动跟随",
        protect: "启动保护",
        attack: "启动攻击",
        chat: "等待聊天回复",
        remember: "保存偏好",
        forget: "删除记录",
        recall: "查看记忆",
      };
      const detail =
        "item" in this.task
          ? ` ${zh ? chineseItemName(this.task.item) : this.task.item}`
          : "";
      return zh
        ? `我正在${names[this.task.kind] ?? "处理指令"}${detail}。`
        : `Current task: ${this.task.kind}${detail}.`;
    }
    if (this.mode) {
      const { kind, player } = this.mode;
      return zh
        ? `当前模式：${kind === "follow" ? "跟随" : kind === "protect" ? "保护" : "攻击"}${kind === "attack" ? "附近怪物" : ` ${player}`}。`
        : `Active mode: ${kind}${kind === "attack" ? " nearby hostile mobs" : ` ${player}`}.`;
    }
    return zh ? "我现在空闲，可以叫我一起走。" : "Idle and ready for a task.";
  }
  async handle(player: string, text: string) {
    const intent = route(text);
    const zh = isChinese(text);
    const say = (message: string) =>
      this.say(zh ? chineseReply(message) : message);
    if (intent.kind === "invalid") {
      this.say(intent.message);
      return;
    }
    if (intent.kind === "help") {
      say(
        zh
          ? "跟着我 | 停下 | 过来 | 收集 橡木 3 | 给我 橡木 3 | 保护我 | 攻击 | 状态 | 背包 | 记住 <偏好> | 回忆 | 忘记我"
          : "follow me | stop | come here | collect oak_log 3 | give me oak_log 3 | protect me | attack nearby hostile mobs | status | inventory | remember <preference> | memory | forget me",
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
                .map((e) => chineseReply(e.text).replace(/[.。]+$/, ""))
                .join("；") || "还没有"
            }。`
          : `Preferences: ${m.preferences.join("; ") || "none"}. Recent events: ${
              m.events
                .slice(-3)
                .map((e) => e.text.replace(/[.。]+$/, ""))
                .join("; ") || "none"
            }.`,
      );
      return;
    }
    if (intent.kind === "status") {
      this.say(this.status(zh));
      return;
    }
    if (intent.kind === "inventory") {
      try {
        const items = this.skills.inventory?.();
        if (!items) {
          this.say(
            zh
              ? "这个游戏适配器还不能查看背包。"
              : "This adapter does not support inventory queries.",
          );
          return;
        }
        const summary = items
          .slice(0, 8)
          .map((i) => `${zh ? chineseItemName(i.name) : i.name} ×${i.count}`)
          .join(zh ? "，" : ", ");
        this.say(
          zh
            ? `背包：${summary || "还没有物品"}${items.length > 8 ? `，另有 ${items.length - 8} 种物品` : ""}。`
            : `Inventory: ${summary || "empty"}${items.length > 8 ? `, plus ${items.length - 8} other item types` : ""}.`,
        );
      } catch {
        this.say(
          zh
            ? "暂时读不到背包，等进服后再试。"
            : "Inventory is not available yet. Try again after joining.",
        );
      }
      return;
    }
    if (intent.kind === "stop") {
      this.stopRequests++;
      this.active?.abort();
      try {
        await this.stopSkills();
        await this.completed;
        this.mode = undefined;
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
    this.task = intent;
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
      this.mode = undefined;
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
      if (
        intent.kind === "follow" ||
        intent.kind === "protect" ||
        intent.kind === "attack"
      )
        this.mode = { kind: intent.kind, player };
      say(result);
      try {
        this.memory.event(player, result);
      } catch (error) {
        if (!(error instanceof MemoryWriteError)) throw error;
        this.say(
          zh
            ? "动作已完成，但这次合作记录没能保存。请检查本地存储权限和空间。"
            : "The action finished, but its event could not be saved. Check local storage permissions and space.",
        );
      }
    } catch (error) {
      if (error instanceof MemoryWriteError) {
        this.say(
          zh
            ? "记忆文件没能更新，保存或删除尚未完成。请检查本地存储权限和空间后重试。"
            : "Memory update failed; saving or deletion has not completed. Check local storage permissions and space, then retry.",
        );
        return;
      }
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
      this.task = undefined;
      complete();
    }
  }
}
