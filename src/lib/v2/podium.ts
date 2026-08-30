/**
 * Who stands on the podium, in order, for the awards ceremony.
 *
 * Round-robin is the straightforward case: the final table already ranks
 * everyone. A compass draw has no single table, so the podium is read off the
 * bracket finals — East decides first and second, and the West (consolation)
 * final is the closest thing the format has to a third-place match.
 */
import { computeStandings, computeTeamStandings } from "../standings";
import { BRACKET_LABELS, BracketCode, MatchDTO, isRotatingPartners, isTeamAmericano } from "../types";
import type { AwardDTO } from "./stage";

/** How deep the ceremony can go — nobody hands out ninth place. */
export const MAX_PLACES = 6;

function finalOf(matches: MatchDTO[], bracket: BracketCode): MatchDTO | undefined {
  const final = matches.find((m) => m.bracket === bracket && m.isBracketFinal);
  return final && final.status === "completed" && final.winnerId ? final : undefined;
}

function sidesOf(final: MatchDTO): { winner: { id: string; name: string }; loser: { id: string; name: string } } | null {
  if (!final.player1 || !final.player2 || !final.winnerId) return null;
  const winnerIsP1 = final.winnerId === final.player1.id;
  return {
    winner: winnerIsP1 ? final.player1 : final.player2,
    loser: winnerIsP1 ? final.player2 : final.player1,
  };
}

function compassPodium(matches: MatchDTO[]): AwardDTO[] {
  const out: AwardDTO[] = [];
  const push = (playerId: string, name: string, detail: string) => {
    if (out.some((a) => a.playerId === playerId)) return;
    out.push({ place: out.length + 1, playerId, name, detail });
  };

  // East settles the title; West is the consolation draw, so its final is the
  // nearest equivalent of a third-place play-off.
  for (const bracket of ["E", "W"] as BracketCode[]) {
    const final = finalOf(matches, bracket);
    const sides = final ? sidesOf(final) : null;
    if (!sides) continue;
    push(sides.winner.id, sides.winner.name, `${BRACKET_LABELS[bracket]} Draw — Champion`);
    push(sides.loser.id, sides.loser.name, `${BRACKET_LABELS[bracket]} Draw — Finalist`);
  }
  // Remaining draws only fill places nobody has claimed yet.
  for (const bracket of ["N", "S", "NE", "SE", "NW", "SW"] as BracketCode[]) {
    if (out.length >= MAX_PLACES) break;
    const final = finalOf(matches, bracket);
    const sides = final ? sidesOf(final) : null;
    if (!sides) continue;
    push(sides.winner.id, sides.winner.name, `${BRACKET_LABELS[bracket]} Draw — Champion`);
  }
  return out.slice(0, MAX_PLACES);
}

function groupPodium(matches: MatchDTO[]): AwardDTO[] {
  return computeStandings(matches)
    .slice(0, MAX_PLACES)
    .map((row, i) => ({
      place: i + 1,
      playerId: row.id,
      name: row.name,
      detail: `${row.won} ${row.won === 1 ? "win" : "wins"} · ${row.lost} ${row.lost === 1 ? "loss" : "losses"} · ${row.pointsFor} points`,
    }));
}

/**
 * The rotating-partner formats are won on points, not on wins, so the medals
 * read that way: the headline number is the personal total, with the win/loss
 * record behind it.
 */
function rotatingPodium(matches: MatchDTO[]): AwardDTO[] {
  return computeStandings(matches)
    .slice(0, MAX_PLACES)
    .map((row, i) => ({
      place: i + 1,
      playerId: row.id,
      name: row.name,
      detail: `${row.pointsFor} points · ${row.won}–${row.lost} from ${row.played} ${row.played === 1 ? "match" : "matches"}`,
    }));
}

/**
 * Two groups feeding a knockout: the final settles first and second, both beaten
 * semifinalists share the podium behind them, and anyone deeper is ranked off
 * their own group table.
 */
function twoGroupPodium(matches: MatchDTO[]): AwardDTO[] {
  const out: AwardDTO[] = [];
  const push = (playerId: string, name: string, detail: string) => {
    if (out.length >= MAX_PLACES || out.some((a) => a.playerId === playerId)) return;
    out.push({ place: out.length + 1, playerId, name, detail });
  };

  const final = matches.find((m) => m.bracket === "F" && m.status === "completed" && m.winnerId);
  const sides = final ? sidesOf(final) : null;
  if (sides) {
    push(sides.winner.id, sides.winner.name, "Champion");
    push(sides.loser.id, sides.loser.name, "Finalist");
  }
  for (const semi of matches.filter((m) => m.bracket === "SF" && m.status === "completed" && m.loserId)) {
    const s = sidesOf(semi);
    if (s) push(s.loser.id, s.loser.name, "Semifinalist");
  }
  // Everyone else, best group record first.
  const rest = ["GA", "GB"].flatMap((b) => computeStandings(matches.filter((m) => m.bracket === b)));
  rest.sort((a, b) => b.won - a.won || b.pointsFor - a.pointsFor);
  for (const row of rest) {
    push(row.id, row.name, `${row.won} ${row.won === 1 ? "win" : "wins"} · ${row.pointsFor} points`);
  }
  return out.slice(0, MAX_PLACES);
}

/**
 * A team americano is won by a SIDE, so the medals go to the teams — announcing
 * the highest individual scorer would be crowning someone the format never set
 * out to rank.
 */
function teamPodium(matches: MatchDTO[]): AwardDTO[] {
  return computeTeamStandings(matches)
    .slice(0, MAX_PLACES)
    .map((row, i) => ({
      place: i + 1,
      playerId: row.id,
      name: row.name,
      detail: `${row.pointsFor} points · ${row.won}–${row.lost} from ${row.played} ${row.played === 1 ? "match" : "matches"}`,
    }));
}

/** The full ranked podium for this tournament, deepest place last. */
export function computePodium(matches: MatchDTO[], format: string): AwardDTO[] {
  if (isTeamAmericano(format)) return teamPodium(matches);
  if (isRotatingPartners(format)) return rotatingPodium(matches);
  if (format === "round-robin") return groupPodium(matches);
  if (format === "two-group") return twoGroupPodium(matches);
  return compassPodium(matches);
}

/**
 * The podium trimmed to the places the organiser chose, in reveal order —
 * third, then second, then first. Places with nobody in them (a group of two
 * has no third place) are dropped rather than announced as blanks.
 */
export function buildAwards(podium: AwardDTO[], places: number[]): { awards: AwardDTO[]; places: number[] } {
  const wanted = Array.from(new Set(places))
    .filter((p) => Number.isInteger(p) && p >= 1 && p <= MAX_PLACES)
    .sort((a, b) => b - a); // 3 → 2 → 1
  const awards = wanted.map((p) => podium.find((a) => a.place === p)).filter((a): a is AwardDTO => !!a);
  return { awards, places: awards.map((a) => a.place) };
}
