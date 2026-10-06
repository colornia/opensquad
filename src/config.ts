import "dotenv/config";
import { isIP } from "node:net";
export class ConfigurationError extends Error {
  constructor(
    public setting: string,
    public hint: string,
  ) {
    super(`Invalid ${setting}`);
    this.name = "ConfigurationError";
  }
}
function integer(
  name: string,
  fallback: number,
  min: number,
  max: number,
  env: NodeJS.ProcessEnv,
): number {
  const n = Number(env[name] ?? fallback);
  if (!Number.isInteger(n) || n < min || n > max)
    throw new ConfigurationError(name, `请填入 ${min} 到 ${max} 之间的整数。`);
  return n;
}
export function loadConfig(env: NodeJS.ProcessEnv = process.env) {
  const auth = env.MC_AUTH ?? "offline";
  if (auth !== "offline" && auth !== "microsoft")
    throw new ConfigurationError(
      "MC_AUTH",
      "登录方式只能是 offline 或 microsoft。",
    );
  const host = (env.MC_HOST ?? "127.0.0.1").trim();
  if (!isIP(host) && !/^[a-zA-Z0-9](?:[a-zA-Z0-9.-]*[a-zA-Z0-9])?$/.test(host))
    throw new ConfigurationError(
      "MC_HOST",
      "请填写 IP 地址或主机名，例如 127.0.0.1 或 localhost，不要包含端口或网址协议。",
    );
  const username = (env.MC_USERNAME ?? "OpenSquad").trim();
  if (
    auth === "offline"
      ? !/^[a-zA-Z0-9_]{3,16}$/.test(username)
      : !username || /[\s#=]/.test(username)
  )
    throw new ConfigurationError(
      "MC_USERNAME",
      auth === "offline"
        ? "离线角色名需要 3 到 16 个英文字母、数字或下划线。"
        : "请填写非空的正版登录账号标识，不要包含空格、井号或等号。",
    );
  const prefix = (env.COMMAND_PREFIX ?? "!bot").trim();
  if (!prefix || /[\r\n]/.test(prefix))
    throw new ConfigurationError(
      "COMMAND_PREFIX",
      "指令前缀不能为空或包含换行，可以使用 !bot。",
    );
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
