import type { Bot } from "mineflayer";

export function hasClearAttackLine(bot: Bot, target: Bot["entity"]): boolean {
  const origin = bot.entity.position.offset(0, bot.entity.height * 0.9, 0);
  const end = target.position.offset(0, target.height * 0.5, 0);
  const direction = end.minus(origin);
  const distance = direction.norm();
  if (!Number.isFinite(distance)) return false;
  if (distance === 0) return false;
  const unit = direction.normalize();
  // Unknown chunks cannot establish a clear line. Raycasting alone skips unloaded blocks.
  const crossings = [0, 1];
  for (const axis of ["x", "y", "z"] as const) {
    if (direction[axis] === 0) continue;
    const low = Math.min(origin[axis], end[axis]);
    const high = Math.max(origin[axis], end[axis]);
    for (let boundary = Math.floor(low) + 1; boundary < high; boundary++)
      crossings.push((boundary - origin[axis]) / direction[axis]);
  }
  crossings.sort((a, b) => a - b);
  for (let i = 1; i < crossings.length; i++) {
    const middle = (crossings[i - 1] + crossings[i]) / 2;
    if (!bot.blockAt(origin.plus(direction.scaled(middle)))) return false;
  }
  if (!bot.blockAt(origin)) return false;
  if (!bot.blockAt(end)) return false;
  return bot.world.raycast(origin, unit, distance) === null;
}
