import { expect, test } from "bun:test";
import { parseStandings } from "../src/games/cs/rankings";

const markdown = `### Standings as of 2026_11_02<br />

| Standing | Points | Team Name            | Roster                                               |                                                                                                      |
| :- | -: | :- | :- | :- |
| 1        |   1960 | MOUZ                 | PR, Spinx, torzsi, xelex, xertioN                    | [details](details/2026_11_02/0001--mouz--pr-spinx-torzsi-xelex-xertion.md)                           |
| 2        |   1922 | Vitality             | flameZ, jL, mezii, ropz, ZywOo                       | [details](details/2026_11_02/0002--vitality--flamez-jl-mezii-ropz-zywoo.md)                          |
| 13       |   1589 | Natus Vincere        | Aleksib, b1t, iM, makazze, w0nderful                 | [details](details/2026_11_02/0013--natus_vincere--aleksib-b1t-im-makazze-w0nderful.md)               |
`;

test("matches Valve's team names to Liquipedia's", () => {
  const rankOf = parseStandings(markdown);
  expect(
    rankOf({ page: "Team Vitality", name: "Team Vitality", short: "Vitality" }),
  ).toBe(2);
  expect(rankOf({ page: "MOUZ", name: "MOUZ", short: "MOUZ" })).toBe(1);
  expect(
    rankOf({ page: "Natus Vincere", name: "Natus Vincere", short: "NAVI" }),
  ).toBe(13);
  expect(
    rankOf({ page: "Team Liquid", name: "Team Liquid", short: "Liquid" }),
  ).toBeUndefined();
});
