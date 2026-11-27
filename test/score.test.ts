import { describe, expect, test } from "bun:test";
import { scoreMatches } from "../src/games/cs/score";

const now = new Date("2026-11-25T18:00:00Z");
const hoursAgo = (h: number) => new Date(now.getTime() - h * 3_600_000);

describe("scoreMatches", () => {
  test("adds tier, stage and both teams' rankings", () => {
    expect(
      scoreMatches(
        [
          { tier: 1, stage: "Playoffs - Bo5", ranks: [1, 2] }, // 30 + 30 + 10 + 9.5
          { tier: 2, stage: "Group A - Bo3", ranks: [undefined, undefined] }, // 15
          { stage: "Quarterfinals - Bo3", ranks: [25, undefined] }, // 18
        ],
        now,
      ),
    ).toEqual([79.5, 15, 18]);
  });

  test("ranks playoff stages from grand final down to groups", () => {
    const stages = [
      "Grand Final - Bo5",
      "Semifinals - Bo3",
      "Upper Bracket Final - Bo3",
      "Quarterfinals - Bo3",
      "Playoffs - Bo3",
      "Round 4 - Bo3",
      "Bo5",
    ];
    const scores = scoreMatches(
      stages.map((stage) => ({ stage, ranks: [undefined, undefined] })),
      now,
    );
    expect(scores).toEqual([30, 24, 24, 18, 15, 0, 0]);
  });

  test("scores views per hour against the median of videos at least 3 hours old", () => {
    const base = {
      tier: 1 as const,
      stage: "Round 1 - Bo1",
      ranks: [undefined, undefined] as [undefined, undefined],
    };
    expect(
      scoreMatches(
        [
          { ...base, video: { views: 6_000, publishedAt: hoursAgo(6) } }, // 1000/h, half the median
          { ...base, video: { views: 18_000, publishedAt: hoursAgo(6) } }, // 3000/h, 1.5x the median
          { ...base, video: { views: 2_000, publishedAt: hoursAgo(2) } }, // 1000/h, not in the median
          base,
        ],
        now,
      ),
    ).toEqual([35, 45, 35, 30]);
  });

  test("spreads a minutes-old video's views over at least an hour", () => {
    const base = {
      stage: "Round 1 - Bo1",
      ranks: [undefined, undefined] as [undefined, undefined],
    };
    expect(
      scoreMatches(
        [
          { ...base, video: { views: 4_000, publishedAt: hoursAgo(4) } }, // 1000/h, the median
          { ...base, video: { views: 1_500, publishedAt: hoursAgo(0.1) } }, // 1500/h, not 15000/h
          { ...base, video: { views: 50_000, publishedAt: hoursAgo(0.1) } }, // a fresh hit, capped
        ],
        now,
      ),
    ).toEqual([10, 15, 20]);
  });

  test("adds the stakes of a match", () => {
    const ranks = [undefined, undefined] as [undefined, undefined];
    expect(
      scoreMatches(
        [
          { stage: "Round 5 - Bo3", stakes: "decider", ranks },
          { stage: "Round 3 - Bo3", stakes: "elimination", ranks },
          { stage: "Round 4 - Bo3", stakes: "qualification", ranks },
        ],
        now,
      ),
    ).toEqual([18, 15, 12]);
  });

  test("never ranks a stage and its stakes above a grand final", () => {
    const ranks = [undefined, undefined] as [undefined, undefined];
    expect(
      scoreMatches(
        [
          { stage: "Lower Bracket Final - Bo3", stakes: "elimination", ranks },
          {
            stage: "Lower Bracket Quarterfinals - Bo3",
            stakes: "elimination",
            ranks,
          },
          { stage: "Grand Final - Bo5", ranks },
        ],
        now,
      ),
    ).toEqual([30, 30, 30]);
  });

  test("caps the view score at 20", () => {
    const base = {
      stage: "Round 1 - Bo1",
      ranks: [undefined, undefined] as [undefined, undefined],
    };
    const scores = scoreMatches(
      [
        { ...base, video: { views: 100, publishedAt: hoursAgo(10) } },
        { ...base, video: { views: 100, publishedAt: hoursAgo(10) } },
        { ...base, video: { views: 100_000, publishedAt: hoursAgo(10) } },
      ],
      now,
    );
    expect(scores).toEqual([10, 10, 20]);
  });
});
