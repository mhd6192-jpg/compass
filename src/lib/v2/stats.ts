import { computeStandings } from "../standings";
import type { MatchDTO } from "../types";
import { formatDuration } from "./venue";

/**
 * Things worth putting on a court screen between matches.
 *
 * Every card here is computed from results that actually happened; nothing is
 * estimated or rounded into something catchier. A card is only produced when
 * its data exists, so an event that has just started shows two cards and one
 * that has run all day shows seven, rather than a row of zeroes.
 *
 * The longest rally is the one figure to treat with care: it is measured tap to
 * tap, so it bounds the rally rather than timing it. The card states it plainly
 * with no qualifier, by choice — but the field behind it keeps the literal name
 * `longestPointMs`, because the data is a gap between points whatever the card
 * calls it.
 */

export interface Spotlight {
  key: string;
  icon: string;
  eyebrow: string;
  headline: string;
  detail: string;
}

/** The margin of a finished match, when it is a single decisive score. */
function marginOf(match: MatchDTO): { margin: number; line: string } | null {
  const sets = match.state.completedSets;
  if (sets.length !== 1) return null; // multi-set results don't reduce to one number
  const [a, b] = sets[0].tiebreak ?? sets[0].games;
  if (a === b) return null;
  const hi = Math.max(a, b);
  const lo = Math.min(a, b);
  return { margin: hi - lo, line: `${hi}–${lo}` };
}

function durationOf(match: MatchDTO): number | null {
  if (!match.startedAt || !match.completedAt) return null;
  const ms = Date.parse(match.completedAt) - Date.parse(match.startedAt);
  return Number.isFinite(ms) && ms > 0 ? ms : null;
}

function namesOf(match: MatchDTO): string {
  return `${match.player1?.name ?? "TBD"} v ${match.player2?.name ?? "TBD"}`;
}

function winnerName(match: MatchDTO): string | null {
  if (!match.winnerId) return null;
  return match.winnerId === match.player1?.id ? match.player1?.name ?? null : match.player2?.name ?? null;
}

export function buildSpotlights(matches: MatchDTO[]): Spotlight[] {
  const done = matches.filter((m) => m.status === "completed" && !m.forcedEnd);
  const cards: Spotlight[] = [];

  if (done.length === 0) return cards;

  // --- who is having the best day ---
  const table = computeStandings(matches);
  const leader = table[0];
  if (leader && leader.won > 0) {
    const played = leader.won + leader.lost;
    cards.push({
      key: "leader",
      icon: "🔥",
      eyebrow: "Team of the day",
      headline: leader.name,
      detail: `${leader.won} ${leader.won === 1 ? "win" : "wins"} from ${played}`,
    });
  }

  // --- the match that would not end ---
  const timed = done
    .map((m) => ({ m, ms: durationOf(m) }))
    .filter((x): x is { m: MatchDTO; ms: number } => x.ms !== null);
  const longest = timed.length > 0 ? timed.reduce((best, x) => (x.ms > best.ms ? x : best)) : null;
  // Results typed straight in as a final score take no time at all; putting
  // "longest match: 4s" on a TV would just look broken.
  if (longest && longest.ms >= 60_000) {
    cards.push({
      key: "longest",
      icon: "⏱️",
      eyebrow: "Longest match",
      headline: formatDuration(longest.ms),
      detail: namesOf(longest.m),
    });
  }

  // --- the tightest and the most one-sided ---
  const withMargin = done
    .map((m) => ({ m, ...(marginOf(m) ?? { margin: -1, line: "" }) }))
    .filter((x) => x.margin >= 0);

  if (withMargin.length > 0) {
    const closest = withMargin.reduce((best, x) => (x.margin < best.margin ? x : best));
    cards.push({
      key: "closest",
      icon: "🪶",
      eyebrow: "Closest match",
      headline: closest.line,
      detail: `${winnerName(closest.m) ?? "—"} over ${
        closest.m.winnerId === closest.m.player1?.id ? closest.m.player2?.name : closest.m.player1?.name
      }`,
    });

    const biggest = withMargin.reduce((best, x) => (x.margin > best.margin ? x : best));
    if (biggest.m.id !== closest.m.id) {
      cards.push({
        key: "biggest",
        icon: "💥",
        eyebrow: "Most decisive",
        headline: biggest.line,
        detail: `${winnerName(biggest.m) ?? "—"} over ${
          biggest.m.winnerId === biggest.m.player1?.id ? biggest.m.player2?.name : biggest.m.player1?.name
        }`,
      });
    }
  }

  // --- the one players actually retell ---
  const comebacks = done.filter((m) => m.comeback && m.comeback.deficit >= 3);
  if (comebacks.length > 0) {
    const best = comebacks.reduce((a, b) => (b.comeback!.deficit > a.comeback!.deficit ? b : a));
    const [mine, theirs] = best.comeback!.from;
    cards.push({
      key: "comeback",
      icon: "🔄",
      eyebrow: "Biggest comeback",
      headline: `From ${mine}–${theirs} down`,
      detail: `${winnerName(best) ?? "—"} beat ${
        best.winnerId === best.player1?.id ? best.player2?.name : best.player1?.name
      }`,
    });
  }

  // --- the point that would not end ---
  const rallies = done.filter((m) => m.longestPointMs !== null);
  if (rallies.length > 0) {
    const best = rallies.reduce((a, b) => (b.longestPointMs! > a.longestPointMs! ? b : a));
    cards.push({
      key: "rally",
      icon: "🏓",
      eyebrow: "Longest rally",
      headline: formatDuration(best.longestPointMs!),
      detail: namesOf(best),
    });
  }

  // --- the sheer volume of tennis played ---
  const totalPoints = matches.reduce((sum, m) => sum + m.state.totalPoints, 0);
  if (totalPoints > 0) {
    cards.push({
      key: "points",
      icon: "🎾",
      eyebrow: "Points played today",
      headline: totalPoints.toLocaleString(),
      detail: `${done.length} ${done.length === 1 ? "match" : "matches"} completed`,
    });
  }

  // --- the heaviest scorer, when it is not simply the leader ---
  const topScorer = [...table].sort((a, b) => b.pointsFor - a.pointsFor)[0];
  if (topScorer && topScorer.pointsFor > 0 && topScorer.id !== leader?.id) {
    cards.push({
      key: "scorer",
      icon: "📈",
      eyebrow: "Most points won",
      headline: topScorer.name,
      detail: `${topScorer.pointsFor} points`,
    });
  }

  return cards;
}
