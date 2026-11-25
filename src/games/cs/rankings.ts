import type { Cache } from "../../core/cache";
import type { Team } from "./liquipedia";
import { aliases, normalize } from "./names";

const REPO = "ValveSoftware/counter-strike_regional_standings";
const DAY = 86_400_000;

export type RankOf = (team: Team) => number | undefined;

/** Reads a Valve Regional Standings table (`standings_global_*.md`). */
export function parseStandings(markdown: string): RankOf {
  const ranks = new Map<string, number>();
  for (const row of markdown.matchAll(/^\|\s*(\d+)\s*\|\s*\d+\s*\|\s*([^|]+?)\s*\|/gm)) {
    const key = normalize(row[2]!);
    if (!ranks.has(key)) ranks.set(key, Number(row[1]));
  }
  return (team) => {
    for (const alias of aliases(team)) {
      const rank = ranks.get(alias);
      if (rank !== undefined) return rank;
    }
    return undefined;
  };
}

// Valve publishes new standings about once a month.
export async function loadStandings(cache: Cache): Promise<RankOf> {
  const markdown = await cache("valve-standings", DAY, async () => {
    const year = new Date().getUTCFullYear();
    // In early January the new year's folder may not exist yet.
    for (const y of [year, year - 1]) {
      const res = await fetch(`https://api.github.com/repos/${REPO}/contents/live/${y}`);
      if (res.status === 404) continue;
      if (!res.ok) throw new Error(`GitHub returned ${res.status} listing Valve's standings`);
      const files = (await res.json()) as { name: string; download_url: string }[];
      const latest = files.filter((f) => /^standings_global_.*\.md$/.test(f.name)).sort((a, b) => a.name.localeCompare(b.name)).at(-1);
      if (!latest) continue;
      const md = await fetch(latest.download_url);
      if (!md.ok) throw new Error(`GitHub returned ${md.status} fetching ${latest.name}`);
      return md.text();
    }
    throw new Error("Found no Valve standings for this year or last");
  });
  return parseStandings(markdown);
}
