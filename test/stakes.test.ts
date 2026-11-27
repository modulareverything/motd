import { describe, expect, test } from "bun:test";
import type { TickerMatch } from "../src/games/cs/liquipedia";
import { formatStakes, placeMatch, stages } from "../src/games/cs/stakes";

const fixture = (name: string) =>
  Bun.file(new URL(`./fixtures/${name}.wiki`, import.meta.url)).text();
const swiss = await fixture("swiss");
const groups = await fixture("groups");
const brackets = await fixture("brackets");

// Every fixture's dates are UTC+8.
const UTC8 = 28800;
const at = (local: string) =>
  new Date(Date.parse(`${local}:00Z`) - UTC8 * 1000);
const team = (name: string) => ({ page: name, name, short: name });
const place = (wikitext: string, local: string, a: string, b: string) =>
  placeMatch(wikitext, at(local), UTC8, [team(a), team(b)]);

describe("placeMatch in a Swiss stage", () => {
  test("a Round 3 Low match, at 0-2, puts the loser out", () => {
    expect(
      place(swiss, "2026-11-25T18:00", "GOSH", "Chinggis Warriors"),
    ).toEqual({ stakes: "elimination" });
  });

  test("a Round 3 High match, at 2-0, sends the winner through", () => {
    expect(place(swiss, "2026-11-25T19:00", "NIP", "Team Liquid")).toEqual({
      stakes: "qualification",
    });
  });

  test("a Round 3 Mid match, at 1-1, has nothing at stake", () => {
    expect(place(swiss, "2026-11-25T14:00", "HEROIC", "M80")).toEqual({});
  });

  test("Round 4 High is for qualification and Round 4 Low for elimination", () => {
    expect(place(swiss, "2026-11-26T14:00", "M80", "EF")).toEqual({
      stakes: "qualification",
    });
    expect(place(swiss, "2026-11-26T14:00", "HEROIC", "FaZe")).toEqual({
      stakes: "elimination",
    });
  });

  test("a Round 5 match, at 2-2, is a decider", () => {
    expect(place(swiss, "2026-11-27T14:00", "LVG", "HEROIC")).toEqual({
      stakes: "decider",
    });
  });

  test("Rounds 1 and 2 have nothing at stake", () => {
    expect(place(swiss, "2026-11-24T12:05", "HEROIC", "Imperial")).toEqual({});
    expect(place(swiss, "2026-11-24T16:45", "NIP", "LVG")).toEqual({});
  });
});

describe("placeMatch in a GSL group", () => {
  test("the opening matches have nothing at stake", () => {
    expect(place(groups, "2026-11-11T10:00", "Legacy", "FURIA")).toEqual({});
  });

  test("with losers first, the third match is for elimination and the fourth for qualification", () => {
    expect(place(groups, "2026-11-12T10:00", "Legacy", "Falcons")).toEqual({
      stakes: "elimination",
    });
    expect(place(groups, "2026-11-12T12:00", "FURIA", "Vitality")).toEqual({
      stakes: "qualification",
    });
  });
});

describe("placeMatch in a bracket", () => {
  test("names the round of a single-elimination playoff match", () => {
    expect(place(groups, "2026-11-14T18:35", "FURIA", "Falcons")).toEqual({
      round: "Semifinals",
    });
    expect(place(groups, "2026-11-15T16:00", "FURIA", "Spirit")).toEqual({
      round: "Grand Final",
    });
  });

  test("a lower-bracket match puts the loser out", () => {
    expect(place(brackets, "2026-11-04T18:20", "NAVI", "Falcons")).toEqual({
      stakes: "elimination",
      round: "Lower Bracket Final",
    });
  });

  test("an upper-bracket match has nothing at stake", () => {
    expect(place(brackets, "2026-11-04T17:30", "MongolZ", "FURIA")).toEqual({
      round: "Upper Bracket Final",
    });
  });
});

test("finds nothing for a match that isn't on the page", () => {
  expect(place(swiss, "2026-01-01T00:00", "A", "B")).toBeUndefined();
});

const ticker = (stage: string, eventPage = "PGL/2026/Singapore/Stage_1") =>
  ({ stage, eventPage }) as TickerMatch;

describe("formatStakes", () => {
  const event = [ticker("Round 3 - Bo1"), ticker("Round 3 - Bo3")];

  test("takes a Bo3 among an event's Bo1s in the same round to be an elimination", () => {
    expect(formatStakes(ticker("Round 3 - Bo3"), event)).toBe("elimination");
  });

  test("finds nothing when the whole round is Bo3", () => {
    const allBo3 = [ticker("Round 3 - Bo3", "BLAST/Open")];
    expect(
      formatStakes(ticker("Round 3 - Bo3", "BLAST/Open"), allBo3),
    ).toBeUndefined();
  });
});

describe("stages", () => {
  test("uses the bracket round when the ticker names none", () => {
    expect(stages(ticker("Bo3"), { round: "Quarterfinals" })).toEqual({
      scored: "Quarterfinals - Bo3",
      shown: "Quarterfinals - Bo3",
    });
    expect(stages(ticker("Playoffs - Bo5"), { round: "Grand Final" })).toEqual({
      scored: "Grand Final - Bo5",
      shown: "Grand Final - Bo5",
    });
  });

  test("scores but never shows an upper or lower bracket round", () => {
    expect(
      stages(ticker("Playoffs - Bo3"), {
        stakes: "elimination",
        round: "Lower Bracket Final",
      }),
    ).toEqual({ scored: "Lower Bracket Final - Bo3", shown: "Playoffs - Bo3" });
  });

  test("keeps a stage the ticker already names", () => {
    expect(
      stages(ticker("Group A - Bo3"), { round: "Upper Bracket Final" }),
    ).toEqual({ scored: "Group A - Bo3", shown: "Group A - Bo3" });
  });
});
