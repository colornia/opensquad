import { test } from "node:test";
import assert from "node:assert/strict";
import { itemAliases, chineseItemName } from "../src/skills/items";
import { route } from "../src/planner/router";
import { chineseReply } from "../src/planner/language";

test("Chinese handoff names resolve to real registry items and keep unknown names intact", () => {
  const registry = require("minecraft-data")("1.18.2");
  for (const [name, item] of Object.entries(itemAliases)) {
    assert.ok(registry.itemsByName[item], `${name} maps to a valid item`);
    for (const command of [
      `给我${name}2个`,
      `给我2个${name}`,
      `给我 ${name} 2`,
    ])
      assert.deepEqual(route(command), { kind: "give", item, count: 2 });
  }
  assert.equal(chineseItemName("netherite_pickaxe"), "下界合金镐");
  assert.equal(chineseItemName("music_disc_13"), "music_disc_13");
  assert.equal(route("给我石镐0个").kind, "invalid");
  assert.equal(route("给我2个面包3个").kind, "invalid");
  assert.equal(route("我想给我石镐这条指令加个别名").kind, "chat");
  assert.match(
    chineseReply("Dropped 1 stone_pickaxe beside Alex; pick it up."),
    /石镐/,
  );
});

test("known plugin failures provide Chinese recovery hints without changing other replies", () => {
  for (const [message, hint] of [
    ["Block not in view", "区块加载"],
    ["Digging aborted", "重新叫我采集"],
    ["The goal was changed before it could be completed!", "重新发指令"],
    [
      "Path was stopped before it could be completed! Thus, the desired goal was not reached.",
      "还没走到目标",
    ],
    [
      "Server didn't respond to transaction for clicking on slot 36 on window with id 0.",
      "查看背包",
    ],
    [
      "Server rejected transaction for clicking on slot 36 on window with id 0.",
      "实际数量",
    ],
  ])
    assert.ok(
      chineseReply(`Couldn't finish: ${message}`).includes(hint),
      message,
    );
  assert.equal(
    chineseReply("A custom adapter message."),
    "A custom adapter message.",
  );
});
