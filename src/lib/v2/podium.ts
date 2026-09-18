/**
 * Who stands on the podium, in order, for the awards ceremony.
 *
 * Round-robin is the straightforward case: the final table already ranks
 * everyone. A compass draw has no single table, so the podium is read off the
 * bracket finals — East decides first and second, and the West (consolation)
 * final is the closest thing the format has to a third-place match.
 */
import { computeStandings, computeTeamStandings } from "../standings";
import { mixicanoGroupName } from "../bracket/mixicano";
import { isThirdPlaceRow } from "../bracket/twoGroup";
import { BRACKET_LABELS, BracketCode, MatchDTO, isRotatingPartners, isTeamScored, tallyUnit } from "../types";
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

function compassPodium(matches: MatchDTO[], unit: string): AwardDTO[] {
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

function groupPodium(matches: MatchDTO[], unit: string): AwardDTO[] {
  return computeStandings(matches)
    .slice(0, MAX_PLACES)
    .map((row, i) => ({
      place: i + 1,
      playerId: row.id,
      name: row.name,
      detail: `${row.won} ${row.won === 1 ? "win" : "wins"} · ${row.lost} ${row.lost === 1 ? "loss" : "losses"} · ${row.pointsFor} ${unit}`,
    }));
}

/**
 * The rotating-partner formats are won on points, not on wins, so the medals
 * read that way: the headline number is the personal total, with the win/loss
 * record behind it.
 */
/**
 * KNOWN LIMITATION, deliberately left as it is.
 *
 * A group-ranked format (mixed americano, mixed mexicano) ranks its two groups
 * separately — that per-group table is the whole reason for running one — but
 * the podium here is a single combined table, so a stronger group can take
 * every medal and the other group's winner is never announced.
 *
 * Interleaving the two tables so both leaders share first place was tried and
 * reverted, because `place` is load-bearing in three other places that all
 * assume it is unique: `buildAwards` picks ONE award per place (so the ceremony
 * silently dropped the second group again), `FinalStandingsScreen` names
 * `podium[0]` the tournament champion (so it named the lower-scoring group's
 * leader), and `archive.finalPlacings` sorts the ARCHIVED standings and every
 * `MemberResult.rank` by it — durable club records, reordered by a key the
 * table does not show.
 *
 * Announcing two champions is a real feature and worth building; it needs a
 * decision about what the trophy card says and how many medals each group gets,
 * and a rank the archive can represent. It is not a one-line change here.
 */
function rotatingPodium(matches: MatchDTO[], unit: string): AwardDTO[] {
  // In the grouped formats the group is part of who someone is on the night, so
  // it belongs on the medal line rather than only in the table.
  const groupOfPlayer = new Map<string, number>();
  for (const m of matches) {
    for (const p of [...(m.player1Members ?? []), ...(m.player2Members ?? [])]) {
      if (p.team) groupOfPlayer.set(p.id, p.team);
    }
  }
  return computeStandings(matches)
    .slice(0, MAX_PLACES)
    .map((row, i) => {
      const group = groupOfPlayer.get(row.id);
      const record = `${row.pointsFor} ${unit} · ${row.won}–${row.lost} from ${row.played} ${row.played === 1 ? "match" : "matches"}`;
      return {
        place: i + 1,
        playerId: row.id,
        name: row.name,
        detail: group ? `${mixicanoGroupName(group)} · ${record}` : record,
      };
    });
}

/**
 * Two groups feeding a knockout: the final settles first and second, both beaten
 * semifinalists share the podium behind them, and anyone deeper is ranked off
 * their own group table.
 */
function twoGroupPodium(matches: MatchDTO[], unit: string): AwardDTO[] {
  const out: AwardDTO[] = [];
  const push = (playerId: string, name: string, detail: string) => {
    if (out.length >= MAX_PLACES || out.some((a) => a.playerId === playerId)) return;
    out.push({ place: out.length + 1, playerId, name, detail });
  };

  // `isBracketFinal`, not just the bracket. The F bracket holds a second row
  // when a third-place play-off was drawn, and picking the first F match found
  // would have crowned whoever won THAT as champion.
  const final = matches.find((m) => m.bracket === "F" && m.isBracketFinal && m.status === "completed" && m.winnerId);
  const sides = final ? sidesOf(final) : null;
  if (sides) {
    push(sides.winner.id, sides.winner.name, "Champion");
    push(sides.loser.id, sides.loser.name, "Finalist");
  }

  // Third and fourth are settled on court when the play-off was played, and
  // only then. Without one the two beaten semifinalists share the places behind
  // the finalists, because nothing separated them.
  const playoff = matches.find((m) => isThirdPlaceRow(m) && m.status === "completed" && m.winnerId);
  const playoffSides = playoff ? sidesOf(playoff) : null;
  if (playoffSides) {
    push(playoffSides.winner.id, playoffSides.winner.name, "Third place");
    push(playoffSides.loser.id, playoffSides.loser.name, "Fourth place");
  }
  for (const semi of matches.filter((m) => m.bracket === "SF" && m.status === "completed" && m.loserId)) {
    const s = sidesOf(semi);
    if (s) push(s.loser.id, s.loser.name, "Semifinalist");
  }
  // Everyone else, best group record first.
  const rest = ["GA", "GB"].flatMap((b) => computeStandings(matches.filter((m) => m.bracket === b)));
  rest.sort((a, b) => b.won - a.won || b.pointsFor - a.pointsFor);
  for (const row of rest) {
    push(row.id, row.name, `${row.won} ${row.won === 1 ? "win" : "wins"} · ${row.pointsFor} ${unit}`);
  }
  return out.slice(0, MAX_PLACES);
}

/**
 * The team formats are won by a SIDE, so the medals go to the teams —
 * announcing the highest individual scorer would be crowning someone those
 * formats never set out to rank.
 */
function teamPodium(matches: MatchDTO[], unit: string): AwardDTO[] {
  return computeTeamStandings(matches)
    .slice(0, MAX_PLACES)
    .map((row, i) => ({
      place: i + 1,
      playerId: row.id,
      name: row.name,
      detail: `${row.pointsFor} ${unit} · ${row.won}–${row.lost} from ${row.played} ${row.played === 1 ? "match" : "matches"}`,
    }));
}

/** The full ranked podium for this tournament, deepest place last. */
/**
 * `tiebreakMode` decides one word: the tally column counts POINTS in a race and
 * GAMES in set play, and the podium used to say "points" either way — so a
 * best-of-three announced its medals as "18 points" when it meant 18 games.
 * Every screen already takes that word from `tallyUnit`; this one did not.
 */
export function computePodium(matches: MatchDTO[], format: string, tiebreakMode?: string): AwardDTO[] {
  const unit = tallyUnit(tiebreakMode).long;
  if (isTeamScored(format)) return teamPodium(matches, unit);
  if (isRotatingPartners(format)) return rotatingPodium(matches, unit);
  if (format === "round-robin") return groupPodium(matches, unit);
  if (format === "two-group") return twoGroupPodium(matches, unit);
  return compassPodium(matches, unit);
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
