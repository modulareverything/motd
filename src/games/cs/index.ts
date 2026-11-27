import { cacheDir } from "../../core/cache";
import type {
  Ask,
  Context,
  Game,
  Match,
  Status,
  Watch,
  Window,
} from "../../core/game";
import {
  type Client,
  findStream,
  pageWikitext,
  parseTicker,
  renderTickers,
  resolveTeam,
  type TickerMatch,
} from "./liquipedia";
import { loadStandings, type RankOf } from "./rankings";
import { scoreMatches } from "./score";
import { formatStakes, placeMatch, stages } from "./stakes";
import { findVideo, videoId, videoStats, type VideoStats } from "./youtube";

const TEN_MINUTES = 600_000;

interface CsConfig {
  teams: string[];
}

function readConfig(config: unknown): CsConfig {
  const teams = (config as Partial<CsConfig> | undefined)?.teams;
  if (!Array.isArray(teams) || !teams.every((t) => typeof t === "string")) {
    throw new Error("The cs config has no team list. Run `motd setup cs`.");
  }
  return { teams };
}

const client = (ctx: Context): Client => ({
  contact: ctx.contact,
  cacheDir,
  progress: ctx.progress,
});

function status(match: TickerMatch, now: Date): Status {
  if (match.finished) return "finished";
  return match.start <= now ? "live" : "upcoming";
}

function inWindow(match: TickerMatch, window: Window): boolean {
  const s = status(match, window.now);
  if (s === "live") return true;
  return s === "finished"
    ? match.start >= window.from
    : match.start <= window.to;
}

const pageTitle = (match: TickerMatch) => match.eventPage.replace(/_/g, " ");

const eventWikitext = (ctx: Context, page: string) =>
  ctx.cache(`wikitext:${page}`, TEN_MINUTES, () =>
    pageWikitext(client(ctx), page),
  );

async function stream(
  ctx: Context,
  match: TickerMatch,
): Promise<string | undefined> {
  const wikitext = await eventWikitext(ctx, pageTitle(match));
  return findStream(wikitext, match.start, match.tzOffset, match.teams);
}

async function watch(
  ctx: Context,
  match: TickerMatch,
  now: Date,
): Promise<Watch | undefined> {
  const s = status(match, now);
  if (s === "finished") {
    if (match.vod) return { url: match.vod, label: "full VOD, from Map 1" };
    const key = ctx.env.YOUTUBE_API_KEY;
    return key
      ? findVideo(ctx.cache, key, match.teams, match.event, match.start)
      : undefined;
  }
  const url = await stream(ctx, match);
  if (!url) return undefined;
  if (s === "upcoming") return { url, label: "stream" };
  return {
    url: url.includes("watch?v=") ? `${url}&t=0s` : url,
    label: "live stream, from the start",
  };
}

async function orSkip<T>(
  ctx: Context,
  what: string,
  load: () => Promise<T>,
  fallback: T,
): Promise<T> {
  try {
    return await load();
  } catch (error) {
    ctx.warn(`Skipping ${what}: ${(error as Error).message}`);
    return fallback;
  }
}

async function eventPages(
  ctx: Context,
  matches: TickerMatch[],
): Promise<Map<string, string>> {
  // Ticker cards for some streams link to a special page rather than an event.
  const pages = [...new Set(matches.map(pageTitle))].filter(
    (page) => !page.startsWith("Special:"),
  );
  const wikitexts = new Map<string, string>();
  for (const [i, page] of pages.entries()) {
    ctx.progress(`Reading event pages (${i + 1}/${pages.length})…`);
    const wikitext = await orSkip<string | undefined>(
      ctx,
      `the stakes for ${page}`,
      () => eventWikitext(ctx, page),
      undefined,
    );
    if (wikitext !== undefined) wikitexts.set(page, wikitext);
  }
  return wikitexts;
}

export const cs: Game = {
  credit: "Data: Liquipedia (CC-BY-SA), Valve Regional Standings",

  async setup(ctx: Context, ask: Ask): Promise<CsConfig> {
    const answer = ask(
      "Which teams do you support? (comma-separated, blank for none)",
    );
    const teams: string[] = [];
    for (const name of answer
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)) {
      const result = await resolveTeam(client(ctx), name);
      if ("page" in result) {
        console.log(`  ✓ ${result.page}`);
        teams.push(result.page);
        continue;
      }
      if (!result.suggestions.length) {
        console.log(`  ✗ No Liquipedia team called "${name}"; skipped.`);
        continue;
      }
      console.log(`  No team called "${name}". Did you mean:`);
      result.suggestions.forEach((s, i) => console.log(`    ${i + 1}. ${s}`));
      const pick =
        result.suggestions[
          Number(ask("  Pick a number, or Enter to skip")) - 1
        ];
      if (pick) teams.push(pick);
    }
    return { teams };
  },

  async matches(
    ctx: Context,
    config: unknown,
    window: Window,
  ): Promise<Match[]> {
    const { teams } = readConfig(config);
    ctx.progress("Loading matches…");
    const html = await ctx.cache(
      `tickers:${teams.join("|")}`,
      TEN_MINUTES,
      () => renderTickers(client(ctx), teams),
    );
    const ticker = parseTicker(html);
    const matches = ticker.filter((m) => inWindow(m, window));

    const wikitexts = await eventPages(ctx, matches);
    const placements = matches.map((m) => {
      const wikitext = wikitexts.get(pageTitle(m));
      return wikitext === undefined
        ? undefined
        : placeMatch(wikitext, m.start, m.tzOffset, m.teams);
    });
    const stageNames = matches.map((m, i) => stages(m, placements[i]));

    ctx.progress("Loading rankings…");
    const rankOf = await orSkip<RankOf>(
      ctx,
      "rankings",
      () => loadStandings(ctx.cache),
      () => undefined,
    );
    const key = ctx.env.YOUTUBE_API_KEY;
    const videoIds = matches.map((m) =>
      m.finished && m.vod ? videoId(m.vod) : undefined,
    );
    const ids = videoIds.filter((id): id is string => id !== undefined);
    if (key && ids.length) ctx.progress("Fetching view counts…");
    const stats =
      key && ids.length
        ? await orSkip(
            ctx,
            "view counts",
            () => videoStats(ctx.cache, key, ids),
            new Map<string, VideoStats>(),
          )
        : new Map<string, VideoStats>();

    const scores = scoreMatches(
      matches.map((m, i) => {
        const id = videoIds[i];
        const video = id ? stats.get(id) : undefined;
        const placement = placements[i];
        const stakes = placement ? placement.stakes : formatStakes(m, ticker);
        return {
          tier: m.tier,
          stage: stageNames[i]!.scored,
          ...(stakes ? { stakes } : {}),
          ranks: [rankOf(m.teams[0]), rankOf(m.teams[1])],
          ...(video ? { video } : {}),
        };
      }),
      window.now,
    );

    return matches.map((m, i) => ({
      status: status(m, window.now),
      start: m.start,
      title: `${m.teams[0].name} vs ${m.teams[1].name}`,
      detail: `${m.event} · ${stageNames[i]!.shown}`,
      favourite: m.teams.some((t) => teams.includes(t.page)),
      score: scores[i]!,
      watch: () => watch(ctx, m, window.now),
    }));
  },
};
