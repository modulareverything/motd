import type { Team } from "./liquipedia";

/** Folds a team name so that "Team Vitality", "Vitality" and "FaZe Clan"/"FaZe" compare equal. */
export function normalize(name: string): string {
  return name
    .normalize("NFD")
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, "")
    .replace(/^team /, "")
    .replace(/ (clan|esports|gaming|team)$/, "")
    .replace(/ /g, "");
}

export function aliases(team: Team): string[] {
  const initials = team.name
    .split(/\s+/)
    .map((word) => word[0] ?? "")
    .join("")
    .toLowerCase();
  return [...new Set([normalize(team.name), normalize(team.short), normalize(team.page), initials])];
}
