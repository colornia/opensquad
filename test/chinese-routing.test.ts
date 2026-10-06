import { test } from "node:test";
import assert from "node:assert/strict";
import { route } from "../src/planner/router";

test("Chinese resource commands accept compact writing and quantities on either side", () => {
  for (const command of [
    "收集橡木3个",
    "采集3个橡木",
    "帮我收集 3 个 橡木",
    "收集 橡木 3",
    "收集橡木原木3！",
  ])
    assert.deepEqual(route(command), {
      kind: "collect",
      item: "oak_log",
      count: 3,
    });
  for (const command of ["给我3个泥土", "给我泥土3个", "给我 泥土 3"])
    assert.deepEqual(route(command), { kind: "give", item: "dirt", count: 3 });
  assert.deepEqual(route("收集钻石"), {
    kind: "collect",
    item: "diamond",
    count: 1,
  });
  assert.deepEqual(route("收集白桦木原木999个"), {
    kind: "collect",
    item: "birch_log",
    count: 64,
  });
  assert.deepEqual(route("给我 music_disc_13"), {
    kind: "give",
    item: "music_disc_13",
    count: 1,
  });
});

test("invalid quantities are rejected and conversation mentioning a command stays conversation", () => {
  for (const command of [
    "收集3个橡木2个",
    "给我3个泥土3个",
    "收集橡木0个",
    "给我-2个泥土",
    "collect dirt 0",
    "give me dirt -1",
  ])
    assert.equal(route(command).kind, "invalid", command);
  for (const text of [
    "能帮我收集橡木吗",
    "我喜欢收集橡木3个",
    "收集橡木3个然后保护我",
  ])
    assert.equal(route(text).kind, "chat", text);
});
