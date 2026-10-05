import {
  mkdirSync,
  readFileSync,
  writeFileSync,
  renameSync,
  existsSync,
} from "node:fs";
import { dirname } from "node:path";
export interface PlayerMemory {
  preferences: string[];
  events: { at: string; text: string }[];
}
export class MemoryStore {
  private data: Record<string, PlayerMemory> = Object.create(null);
  constructor(private path: string) {
    if (existsSync(path)) {
      const parsed: unknown = JSON.parse(readFileSync(path, "utf8"));
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
        throw new Error("Invalid memory file");
      for (const [name, value] of Object.entries(parsed)) {
        const p = value as PlayerMemory;
        if (
          !Array.isArray(p.preferences) ||
          !p.preferences.every((x) => typeof x === "string") ||
          !Array.isArray(p.events) ||
          !p.events.every(
            (x) => typeof x.at === "string" && typeof x.text === "string",
          )
        )
          throw new Error("Invalid memory record");
        this.data[name] = p;
      }
    }
  }
  get(player: string): PlayerMemory {
    return structuredClone(
      this.data[player] ?? { preferences: [], events: [] },
    );
  }
  remember(player: string, text: string) {
    const p = this.get(player);
    p.preferences = [...new Set([...p.preferences, text])].slice(-20);
    this.save(player, p);
  }
  event(player: string, text: string) {
    const p = this.get(player);
    p.events.push({ at: new Date().toISOString(), text });
    p.events = p.events.slice(-50);
    this.save(player, p);
  }
  private save(player: string, p: PlayerMemory) {
    this.data[player] = p;
    mkdirSync(dirname(this.path), { recursive: true });
    writeFileSync(`${this.path}.tmp`, JSON.stringify(this.data, null, 2));
    renameSync(`${this.path}.tmp`, this.path);
  }
}
