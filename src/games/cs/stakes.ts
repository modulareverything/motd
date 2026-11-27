import { findMatch, type Team, type TickerMatch } from "./liquipedia";

export type Stakes = "decider" | "elimination" | "qualification";

/**
 * Where a match sits in its event, read only from the event's structure, never from a result.
 * Stakes reveal earlier results, so they rank matches but never reach the screen.
 */
export interface Placement {
  stakes?: Stakes;
  /** The bracket round, such as "Quarterfinals" or "Lower Bracket Final". */
  round?: string;
}

const lastBefore = (text: string, pattern: RegExp, at: number) => {
  let last: RegExpExecArray | undefined;
  for (const m of text.matchAll(pattern)) {
    if (m.index >= at) break;
    last = m;
  }
  return last;
};

const param = (header: string, name: string) =>
  header.match(new RegExp(`\\|${name}=([^|\\n}]*)`))?.[1]?.trim();

function stakesOf(wins: number, losses: number, needed: number) {
  const advancing = wins === needed - 1;
  const out = losses === needed - 1;
  if (advancing && out) return "decider";
  if (out) return "elimination";
  return advancing ? "qualification" : undefined;
}

/**
 * Each `{{Round|matchgroups=…}}` of a `swissN` table lists its pools from the best record down,
 * and a pool holds every record still alive with as many matches played as rounds before it.
 */
function swissStakes(wikitext: string, groupId: string): Stakes | undefined {
  for (const table of wikitext.matchAll(
    /\{\{SwissStandings\|format=swiss(\d+)([\s\S]*?)\n\}\}/g,
  )) {
    const needed = Number(table[1]);
    for (const round of table[2]!.matchAll(
      /\|round(\d+)=\{\{Round\|matchgroups=([^}]*)\}\}/g,
    )) {
      const pools = round[2]!.split(",").map((id) => id.trim());
      const pool = pools.indexOf(groupId);
      if (pool < 0) continue;
      const played = Number(round[1]) - 1;
      const records: [number, number][] = [];
      for (let wins = Math.min(played, needed - 1); wins >= 0; wins--) {
        const losses = played - wins;
        if (losses < needed) records.push([wins, losses]);
      }
      if (records.length !== pools.length) return undefined;
      const [wins, losses] = records[pool]!;
      return stakesOf(wins, losses, needed);
    }
  }
  return undefined;
}

// A GSL group plays two opening matches, then the winners' and elimination matches in the order `gsl` names, then the decider.
function gslStakes(order: string, index: number): Stakes | undefined {
  if (index === 4) return "decider";
  const winnersFirst = order === "winnersfirst";
  if (index === 2) return winnersFirst ? "qualification" : "elimination";
  if (index === 3) return winnersFirst ? "elimination" : "qualification";
  return undefined;
}

function matchlistPlacement(
  wikitext: string,
  header: string,
  from: number,
  at: number,
): Placement {
  const id = param(header, "id");
  const swiss = id ? swissStakes(wikitext, id) : undefined;
  if (swiss) return { stakes: swiss };
  const gsl = param(header, "gsl");
  if (!gsl) return {};
  const index = [...wikitext.slice(from, at).matchAll(/\{\{Match\b/g)].length;
  const stakes = gslStakes(gsl, index);
  return stakes ? { stakes } : {};
}

// Liquipedia's bracket generator heads each round with a comment such as `<!-- Lower Bracket Quarterfinals -->`.
function bracketPlacement(
  wikitext: string,
  from: number,
  at: number,
): Placement {
  const round = lastBefore(
    wikitext.slice(from, at),
    /<!--\s*(.*?)\s*-->/g,
    at - from,
  )?.[1];
  if (!round) return {};
  return /lower bracket/i.test(round)
    ? { stakes: "elimination", round }
    : { round };
}

/** Undefined when the match isn't on the page. */
export function placeMatch(
  wikitext: string,
  start: Date,
  tzOffset: number,
  teams: [Team, Team],
): Placement | undefined {
  const match = findMatch(wikitext, start, tzOffset, teams);
  if (!match) return undefined;
  const container = lastBefore(
    wikitext,
    /\{\{(Matchlist|Bracket)\|[^\n]*/g,
    match.at,
  );
  if (!container) return {};
  return container[1] === "Matchlist"
    ? matchlistPlacement(wikitext, container[0], container.index, match.at)
    : bracketPlacement(wikitext, container.index, match.at);
}

/**
 * At Majors, only Swiss matches that send a team through or out are Bo3.
 * It can't tell which, so it assumes the likelier: someone goes out.
 */
export function formatStakes(
  match: TickerMatch,
  all: TickerMatch[],
): Stakes | undefined {
  const round = match.stage.match(/^Round (\d+) - Bo3$/)?.[1];
  if (!round) return undefined;
  const hasBo1 = all.some(
    (m) =>
      m.eventPage === match.eventPage && m.stage === `Round ${round} - Bo1`,
  );
  return hasBo1 ? "elimination" : undefined;
}

const BARE_STAGE = /^(?:Playoffs - )?(Bo\d+)$/;

/**
 * The ticker often names no round in playoffs, so the bracket's round is used instead.
 * Upper and lower bracket names stay off the screen: a lower-bracket match shows which teams have lost.
 */
export function stages(
  match: TickerMatch,
  placement: Placement | undefined,
): { scored: string; shown: string } {
  const format = match.stage.match(BARE_STAGE)?.[1];
  const round = placement?.round;
  if (!format || !round) return { scored: match.stage, shown: match.stage };
  const named = `${round} - ${format}`;
  return {
    scored: named,
    shown: /(?:upper|lower) bracket/i.test(round) ? match.stage : named,
  };
}
