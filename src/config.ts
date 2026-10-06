import "dotenv/config";
function integer(
  name: string,
  fallback: number,
  min: number,
  max: number,
): number {
  const n = Number(process.env[name] ?? fallback);
  if (!Number.isInteger(n) || n < min || n > max)
    throw new Error(`Invalid ${name}`);
  return n;
}
export function loadConfig() {
  const auth = process.env.MC_AUTH ?? "offline";
  if (auth !== "offline" && auth !== "microsoft")
    throw new Error("MC_AUTH must be offline or microsoft");
  return {
    host: process.env.MC_HOST ?? "127.0.0.1",
    port: integer("MC_PORT", 25565, 1, 65535),
    username: process.env.MC_USERNAME ?? "OpenSquad",
    auth: auth as "offline" | "microsoft",
    version: process.env.MC_VERSION || undefined,
    prefix: process.env.COMMAND_PREFIX ?? "!bot",
    allowedPlayers: (process.env.ALLOWED_PLAYERS ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
    memoryPath: process.env.MEMORY_PATH ?? "data/memory.json",
    authCachePath: "data/auth-cache",
    collectRadius: integer("COLLECT_RADIUS", 32, 1, 64),
    maxCollect: integer("MAX_COLLECT", 16, 1, 64),
    timeout: integer("ACTION_TIMEOUT_MS", 45000, 1000, 300000),
    hostileRadius: integer("HOSTILE_RADIUS", 12, 1, 32),
  };
}
export type Config = ReturnType<typeof loadConfig>;
