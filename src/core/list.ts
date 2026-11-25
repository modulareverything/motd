import type { Match } from "./game";

export const TOP = 5;

// Order never depends on a result.
export function rank(matches: Match[], all: boolean): Match[] {
  const sorted = [...matches].sort(
    (a, b) =>
      Number(b.favourite) - Number(a.favourite) ||
      b.score - a.score ||
      a.start.getTime() - b.start.getTime(),
  );
  return all ? sorted : sorted.slice(0, TOP);
}

const time = (d: Date) =>
  d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
const day = (d: Date) => d.toLocaleDateString("en-GB", { weekday: "short" });

function status(match: Match): string {
  if (match.status === "live") return "LIVE";
  if (match.status === "upcoming") return `UPCOMING ${time(match.start)}`;
  return `FINISHED ${day(match.start)} ${time(match.start)}`;
}

export function render(matches: Match[]): string {
  const width = String(matches.length).length;
  return matches
    .map((m, i) => {
      const n = String(i + 1).padStart(width);
      const star = m.favourite ? "★" : " ";
      return `${n}. ${star} ${status(m).padEnd(19)} ${m.title}\n${" ".repeat(width + 25)}${m.detail}`;
    })
    .join("\n");
}
