import type { Tier } from "./liquipedia";
import type { Stakes } from "./stakes";

export interface ScoreInput {
  tier?: Tier;
  stage: string;
  stakes?: Stakes;
  ranks: [number | undefined, number | undefined];
  video?: { views: number; publishedAt: Date };
}

const TIER_POINTS = { 1: 30, 2: 15 };
const GRAND_FINAL_POINTS = 30;
const STAKES_POINTS: Record<Stakes, number> = {
  decider: 18,
  elimination: 15,
  qualification: 12,
};
// Videos younger than this would mark the typical rate down, but may still score well against it.
const TYPICAL_MIN_AGE_HOURS = 3;
// A minutes-old video's views would otherwise be multiplied into an hourly rate it may never reach.
const RATE_MIN_HOURS = 1;

function stagePoints(stage: string): number {
  const s = stage.toLowerCase();
  if (s.includes("grand final")) return GRAND_FINAL_POINTS;
  if (s.includes("semi")) return 24;
  if (s.includes("quarter")) return 18;
  // Upper and lower bracket finals rank with the semi-finals.
  if (s.includes("final")) return 24;
  // Liquipedia's ticker often says only "Playoffs"; a Bo5 there is the grand final.
  if (s.includes("playoff")) return s.includes("bo5") ? GRAND_FINAL_POINTS : 15;
  return 0;
}

const rankPoints = (rank: number | undefined) =>
  rank === undefined ? 0 : Math.max(0, 21 - rank) / 2;

interface Rate {
  perHour: number;
  settled: boolean;
}

function viewRate(input: ScoreInput, now: Date): Rate | undefined {
  if (!input.video) return undefined;
  const hours = (now.getTime() - input.video.publishedAt.getTime()) / 3_600_000;
  return {
    perHour: input.video.views / Math.max(RATE_MIN_HOURS, hours),
    settled: hours >= TYPICAL_MIN_AGE_HOURS,
  };
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2
    ? sorted[mid]!
    : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

// Nothing outranks a grand final on where it sits in the event alone.
const placementPoints = (input: ScoreInput) =>
  Math.min(
    GRAND_FINAL_POINTS,
    stagePoints(input.stage) + (input.stakes ? STAKES_POINTS[input.stakes] : 0),
  );

// Views are judged against the other videos in the same list, since what counts as a lot depends on the event.
export function scoreMatches(inputs: ScoreInput[], now: Date): number[] {
  const rates = inputs.map((input) => viewRate(input, now));
  const settled = rates.flatMap((rate) =>
    rate?.settled ? [rate.perHour] : [],
  );
  const typical = settled.length ? median(settled) : 0;

  return inputs.map((input, i) => {
    const rate = rates[i];
    const views =
      !rate || typical === 0 ? 0 : Math.min(20, (10 * rate.perHour) / typical);
    return (
      (input.tier ? TIER_POINTS[input.tier] : 0) +
      placementPoints(input) +
      rankPoints(input.ranks[0]) +
      rankPoints(input.ranks[1]) +
      views
    );
  });
}
