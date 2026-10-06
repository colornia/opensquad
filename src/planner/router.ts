import { itemAliases } from "../skills/items";

export type Intent =
  | {
      kind:
        | "follow"
        | "stop"
        | "come"
        | "protect"
        | "attack"
        | "help"
        | "recall"
        | "forget";
    }
  | { kind: "status" | "inventory" }
  | { kind: "invalid"; message: string }
  | { kind: "collect" | "give"; item: string; count: number }
  | { kind: "remember"; preference: string }
  | { kind: "chat"; text: string };
const compactItem = new RegExp(
  `^(?:帮我)?(收集|采集|给我)\\s*(?:(-?\\d+)\\s*个?\\s*)?(${Object.keys(
    itemAliases,
  )
    .sort((a, b) => b.length - a.length)
    .join("|")})\\s*(?:(-?\\d+)\\s*个?)?$`,
);
function resourceIntent(
  kind: "collect" | "give",
  item: string,
  quantity?: string,
  chinese = false,
): Intent {
  const count = Number(quantity ?? 1);
  if (count <= 0)
    return {
      kind: "invalid",
      message: chinese
        ? "数量要是正整数，例如‘收集橡木3个’。"
        : "Use a positive whole number, for example collect oak_log 3.",
    };
  return { kind, item, count: Math.min(64, count) };
}
export function route(text: string): Intent {
  const s = text.trim().replace(/[.!?。！？]+$/, "");
  if (/^(follow( me)?|跟着我|跟随我)$/i.test(s)) return { kind: "follow" };
  if (/^(stop|停止|停下)$/i.test(s)) return { kind: "stop" };
  if (/^(come( here)?|过来|来这里)$/i.test(s)) return { kind: "come" };
  if (/^(protect( me)?|保护我)$/i.test(s)) return { kind: "protect" };
  if (/^(attack( nearby( hostile)? mobs)?|攻击)$/i.test(s))
    return { kind: "attack" };
  if (/^(help|帮助)$/i.test(s)) return { kind: "help" };
  if (/^(status|状态|你在干什么)$/i.test(s)) return { kind: "status" };
  if (/^(inventory|背包|背包里有什么)$/i.test(s)) return { kind: "inventory" };
  if (/^(memory|回忆)$/i.test(s)) return { kind: "recall" };
  if (/^(forget me|忘记我|删除我的记忆)$/i.test(s)) return { kind: "forget" };
  const remember = s.match(/^(?:remember|记住)\s+(.+)$/i);
  if (remember)
    return { kind: "remember", preference: remember[1].slice(0, 200) };
  const compact = s.match(compactItem);
  if (compact) {
    if (compact[2] && compact[4])
      return {
        kind: "invalid",
        message: "数量只写一次，例如‘给我3个泥土’或‘给我泥土3个’。",
      };
    return resourceIntent(
      compact[1] === "给我" ? "give" : "collect",
      itemAliases[compact[3]],
      compact[2] ?? compact[4],
      true,
    );
  }
  const chinese = s.match(
    /^(收集|采集|给我)\s+([^\s]+)(?:\s+(-?\d+)(?:个)?)?$/,
  );
  if (chinese) {
    return resourceIntent(
      chinese[1] === "给我" ? "give" : "collect",
      Object.hasOwn(itemAliases, chinese[2])
        ? itemAliases[chinese[2]]
        : chinese[2].toLowerCase(),
      chinese[3],
      true,
    );
  }
  const m = s.match(
    /^(collect|give(?: me)?)\s+([a-z][a-z0-9_ ]*?)(?:\s+(-?\d+))?$/i,
  );
  if (m)
    return resourceIntent(
      m[1].toLowerCase() === "collect" ? "collect" : "give",
      m[2].trim().toLowerCase().replace(/\s+/g, "_"),
      m[3],
    );
  return { kind: "chat", text: text.slice(0, 500) };
}
export function addressed(
  message: string,
  prefix: string,
  username: string,
): string | null {
  for (const p of [prefix, `${username}:`])
    if (
      message.toLowerCase().startsWith(p.toLowerCase()) &&
      (p.endsWith(":") ||
        message.length === p.length ||
        /\s/.test(message[p.length]))
    )
      return message.slice(p.length).trim();
  return null;
}
