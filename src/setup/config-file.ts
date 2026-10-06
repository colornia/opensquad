import { writeFileSync } from "node:fs";
import { loadConfig } from "../config";

export interface SetupAnswers {
  host: string;
  port: string;
  username: string;
  auth: string;
  player: string;
}
export function createConfigFile(
  template: string,
  path: string,
  answers: SetupAnswers,
) {
  loadConfig({
    MC_HOST: answers.host,
    MC_PORT: answers.port,
    MC_USERNAME: answers.username,
    MC_AUTH: answers.auth,
  });
  if (answers.player && !/^[a-zA-Z0-9_]{3,16}$/.test(answers.player))
    throw new Error(
      "Player name must contain 3–16 letters, numbers or underscores",
    );
  const values: Record<string, string> = {
    MC_HOST: answers.host.trim(),
    MC_PORT: answers.port,
    MC_USERNAME: answers.username.trim(),
    MC_AUTH: answers.auth,
    ALLOWED_PLAYERS: answers.player,
  };
  const content = template.replace(
    /^(MC_HOST|MC_PORT|MC_USERNAME|MC_AUTH|ALLOWED_PLAYERS)=.*$/gm,
    (_line, key: string) => `${key}=${values[key]}`,
  );
  // Exclusive creation keeps an existing configuration, including any API key, untouched.
  writeFileSync(path, content, { flag: "wx", mode: 0o600 });
}
