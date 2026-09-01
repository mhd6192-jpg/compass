// The archive, against the real database.
//
// The property under test is the one that bit for real: a reset must no longer
// destroy the night that was just played. Everything else here — the contents,
// the team split, the refusal to archive nothing — exists so the record is
// worth having when someone opens it weeks later.
//
// RESTART `npm run dev:db` BEFORE EACH RUN.
import { PrismaClient } from "@prisma/client";
import { seedTournament } from "../src/lib/bracket/seed";
import { getFullSnapshot } from "../src/lib/bracket/dto";
import { scorePoint } from "../src/lib/bracket/routing";
import { archiveCurrentTournament, buildArchive } from "../src/lib/archive";
import { resetV2State } from "../src/lib/v2/reset";
import type { MatchDTO } from "../src/lib/types";

const URL = "postgresql://postgres:postgres@127.0.0.1:5433/postgres?connection_limit=1";
const prisma = new PrismaClient({ datasources: { db: { url: URL } } });

let failures = 0;
function check(name: string, cond: boolean, extra = "") {
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${extra ? ` — ${extra}` : ""}`);
  if (!cond) failures++;
}

const TARGET = 16;

async function playMatch(id: string, side1Wins: boolean, loserPts: number) {
  const w = side1Wins ? 1 : 2;
  const l = side1Wins ? 2 : 1;
  for (let i = 0; i < loserPts; i++) await scorePoint(prisma, id, l);
  for (let i = 0; i < TARGET; i++) {
    const r = await scorePoint(prisma, id, w);
    if (r.completed) return;
  }
}

/** What the reset route does, in the same order. */
async function resetLikeTheApp(label?: string) {
  const archivedId = await archiveCurrentTournament(prisma, label);
  await prisma.pointEvent.deleteMany({});
  await prisma.match.deleteMany({});
  await prisma.player.deleteMany({});
  await prisma.court.deleteMany({});
  await prisma.tournamentConfig.deleteMany({});
  await resetV2State(prisma);
  return archivedId;
}

async function seedAndPlay(format: "americano" | "team-americano", names: string[], rounds: number, playRounds = rounds) {
  await prisma.tournamentConfig.updateMany({ data: { status: "setup" } }).catch(() => {});
  await seedTournament(prisma, names, {
    bestOfSets: 1,
    tiebreakMode: "race-to-16",
    raceTarget: TARGET,
    amRounds: rounds,
    pin: "1234",
    format,
    courtIds: [2, 3],
  });
  for (let round = 1; round <= playRounds; round++) {
    const s = (await getFullSnapshot(prisma)) as unknown as { matches: MatchDTO[] };
    const live = s.matches.filter((m) => m.bracket === "AM" && m.round === round);
    for (const [i, m] of live.entries()) await playMatch(m.id, i === 0, 4 + i * 3);
  }
}

async function main() {
  await prisma.archivedTournament.deleteMany({});

  // --- nothing to keep --------------------------------------------------------
  await prisma.tournamentConfig.updateMany({ data: { status: "setup" } }).catch(() => {});
  await seedTournament(prisma, ["A", "B", "C", "D", "E", "F", "G", "H"], {
    bestOfSets: 1,
    tiebreakMode: "race-to-16",
    raceTarget: TARGET,
    amRounds: 2,
    pin: "1234",
    format: "americano",
    courtIds: [2, 3],
  });
  check("an untouched draw archives nothing", (await buildArchive(prisma)) === null);
  check("...so resetting it adds no history row", (await resetLikeTheApp()) === null);
  check("...and the history is still empty", (await prisma.archivedTournament.count()) === 0);

  // --- the real case ----------------------------------------------------------
  const names = ["Ana", "Ben", "Cara", "Dan", "Eve", "Finn", "Gia", "Hugo"];
  await seedAndPlay("americano", names, 3);

  const before = (await getFullSnapshot(prisma)) as unknown as { matches: MatchDTO[] };
  const playedCount = before.matches.filter((m) => m.status === "completed").length;
  const pointsBefore = await prisma.pointEvent.count();
  check("a tournament was played", playedCount === 6 && pointsBefore > 0, `${playedCount} matches, ${pointsBefore} points`);

  const id = await resetLikeTheApp();
  check("resetting archived it", typeof id === "string" && id.length > 0);

  // The wipe really happened...
  check("players were wiped", (await prisma.player.count()) === 0);
  check("matches were wiped", (await prisma.match.count()) === 0);
  check("points were wiped", (await prisma.pointEvent.count()) === 0);
  check("config was wiped", (await prisma.tournamentConfig.count()) === 0);

  // ...but the record survives it.
  const kept = await prisma.archivedTournament.findUnique({ where: { id: id! } });
  check("the record survives the wipe", !!kept);
  const standings = kept!.standings as unknown as Array<{ name: string; pointsFor: number; won: number }>;
  const results = kept!.results as unknown as Array<{ side1: string; side2: string; score: string; winner: number }>;

  check("every entrant is in the standings", standings.length === names.length, `${standings.length}`);
  check("the standings are real names", standings.every((r) => names.includes(r.name)), standings.map((r) => r.name).join(","));
  check("the standings are ranked", standings.every((r, i) => i === 0 || standings[i - 1].pointsFor >= r.pointsFor));
  check("every match was kept", results.length === playedCount, `${results.length}/${playedCount}`);
  check("results name both sides", results.every((r) => r.side1 && r.side2), JSON.stringify(results[0]));
  check("results carry a score line", results.every((r) => /\d+-\d+/.test(r.score)), results[0]?.score);
  check("results say who won", results.every((r) => r.winner === 1 || r.winner === 2));
  check("the scoring rules are recorded", kept!.scoring.includes("16"), kept!.scoring);
  check("the format is named readably", kept!.formatName.toLowerCase().includes("americano"), kept!.formatName);
  check("it counts entrants and matches", kept!.entrants === 8 && kept!.matches === 6, `${kept!.entrants}/${kept!.matches}`);
  check("the label defaults to something readable", kept!.label.includes("·"), kept!.label);
  check("a podium was captured", (kept!.podium as unknown as unknown[]).length > 0);

  // --- a new event does not disturb the old one -------------------------------
  await seedAndPlay("americano", ["Ivy", "Jack", "Kim", "Leo", "Mia", "Nate", "Omar", "Pia"], 2);
  const secondId = await resetLikeTheApp("Thursday social");
  check("a second event archives too", typeof secondId === "string");
  check("both are in the history", (await prisma.archivedTournament.count()) === 2);
  const first = await prisma.archivedTournament.findUnique({ where: { id: id! } });
  check("the first is untouched", JSON.stringify(first!.standings) === JSON.stringify(kept!.standings));
  const second = await prisma.archivedTournament.findUnique({ where: { id: secondId! } });
  check("a supplied label is used", second!.label === "Thursday social", second!.label);
  check("the second holds the new names", (second!.standings as unknown as Array<{ name: string }>).every((r) => ["Ivy", "Jack", "Kim", "Leo", "Mia", "Nate", "Omar", "Pia"].includes(r.name)));

  // --- a team format keeps both tables ---------------------------------------
  await seedAndPlay("team-americano", names, 2);
  const teamId = await resetLikeTheApp();
  const team = await prisma.archivedTournament.findUnique({ where: { id: teamId! } });
  const teamRows = team!.standings as unknown as Array<{ name: string }>;
  check("a team event archives the team table", teamRows.length === 2 && teamRows.every((r) => r.name.startsWith("Team")), teamRows.map((r) => r.name).join(","));
  check("...and keeps the individual scorers beside it", ((team!.players ?? []) as unknown as unknown[]).length === 8);

  // --- saving mid-evening, then finishing it -----------------------------------
  // The control screen can save without wiping now, so an organiser sends the
  // results out before the last match and then resets at the end. Both writes
  // describe the same night, and the history has to end up with one entry for
  // it rather than a half-played duplicate beside the finished one.
  const historyBefore = await prisma.archivedTournament.count();
  await seedAndPlay("americano", ["Ivy", "Jack", "Kim", "Leo", "Mia", "Nate", "Omar", "Pia"], 3, 1);

  const midway = await archiveCurrentTournament(prisma, "Thursday night");
  check("saving mid-evening writes a record", typeof midway === "string");
  check("...adding exactly one entry", (await prisma.archivedTournament.count()) === historyBefore + 1);
  const partialMatches = (await prisma.archivedTournament.findUnique({ where: { id: midway! } }))!.matches;
  check("...of the night so far, not the whole thing", partialMatches === 2, `${partialMatches} of an eventual 6`);

  // Now play it out and save again, the way the reset at the end does.
  for (let round = 2; round <= 3; round++) {
    const s2 = (await getFullSnapshot(prisma)) as unknown as { matches: MatchDTO[] };
    for (const [i, m] of s2.matches.filter((m) => m.bracket === "AM" && m.round === round).entries()) {
      await playMatch(m.id, i === 0, 4 + i * 3);
    }
  }
  const again = await archiveCurrentTournament(prisma);

  check("saving again does not add a second entry", (await prisma.archivedTournament.count()) === historyBefore + 1, `${await prisma.archivedTournament.count()}`);
  check("...it updates the one already there", again === midway, `${again} vs ${midway}`);
  const finished = (await prisma.archivedTournament.findUnique({ where: { id: midway! } }))!;
  check("...with the matches played since", finished.matches === 6, `${finished.matches}, was ${partialMatches}`);
  check("...and the name the organiser gave it, not a generated one", finished.label === "Thursday night", finished.label);

  // One line per person per event, even across two saves.
  const lines = await prisma.memberResult.count({ where: { eventId: midway! } });
  check("each player still has one result line", lines === 8, `${lines}`);
  const ivy = await prisma.memberResult.findFirst({ where: { eventId: midway!, member: { name: "Ivy" } } });
  check("...carrying the final numbers, not the half-time ones", (ivy?.played ?? 0) === 3, `played ${ivy?.played}`);

  // A later save may rename it, but must not undo a name with a generated one.
  await archiveCurrentTournament(prisma, "Thursday social night");
  check("a new name given later is taken", (await prisma.archivedTournament.findUnique({ where: { id: midway! } }))!.label === "Thursday social night");

  await resetLikeTheApp();
  check("...and the reset that ends the night adds nothing more", (await prisma.archivedTournament.count()) === historyBefore + 1, `${await prisma.archivedTournament.count()}`);

  await prisma.archivedTournament.deleteMany({});
  await prisma.$disconnect();
  console.log(failures ? `\n${failures} CHECK(S) FAILED` : "\nALL CHECKS PASSED");
  process.exitCode = failures ? 1 : 0;
}

main().catch(async (e) => {
  console.error("ERR", e instanceof Error ? e.message : e);
  await prisma.$disconnect();
  process.exitCode = 1;
});
