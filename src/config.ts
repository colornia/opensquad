import "dotenv/config";
import { isIP } from "node:net";
function integer(
  name: string,
  fallback: number,
  min: number,
  max: number,
  env: NodeJS.ProcessEnv,
): number {
  const n = Number(env[name] ?? fallback);
  if (!Number.isInteger(n) || n < min || n > max)
    throw new Error(`Invalid ${name}`);
  return n;
}
export function loadConfig(env: NodeJS.ProcessEnv = process.env) {
  const auth = env.MC_AUTH ?? "offline";
  if (auth !== "offline" && auth !== "microsoft")
    throw new Error("MC_AUTH must be offline or microsoft");
  const host = (env.MC_HOST ?? "127.0.0.1").trim();
  if (!isIP(host) && !/^[a-zA-Z0-9](?:[a-zA-Z0-9.-]*[a-zA-Z0-9])?$/.test(host))
    throw new Error("MC_HOST must be an IP address or hostname");
  const username = (env.MC_USERNAME ?? "OpenSquad").trim();
  if (
    auth === "offline"
      ? !/^[a-zA-Z0-9_]{3,16}$/.test(username)
      : !username || /[\s#=]/.test(username)
  )
    throw new Error("Invalid MC_USERNAME");
  const prefix = (env.COMMAND_PREFIX ?? "!bot").trim();
  if (!prefix || /[\r\n]/.test(prefix))
    throw new Error("COMMAND_PREFIX must not be empty");
  return {
    host,
    port: integer("MC_PORT", 25565, 1, 65535, env),
    username,
    auth: auth as "offline" | "microsoft",
    version: env.MC_VERSION || undefined,
    prefix,
    allowedPlayers: (env.ALLOWED_PLAYERS ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
    memoryPath: env.MEMORY_PATH ?? "data/memory.json",
    authCachePath: "data/auth-cache",
    collectRadius: integer("COLLECT_RADIUS", 32, 1, 64, env),
    maxCollect: integer("MAX_COLLECT", 16, 1, 64, env),
    timeout: integer("ACTION_TIMEOUT_MS", 45000, 1000, 300000, env),
    hostileRadius: integer("HOSTILE_RADIUS", 12, 1, 32, env),
  };
}
export type Config = ReturnType<typeof loadConfig>;
