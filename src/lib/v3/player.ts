import { computeStandings, type StandingsRow } from "../standings";
import { participantIds, type MatchDTO, type PlayerDTO } from "../types";

/**
 * One team's view of the tournament.
 *
 * The question players ask a coach twenty times a day is "when do I play, and
 * where" — and the honest answer is not a clock time. Courts are filled
 * automatically as they free up, favouring whoever has rested longest, so
 * promising "you're on at 4:15" would be a lie the app can't keep. Everything
 * here is phrased as what is actually known: you're on this court now, you're
 * next on that court, or you're in the pool with this many matches ahead.
 */

export type PlayerStatus =
  | { kind: "playing"; match: MatchDTO; courtId: number }
  | { kind: "called"; match: MatchDTO; courtId: number; queuedBehind: boolean }
  | { kind: "pool"; match: MatchDTO; onCourtNow: number; waiting: number }
  | { kind: "blocked"; match: MatchDTO }
  | { kind: "done" };

export interface PlayerView {
  team: PlayerDTO;
  status: PlayerStatus;
  played: MatchDTO[];
  upcoming: MatchDTO[];
  row: StandingsRow | null;
  position: number | null;
  tableSize: number;
  tableLabel: string | null;
}

/**
 * Everyone who can be looked up on the player card.
 *
 * In an americano this is the individuals, not the sides — partners rotate, so
 * "Ana & Ben" is a thing that exists for one round rather than someone who can
 * follow their own results all evening.
 */
export function teamsIn(matches: MatchDTO[]): PlayerDTO[] {
  const byId = new Map<string, PlayerDTO>();
  for (const m of matches) {
    const people = [...(m.player1Members ?? (m.player1 ? [m.player1] : [])), ...(m.player2Members ?? (m.player2 ? [m.player2] : []))];
    for (const p of people) byId.set(p.id, p);
  }
  return [...byId.values()].sort((a, b) => a.name.localeCompare(b.name));
}

function involves(match: MatchDTO, teamId: string): boolean {
  return participantIds(match).includes(teamId);
}

/** The side this person is up against — in an americano, the other pair. */
export function opponentOf(match: MatchDTO, teamId: string): PlayerDTO | null {
  const onSide1 = (match.player1Members ?? (match.player1 ? [match.player1] : [])).some((p) => p.id === teamId);
  if (onSide1) return match.player2;
  const onSide2 = (match.player2Members ?? (match.player2 ? [match.player2] : [])).some((p) => p.id === teamId);
  if (onSide2) return match.player1;
  return null;
}

/** Who this person is playing WITH this round — americano only, null elsewhere. */
export function partnerOf(match: MatchDTO, playerId: string): PlayerDTO | null {
  for (const side of [match.player1Members, match.player2Members]) {
    if (!side) continue;
    if (side.some((p) => p.id === playerId)) return side.find((p) => p.id !== playerId) ?? null;
  }
  return null;
}

/** Which table this team is ranked in — a two-group draw has two. */
function tableFor(matches: MatchDTO[], teamId: string): { rows: StandingsRow[]; label: string | null } {
  const group = matches.find((m) => involves(m, teamId) && (m.bracket === "GA" || m.bracket === "GB"));
  if (group) {
    return {
      rows: computeStandings(matches.filter((m) => m.bracket === group.bracket)),
      label: group.bracket === "GA" ? "Group A" : "Group B",
    };
  }
  return { rows: computeStandings(matches), label: null };
}

function statusFor(matches: MatchDTO[], teamId: string, upcoming: MatchDTO[]): PlayerStatus {
  const next = upcoming[0];
  if (!next) return { kind: "done" };

  if (next.courtId !== null) {
    if (next.status === "in_progress" || next.state.totalPoints > 0) {
      return { kind: "playing", match: next, courtId: next.courtId };
    }
    return { kind: "called", match: next, courtId: next.courtId, queuedBehind: next.courtSlot === "next" };
  }

  // Not on a court yet. If the teams aren't even decided it is waiting on an
  // earlier result, which is a different answer from "waiting for a court".
  if (!next.player1 || !next.player2) return { kind: "blocked", match: next };

  return {
    kind: "pool",
    match: next,
    onCourtNow: matches.filter((m) => m.courtId !== null && m.courtSlot === "current" && m.status !== "completed").length,
    waiting: matches.filter((m) => m.courtId === null && m.status === "ready" && m.player1 && m.player2).length,
  };
}

export function buildPlayerView(matches: MatchDTO[], team: PlayerDTO): PlayerView {
  const mine = matches.filter((m) => involves(m, team.id));
  const played = mine
    .filter((m) => m.status === "completed")
    .sort((a, b) => (a.completedAt ?? "").localeCompare(b.completedAt ?? ""));
  // Most imminent first. Without this the headline card is whichever unplayed
  // match happens to sort first in the draw, so a team standing on court mid-
  // rally gets told they are "waiting for a court".
  const imminence = (m: MatchDTO): number => {
    if (m.status === "in_progress" || m.state.totalPoints > 0) return 0;
    if (m.courtId !== null && m.courtSlot === "current") return 1;
    if (m.courtId !== null) return 2;
    if (m.player1 && m.player2) return 3;
    return 4; // still waiting on an earlier result
  };
  const upcoming = mine.filter((m) => m.status !== "completed").sort((a, b) => imminence(a) - imminence(b));

  const { rows, label } = tableFor(matches, team.id);
  const index = rows.findIndex((r) => r.id === team.id);

  return {
    team,
    status: statusFor(matches, team.id, upcoming),
    played,
    upcoming,
    row: index >= 0 ? rows[index] : null,
    position: index >= 0 ? index + 1 : null,
    tableSize: rows.length,
    tableLabel: label,
  };
}

/** "2nd of 6" — how a player would say where they are. */
export function ordinal(n: number): string {
  const rem10 = n % 10;
  const rem100 = n % 100;
  if (rem10 === 1 && rem100 !== 11) return `${n}st`;
  if (rem10 === 2 && rem100 !== 12) return `${n}nd`;
  if (rem10 === 3 && rem100 !== 13) return `${n}rd`;
  return `${n}th`;
}
