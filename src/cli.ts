#!/usr/bin/env bun
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileCache } from "./core/cache";
import { type Config, configPath, loadConfig, saveConfig } from "./core/config";
import type { Ask, Context, Game, Window } from "./core/game";
import { rank, render, TOP } from "./core/list";
import { openUrl } from "./core/open";
import { spinner } from "./core/progress";
import { cs } from "./games/cs";

const games: Record<string, Game> = { cs };

const USAGE = `Usage:
  motd <game> [--all] [--refresh]   today's best matches, without spoilers
  motd setup <game>                 choose your teams

Games: ${Object.keys(games).join(", ")}
  --all       every match, not just the top ${TOP}
  --refresh   skip the 10-minute cache`;

const FINISHED_WINDOW_HOURS = 36;

/**
 * Loads the `.env` beside the tool rather than in the working directory, which is all Bun reads by itself.
 * 1Password Environments serves that file as a named pipe, which `Bun.file` hangs on, so it is read with `readFile`.
 * Values already set (for example by `op run`) win.
 */
async function loadEnv(): Promise<void> {
  let text: string;
  try {
    text = await readFile(join(import.meta.dir, "..", ".env"), "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return;
    throw error;
  }
  for (const line of text.split("\n")) {
    const m = line.match(
      /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/,
    );
    if (!m || process.env[m[1]!] !== undefined) continue;
    process.env[m[1]!] = m[2]!.replace(/^(["'])(.*)\1$/, "$2");
  }
}

const ask: Ask = (question) => prompt(question)?.trim() ?? "";

const progress = spinner();

function context(config: Config, refresh: boolean): Context {
  return {
    contact: config.core?.email ?? "",
    cache: fileCache(refresh),
    env: process.env,
    warn: progress.warn,
    progress: progress.update,
  };
}

async function setup(
  config: Config,
  name: string,
  game: Game,
): Promise<Config> {
  if (!config.core?.email) {
    const email = ask(
      "Contact email for Liquipedia's API (sent with every request, as its terms ask):",
    );
    if (!email.includes("@"))
      throw new Error("That doesn't look like an email address.");
    config.core = { ...config.core, email };
  }
  config[name] = await game.setup(context(config, false), ask);
  await saveConfig(config);
  console.log(`Saved to ${configPath}\n`);
  return config;
}

function today(now: Date): Window {
  const to = new Date(now);
  to.setHours(23, 59, 59, 999);
  return {
    now,
    from: new Date(now.getTime() - FINISHED_WINDOW_HOURS * 3_600_000),
    to,
  };
}

async function show(
  config: Config,
  name: string,
  game: Game,
  flags: Set<string>,
): Promise<void> {
  if (!config.core?.email || config[name] === undefined)
    config = await setup(config, name, game);
  const found = await game.matches(
    context(config, flags.has("--refresh")),
    config[name],
    today(new Date()),
  );
  progress.stop();
  const matches = rank(found, flags.has("--all"));
  if (!matches.length) {
    console.log("No matches today.");
    return;
  }
  console.log(`${render(matches)}\n\n${game.credit}\n`);

  const pick = matches[Number(ask("Watch which? (number, Enter to quit)")) - 1];
  if (!pick) return;
  const link = await pick.watch();
  progress.stop();
  if (!link) {
    console.log("No link for that match yet.");
    return;
  }
  console.log(`Opening the ${link.label}.`);
  await openUrl(link.url);
}

async function main(args: string[]): Promise<void> {
  await loadEnv();
  const [command, ...rest] = args;
  const isSetup = command === "setup";
  const name = isSetup ? rest[0] : command;
  const flags = new Set(isSetup ? rest.slice(1) : rest);
  const game = name ? games[name] : undefined;
  const allowed = isSetup ? [] : ["--all", "--refresh"];
  if (!name || !game || [...flags].some((f) => !allowed.includes(f))) {
    console.log(USAGE);
    process.exitCode = command && command !== "--help" ? 1 : 0;
    return;
  }

  const config = await loadConfig();
  if (isSetup) await setup(config, name, game);
  else await show(config, name, game, flags);
}

process.on("SIGINT", () => {
  progress.stop();
  process.exit(130);
});

main(Bun.argv.slice(2)).catch((error: Error) => {
  progress.stop();
  console.error(error.message);
  process.exitCode = 1;
});
