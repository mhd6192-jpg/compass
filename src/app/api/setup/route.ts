import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { seedTournament } from "@/lib/bracket/seed";
import { arrangeDraw } from "@/lib/bracket/seedArrange";
import { broadcastSnapshot } from "@/lib/broadcast";
import { isPointsRace, isRotatingPartners, type TournamentFormat } from "@/lib/types";
import { MIN_TWO_GROUP_TEAMS } from "@/lib/bracket/twoGroup";
import { MAX_AMERICANO_PLAYERS, MAX_AMERICANO_ROUNDS, MIN_AMERICANO_PLAYERS } from "@/lib/bracket/americano";
import { MIN_KING_COURT_PLAYERS } from "@/lib/bracket/kingCourt";
import { MIN_TEAM_AMERICANO_PLAYERS } from "@/lib/bracket/teamAmericano";
import { MIN_MIXICANO_PLAYERS } from "@/lib/bracket/mixicano";
import { MIN_WINNER_COURT_PLAYERS } from "@/lib/bracket/winnerCourt";
import { getIO, EVENTS } from "@/lib/socket";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { names, bestOfSets, tiebreakMode, pin, seeds, arrange, format, discipline } = body;
    const fmt: TournamentFormat =
      format === "round-robin" ||
      format === "two-group" ||
      format === "americano" ||
      format === "mexicano" ||
      format === "king-court" ||
      format === "team-americano" ||
      format === "mixicano" ||
      format === "winner-court"
        ? format
        : "compass";
    const rotating = isRotatingPartners(fmt);

    const minTeams =
      fmt === "two-group"
        ? MIN_TWO_GROUP_TEAMS
        : fmt === "king-court"
        ? MIN_KING_COURT_PLAYERS
        : fmt === "team-americano"
        ? MIN_TEAM_AMERICANO_PLAYERS
        : fmt === "mixicano"
        ? MIN_MIXICANO_PLAYERS
        : fmt === "winner-court"
        ? MIN_WINNER_COURT_PLAYERS
        : rotating
        ? MIN_AMERICANO_PLAYERS
        : 3;
    if (!Array.isArray(names) || (fmt === "compass" ? names.length !== 16 : names.length < minTeams)) {
      return NextResponse.json(
        {
          error:
            fmt === "compass"
              ? "Exactly 16 player names are required"
              : rotating
              ? `At least ${minTeams} players are required`
              : `At least ${minTeams} teams are required`,
        },
        { status: 400 }
      );
    }
    if (rotating && names.length > MAX_AMERICANO_PLAYERS) {
      return NextResponse.json({ error: `This format supports up to ${MAX_AMERICANO_PLAYERS} players` }, { status: 400 });
    }
    // The ladder only works with every rung full — see lib/bracket/kingCourt.ts.
    if (fmt === "king-court" && names.length % 4 !== 0) {
      return NextResponse.json(
        { error: `King of the court needs a multiple of four players (got ${names.length})` },
        { status: 400 }
      );
    }
    // Two equal teams that each split into pairs.
    if (fmt === "team-americano" && names.length % 4 !== 0) {
      return NextResponse.json(
        { error: `A team americano needs a multiple of four players (got ${names.length})` },
        { status: 400 }
      );
    }
    // Two equal groups that between them make whole matches.
    if (fmt === "mixicano" && names.length % 4 !== 0) {
      return NextResponse.json(
        { error: `A mixicano needs a multiple of four players (got ${names.length})` },
        { status: 400 }
      );
    }

    const amRounds = rotating ? Number(body.amRounds) || 0 : 0;
    if (amRounds !== 0 && (!Number.isInteger(amRounds) || amRounds < 1 || amRounds > MAX_AMERICANO_ROUNDS)) {
      return NextResponse.json({ error: `Rounds must be between 1 and ${MAX_AMERICANO_ROUNDS}` }, { status: 400 });
    }
    if (!pin || typeof pin !== "string" || pin.length < 4) {
      return NextResponse.json({ error: "PIN must be at least 4 digits/characters" }, { status: 400 });
    }
    if (!["standard", "match-tiebreak", "advantage", "race-to-9", "race-to-16"].includes(tiebreakMode)) {
      return NextResponse.json({ error: "Invalid tiebreak mode" }, { status: 400 });
    }
    const bestOf = Number(bestOfSets);
    if (![1, 3, 5].includes(bestOf)) {
      return NextResponse.json({ error: "bestOfSets must be 1, 3, or 5" }, { status: 400 });
    }

    // The race knobs only mean anything for the points-race formats; for the
    // set-based formats they are stored as 0 ("not configured") so a later
    // switch of format can't inherit a stale target.
    let raceTarget = 0;
    let serveEvery = 0;
    if (isPointsRace(tiebreakMode)) {
      raceTarget = Number(body.raceTarget) || 0;
      serveEvery = Number(body.serveEvery) || 0;
      if (raceTarget !== 0 && (!Number.isInteger(raceTarget) || raceTarget < 4 || raceTarget > 99)) {
        return NextResponse.json({ error: "The race target must be a whole number between 4 and 99" }, { status: 400 });
      }
      if (serveEvery !== 0 && (!Number.isInteger(serveEvery) || serveEvery < 1 || serveEvery > 10)) {
        return NextResponse.json({ error: "Serve change must be every 1 to 10 points" }, { status: 400 });
      }
    }

    // Optionally arrange by seed so top seeds land in separate quarters (they only
    // meet in the semis/final). `seeds[i]` is the 1-based seed for `names[i]`; 0/null = unseeded.
    let orderedNames: string[] = names;
    if (fmt === "compass" && arrange && Array.isArray(seeds) && seeds.length === 16) {
      orderedNames = arrangeDraw(names.map((n: string, i: number) => ({ name: n, seed: Number(seeds[i]) || null })));
    }

    // A points race is one race, never a best-of-N. Allowing 3 or 5 here would
    // produce a hybrid the engine can't score sensibly (a points race for set 1,
    // then ordinary games for the rest), so pin it to a single set.
    const effectiveBestOf = isPointsRace(tiebreakMode) ? 1 : bestOf;

    const rawCourts = Array.isArray(body.courtIds) ? body.courtIds.map(Number).filter((n: number) => Number.isInteger(n) && n >= 1 && n <= 12) : [];
    const courtIds: number[] = [...new Set<number>(rawCourts)].sort((a, b) => a - b);
    if (Array.isArray(body.courtIds) && courtIds.length === 0) {
      return NextResponse.json({ error: "Pick at least one court (numbers 1-12)" }, { status: 400 });
    }

    await seedTournament(prisma, orderedNames, {
      bestOfSets: effectiveBestOf,
      tiebreakMode,
      raceTarget,
      serveEvery,
      amRounds,
      pin,
      format: fmt,
      discipline: discipline === "singles" ? "singles" : "doubles",
      courtIds: courtIds.length ? courtIds : undefined,
    });
    await broadcastSnapshot();
    getIO()?.emit(EVENTS.TOURNAMENT_STARTED, {});

    return NextResponse.json({ ok: true });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to start tournament";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
