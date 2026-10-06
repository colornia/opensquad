import { chineseItemName } from "../skills/items";
export { chineseItemName } from "../skills/items";

export function isChinese(text: string) {
  return /[\u3400-\u9fff]/u.test(text);
}
// Translate deterministic skill results; model-generated conversation keeps its own language.
export function chineseReply(text: string): string {
  const fixed: Record<string, string> = {
    "Stopped.": "好，停下了。",
    "I am busy. Say stop before another command.":
      "我还在做上一件事。要换任务的话，先叫我停下。",
    "I will remember that.": "记住了，下次还可以问我。",
    "Action stopped or timed out.": "动作已中断，或等待超时。",
    "The action timed out. Finishing cleanup before another task.":
      "这件事等太久了，我正在收尾。收尾完成后才能接新任务。",
    "Couldn't stop cleanly. Wait for the current action or reconnect.":
      "这次没能确认停稳，先等当前动作结束；仍然卡住的话，请重新连接机器人。",
    "Attacking nearby hostile mobs. Say stop to finish.":
      "我去应付附近的怪物，想结束就叫我停下。",
    "I need a suitable tool in my inventory.":
      "这个资源需要合适的工具，先把镐丢给我吧。",
    "You moved away; come closer for the handoff.":
      "你走远了，靠近一点，我再把东西给你。",
    "No path to the goal!":
      "这条路走不过去。换个开阔的位置，或者靠近一点再叫我。",
    "Took to long to decide path to goal!":
      "这里的路线太复杂，暂时没找到路。换个开阔的位置再试试。",
    "I couldn't reach that spot. Try moving to an open area.":
      "我还没走到那里。换个开阔的位置再叫我吧。",
    "Bot does not have a harvestable tool!":
      "我缺少能采集这个资源的工具，先把合适的镐丢给我。",
    "There are no defined chest locations!":
      "背包可能已经满了。先让我把一些物品给你，再继续采集。",
    "Block not in view": "暂时看不到要挖的方块。走近资源、等区块加载后再试。",
    "Digging aborted": "挖掘中断了，确认资源还在附近后可以重新叫我采集。",
    "The goal was changed before it could be completed!":
      "路线已经改变，这次没走到目标。等我停稳后重新发指令吧。",
    "Path was stopped before it could be completed! Thus, the desired goal was not reached.":
      "移动中断了，这次还没走到目标。等我停稳后再试。",
    "Collect supports oak_log, birch_log, spruce_log, dirt, sand, cobblestone, coal, raw_iron, diamond.":
      "现在能收集橡木、白桦木、云杉木、泥土、沙子、圆石、煤炭、粗铁和钻石。",
  };
  if (Object.hasOwn(fixed, text)) return fixed[text];
  const patterns: [RegExp, (...parts: string[]) => string][] = [
    [
      /^Server (?:didn't respond to|rejected) transaction for clicking on slot \d+ on window with id \d+\.$/,
      () => "服务器没有确认这次物品操作。先查看背包，确认实际数量后再试。",
    ],
    [/^Following (.+)\.$/, (name) => `跟上了，${name}。`],
    [/^I'm here, (.+)\.$/, (name) => `到了，${name}。`],
    [
      /^Protecting (.+) from nearby hostile mobs\. Say stop to finish\.$/,
      (name) => `我跟着保护你，${name}。想结束就叫我停下。`,
    ],
    [
      /^Collected (\d+) (.+) \(requested (\d+)\)\.$/,
      (n, item, wanted) =>
        `收集到了 ${n} 个 ${chineseItemName(item)}，目标是 ${wanted} 个。`,
    ],
    [
      /^Dropped (\d+) (.+) beside (.+); pick it up\.$/,
      (n, item, name) =>
        `把 ${n} 个 ${chineseItemName(item)} 放在 ${name} 身边了，记得捡。`,
    ],
    [
      /^(.+) is not visible\. Move closer\.$/,
      (name) => `还看不到 ${name}，走近一点吧。`,
    ],
    [
      /^I have no (.+)\.$/,
      (item) => `我背包里还没有 ${chineseItemName(item)}。`,
    ],
    [
      /^No (.+) collected\. Check nearby sources, tools and inventory space\.$/,
      (item) =>
        `这次没有拿到${chineseItemName(item)}。看看附近有没有资源、工具是否合适，背包是否还有空位。`,
    ],
  ];
  for (const [pattern, format] of patterns) {
    const match = text.match(pattern);
    if (match) return format(...match.slice(1));
  }
  if (text.startsWith("Couldn't finish: "))
    return `没做完：${chineseReply(text.slice("Couldn't finish: ".length))}`;
  return text;
}
