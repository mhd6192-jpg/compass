/**
 * Compass v2 — the per-court TV state machine.
 *
 * Every court has its own TV. Court 3's screen only ever talks about court 3:
 * it holds the upcoming match and the standings between matches, becomes a
 * full-screen scoreboard while its match is being played, freezes on the
 * winner until that court's coach releases it, and joins the rest of the venue
 * for the awards ceremony at the end.
 *
 * Only ONE bit of that is actually stored per court ("idle" vs "live") — every
 * other screen is derived from the tournament data. That is deliberate: a
 * stored "winner" flag could disagree with the real result after an undo or a
 * score correction, and a TV stuck celebrating a match that was un-completed is
 * the worst possible failure on a screen nobody can reach.
 */
import type { MatchDTO } from "../types";

/** What the coach controls: is this court on air, and with which match. */
export type StoredCourtStage = "idle" | "live";

/** What the TV actually renders. */
export type CourtScreen =
  | "idle" // upcoming match on top, standings below
  | "live" // full-screen scoreboard
  | "winner" // frozen celebration, held until the coach taps Finish
  | "waiting" // every match played, results not announced yet
  | "final" // results announced — the medal table, left up for photos
  | "ceremony"; // venue-wide awards presentation

export type CeremonyStage =
  | "idle" // not running — courts show their own screens
  | "standby" // "and now, the presentation" holding card on every TV
  | "revealing" // an award is on screen
  | "complete"; // full podium, celebration

export interface CourtStageDTO {
  courtId: number;
  stage: StoredCourtStage;
  activeMatchId: string | null;
  coachName: string | null;
  rev: number;
}

export interface AwardDTO {
  /** 1 = champion, 2 = runner-up, 3 = third place, … */
  place: number;
  playerId: string;
  name: string;
  /** One line of supporting detail — the group record, or the bracket won. */
  detail: string;
}

export interface CeremonyDTO {
  stage: CeremonyStage;
  /** Places to announce, in reveal order (lowest place first: [3,2,1]). */
  places: number[];
  /** Index into `places` of the award currently on screen; -1 = none yet. */
  cursor: number;
  /** Podium frozen at the moment the ceremony started. */
  awards: AwardDTO[];
  /** Ceremony music on the court TVs, controlled from the announcer's remote. */
  soundOn: boolean;
  /** The presentation has reached the full podium at least once. */
  announced: boolean;
  rev: number;
}

export interface V2StateDTO {
  /** False until `prisma db push` has created the v2 tables. */
  ready: boolean;
  courts: CourtStageDTO[];
  ceremony: CeremonyDTO;
}

export const IDLE_CEREMONY: CeremonyDTO = {
  stage: "idle",
  places: [],
  cursor: -1,
  awards: [],
  soundOn: true,
  announced: false,
  rev: 0,
};

export function emptyCourtStage(courtId: number): CourtStageDTO {
  return { courtId, stage: "idle", activeMatchId: null, coachName: null, rev: 0 };
}

export interface CourtView {
  screen: CourtScreen;
  /** The match being played or celebrated (live / winner screens). */
  match: MatchDTO | null;
  /** Idle screen: what this court plays next, and the one after it. */
  upcoming: MatchDTO | null;
  onDeck: MatchDTO | null;
  /** Winner screen: the award currently being held on the TV. */
  winnerName: string | null;
  loserName: string | null;
}

/** The match sitting in a court's "current" slot, if any. */
export function currentOnCourt(matches: MatchDTO[], courtId: number): MatchDTO | null {
  return matches.find((m) => m.courtId === courtId && m.courtSlot === "current" && m.status !== "completed") ?? null;
}

/** The match queued behind it. */
export function nextOnCourt(matches: MatchDTO[], courtId: number): MatchDTO | null {
  return matches.find((m) => m.courtId === courtId && m.courtSlot === "next" && m.status !== "completed") ?? null;
}

/**
 * Resolves what one court's TV should be showing right now. Order matters: the
 * ceremony outranks everything (the whole venue looks at the podium together),
 * and a held winner outranks "waiting for results" so the last match of the day
 * still gets its celebration before the screens go to the ceremony holding card.
 */
export function resolveCourtScreen(args: {
  courtId: number;
  stage: CourtStageDTO;
  matches: MatchDTO[];
  allPlayed: boolean;
  ceremony: CeremonyDTO;
}): CourtView {
  const { courtId, stage, matches, allPlayed, ceremony } = args;
  const upcoming = currentOnCourt(matches, courtId);
  const onDeck = nextOnCourt(matches, courtId);
  const base = { match: null, upcoming, onDeck, winnerName: null, loserName: null };

  if (ceremony.stage !== "idle") {
    return { ...base, screen: "ceremony" };
  }

  const active = stage.activeMatchId ? matches.find((m) => m.id === stage.activeMatchId) ?? null : null;

  if (stage.stage === "live" && active) {
    if (active.status === "completed" && active.winnerId && active.player1 && active.player2) {
      const winnerIsP1 = active.winnerId === active.player1.id;
      return {
        ...base,
        screen: "winner",
        match: active,
        winnerName: winnerIsP1 ? active.player1.name : active.player2.name,
        loserName: winnerIsP1 ? active.player2.name : active.player1.name,
      };
    }
    if (active.status !== "completed") {
      return { ...base, screen: "live", match: active };
    }
  }

  if (allPlayed) return { ...base, screen: ceremony.announced ? "final" : "waiting" };
  return { ...base, screen: "idle" };
}

/** The award on screen right now, or null while on the standby card. */
export function currentAward(ceremony: CeremonyDTO): AwardDTO | null {
  if (ceremony.stage !== "revealing") return null;
  const place = ceremony.places[ceremony.cursor];
  if (place === undefined) return null;
  return ceremony.awards.find((a) => a.place === place) ?? null;
}

/** Every award revealed so far, champion last — used to build up the podium. */
export function revealedAwards(ceremony: CeremonyDTO): AwardDTO[] {
  const upto = ceremony.stage === "complete" ? ceremony.places.length - 1 : ceremony.cursor;
  const shown = ceremony.places.slice(0, upto + 1);
  return ceremony.awards.filter((a) => shown.includes(a.place)).sort((a, b) => b.place - a.place);
}
