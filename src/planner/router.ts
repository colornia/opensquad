export type Intent =
  | {
      kind:
        "follow" | "stop" | "come" | "protect" | "attack" | "help" | "recall";
    }
  | { kind: "collect" | "give"; item: string; count: number }
  | { kind: "remember"; preference: string }
  | { kind: "chat"; text: string };
export function route(text: string): Intent {
  const s = text.trim().replace(/[.!?]+$/, "");
  if (/^(follow( me)?|跟着我|跟随我)$/i.test(s)) return { kind: "follow" };
  if (/^(stop|停止|停下)$/i.test(s)) return { kind: "stop" };
  if (/^(come( here)?|过来|来这里)$/i.test(s)) return { kind: "come" };
  if (/^(protect( me)?|保护我)$/i.test(s)) return { kind: "protect" };
  if (/^(attack( nearby( hostile)? mobs)?|攻击)$/i.test(s))
    return { kind: "attack" };
  if (/^(help|帮助)$/i.test(s)) return { kind: "help" };
  if (/^(memory|回忆)$/i.test(s)) return { kind: "recall" };
  const remember = s.match(/^(?:remember|记住)\s+(.+)$/i);
  if (remember)
    return { kind: "remember", preference: remember[1].slice(0, 200) };
  const m = s.match(
    /^(collect|give(?: me)?)\s+([a-z][a-z0-9_ ]*?)(?:\s+(\d+))?$/i,
  );
  if (m)
    return {
      kind: m[1].toLowerCase() === "collect" ? "collect" : "give",
      item: m[2].trim().toLowerCase().replace(/\s+/g, "_"),
      count: Math.max(1, Math.min(64, Number(m[3] ?? 1))),
    };
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
