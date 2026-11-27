import { aliases } from "./names";

export interface Team {
  page: string;
  name: string;
  short: string;
}

export type Tier = 1 | 2;

// Holds no score or winner: anything kept here can reach the screen.
export interface TickerMatch {
  tier?: Tier;
  start: Date;
  tzOffset: number;
  finished: boolean;
  stage: string;
  teams: [Team, Team];
  event: string;
  eventPage: string;
  vod?: string;
}

const SECTION_TIERS: Record<string, Tier | undefined> = { s: 1, a: 2 };

const decode = (s: string) =>
  s
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");

function parseTeam(block: string): Team | undefined {
  const page = block.match(/<a href="[^"]*" title="([^"]*)"/)?.[1];
  const name = block.match(/class="team-name">([^<]*)</)?.[1];
  const short = block.match(/class="team-shortname">([^<]*)</)?.[1];
  if (!page || !name) return undefined;
  return {
    page: decode(page),
    name: decode(name),
    short: decode(short ?? name),
  };
}

function parseCard(
  card: string,
  tier: Tier | undefined,
): TickerMatch | undefined {
  const time = card.match(
    /data-match-timestamp="(\d+)" data-match-timezone-offset="(-?\d+)"/,
  );
  const stage = card.match(/<\/span><\/span><div>([^<]*)<\/div>/)?.[1];
  const event = card.match(
    /tournament-name"><a href="\/counterstrike\/([^"#]*)[^"]*"[^>]*>([^<]*)</,
  );
  // The `winner` modifier and the score div inside each opponent block are never read.
  const opponents = card
    .split(/<div class="match-ticker-card&#95;&#95;opponent(?: winner)?">/)
    .slice(1);
  const teams = opponents.map(parseTeam);
  const [a, b] = teams;
  if (!time || stage === undefined || !event || !a || !b) return undefined;

  // Only Game 1 is kept: how many game links a card has gives away how long the series went.
  const vod = card.match(/href="([^"]*)"><div[^>]*title="Watch Game 1"/)?.[1];

  return {
    tier,
    start: new Date(Number(time[1]) * 1000),
    tzOffset: Number(time[2]),
    finished: card.includes('data-finished="finished"'),
    stage: decode(stage),
    teams: [a, b],
    event: decode(event[2]!),
    eventPage: decode(event[1]!),
    ...(vod ? { vod: decode(vod) } : {}),
  };
}

/** Reads the HTML that `renderTickers` returns. */
export function parseTicker(html: string): TickerMatch[] {
  const parts = html.split(/<div data-motd="([a-z]+)-[a-z]+">/);
  // Tier sections come before team sections, so the first copy of a match carries its tier.
  const matches = new Map<string, TickerMatch>();
  for (let i = 1; i < parts.length; i += 2) {
    const tier = SECTION_TIERS[parts[i]!];
    for (const card of parts[i + 1]!.split(
      /(?=<div class="match-ticker-card")/,
    ).slice(1)) {
      const match = parseCard(card, tier);
      if (!match) continue;
      const key = `${match.start.getTime()}|${match.teams[0].page}|${match.teams[1].page}`;
      if (!matches.has(key)) matches.set(key, match);
    }
  }
  return [...matches.values()];
}

const MONTHS = [
  "january",
  "february",
  "march",
  "april",
  "may",
  "june",
  "july",
  "august",
  "september",
  "october",
  "november",
  "december",
];

/** Reads a `{{Match}}` date such as "November 25, 2026 - 19:00 {{Abbr/SGT}}", given its zone's offset in seconds. */
function parseMatchDate(value: string, tzOffset: number): number | undefined {
  const m = value.match(/([A-Za-z]+) (\d{1,2}), (\d{4}) - (\d{1,2}):(\d{2})/);
  if (!m) return undefined;
  const month = MONTHS.indexOf(m[1]!.toLowerCase());
  if (month < 0) return undefined;
  return (
    Date.UTC(Number(m[3]), month, Number(m[2]), Number(m[4]), Number(m[5])) -
    tzOffset * 1000
  );
}

function streamUrl(block: string): string | undefined {
  const youtube = block.match(/\|youtube=([^|\n}]+)/)?.[1]?.trim();
  if (youtube) {
    const [channel, video] = youtube.split("/");
    return video
      ? `https://www.youtube.com/watch?v=${video}`
      : `https://www.youtube.com/@${channel}/live`;
  }
  const twitch = block.match(/\|twitch=([^|\n}]+)/)?.[1]?.trim();
  return twitch
    ? `https://www.twitch.tv/${twitch.replace(/ /g, "_").toLowerCase()}`
    : undefined;
}

const BLOCK_START = /\{\{(?:Match|Matchlist|Bracket)\b/g;

export interface WikiMatch {
  /** Where the match's `{{Match` starts in the page. */
  at: number;
  block: string;
}

/**
 * Opponents in wikitext are team templates such as `nip` or `tl`, so matches that start together
 * are told apart by how many templates match one of the teams' names.
 */
export function findMatch(
  wikitext: string,
  start: Date,
  tzOffset: number,
  teams: [Team, Team],
): WikiMatch | undefined {
  const names = teams.map(aliases);
  const starts = [...wikitext.matchAll(BLOCK_START)];
  let best: (WikiMatch & { hits: number }) | undefined;
  starts.forEach((m, i) => {
    if (m[0] !== "{{Match") return;
    const block = wikitext.slice(m.index, starts[i + 1]?.index);
    const date = block.match(/\|date=([^|\n]+)/)?.[1];
    if (!date || parseMatchDate(date, tzOffset) !== start.getTime()) return;
    const templates = [...block.matchAll(/\{\{TeamOpponent\|([^}|]+)/g)].map(
      (t) => t[1]!.toLowerCase(),
    );
    const hits = templates.filter((t) =>
      names.some((n) => n.some((alias) => alias === t || alias.startsWith(t))),
    ).length;
    if (!best || hits > best.hits) best = { at: m.index, block, hits };
  });
  return best && { at: best.at, block: best.block };
}

export function findStream(
  wikitext: string,
  start: Date,
  tzOffset: number,
  teams: [Team, Team],
): string | undefined {
  const match = findMatch(wikitext, start, tzOffset, teams);
  return match && streamUrl(match.block);
}

const API = "https://liquipedia.net/counterstrike/api.php";
// Liquipedia's API terms: at most one request every 2 s, and one `action=parse` every 30 s.
const ANY_GAP = 2_000;
const PARSE_GAP = 30_000;

export interface Client {
  contact: string;
  cacheDir: string;
  progress(message: string): void;
}

const lastAt = async (path: string) => {
  const file = Bun.file(path);
  return (await file.exists()) ? file.lastModified : 0;
};

// The time of the last request lives on disk so separate runs share the rate limit.
async function waitTurn(client: Client, parse: boolean): Promise<void> {
  const anyStamp = `${client.cacheDir}/liquipedia-request-at`;
  const parseStamp = `${client.cacheDir}/liquipedia-parse-at`;
  let ready = (await lastAt(anyStamp)) + ANY_GAP;
  if (parse) ready = Math.max(ready, (await lastAt(parseStamp)) + PARSE_GAP);
  for (let left = ready - Date.now(); left > 0; left = ready - Date.now()) {
    if (left > 1_000)
      client.progress(
        `Waiting ${Math.ceil(left / 1000)}s for Liquipedia's rate limit…`,
      );
    await Bun.sleep(Math.min(left, 1_000));
  }
  await Bun.write(anyStamp, "");
  if (parse) await Bun.write(parseStamp, "");
}

async function call<T>(
  client: Client,
  params: Record<string, string>,
): Promise<T> {
  const parse = params.action === "parse";
  await waitTurn(client, parse);
  const query = new URLSearchParams({
    format: "json",
    formatversion: "2",
    ...params,
  });
  const res = await fetch(parse ? API : `${API}?${query}`, {
    method: parse ? "POST" : "GET",
    body: parse ? query : undefined,
    headers: {
      "User-Agent": `motd/0.1 (${client.contact})`,
      "Accept-Encoding": "gzip",
    },
  });
  if (!res.ok)
    throw new Error(
      `Liquipedia returned ${res.status}${res.status === 429 ? " (rate limited, try again in a minute)" : ""}`,
    );
  const json = (await res.json()) as T & {
    error?: { code: string; info?: string };
  };
  if (json.error)
    throw new Error(`Liquipedia: ${json.error.info ?? json.error.code}`);
  return json;
}

const ticker = (section: string, args: string) =>
  `<div data-motd="${section}">{{#invoke:Lua|invoke|module=MatchTicker/Custom|fn=mainPage|${args}}}</div>`;

/**
 * Wikitext for every ticker one run needs, so a single `action=parse` fetches them all.
 * Tier sections come first: `parseTicker` keeps the first copy of a match.
 */
export function tickerWikitext(teams: string[]): string {
  return [
    ticker("s-recent", "type=recent|limit=50|filterbuttons-liquipediatier=1"),
    ticker(
      "s-upcoming",
      "type=upcoming|limit=30|filterbuttons-liquipediatier=1",
    ),
    ticker("a-recent", "type=recent|limit=30|filterbuttons-liquipediatier=2"),
    ticker(
      "a-upcoming",
      "type=upcoming|limit=30|filterbuttons-liquipediatier=2",
    ),
    ...teams.flatMap((team) => [
      ticker("team-recent", `type=recent|limit=5|team=${team}`),
      ticker("team-upcoming", `type=upcoming|limit=5|team=${team}`),
    ]),
  ].join("\n");
}

export async function renderTickers(
  client: Client,
  teams: string[],
): Promise<string> {
  const json = await call<{ parse: { text: string } }>(client, {
    action: "parse",
    text: tickerWikitext(teams),
    contentmodel: "wikitext",
    prop: "text",
    disablelimitreport: "1",
  });
  return json.parse.text;
}

export async function pageWikitext(
  client: Client,
  title: string,
): Promise<string> {
  const json = await call<{
    query: {
      pages: {
        missing?: boolean;
        revisions?: { slots: { main: { content: string } } }[];
      }[];
    };
  }>(client, {
    action: "query",
    prop: "revisions",
    rvprop: "content",
    rvslots: "main",
    titles: title,
  });
  const content = json.query.pages[0]?.revisions?.[0]?.slots.main.content;
  if (content === undefined)
    throw new Error(`Liquipedia has no page "${title}"`);
  return content;
}

type TeamPages = {
  query: {
    pages: { title: string; missing?: boolean; categories?: unknown[] }[];
  };
};

const teamPages = (client: Client, titles: string[]) =>
  call<TeamPages>(client, {
    action: "query",
    titles: titles.join("|"),
    redirects: "1",
    prop: "categories",
    clcategories: "Category:Teams",
  }).then((json) =>
    json.query.pages
      .filter((p) => !p.missing && p.categories?.length)
      .map((p) => p.title),
  );

export async function resolveTeam(
  client: Client,
  name: string,
): Promise<{ page: string } | { suggestions: string[] }> {
  const [page] = await teamPages(client, [name]);
  if (page) return { page };
  const [, titles] = await call<[string, string[]]>(client, {
    action: "opensearch",
    search: name,
    limit: "10",
    namespace: "0",
  });
  const candidates = titles.filter((t) => !t.includes("/"));
  return {
    suggestions: candidates.length ? await teamPages(client, candidates) : [],
  };
}
