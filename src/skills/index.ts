export interface Skills {
  inventory?(): { name: string; count: number }[];
  stop(): Promise<void>;
  follow(player: string): Promise<string>;
  come(player: string): Promise<string>;
  collect(item: string, count: number, signal: AbortSignal): Promise<string>;
  give(
    player: string,
    item: string,
    count: number,
    signal: AbortSignal,
  ): Promise<string>;
  protect(player: string): Promise<string>;
  attack(): Promise<string>;
}
