import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";
import { createConfigFile, type SetupAnswers } from "../src/setup/config-file";

async function main() {
  const target = resolve(".env");
  if (existsSync(target)) {
    console.log(
      "已有 .env 配置，我会保留它。要调整服务器信息，请直接编辑这个文件。",
    );
    return;
  }
  const answers: SetupAnswers = {
    host: "127.0.0.1",
    port: "25565",
    username: "OpenSquad",
    auth: "offline",
    player: "",
  };
  if (!process.argv.includes("--defaults")) {
    if (!stdin.isTTY)
      throw new Error(
        "请在交互终端运行；要生成本机默认配置，使用 npm run setup -- --defaults。",
      );
    const reader = createInterface({ input: stdin, output: stdout });
    console.log(
      "填写几项信息，就能叫队友进服。按回车使用括号中的默认值；这里不需要模型密钥。",
    );
    try {
      answers.host =
        (await reader.question("服务器地址 (127.0.0.1)：")).trim() ||
        answers.host;
      answers.port =
        (
          await reader.question(
            "服务器端口 (25565，局域网开放请填游戏显示的端口)：",
          )
        ).trim() || answers.port;
      answers.auth =
        (
          await reader.question(
            "登录方式 (offline 本地测试 / microsoft 正版账号，默认 offline)：",
          )
        ).trim() || answers.auth;
      answers.username =
        (
          await reader.question(
            answers.auth === "microsoft"
              ? "机器人账号标识（如登录邮箱）："
              : "机器人游戏名 (OpenSquad)：",
          )
        ).trim() || answers.username;
      answers.player = (
        await reader.question("你的游戏名（留空允许同服所有玩家指挥）：")
      ).trim();
    } finally {
      reader.close();
    }
  }
  createConfigFile(
    readFileSync(resolve(__dirname, "../.env.example"), "utf8"),
    target,
    answers,
  );
  console.log(
    "已创建 .env。先启动你的 Minecraft Java 服务器，然后执行 npm run doctor 检查连接，再用 npm run dev 叫队友进服。",
  );
  if (answers.auth === "offline")
    console.log(
      "offline 用于隔离的本地测试服；需要正版登录的服务器请使用 microsoft。",
    );
}
void main().catch((error) => {
  console.error(
    `配置没有完成：${error instanceof Error ? error.message : "请检查输入"}`,
  );
  process.exitCode = 1;
});
