import type { MatchDTO } from "../types";
import {
  CeremonyDTO,
  CourtScreen,
  CourtStageDTO,
  currentOnCourt,
  emptyCourtStage,
  nextOnCourt,
  resolveCourtScreen,
} from "./stage";

/**
 * The whole venue in one object.
 *
 * Every v2 screen so far answers "what is happening on THIS court". Nothing
 * answered "what is happening at the event", which is the question the person
 * running it actually has — and the reason they end up walking laps of the hall
 * looking at TVs. This is the shared model behind the organiser's control room
 * and the lobby big board, so the two can never disagree.
 */

export type AlertLevel = "info" | "warn";

export interface CourtCard {
  courtId: number;
  label: string;
  screen: CourtScreen;
  /** What that court's TV is showing, if it is a match. */
  match: MatchDTO | null;
  /** Queued behind it. */
  upcoming: MatchDTO | null;
  coachName: string | null;
  onAir: boolean;
  /** Milliseconds since the match started, once it has. */
  elapsedMs: number | null;
  /** Milliseconds a finished match has been sitting on the celebration screen. */
  heldMs: number | null;
  alert: { level: AlertLevel; text: string } | null;
}

export interface VenueView {
  courts: CourtCard[];
  /** Ready to play, not yet called to a court. */
  queue: MatchDTO[];
  progress: { completed: number; total: number };
  ceremonyRunning: boolean;
  alertCount: number;
}

/** A celebration left up this long usually means the coach has walked off. */
const HELD_TOO_LONG_MS = 4 * 60 * 1000;

function ms(from: string | null, now: number): number | null {
  if (!from) return null;
  const t = Date.parse(from);
  return Number.isFinite(t) ? Math.max(0, now - t) : null;
}

/** "45s", "12m", "1h 04m" — short enough to sit in a court card. */
export function formatDuration(value: number | null): string {
  if (value === null) return "—";
  const mins = Math.floor(value / 60000);
  // Below a minute, minutes round to "0m" and read like a bug.
  if (mins < 1) return `${Math.max(1, Math.round(value / 1000))}s`;
  if (mins < 60) return `${mins}m`;
  return `${Math.floor(mins / 60)}h ${String(mins % 60).padStart(2, "0")}m`;
}

function alertFor(args: {
  screen: CourtScreen;
  match: MatchDTO | null;
  heldMs: number | null;
  queueLength: number;
  onAir: boolean;
}): CourtCard["alert"] {
  const { screen, match, heldMs, queueLength, onAir } = args;

  // The one that actually costs the event time: a finished match still on the
  // TV, court empty, everyone waiting for someone to tap Finish.
  if (screen === "winner" && heldMs !== null && heldMs > HELD_TOO_LONG_MS) {
    return { level: "warn", text: `Celebration held ${formatDuration(heldMs)} — needs finishing` };
  }
  if (!match && queueLength > 0) {
    return { level: "warn", text: `Court free — ${queueLength} match${queueLength === 1 ? "" : "es"} waiting` };
  }
  if (match && !onAir && screen !== "winner" && match.state.totalPoints === 0) {
    return { level: "info", text: "Ready to start" };
  }
  return null;
}

export function buildVenueView(
  snapshot: {
    courts: Array<{ id: number; label: string }>;
    matches: MatchDTO[];
    progress: { completed: number; total: number };
    v2: { courts: CourtStageDTO[]; ceremony: CeremonyDTO };
  },
  now: number
): VenueView {
  const allPlayed = snapshot.progress.total > 0 && snapshot.progress.completed === snapshot.progress.total;

  const queue = snapshot.matches.filter((m) => m.courtId === null && m.status === "ready" && m.player1 && m.player2);

  const courts = snapshot.courts.map<CourtCard>((court) => {
    const stage = snapshot.v2.courts.find((c) => c.courtId === court.id) ?? emptyCourtStage(court.id);
    const view = resolveCourtScreen({
      courtId: court.id,
      stage,
      matches: snapshot.matches,
      allPlayed,
      ceremony: snapshot.v2.ceremony,
    });

    const match = view.screen === "live" || view.screen === "winner" ? view.match : currentOnCourt(snapshot.matches, court.id);
    const onAir = stage.stage === "live";
    const heldMs = view.screen === "winner" ? ms(match?.completedAt ?? null, now) : null;

    return {
      courtId: court.id,
      label: court.label,
      screen: view.screen,
      match,
      upcoming: nextOnCourt(snapshot.matches, court.id),
      coachName: stage.coachName,
      onAir,
      elapsedMs: view.screen === "live" ? ms(match?.startedAt ?? null, now) : null,
      heldMs,
      alert: alertFor({ screen: view.screen, match, heldMs, queueLength: queue.length, onAir }),
    };
  });

  return {
    courts,
    queue,
    progress: snapshot.progress,
    ceremonyRunning: snapshot.v2.ceremony.stage !== "idle",
    alertCount: courts.filter((c) => c.alert?.level === "warn").length,
  };
}

/** The live score as two short strings, whatever the format. */
export function scoreLine(match: MatchDTO): { a: string; b: string; caption: string } {
  const st = match.state;

  // A finished match has no "current" anything left to read, and a race that
  // ended 16-9 must not be reported as "1 set to 0" — show what was actually
  // played.
  if (match.status === "completed") {
    const only = st.completedSets.length === 1 ? st.completedSets[0] : null;
    if (only) {
      // A race is recorded as a one-game set whose real score sits in the
      // tiebreak pair — reading `games` there reports 16-9 as "1-0".
      const [a, b] = only.tiebreak ?? only.games;
      return { a: String(a), b: String(b), caption: "final" };
    }
    return { a: String(st.setsWon[0]), b: String(st.setsWon[1]), caption: "sets" };
  }

  if (st.isMatchTiebreakSet) {
    const [a, b] = st.currentGame?.display ?? ["0", "0"];
    return { a, b, caption: "points" };
  }
  const games = st.currentSet?.games ?? [0, 0];
  const pts = st.currentGame?.display;
  return {
    a: `${st.setsWon[0]}·${games[0]}${pts ? ` (${pts[0]})` : ""}`,
    b: `${st.setsWon[1]}·${games[1]}${pts ? ` (${pts[1]})` : ""}`,
    caption: "sets · games",
  };
}
