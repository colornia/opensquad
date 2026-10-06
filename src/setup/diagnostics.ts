import { createConnection } from "node:net";
import { ConfigurationError } from "../config";
import { MemoryReadError } from "../memory/store";

export function startupHint(error: unknown): string {
  if (error instanceof ConfigurationError)
    return `配置项 ${error.setting} 不正确。${error.hint} 修改 .env 后运行 npm run doctor 再检查。`;
  if (error instanceof MemoryReadError)
    return error.reason === "invalid"
      ? "记忆文件格式不正确，已经停止启动，原文件没有改写。先备份 MEMORY_PATH 指定的文件，再修复内容或换用新的记忆文件。"
      : "记忆文件无法读取，已经停止启动。先备份 MEMORY_PATH 指定的文件，检查读取权限、文件类型和存储状态后重试。";
  return "机器人还没能启动。先运行 npm run doctor 检查配置与连接，再核对 MC_VERSION 和登录方式。";
}

export function connectionHint(error: unknown): string {
  const code = (error as { code?: string })?.code;
  if (code === "ECONNREFUSED")
    return "服务器没有接受连接。确认它已经启动，并检查 .env 的地址和端口；局域网开放的端口可能每次变化。";
  if (code === "ENOTFOUND" || code === "EAI_AGAIN")
    return "服务器地址暂时无法解析。检查 MC_HOST 的拼写和网络连接。";
  if (code === "ETIMEDOUT" || code === "EHOSTUNREACH" || code === "ENETUNREACH")
    return "连接超时或网络不可达。检查服务器是否在线、地址是否正确，以及防火墙是否允许连接。";
  return "请核对服务器版本、登录方式和白名单；详细错误留在本机终端，分享日志前删除私人信息。";
}
export function probeConnection(
  host: string,
  port: number,
  timeout = 3000,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const socket = createConnection({ host, port });
    socket.setTimeout(timeout);
    socket.once("connect", () => {
      socket.destroy();
      resolve();
    });
    socket.once("error", (error) => {
      socket.destroy();
      reject(error);
    });
    socket.once("timeout", () => {
      socket.destroy();
      reject(
        Object.assign(new Error("Connection timed out"), { code: "ETIMEDOUT" }),
      );
    });
  });
}
