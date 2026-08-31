// People, as opposed to tonight's entrants — against the real database.
//
// The property that matters is that a reset does not erase who plays here. A
// `Player` row is deleted every time the next draw is seeded; a `ClubMember`
// has to survive that, be found again by name the following week, and carry the
// results of every night in between.
//
// The second half is about the cost of matching people by name automatically:
// one typo makes two people out of one. That is a fair trade only because it
// can be repaired, so merging is tested as carefully as the matching is.
//
// RESTART `npm run dev:db` BEFORE EACH RUN.
import { PrismaClient } from "@prisma/client";
import { seedTournament } from "../src/lib/bracket/seed";
import { getFullSnapshot } from "../src/lib/bracket/dto";
import { scorePoint } from "../src/lib/bracket/routing";
import { archiveCurrentTournament } from "../src/lib/archive";
import { resetV2State } from "../src/lib/v2/reset";
import { mergeMembers, nameKeyOf, resolveMembers, seasonTable } from "../src/lib/members";
import type { MatchDTO } from "../src/lib/types";

const URL = "postgresql://postgres:postgres@127.0.0.1:5433/postgres?connection_limit=1";
const prisma = new PrismaClient({ datasources: { db: { url: URL } } });

let failures = 0;
function check(name: string, cond: boolean, extra = "") {
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${extra ? ` — ${extra}` : ""}`);
  if (!cond) failures++;
}

const TARGET = 16;
const NAMES = ["Ana", "Ben", "Cara", "Dan", "Eve", "Finn", "Gia", "Hugo"];

async function playMatch(id: string, side1Wins: boolean, loserPts: number) {
  const w = side1Wins ? 1 : 2;
  const l = side1Wins ? 2 : 1;
  for (let i = 0; i < loserPts; i++) await scorePoint(prisma, id, l);
  for (let i = 0; i < TARGET; i++) {
    const r = await scorePoint(prisma, id, w);
    if (r.completed) return;
  }
}

async function seedAndPlay(names: string[], rounds: number) {
  await prisma.tournamentConfig.updateMany({ data: { status: "setup" } }).catch(() => {});
  await seedTournament(prisma, names, {
    bestOfSets: 1,
    tiebreakMode: "race-to-16",
    raceTarget: TARGET,
    amRounds: rounds,
    pin: "1234",
    format: "americano",
    courtIds: [2, 3],
  });
  for (let round = 1; round <= rounds; round++) {
    const s = (await getFullSnapshot(prisma)) as unknown as { matches: MatchDTO[] };
    for (const [i, m] of s.matches.filter((x) => x.bracket === "AM" && x.round === round).entries()) {
      await playMatch(m.id, i === 0, 4 + i * 3);
    }
  }
}

/** What the reset route does, in the same order. */
async function resetLikeTheApp(label?: string) {
  const id = await archiveCurrentTournament(prisma, label);
  await prisma.pointEvent.deleteMany({});
  await prisma.match.deleteMany({});
  await prisma.player.deleteMany({});
  await prisma.court.deleteMany({});
  await prisma.tournamentConfig.deleteMany({});
  await resetV2State(prisma);
  return id;
}

async function main() {
  await prisma.memberResult.deleteMany({});
  await prisma.archivedTournament.deleteMany({});
  await prisma.clubMember.deleteMany({});

  // --- what counts as the same person -----------------------------------------
  check("case does not make two people", nameKeyOf("Ana") === nameKeyOf("ana"));
  check("nor does stray whitespace", nameKeyOf("  Ana  Karim ") === nameKeyOf("Ana Karim"));
  // Anything beyond that is left alone on purpose: guessing would quietly weld
  // two real people together, which is far harder to undo than a merge.
  check("but a different name does", nameKeyOf("Ana K.") !== nameKeyOf("Ana K"));

  // --- seeding attaches entrants to people -------------------------------------
  await seedAndPlay(NAMES, 3);
  check("a member exists for every entrant", (await prisma.clubMember.count()) === 8, `${await prisma.clubMember.count()}`);
  const linked = await prisma.player.findMany({ select: { name: true, memberId: true } });
  check("every player points at one", linked.every((p) => !!p.memberId), JSON.stringify(linked.filter((p) => !p.memberId)));

  // --- the reset, which is the whole point -------------------------------------
  const firstEvent = await resetLikeTheApp("Tuesday americano");
  check("the night was archived", typeof firstEvent === "string");
  check("every player row is gone", (await prisma.player.count()) === 0);
  check("the people are not", (await prisma.clubMember.count()) === 8);
  check("...and their results survived with them", (await prisma.memberResult.count()) === 8, `${await prisma.memberResult.count()}`);

  const ana = await prisma.clubMember.findUnique({ where: { nameKey: nameKeyOf("Ana") } });
  const anaResult = await prisma.memberResult.findFirst({ where: { memberId: ana!.id } });
  check("a result knows the event it came from", anaResult?.eventId === firstEvent);
  check("...what they were entered as", anaResult?.playedAs === "Ana", anaResult?.playedAs);
  check("...where they finished", (anaResult?.rank ?? 0) >= 1 && (anaResult?.rank ?? 0) <= 8, `${anaResult?.rank}`);
  check("...and what they actually did", (anaResult?.played ?? 0) === 3 && anaResult!.won + anaResult!.lost === 3, JSON.stringify(anaResult));

  const ranks = (await prisma.memberResult.findMany({ where: { eventId: firstEvent! } })).map((r) => r.rank).sort((a, b) => a - b);
  check("the table is ranked 1..8 with no gaps or ties", JSON.stringify(ranks) === JSON.stringify([1, 2, 3, 4, 5, 6, 7, 8]), ranks.join(","));

  // --- the same people, the following week --------------------------------------
  // Entered a little differently, the way a real entry form gets used.
  await seedAndPlay(["ana", "BEN", " Cara ", "Dan", "Eve", "Finn", "Gia", "Hugo"], 3);
  check("a sloppier spelling finds the same people", (await prisma.clubMember.count()) === 8, `${await prisma.clubMember.count()}`);
  const anaAgain = await prisma.player.findFirst({ where: { name: "ana" } });
  check("...and the same person specifically", anaAgain?.memberId === ana!.id);
  const anaRow = await prisma.clubMember.findUnique({ where: { id: ana!.id } });
  check("the stored name follows the latest spelling", anaRow?.name === "ana", anaRow?.name);

  const secondEvent = await resetLikeTheApp("Thursday americano");
  check("two events are on record", (await prisma.archivedTournament.count()) === 2, `${secondEvent}`);
  check("...and sixteen result lines", (await prisma.memberResult.count()) === 16);
  check("still only eight people", (await prisma.clubMember.count()) === 8);

  // --- the table people actually want --------------------------------------------
  const table = await seasonTable(prisma);
  check("everybody is in the club table", table.length === 8, `${table.length}`);
  check("...having played two events each", table.every((r) => r.events === 2), JSON.stringify(table.map((r) => r.events)));
  check("...with both nights added up", table.every((r) => r.played === 6), JSON.stringify(table.map((r) => r.played)));
  check("wins and losses account for every match", table.every((r) => r.won + r.lost === r.played));
  check("the table is ordered by wins", table.every((r, i) => i === 0 || table[i - 1].won >= r.won), table.map((r) => `${r.name}:${r.won}`).join(" "));
  check("a win rate is reported", table.every((r) => r.winRate === r.won / r.played));
  check("a best finish is reported", table.every((r) => r.bestRank !== null && r.bestRank >= 1));
  check("winners are counted", table.filter((r) => r.firsts > 0).length >= 1, `${table.filter((r) => r.firsts > 0).length} with a first`);
  check("the last time they played is known", table.every((r) => !!r.lastPlayed));

  // A season cut must exclude what came before it.
  const future = await seasonTable(prisma, new Date(Date.now() + 60_000));
  check("a season starting tomorrow is empty", future.length === 0, `${future.length}`);

  // --- one person, entered two ways ------------------------------------------------
  // The cost of matching by name, and the reason merging exists.
  await seedAndPlay(["Ana K.", "Ben", "Cara", "Dan", "Eve", "Finn", "Gia", "Hugo"], 2);
  check("a typo creates a second person", (await prisma.clubMember.count()) === 9, `${await prisma.clubMember.count()}`);
  const typo = await prisma.clubMember.findUnique({ where: { nameKey: nameKeyOf("Ana K.") } });
  await resetLikeTheApp("Saturday americano");

  const beforeMerge = await prisma.memberResult.count();
  const moved = await mergeMembers(prisma, ana!.id, typo!.id);
  check("merging moves the stray result across", moved === 1, `${moved}`);
  check("...and loses none of them", (await prisma.memberResult.count()) === beforeMerge, `${await prisma.memberResult.count()}`);
  check("...and the duplicate is gone", (await prisma.clubMember.count()) === 8);
  check("...leaving one person with three events", (await prisma.memberResult.count({ where: { memberId: ana!.id } })) === 3);
  const merged = await seasonTable(prisma);
  check("the club table shows the whole record", merged.find((r) => r.memberId === ana!.id)?.events === 3);

  // Merging must refuse the nonsense cases rather than half-doing them.
  let refused = "";
  await mergeMembers(prisma, ana!.id, ana!.id).catch((e) => (refused = String(e.message)));
  check("merging somebody into themselves is refused", /different/i.test(refused), refused);
  refused = "";
  await mergeMembers(prisma, ana!.id, "does-not-exist").catch((e) => (refused = String(e.message)));
  check("merging a stranger is refused", /no longer exists/i.test(refused), refused);

  // --- the same typo inside one draw -------------------------------------------
  // Both halves played the same night, so adding their lines together would
  // invent somebody who played twice as many matches as anybody else.
  const dup = await prisma.clubMember.create({ data: { name: "Ana Karim", nameKey: nameKeyOf("Ana Karim") } });
  const anEvent = (await prisma.archivedTournament.findFirst())!;
  const anasRank = (await prisma.memberResult.findFirst({ where: { memberId: ana!.id, eventId: anEvent.id } }))!.rank;
  await prisma.memberResult.create({
    data: {
      memberId: dup.id, eventId: anEvent.id, playedAs: "Ana Karim",
      rank: anasRank + 1, played: 1, won: 0, lost: 1, pointsFor: 5, pointsAgainst: 16, endedAt: anEvent.endedAt,
    },
  });
  const countBefore = await prisma.memberResult.count({ where: { eventId: anEvent.id } });
  await mergeMembers(prisma, ana!.id, dup.id);
  check("a clash inside one event does not double-count", (await prisma.memberResult.count({ where: { memberId: ana!.id, eventId: anEvent.id } })) === 1);
  check("...and the better finish is the one kept", (await prisma.memberResult.findFirst({ where: { memberId: ana!.id, eventId: anEvent.id } }))!.rank === anasRank);
  check("...leaving the event one line shorter", (await prisma.memberResult.count({ where: { eventId: anEvent.id } })) === countBefore - 1);

  // --- deleting an event takes its results with it --------------------------------
  await prisma.archivedTournament.delete({ where: { id: anEvent.id } });
  check("removing an event removes its result lines", (await prisma.memberResult.count({ where: { eventId: anEvent.id } })) === 0);
  check("...but not the people who played in it", (await prisma.clubMember.count()) === 8);

  // --- and none of this may stop an event running ---------------------------------
  // A database without the tables must still seed a draw. Nothing gets recorded,
  // which is a far better outcome than a club that cannot start its evening.
  const broken = { clubMember: { upsert: async () => { throw new Error("relation does not exist"); } } } as never;
  const nulls = await resolveMembers(broken, ["Ana", "Ben"]);
  check("a database without the tables resolves nobody", JSON.stringify(nulls) === JSON.stringify([null, null]), JSON.stringify(nulls));
  const brokenTable = { memberResult: { findMany: async () => { throw new Error("relation does not exist"); } } } as never;
  check("...and reads back an empty club table", (await seasonTable(brokenTable)).length === 0);

  // --- a field of pairs is not a field of people ---------------------------------
  // A doubles draw enters "Alpha/Bravo" as one row. Recording that as somebody
  // would list pairs in the club table alongside the people inside them.
  const peopleBefore = await prisma.clubMember.count();
  await prisma.tournamentConfig.updateMany({ data: { status: "setup" } }).catch(() => {});
  await seedTournament(prisma, ["Alpha/Bravo", "Chi/Delta", "Echo/Fox", "Golf/Hotel"], {
    bestOfSets: 1, tiebreakMode: "race-to-16", raceTarget: TARGET,
    pin: "1234", format: "round-robin", discipline: "doubles", courtIds: [2],
  });
  check("a doubles draw records no members", (await prisma.clubMember.count()) === peopleBefore, `${await prisma.clubMember.count()} vs ${peopleBefore}`);
  check("...and its entrants point at nobody", (await prisma.player.findMany()).every((p) => p.memberId === null));

  // The same size of field played as singles is four people.
  await prisma.tournamentConfig.updateMany({ data: { status: "setup" } }).catch(() => {});
  await seedTournament(prisma, ["Nadia", "Omar", "Pia", "Rafi"], {
    bestOfSets: 1, tiebreakMode: "race-to-16", raceTarget: TARGET,
    pin: "1234", format: "round-robin", discipline: "singles", courtIds: [2],
  });
  check("a singles draw does record them", (await prisma.clubMember.count()) === peopleBefore + 4, `${await prisma.clubMember.count()}`);

  // The same name twice in one draw is one person, not two.
  const twice = await resolveMembers(prisma, ["Ben", "ben"]);
  check("one name entered twice is one person", twice[0] === twice[1] && !!twice[0]);

  await prisma.$disconnect();
  console.log(failures ? `\n${failures} CHECK(S) FAILED` : "\nALL CHECKS PASSED");
  process.exitCode = failures ? 1 : 0;
}

main().catch(async (e) => {
  console.error("ERR", e instanceof Error ? e.message : e);
  await prisma.$disconnect();
  process.exitCode = 1;
});
