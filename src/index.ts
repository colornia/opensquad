import { loadConfig } from "./config";
import { MinecraftAdapter } from "./minecraft/adapter";
import { createBrain } from "./brain";
import { MemoryStore } from "./memory/store";
import { Controller } from "./planner/controller";
import { addressed } from "./planner/router";
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
let ready = false;
adapter.bot.on("spawn", () => {
  ready = true;
  console.log(
    `Connected to ${config.host}:${config.port} as ${config.username}`,
  );
  adapter.say(`我来了！输入 ${config.prefix} 帮助 / help 看看可以一起做什么。`);
});
adapter.bot.on("death", () => {
  ready = false;
});
adapter.bot.on("chat", (player, message) => {
  if (
    !ready ||
    player === adapter.bot.username ||
    (config.allowedPlayers.length && !config.allowedPlayers.includes(player))
  )
    return;
  const text = addressed(message, config.prefix, config.username);
  if (text === null) return;
  void controller
    .handle(player, text)
    .catch((error) => console.error("Command failed:", error.message));
});
adapter.bot.on("kicked", (reason) => console.error("Kicked:", reason));
adapter.bot.on("error", (error) =>
  console.error("Connection error:", error.message),
);
adapter.bot.on("end", () => {
  ready = false;
  console.log("Disconnected. Restart to reconnect.");
  process.exitCode = 1;
});
for (const signal of ["SIGINT", "SIGTERM"] as const)
  process.on(signal, () => {
    void adapter.stop().finally(() => adapter.bot.quit("Shutting down"));
  });
