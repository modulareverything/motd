import { mkdir } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

export const cacheDir = join(
  process.env.XDG_CACHE_HOME ?? join(homedir(), ".cache"),
  "motd",
);

export type Cache = (
  key: string,
  ttlMs: number,
  load: () => Promise<string>,
) => Promise<string>;

export function fileCache(refresh: boolean): Cache {
  return async (key, ttlMs, load) => {
    const file = Bun.file(join(cacheDir, `${Bun.hash(key).toString(16)}.txt`));
    if (
      !refresh &&
      (await file.exists()) &&
      Date.now() - file.lastModified < ttlMs
    )
      return file.text();
    const body = await load();
    await mkdir(cacheDir, { recursive: true });
    await Bun.write(file, body);
    return body;
  };
}
