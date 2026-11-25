import { mkdir } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

export const configPath = join(
  process.env.XDG_CONFIG_HOME ?? join(homedir(), ".config"),
  "motd",
  "config.json",
);

export interface Config {
  core?: { email?: string };
  [game: string]: unknown;
}

export async function loadConfig(): Promise<Config> {
  const file = Bun.file(configPath);
  return (await file.exists()) ? ((await file.json()) as Config) : {};
}

export async function saveConfig(config: Config): Promise<void> {
  await mkdir(dirname(configPath), { recursive: true });
  await Bun.write(configPath, `${JSON.stringify(config, null, 2)}\n`);
}
