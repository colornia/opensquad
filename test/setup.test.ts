import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { execFileSync } from "node:child_process";
import { createServer } from "node:net";
import { loadConfig } from "../src/config";
import { createConfigFile } from "../src/setup/config-file";
import { probeConnection, connectionHint } from "../src/setup/diagnostics";

test("setup creates a usable config and preserves an existing one", () => {
  const dir = mkdtempSync(join(tmpdir(), "opensquad-setup-"));
  try {
    const path = join(dir, ".env");
    const template = readFileSync(".env.example", "utf8");
    const answers = {
      host: "127.0.0.1",
      port: "25565",
      username: "OpenSquad",
      auth: "offline",
      player: "Alex",
    };
    createConfigFile(template, path, answers);
    const before = readFileSync(path, "utf8");
    assert.match(before, /ALLOWED_PLAYERS=Alex/);
    assert.match(before, /LLM_API_KEY=\s*$/m);
    assert.throws(
      () => createConfigFile(template, path, { ...answers, host: "localhost" }),
      /EEXIST/,
    );
    assert.equal(readFileSync(path, "utf8"), before);
    assert.throws(() =>
      createConfigFile(template, join(dir, "bad.env"), {
        ...answers,
        host: "localhost\nLLM_API_KEY=anything",
      }),
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
test("configuration rejects empty prefixes, bad ports and invalid offline names", () => {
  assert.throws(() => loadConfig({ COMMAND_PREFIX: "" }), /COMMAND_PREFIX/);
  assert.throws(() => loadConfig({ MC_PORT: "70000" }), /MC_PORT/);
  assert.throws(
    () => loadConfig({ MC_USERNAME: "name with spaces" }),
    /MC_USERNAME/,
  );
  assert.equal(
    loadConfig({ MC_AUTH: "microsoft", MC_USERNAME: "player@example.invalid" })
      .auth,
    "microsoft",
  );
  assert.equal(loadConfig({ MC_HOST: "::1" }).host, "::1");
});
test("setup CLI can create defaults without credentials and refuses to overwrite", () => {
  const dir = mkdtempSync(join(tmpdir(), "opensquad-cli-"));
  try {
    const args = [
      resolve("node_modules/tsx/dist/cli.mjs"),
      resolve("scripts/setup.ts"),
      "--defaults",
    ];
    const output = execFileSync(process.execPath, args, {
      cwd: dir,
      encoding: "utf8",
    });
    assert.match(output, /已创建/);
    const before = readFileSync(join(dir, ".env"), "utf8");
    assert.match(
      execFileSync(process.execPath, args, { cwd: dir, encoding: "utf8" }),
      /已有/,
    );
    assert.equal(readFileSync(join(dir, ".env"), "utf8"), before);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
test("network diagnostic distinguishes reachable and refused ports", async () => {
  const server = createServer((socket) => socket.end());
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  try {
    await probeConnection("127.0.0.1", address.port);
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
  await assert.rejects(probeConnection("127.0.0.1", address.port), (error) =>
    connectionHint(error).includes("没有接受连接"),
  );
  assert.match(connectionHint({ code: "ETIMEDOUT" }), /超时/);
  assert.match(connectionHint({ code: "ENOTFOUND" }), /无法解析/);
});
