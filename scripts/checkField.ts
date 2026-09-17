// Changing who is playing, once the evening has started — against the real database.
//
// The failure this replaces is not subtle: somebody left, their remaining
// matches named a player who had gone home, and the only way out was to wipe
// the draw. So the checks are mostly about the two things that must survive a
// change of field — everything already played, and a draw the rest of the night
// can actually be played from.
//
// The rest is about the boundary. A round that is under way cannot be redrawn
// without either replaying it or giving four people a second go, so the change
// takes hold from the first round nothing has happened in. Several checks below
// exist only to pin that line down.
//
// RESTART `npm run dev:db` BEFORE EACH RUN.
import { PrismaClient } from "@prisma/client";
import { seedTournament } from "../src/lib/bracket/seed";
import { getFullSnapshot } from "../src/lib/bracket/dto";
import { scorePoint } from "../src/lib/bracket/routing";
import { addPlayer, refuseFieldChange, replacePlayer, withdrawPlayer } from "../src/lib/bracket/field";
import { computeStandings } from "../src/lib/standings";
import { resetV2State } from "../src/lib/v2/reset";
import type { MatchDTO, TournamentFormat } from "../src/lib/types";

const URL = "postgresql://postgres:postgres@127.0.0.1:5433/postgres?connection_limit=1";
const prisma = new PrismaClient({ datasources: { db: { url: URL } } });

let failures = 0;
function check(name: string, cond: boolean, extra = "") {
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${extra ? ` — ${extra}` : ""}`);
  if (!cond) failures++;
}

const TARGET = 16;
const EIGHT = ["Ana", "Ben", "Cara", "Dan", "Eve", "Finn", "Gia", "Hugo"];

/** The four people in a match, whatever slots they sit in. */
function occupants(m: { player1Id: string | null; player2Id: string | null; player1PartnerId: string | null; player2PartnerId: string | null }): string[] {
  return [m.player1Id, m.player2Id, m.player1PartnerId, m.player2PartnerId].filter(Boolean) as string[];
}

async function rows() {
  return prisma.match.findMany({ where: { bracket: "AM" }, orderBy: [{ round: "asc" }, { posIndex: "asc" }] });
}

async function seed(format: TournamentFormat, names: string[], rounds: number) {
  await prisma.pointEvent.deleteMany({});
  await prisma.match.deleteMany({});
  await prisma.player.deleteMany({});
  await prisma.court.deleteMany({});
  await prisma.tournamentConfig.deleteMany({});
  await resetV2State(prisma);
  await seedTournament(prisma, names, {
    bestOfSets: 1,
    tiebreakMode: "race-to-16",
    raceTarget: TARGET,
    amRounds: rounds,
    pin: "1234",
    format,
    courtIds: [2, 3],
  });
}

/** Plays every match in one round to a finish. */
async function playRound(round: number) {
  const s = (await getFullSnapshot(prisma)) as unknown as { matches: MatchDTO[] };
  for (const [i, m] of s.matches.filter((x) => x.bracket === "AM" && x.round === round).entries()) {
    const w = i % 2 === 0 ? 1 : 2;
    for (let k = 0; k < TARGET; k++) if ((await scorePoint(prisma, m.id, w)).completed) break;
  }
}

async function main() {
  // --- what each format will and will not take ---------------------------------
  // The refusals are as much a feature as the changes: an organiser mid-evening
  // needs to know what to do instead, not that something is unsupported.
  check("a bracket draw refuses outright", /fixes its fixtures/.test(refuseFieldChange("compass", "withdraw") ?? ""), refuseFieldChange("compass", "withdraw") ?? "(allowed)");
  check("...and says to retire a match instead", /[Rr]etire/.test(refuseFieldChange("compass", "add") ?? ""));
  check("every rotating format takes a replacement", ["americano", "mexicano", "king-court", "winner-court", "team-americano", "mixicano", "mixed-mexicano", "mixed-americano", "mixed-team-americano"].every((f) => refuseFieldChange(f, "replace") === null));
  check("king of the court will not resize", /rung/.test(refuseFieldChange("king-court", "withdraw") ?? ""), refuseFieldChange("king-court", "withdraw") ?? "(allowed)");
  check("winner court will not resize", /queue/.test(refuseFieldChange("winner-court", "add") ?? ""), refuseFieldChange("winner-court", "add") ?? "(allowed)");
  check("the grouped formats will not resize", ["team-americano", "mixicano", "mixed-mexicano", "mixed-americano", "mixed-team-americano"].every((f) => /halves/.test(refuseFieldChange(f, "add") ?? "")));
  check("...and every refusal offers a way forward", ["king-court", "winner-court", "team-americano", "mixicano"].every((f) => /instead/.test(refuseFieldChange(f, "withdraw") ?? "")));
  check("an americano resizes", refuseFieldChange("americano", "withdraw") === null && refuseFieldChange("americano", "add") === null);
  check("a mexicano resizes", refuseFieldChange("mexicano", "withdraw") === null && refuseFieldChange("mexicano", "add") === null);

  // --- somebody leaves an americano after two rounds ---------------------------
  await seed("americano", EIGHT, 5);
  await playRound(1);
  await playRound(2);

  const eve = (await prisma.player.findFirst({ where: { name: "Eve" } }))!;
  const beforeStandings = computeStandings(
    ((await getFullSnapshot(prisma)) as unknown as { matches: MatchDTO[] }).matches
  ).find((r) => r.id === eve.id)!;
  const playedBefore = (await rows()).filter((m) => m.status === "completed").length;

  const out = await prisma.$transaction((tx) => withdrawPlayer(tx, eve.id));
  check("a player can leave an americano mid-event", out.name === "Eve" && out.remaining === 7, JSON.stringify(out));

  const after = await rows();
  check("nothing already played was touched", after.filter((m) => m.status === "completed").length === playedBefore, `${after.filter((m) => m.status === "completed").length}/${playedBefore}`);
  check("...and the rounds played still name her", after.filter((m) => m.round <= 2).some((m) => occupants(m).includes(eve.id)));
  check("no round drawn after she left includes her", after.filter((m) => m.round > 2).every((m) => !occupants(m).includes(eve.id)), `${after.filter((m) => m.round > 2 && occupants(m).includes(eve.id)).length} still do`);

  // Her record is not erased. She played those matches.
  const keptStandings = computeStandings(
    ((await getFullSnapshot(prisma)) as unknown as { matches: MatchDTO[] }).matches
  ).find((r) => r.id === eve.id);
  check("she keeps the points she earned", keptStandings?.pointsFor === beforeStandings.pointsFor, `${keptStandings?.pointsFor} vs ${beforeStandings.pointsFor}`);
  check("...and is still in the standings", !!keptStandings);

  // The rest of the night has to be playable: seven players, four on court.
  const round3 = after.filter((m) => m.round === 3);
  check("the next round was drawn again for seven", round3.length === 1, `${round3.length} matches`);
  check("...with four different people in it", new Set(occupants(round3[0])).size === 4);
  const rounds = [...new Set(after.map((m) => m.round))].sort((a, b) => a - b);
  check("the rounds are still numbered without gaps", JSON.stringify(rounds) === JSON.stringify([1, 2, 3, 4, 5]), rounds.join(","));

  // And it can actually be played to the end.
  await playRound(3);
  await playRound(4);
  await playRound(5);
  const finished = await rows();
  check("the evening plays out to the last round", finished.every((m) => m.status === "completed"), `${finished.filter((m) => m.status !== "completed").length} unfinished`);
  check("...and she never appears again", finished.filter((m) => m.round > 2).every((m) => !occupants(m).includes(eve.id)));

  // --- somebody arrives late ----------------------------------------------------
  await seed("americano", EIGHT, 4);
  await playRound(1);
  const joined = await prisma.$transaction((tx) => addPlayer(tx, "Iris", null));
  check("a latecomer can join an americano", joined.playing === 9, JSON.stringify(joined));

  const withIris = await rows();
  check("they are in no round that was already played", withIris.filter((m) => m.round <= 1).every((m) => !occupants(m).includes(joined.id)));
  const laterOccupants = new Set(withIris.filter((m) => m.round > 1).flatMap(occupants));
  check("...and are drawn into the rest of the night", laterOccupants.has(joined.id));
  // Nine players, four to a court: two matches a round and one sitting out.
  const r2 = withIris.filter((m) => m.round === 2);
  check("the redraw fits the bigger field", r2.length === 2, `${r2.length} matches in round 2`);
  await playRound(2);
  await playRound(3);
  await playRound(4);
  check("and that plays out too", (await rows()).every((m) => m.status === "completed"));

  // --- a replacement, which every format takes ----------------------------------
  await seed("americano", EIGHT, 4);
  await playRound(1);
  const dan = (await prisma.player.findFirst({ where: { name: "Dan" } }))!;
  const swap = await prisma.$transaction((tx) => replacePlayer(tx, dan.id, "Karim", null));
  check("somebody can take another player's place", swap.replaced === "Dan" && swap.name === "Karim", JSON.stringify(swap));
  check("...taking over their remaining matches", swap.matches > 0, `${swap.matches} matches`);

  const swapped = await rows();
  check("the round already played still says Dan", swapped.filter((m) => m.round === 1).some((m) => occupants(m).includes(dan.id)));
  check("...and no later round does", swapped.filter((m) => m.round > 1).every((m) => !occupants(m).includes(dan.id)));
  // One match in each round that was left — Dan's place, not everybody's.
  const laterRounds = new Set(swapped.filter((m) => m.round > 1).map((m) => m.round));
  const standInMatches = swapped.filter((m) => m.round > 1 && occupants(m).includes(swap.incomingId));
  check("...one in each round that was left", standInMatches.length === laterRounds.size, `${standInMatches.length} of ${laterRounds.size} rounds`);

  const karim = (await prisma.player.findUnique({ where: { id: swap.incomingId } }))!;
  check("the stand-in inherits the slot in the field", karim.seed === dan.seed, `${karim.seed} vs ${dan.seed}`);
  const gone = (await prisma.player.findUnique({ where: { id: dan.id } }))!;
  check("the outgoing player is marked as gone", !!gone.withdrawnAt && gone.replacedById === karim.id);
  check("the field is still eight", (await prisma.player.count({ where: { withdrawnAt: null } })) === 8);

  // --- the same, in a format whose rounds come from the last one ----------------
  // King of the court builds its ladder out of who won on each rung, so it names
  // the player who actually played. The stand-in has to be swapped in afterwards
  // or the next round calls somebody who has gone home.
  await seed("king-court", EIGHT, 4);
  await playRound(1);
  const gia = (await prisma.player.findFirst({ where: { name: "Gia" } }))!;
  const kcSwap = await prisma.$transaction((tx) => replacePlayer(tx, gia.id, "Layla", null));
  await playRound(2);
  const kcRows = await rows();
  const kcRound3 = kcRows.filter((m) => m.round === 3);
  check("king of the court derives a round after a replacement", kcRound3.length > 0, `${kcRound3.length} matches`);
  check("...naming the stand-in, not the player who left", kcRound3.every((m) => !occupants(m).includes(gia.id)), "Gia is still in the ladder");
  check("...and the ladder still has everybody on it", new Set(kcRound3.flatMap(occupants)).size === 8, `${new Set(kcRound3.flatMap(occupants)).size} players`);
  check("...including her replacement", new Set(kcRound3.flatMap(occupants)).has(kcSwap.incomingId));

  // --- winner court, whose queue is replayed from the entry order ---------------
  // Nine rounds, not five: the queue has to cycle all the way round before a
  // duplicated entrant can reach the front, and a five-round night stops three
  // rounds short of it.
  await seed("winner-court", EIGHT, 9);
  await playRound(1);
  const hugo = (await prisma.player.findFirst({ where: { name: "Hugo" } }))!;
  const wcSwap = await prisma.$transaction((tx) => replacePlayer(tx, hugo.id, "Nadia", null));
  await playRound(2);
  await playRound(3);
  const wcRows = await rows();
  check("winner court keeps deriving after a replacement", wcRows.filter((m) => m.round === 4).length === 1, `${wcRows.filter((m) => m.round === 4).length}`);
  check("...and never calls the player who left", wcRows.filter((m) => m.round > 1).every((m) => !occupants(m).includes(hugo.id)));
  check("...while the queue still turns over four at a time", wcRows.filter((m) => m.round === 4).every((m) => new Set(occupants(m)).size === 4));
  check("the stand-in reaches the court in his place", wcRows.filter((m) => m.round > 1).some((m) => occupants(m).includes(wcSwap.incomingId)));

  // Played out to the far end of the queue, not just past the swap.
  //
  // `replacePlayer` creates a NEW player row at the same seed, so an unfiltered
  // roster read comes back one longer than the field: the queue gained a place,
  // the stand-in stood in it AS WELL AS arriving as the swap, and the duplicate
  // worked its way to the front over the following rounds. Round 7 was drawn as
  // "Ana & Ben vs Nadia & Nadia" — three people on a doubles court, her points
  // counted twice, and the two she displaced never called at all. Stopping at
  // round 4, as this suite used to, is three rounds short of seeing it.
  for (let r = 4; r <= 9; r++) await playRound(r);
  const wcLate = await rows();
  const wcBad = wcLate.filter((m) => new Set(occupants(m)).size !== 4);
  check(
    "winner court never puts the same person on both sides, however long it runs",
    wcBad.length === 0,
    wcBad.map((m) => `round ${m.round}`).join(", ")
  );
  const everCalled = new Set(wcLate.flatMap(occupants));
  check("...and everyone entered gets on court", everCalled.size === 8, `${everCalled.size} of 8 played`);

  // --- a mexicano changed before the first point of the evening -----------------
  //
  // A redraw deletes every UNTOUCHED round, and before the first point that is
  // all of them. For a format that derives each round from the last, that used
  // to leave the draw with no matches at all: every court read "awaiting the
  // next match" for the rest of the night, the board read 0 of 0, and nothing
  // recovered it short of wiping the event and retyping the field.
  await seed("mexicano", EIGHT, 4);
  const early = (await prisma.player.findFirst({ where: { name: "Eve" } }))!;
  await prisma.$transaction((tx) => withdrawPlayer(tx, early.id));
  const afterEarly = await rows();
  check("a mexicano survives a withdrawal before the first point", afterEarly.length > 0, `${afterEarly.length} matches left`);
  check("...with a round actually open", afterEarly.some((m) => m.status !== "pending"), afterEarly.map((m) => m.status).join(","));
  check("...drawn without the player who left", afterEarly.every((m) => !occupants(m).includes(early.id)));
  check("...and on a court", afterEarly.some((m) => m.courtId !== null), "nothing was called to a court");
  // And it still plays out from there.
  await playRound(1);
  const afterEarlyR2 = (await rows()).filter((m) => m.round === 2);
  check("...and the night carries on into round 2", afterEarlyR2.length > 0, `${afterEarlyR2.length} matches`);

  // The same before-the-first-point path for a late ARRIVAL.
  await seed("mexicano", EIGHT, 4);
  await prisma.$transaction((tx) => addPlayer(tx, "Nadia", null));
  const afterAdd = await rows();
  check("a mexicano survives a late arrival before the first point", afterAdd.length > 0, `${afterAdd.length} matches left`);
  check("...with a round open and courted", afterAdd.some((m) => m.status !== "pending" && m.courtId !== null));

  // --- a mexicano, where the next round comes from the standings ----------------
  await seed("mexicano", EIGHT, 4);
  await playRound(1);
  const cara = (await prisma.player.findFirst({ where: { name: "Cara" } }))!;
  await prisma.$transaction((tx) => withdrawPlayer(tx, cara.id));
  await playRound(2);
  const mexRows = await rows();
  const mexRound2 = mexRows.filter((m) => m.round === 2);
  check("a mexicano redraws without the player who left", mexRound2.every((m) => !occupants(m).includes(cara.id)), "Cara is still being drawn");
  check("...and sits somebody out rather than breaking", mexRound2.length === 1, `${mexRound2.length} matches for seven players`);
  check("...leaving her record alone", mexRows.filter((m) => m.round === 1).some((m) => occupants(m).includes(cara.id)));

  // The progress bar has to be able to reach the end. Eight players filled two
  // matches a round; seven fill one, and estimating the night from round ONE
  // then promised twice the matches the event now holds — so the bar stopped
  // short for the rest of the evening with nothing to explain it.
  // Round 2 is already played above; carry on to the end of the four scheduled.
  for (let r = 3; r <= 4; r++) await playRound(r);
  const mexDone = (await getFullSnapshot(prisma)) as unknown as {
    progress: { completed: number; total: number; scheduled: number };
  };
  check(
    "a shrunken mexicano still finishes at 100%",
    mexDone.progress.completed === mexDone.progress.scheduled,
    `${mexDone.progress.completed} of ${mexDone.progress.scheduled}`
  );
  check("...with every match actually played", (await rows()).every((m) => m.status === "completed"));

  // --- the boundary: a round under way cannot be redrawn -------------------------
  await seed("americano", EIGHT, 4);
  await playRound(1);
  // Start round 2 without finishing it, then try to remove somebody in it.
  const openRound2 = (await rows()).filter((m) => m.round === 2);
  await scorePoint(prisma, openRound2[0].id, 1);
  const onCourt = occupants(openRound2[0])[0];

  let refused = "";
  await prisma.$transaction((tx) => withdrawPlayer(tx, onCourt)).catch((e) => (refused = String(e.message)));
  check("somebody in a round under way cannot just leave", /round 2/.test(refused), refused || "(allowed)");
  check("...and is told to retire the match first", /retire/i.test(refused), refused);

  // Somebody in the same round but not on court is refused for the same reason:
  // the round cannot be drawn again around them without replaying what is done.
  const waiting = occupants(openRound2[1] ?? openRound2[0]).find((id) => !occupants(openRound2[0]).includes(id));
  if (waiting) {
    refused = "";
    await prisma.$transaction((tx) => withdrawPlayer(tx, waiting)).catch((e) => (refused = String(e.message)));
    check("nor can somebody waiting in that round", /round 2/.test(refused), refused || "(allowed)");
  }

  // Somebody with no match left in round 2 at all can leave — the change simply
  // lands from round 3.
  const inRound2 = new Set((await rows()).filter((m) => m.round === 2).flatMap(occupants));
  const free = (await prisma.player.findMany({ where: { withdrawnAt: null } })).find((p) => !inRound2.has(p.id));
  if (free) {
    const ok = await prisma.$transaction((tx) => withdrawPlayer(tx, free.id));
    check("but somebody not in it can", ok.name === free.name, JSON.stringify(ok));
    const rest = await rows();
    check("...and round 2 is left exactly as it was", rest.filter((m) => m.round === 2).length === openRound2.length);
    check("...with the change landing from round 3", rest.filter((m) => m.round >= 3).every((m) => !occupants(m).includes(free.id)));
  } else {
    check("but somebody not in it can", true, "(everyone was in round 2)");
  }

  // --- the things that must simply be refused ------------------------------------
  await seed("americano", EIGHT, 3);
  const ana = (await prisma.player.findFirst({ where: { name: "Ana" } }))!;
  await prisma.$transaction((tx) => replacePlayer(tx, ana.id, "Sara", null));
  refused = "";
  await prisma.$transaction((tx) => replacePlayer(tx, ana.id, "Tariq", null)).catch((e) => (refused = String(e.message)));
  check("somebody who has left cannot be replaced twice", /already left/.test(refused), refused || "(allowed)");

  refused = "";
  await prisma.$transaction((tx) => replacePlayer(tx, ana.id, "   ", null)).catch((e) => (refused = String(e.message)));
  check("a stand-in needs a name", /name/.test(refused), refused || "(allowed)");

  refused = "";
  await prisma.$transaction((tx) => replacePlayer(tx, "nobody", "Tariq", null)).catch((e) => (refused = String(e.message)));
  check("a stranger cannot be replaced", /No such player/.test(refused), refused || "(allowed)");

  // The field has a floor. Emptying it one at a time must stop at the point the
  // format can no longer be played rather than leaving a draw with no matches.
  await seed("americano", ["A", "B", "C", "D"], 3);
  const four = await prisma.player.findMany({ orderBy: { seed: "asc" } });
  refused = "";
  await prisma.$transaction((tx) => withdrawPlayer(tx, four[0].id)).catch((e) => (refused = String(e.message)));
  check("the last four cannot be broken up", refused.length > 0, refused || "(allowed)");
  check("...with the format's own reason", /americano/i.test(refused), refused);
  check("...and nobody was marked as gone", (await prisma.player.count({ where: { withdrawnAt: null } })) === 4);

  // --- and none of it works before an event is running -----------------------------
  await prisma.tournamentConfig.updateMany({ data: { status: "setup" } });
  refused = "";
  await prisma.$transaction((tx) => addPlayer(tx, "Zed", null)).catch((e) => (refused = String(e.message)));
  check("nobody joins a tournament that has not started", /No tournament is running/.test(refused), refused || "(allowed)");

  await prisma.$disconnect();
  console.log(failures ? `\n${failures} CHECK(S) FAILED` : "\nALL CHECKS PASSED");
  process.exitCode = failures ? 1 : 0;
}

main().catch(async (e) => {
  console.error("ERR", e instanceof Error ? e.message : e);
  await prisma.$disconnect();
  process.exitCode = 1;
});
