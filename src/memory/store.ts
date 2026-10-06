import {
  mkdirSync,
  readFileSync,
  writeFileSync,
  renameSync,
  rmSync,
} from "node:fs";
import { dirname } from "node:path";
export interface PlayerMemory {
  preferences: string[];
  events: { at: string; text: string }[];
}
export class MemoryReadError extends Error {
  constructor(
    public reason: "unreadable" | "invalid",
    cause?: unknown,
  ) {
    super(
      reason === "invalid"
        ? "Invalid memory file"
        : "Memory file could not be read",
      { cause },
    );
    this.name = "MemoryReadError";
  }
}
export class MemoryWriteError extends Error {
  constructor(cause: unknown) {
    super(
      "Memory could not be saved. Check storage permissions and available space.",
      { cause },
    );
    this.name = "MemoryWriteError";
  }
}
export class MemoryStore {
  private data: Record<string, PlayerMemory> = Object.create(null);
  constructor(private path: string) {
    let content: string;
    try {
      content = readFileSync(path, "utf8");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return;
      throw new MemoryReadError("unreadable", error);
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(content);
    } catch (error) {
      throw new MemoryReadError("invalid", error);
    }
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
      throw new MemoryReadError("invalid");
    for (const [name, value] of Object.entries(parsed)) {
      const p = value as PlayerMemory;
      if (
        !p ||
        typeof p !== "object" ||
        !Array.isArray(p.preferences) ||
        !p.preferences.every((x) => typeof x === "string") ||
        !Array.isArray(p.events) ||
        !p.events.every(
          (x) =>
            x !== null &&
            typeof x === "object" &&
            typeof x.at === "string" &&
            typeof x.text === "string",
        )
      )
        throw new MemoryReadError("invalid");
      this.data[name] = {
        preferences: p.preferences.slice(-20),
        events: p.events.slice(-50),
      };
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
  forget(player: string) {
    const next = this.snapshot();
    delete next[player];
    this.persist(next);
  }
  private save(player: string, p: PlayerMemory) {
    const next = this.snapshot();
    next[player] = p;
    this.persist(next);
  }
  private snapshot(): Record<string, PlayerMemory> {
    return Object.assign(Object.create(null), this.data);
  }
  private persist(next: Record<string, PlayerMemory>) {
    try {
      mkdirSync(dirname(this.path), { recursive: true });
      writeFileSync(`${this.path}.tmp`, JSON.stringify(next, null, 2), {
        mode: 0o600,
      });
      renameSync(`${this.path}.tmp`, this.path);
      this.data = next;
    } catch (error) {
      try {
        rmSync(`${this.path}.tmp`, { force: true });
      } catch {}
      throw new MemoryWriteError(error);
    }
  }
}
