import { describe, expect, test } from "bun:test";
import { findStream, parseTicker } from "../src/games/cs/liquipedia";

const html = await Bun.file(
  new URL("./fixtures/ticker.html", import.meta.url),
).text();
const matches = parseTicker(html);
const wikitext = await Bun.file(
  new URL("./fixtures/tournament.wiki", import.meta.url),
).text();

const find = (a: string, b: string, start: number) =>
  matches.find(
    (m) =>
      m.teams[0].name === a &&
      m.teams[1].name === b &&
      m.start.getTime() === start * 1000,
  );

describe("parseTicker", () => {
  test("reads a finished S-tier match with only the Map 1 VOD", () => {
    expect(find("Ninjas in Pyjamas", "Team Liquid", 1795604400)).toEqual({
      tier: 1,
      start: new Date(1795604400 * 1000),
      tzOffset: 28800,
      finished: true,
      stage: "Round 3 - Bo3",
      teams: [
        { page: "Ninjas in Pyjamas", name: "Ninjas in Pyjamas", short: "NIP" },
        { page: "Team Liquid", name: "Team Liquid", short: "Liquid" },
      ],
      event: "PGL Major Singapore 2026",
      eventPage: "PGL/2026/Singapore/Stage_1",
      vod: "https://youtu.be/n6qkiicKVQY?t=18",
    });
  });

  test("reads an upcoming match, which has no VOD", () => {
    const match = find("HEROIC", "FaZe Clan", 1795672800);
    expect(match).toMatchObject({
      tier: 1,
      finished: false,
      stage: "Round 4 - Bo3",
    });
    expect(match?.vod).toBeUndefined();
  });

  test("lists a match in both a tier ticker and a team ticker once, keeping its tier", () => {
    const copies = matches.filter(
      (m) =>
        m.teams[0].name === "Team Vitality" &&
        m.start.getTime() === 1794556800 * 1000,
    );
    expect(copies).toHaveLength(1);
    expect(copies[0]).toMatchObject({
      tier: 1,
      stage: "Playoffs - Bo3",
      vod: "https://youtu.be/0lKJzq6Jv0o?t=20",
    });
  });

  test("leaves the tier unset for matches found only through a supported team", () => {
    expect(find("Team Vitality", "FURIA", 1794456000)?.tier).toBeUndefined();
  });

  test("never carries a score, a winner or later maps", () => {
    const allowed = [
      "event",
      "eventPage",
      "finished",
      "stage",
      "start",
      "teams",
      "tier",
      "tzOffset",
      "vod",
    ];
    expect(matches.length).toBeGreaterThan(50);
    for (const match of matches) {
      expect(Object.keys(match).every((key) => allowed.includes(key))).toBe(
        true,
      );
      for (const team of match.teams)
        expect(Object.keys(team).sort()).toEqual(["name", "page", "short"]);
      if (match.vod) expect(match.vod).not.toMatch(/Game [2-9]/);
    }
    expect(JSON.stringify(matches)).not.toContain("winner");
  });
});

describe("findStream", () => {
  const team = (page: string, short: string) => ({ page, name: page, short });

  test("opens the YouTube stream of the match that starts at that time", () => {
    const nip = team("Ninjas in Pyjamas", "NIP");
    const liquid = team("Team Liquid", "Liquid");
    expect(
      findStream(wikitext, new Date(1795604400 * 1000), 28800, [nip, liquid]),
    ).toBe("https://www.youtube.com/watch?v=Cfe3Vp39n2g");
  });

  test("tells apart two matches that start at the same time by their teams", () => {
    const start = new Date(1795493100 * 1000);
    expect(
      findStream(wikitext, start, 28800, [
        team("9z Team", "9z"),
        team("Leviatán", "LEV"),
      ]),
    ).toBe("https://www.youtube.com/watch?v=r15_iNWob2A");
    expect(
      findStream(wikitext, start, 28800, [
        team("HEROIC", "HEROIC"),
        team("Imperial Esports", "Imperial"),
      ]),
    ).toBe("https://www.youtube.com/watch?v=_7LJB5SAgrY");
  });

  test("finds nothing when no match starts at that time", () => {
    expect(
      findStream(wikitext, new Date(0), 28800, [
        team("A", "A"),
        team("B", "B"),
      ]),
    ).toBeUndefined();
  });
});
