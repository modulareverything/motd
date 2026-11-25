import type { Cache } from "../../core/cache";
import type { Watch } from "../../core/game";
import type { Team } from "./liquipedia";
import { normalize } from "./names";

const API = "https://www.googleapis.com/youtube/v3";
const TEN_MINUTES = 600_000;

export function videoId(url: string): string | undefined {
  const u = URL.parse(url);
  if (!u) return undefined;
  if (u.hostname === "youtu.be") return u.pathname.slice(1) || undefined;
  if (u.hostname.endsWith("youtube.com"))
    return u.searchParams.get("v") ?? u.pathname.match(/^\/live\/([^/]+)/)?.[1];
  return undefined;
}

async function get<T>(
  cache: Cache,
  path: string,
  params: Record<string, string>,
  key: string,
): Promise<T> {
  const query = new URLSearchParams(params);
  const body = await cache(
    `youtube:${path}?${query}`,
    TEN_MINUTES,
    async () => {
      query.set("key", key);
      const res = await fetch(`${API}/${path}?${query}`);
      if (!res.ok)
        throw new Error(
          `YouTube returned ${res.status}: ${(await res.text()).slice(0, 200)}`,
        );
      return res.text();
    },
  );
  return JSON.parse(body) as T;
}

export interface VideoStats {
  views: number;
  publishedAt: Date;
}

/** View counts and upload times, 50 videos per request (1 quota unit each). */
export async function videoStats(
  cache: Cache,
  key: string,
  ids: string[],
): Promise<Map<string, VideoStats>> {
  const stats = new Map<string, VideoStats>();
  for (let i = 0; i < ids.length; i += 50) {
    const json = await get<{
      items: {
        id: string;
        snippet: { publishedAt: string };
        statistics: { viewCount?: string };
      }[];
    }>(
      cache,
      "videos",
      {
        part: "snippet,statistics",
        id: ids.slice(i, i + 50).join(","),
        fields: "items(id,snippet/publishedAt,statistics/viewCount)",
      },
      key,
    );
    for (const item of json.items) {
      stats.set(item.id, {
        views: Number(item.statistics.viewCount ?? 0),
        publishedAt: new Date(item.snippet.publishedAt),
      });
    }
  }
  return stats;
}

const decodeTitle = (s: string) =>
  s
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&");

/**
 * Searches for a video of the match uploaded since it started, preferring a full VOD over highlights.
 * Titles are matched but never shown, since a highlight title can give the result away.
 */
export async function findVideo(
  cache: Cache,
  key: string,
  teams: [Team, Team],
  event: string,
  after: Date,
): Promise<Watch | undefined> {
  const json = await get<{
    items: { id: { videoId: string }; snippet: { title: string } }[];
  }>(
    cache,
    "search",
    {
      part: "snippet",
      type: "video",
      maxResults: "10",
      q: `${teams[0].short} vs ${teams[1].short} ${event}`,
      publishedAfter: after.toISOString(),
    },
    key,
  );
  const names = teams.map((t) =>
    [normalize(t.name), normalize(t.short)].filter((n) => n.length > 1),
  );
  const videos = json.items
    .map((item) => ({
      id: item.id.videoId,
      title: normalize(decodeTitle(item.snippet.title)),
    }))
    .filter((v) =>
      names.every((n) => n.some((name) => v.title.includes(name))),
    );
  const full = videos.find((v) => !v.title.includes("highlight"));
  const pick = full ?? videos[0];
  if (!pick) return undefined;
  return {
    url: `https://www.youtube.com/watch?v=${pick.id}`,
    label: full ? "full VOD (found on YouTube)" : "highlights",
  };
}
