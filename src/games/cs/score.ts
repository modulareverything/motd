import type { Tier } from "./liquipedia";

export interface ScoreInput {
  tier?: Tier;
  stage: string;
  ranks: [number | undefined, number | undefined];
  video?: { views: number; publishedAt: Date };
}

const TIER_POINTS = { 1: 30, 2: 15 };
// A video this young hasn't had time to gather views, so it would be marked down unfairly.
const MIN_VIDEO_AGE_HOURS = 3;

function stagePoints(stage: string): number {
  const s = stage.toLowerCase();
  if (s.includes("grand final")) return 30;
  if (s.includes("semi")) return 24;
  if (s.includes("quarter")) return 18;
  // Upper and lower bracket finals rank with the semi-finals.
  if (s.includes("final")) return 24;
  // Liquipedia's ticker often says only "Playoffs"; a Bo5 there is the grand final.
  if (s.includes("playoff")) return s.includes("bo5") ? 30 : 15;
  return 0;
}

const rankPoints = (rank: number | undefined) =>
  rank === undefined ? 0 : Math.max(0, 21 - rank) / 2;

function viewsPerHour(input: ScoreInput, now: Date): number | undefined {
  if (!input.video) return undefined;
  const hours = (now.getTime() - input.video.publishedAt.getTime()) / 3_600_000;
  return hours < MIN_VIDEO_AGE_HOURS ? undefined : input.video.views / hours;
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2
    ? sorted[mid]!
    : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

// Views are judged against the other videos in the same list, since what counts as a lot depends on the event.
export function scoreMatches(inputs: ScoreInput[], now: Date): number[] {
  const rates = inputs.map((input) => viewsPerHour(input, now));
  const eligible = rates.filter((rate): rate is number => rate !== undefined);
  const typical = eligible.length ? median(eligible) : 0;

  return inputs.map((input, i) => {
    const rate = rates[i];
    const views =
      rate === undefined || typical === 0
        ? 0
        : Math.min(20, (10 * rate) / typical);
    return (
      (input.tier ? TIER_POINTS[input.tier] : 0) +
      stagePoints(input.stage) +
      rankPoints(input.ranks[0]) +
      rankPoints(input.ranks[1]) +
      views
    );
  });
}
