import { existsSync } from "node:fs";
import { loadConfig } from "../src/config";
import { connectionHint, probeConnection } from "../src/setup/diagnostics";

async function main() {
  if (!existsSync(".env"))
    console.log(
      "还没有 .env；本次使用本机默认地址。可以先运行 npm run setup。",
    );
  const config = loadConfig();
  console.log("配置格式正常。正在检查服务器能否接受连接……");
  try {
    await probeConnection(config.host, config.port);
  } catch (error) {
    console.error(connectionHint(error));
    process.exitCode = 1;
    return;
  }
  console.log(
    `服务器端口可以连接。下一步运行 npm run dev，在游戏里输入 ${config.prefix} 帮助。`,
  );
  console.log(
    "这个检查只确认网络连接，不验证 Minecraft 版本、账号权限或服务器白名单。",
  );
  if (
    process.env.BRAIN_PROVIDER === "openai-compatible" &&
    !process.env.LLM_API_KEY
  )
    console.log("没有填写模型密钥，会使用基础聊天模式；游戏指令仍能使用。");
}
void main().catch((error) => {
  console.error(
    `配置检查失败：${error instanceof Error ? error.message : "请检查 .env"}`,
  );
  process.exitCode = 1;
});
