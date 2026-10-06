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
    "Attacking nearby hostile mobs. Say stop to finish.":
      "我去应付附近的怪物，想结束就叫我停下。",
    "I need a suitable tool in my inventory.":
      "这个资源需要合适的工具，先把镐丢给我吧。",
    "You moved away; come closer for the handoff.":
      "你走远了，靠近一点，我再把东西给你。",
    "Collect supports oak_log, birch_log, spruce_log, dirt, sand, cobblestone, coal, raw_iron, diamond.":
      "现在能收集橡木、白桦木、云杉木、泥土、沙子、圆石、煤炭、粗铁和钻石。",
  };
  if (Object.hasOwn(fixed, text)) return fixed[text];
  const patterns: [RegExp, (...parts: string[]) => string][] = [
    [/^Following (.+)\.$/, (name) => `跟上了，${name}。`],
    [/^I'm here, (.+)\.$/, (name) => `到了，${name}。`],
    [
      /^Protecting (.+) from nearby hostile mobs\. Say stop to finish\.$/,
      (name) => `我跟着保护你，${name}。想结束就叫我停下。`,
    ],
    [
      /^Collected (\d+) (.+) \(requested (\d+)\)\.$/,
      (n, item, wanted) => `收集到了 ${n} 个 ${item}，目标是 ${wanted} 个。`,
    ],
    [
      /^Dropped (\d+) (.+) beside (.+); pick it up\.$/,
      (n, item, name) => `把 ${n} 个 ${item} 放在 ${name} 身边了，记得捡。`,
    ],
    [
      /^(.+) is not visible\. Move closer\.$/,
      (name) => `还看不到 ${name}，走近一点吧。`,
    ],
    [/^I have no (.+)\.$/, (item) => `我背包里还没有 ${item}。`],
  ];
  for (const [pattern, format] of patterns) {
    const match = text.match(pattern);
    if (match) return format(...match.slice(1));
  }
  if (text.startsWith("Couldn't finish: "))
    return `没做完：${chineseReply(text.slice("Couldn't finish: ".length))}`;
  return text;
}
