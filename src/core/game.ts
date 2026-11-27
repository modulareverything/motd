import type { Cache } from "./cache";

export type Status = "upcoming" | "live" | "finished";

export interface Watch {
  url: string;
  label: string;
}

// Rendered as-is, so a game must never put a result in any of these fields.
export interface Match {
  status: Status;
  start: Date;
  title: string;
  detail: string;
  favourite: boolean;
  score: number;
  watch(): Promise<Watch | undefined>;
}

export interface Context {
  contact: string;
  cache: Cache;
  env: Record<string, string | undefined>;
  warn(message: string): void;
  /** Says what is loading, on one line that the next call replaces. */
  progress(message: string): void;
}

/** Finished matches from `from` on, live matches, and matches due to start by `to`. */
export interface Window {
  now: Date;
  from: Date;
  to: Date;
}

export type Ask = (question: string) => string;

export interface Game {
  credit: string;
  /** Asks the game's setup questions and returns its section of the config. */
  setup(ctx: Context, ask: Ask): Promise<unknown>;
  matches(ctx: Context, config: unknown, window: Window): Promise<Match[]>;
}
