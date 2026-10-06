import { loadConfig } from "./config";
import { MinecraftAdapter } from "./minecraft/adapter";
import { createBrain } from "./brain";
import { MemoryStore } from "./memory/store";
import { Controller } from "./planner/controller";
import { bindChatSession } from "./minecraft/chat-session";
import { connectionHint } from "./setup/diagnostics";
const config = loadConfig();
const memory = new MemoryStore(config.memoryPath);
const adapter = new MinecraftAdapter(config);
const controller = new Controller(
  adapter,
  createBrain(),
  memory,
  (text) => adapter.say(text),
  config.timeout,
);
bindChatSession(adapter.bot, controller, config, {
  ready(respawned) {
    console.log(
      `Connected to ${config.host}:${config.port} as ${adapter.bot.username}`,
    );
    adapter.say(
      respawned
        ? "我重生了，之前的任务已取消。想继续的话，重新叫我跟着你吧。"
        : `我来了！输入 ${config.prefix} 帮助 / help 看看可以一起做什么。`,
    );
  },
  error(error) {
    console.error(
      "Command failed:",
      error instanceof Error ? error.message : error,
    );
  },
});
adapter.bot.on("kicked", (reason) => console.error("Kicked:", reason));
adapter.bot.on("error", (error) =>
  console.error(
    "连接出了问题：",
    connectionHint(error),
    "\n详细错误：",
    error.message,
  ),
);
adapter.bot.on("end", () => {
  console.log("Disconnected. Restart to reconnect.");
  process.exitCode = 1;
});
for (const signal of ["SIGINT", "SIGTERM"] as const)
  process.on(signal, () => {
    void adapter.stop().finally(() => adapter.bot.quit("Shutting down"));
  });
