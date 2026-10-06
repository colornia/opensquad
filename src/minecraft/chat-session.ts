import type { Bot } from "mineflayer";
import type { Config } from "../config";
import type { Controller } from "../planner/controller";
import { addressed } from "../planner/router";

export function bindChatSession(
  bot: Pick<Bot, "on" | "removeListener" | "username">,
  controller: Pick<Controller, "handle" | "invalidate">,
  config: Pick<Config, "prefix" | "allowedPlayers">,
  callbacks: {
    ready?: (respawned: boolean) => void;
    error?: (error: unknown) => void;
  } = {},
) {
  let ready = false;
  let died = false;
  const onSpawn = () => {
    ready = true;
    const respawned = died;
    died = false;
    callbacks.ready?.(respawned);
  };
  const invalidate = () => {
    ready = false;
    controller.invalidate();
  };
  const onDeath = () => {
    died = true;
    invalidate();
  };
  const onChat = (player: string, message: string) => {
    if (
      !ready ||
      player === bot.username ||
      (config.allowedPlayers.length && !config.allowedPlayers.includes(player))
    )
      return;
    const text = addressed(message, config.prefix, bot.username);
    if (text === null) return;
    void controller.handle(player, text).catch((error: unknown) => {
      callbacks.error?.(error);
    });
  };
  bot.on("spawn", onSpawn);
  bot.on("death", onDeath);
  bot.on("respawn", invalidate);
  bot.on("end", invalidate);
  bot.on("chat", onChat);
  return () => {
    bot.removeListener("spawn", onSpawn);
    bot.removeListener("death", onDeath);
    bot.removeListener("respawn", invalidate);
    bot.removeListener("end", invalidate);
    bot.removeListener("chat", onChat);
    invalidate();
  };
}
