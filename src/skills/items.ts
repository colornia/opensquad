// Display and chat aliases only; collection sources remain explicit in the adapter.
const names: Record<string, string> = {
  oak_log: "橡木原木",
  birch_log: "白桦木原木",
  spruce_log: "云杉木原木",
  dirt: "泥土",
  sand: "沙子",
  cobblestone: "圆石",
  coal: "煤炭",
  raw_iron: "粗铁",
  diamond: "钻石",
  torch: "火把",
  bread: "面包",
  apple: "苹果",
  cooked_beef: "牛排",
  shield: "盾牌",
  iron_ingot: "铁锭",
  stick: "木棍",
};
const materials = {
  wooden: "木",
  stone: "石",
  iron: "铁",
  golden: "金",
  diamond: "钻石",
  netherite: "下界合金",
};
const tools = { pickaxe: "镐", axe: "斧", shovel: "铲", sword: "剑" };
for (const [material, prefix] of Object.entries(materials))
  for (const [tool, suffix] of Object.entries(tools))
    names[`${material}_${tool}`] = `${prefix}${suffix}`;

export const itemAliases: Readonly<Record<string, string>> = Object.freeze({
  ...Object.fromEntries(
    Object.entries(names).map(([item, name]) => [name, item]),
  ),
  橡木: "oak_log",
  白桦木: "birch_log",
  云杉木: "spruce_log",
});
export function chineseItemName(item: string): string {
  return Object.hasOwn(names, item) ? names[item] : item;
}
