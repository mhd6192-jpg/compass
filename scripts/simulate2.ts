import { prisma } from "../src/lib/db";
import { seedTournament } from "../src/lib/bracket/seed";
import { scorePoint, undoLastPoint, forceEndMatch } from "../src/lib/bracket/routing";
import { manualAssignCourt } from "../src/lib/bracket/courts";
import { getFullSnapshot, getMatchDTO } from "../src/lib/bracket/dto";

async function reseed(tiebreakMode: "standard" | "match-tiebreak" | "advantage", bestOfSets = 3) {
  const names = Array.from({ length: 16 }, (_, i) => `P${i + 1}`);
  await prisma.tournamentConfig.update({ where: { id: "default" }, data: { status: "setup" } }).catch(() => {});
  await seedTournament(prisma, names, { bestOfSets, tiebreakMode, pin: "1234" });
}

async function playOneGame(matchId: string, winnerSlot: 1 | 2) {
  for (let i = 0; i < 4; i++) await scorePoint(prisma, matchId, winnerSlot);
}

// Interleaves 1-for-1 up to the smaller target, then awards the remainder to
// whoever needs more, so the win-by-2 condition is only reached at the very end.
async function playGamesTo(matchId: string, gamesP1: number, gamesP2: number) {
  const minG = Math.min(gamesP1, gamesP2);
  for (let i = 0; i < minG; i++) {
    await playOneGame(matchId, 1);
    await playOneGame(matchId, 2);
  }
  for (let i = 0; i < gamesP1 - minG; i++) await playOneGame(matchId, 1);
  for (let i = 0; i < gamesP2 - minG; i++) await playOneGame(matchId, 2);
}

async function main() {
  // --- Test 1: undo mid-game reverts points ---
  await reseed("standard");
  let snap = await getFullSnapshot(prisma);
  let m = snap.matches.find((x) => x.bracket === "E" && x.round === 1 && x.posIndex === 0)!;
  await scorePoint(prisma, m.id, 1);
  await scorePoint(prisma, m.id, 1);
  let dto = await getMatchDTO(prisma, m.id);
  console.log("TEST1 after 2 pts to p1:", dto.state.currentGame?.display, "(expect ['30','0'])");
  await undoLastPoint(prisma, m.id);
  dto = await getMatchDTO(prisma, m.id);
  console.log("TEST1 after undo:", dto.state.currentGame?.display, "(expect ['15','0'])");

  // --- Test 2: undo after match completion, safe case (nothing downstream started) ---
  await reseed("standard");
  snap = await getFullSnapshot(prisma);
  m = snap.matches.find((x) => x.bracket === "E" && x.round === 1 && x.posIndex === 0)!;
  await playGamesTo(m.id, 6, 0);
  await playGamesTo(m.id, 6, 0); // p1 wins 6-0 6-0 (2 sets, straight sets win for bestOf 3)
  dto = await getMatchDTO(prisma, m.id);
  console.log("TEST2 match completed:", dto.status, "winner is p1:", dto.winnerId === dto.player1?.id);

  const feedWinnerTarget = snap.matches.find((x) => x.bracket === "E" && x.round === 2 && x.posIndex === 0);
  let qfDto = await getMatchDTO(prisma, feedWinnerTarget!.id);
  console.log("TEST2 QF match player1 populated:", qfDto.player1?.name);

  await undoLastPoint(prisma, m.id);
  dto = await getMatchDTO(prisma, m.id);
  console.log("TEST2 after undo, status:", dto.status, "(expect in_progress) winnerId:", dto.winnerId, "(expect null)");
  qfDto = await getMatchDTO(prisma, feedWinnerTarget!.id);
  console.log("TEST2 QF player1 after undo:", qfDto.player1, "(expect null)");

  // --- Test 3: force-end (walkover) ---
  await reseed("standard");
  snap = await getFullSnapshot(prisma);
  m = snap.matches.find((x) => x.bracket === "E" && x.round === 1 && x.posIndex === 1)!;
  const r = await forceEndMatch(prisma, m.id, 2, "Walkover - player 1 injury");
  dto = await getMatchDTO(prisma, m.id);
  console.log("TEST3 forced end status:", dto.status, "forcedEnd:", dto.forcedEnd, "reason:", dto.forcedEndReason, "champWon:", r.championshipWon);

  // --- Test 4: match-tiebreak deciding-set mode ---
  await reseed("match-tiebreak");
  snap = await getFullSnapshot(prisma);
  m = snap.matches.find((x) => x.bracket === "E" && x.round === 1 && x.posIndex === 2)!;
  await playGamesTo(m.id, 6, 4); // p1 wins set 1
  await playGamesTo(m.id, 4, 6); // p2 wins set 2 -> decider should now be a match tiebreak
  dto = await getMatchDTO(prisma, m.id);
  console.log("TEST4 isMatchTiebreakSet after 1-1 sets:", dto.state.isMatchTiebreakSet, "(expect true)");
  // play the match tiebreak to 10-2 for p1
  for (let i = 0; i < 2; i++) await scorePoint(prisma, m.id, 2);
  for (let i = 0; i < 10; i++) await scorePoint(prisma, m.id, 1);
  dto = await getMatchDTO(prisma, m.id);
  console.log("TEST4 final status:", dto.status, "sets:", JSON.stringify(dto.state.completedSets));

  // --- Test 5: advantage mode never triggers tiebreak, sets can exceed 7 games ---
  await reseed("advantage");
  snap = await getFullSnapshot(prisma);
  m = snap.matches.find((x) => x.bracket === "E" && x.round === 1 && x.posIndex === 3)!;
  await playGamesTo(m.id, 6, 6);
  dto = await getMatchDTO(prisma, m.id);
  console.log("TEST5 at 6-6 games, isTiebreakGame should be false, currentSet:", dto.state.currentSet);
  await playGamesTo(m.id, 8, 6);
  dto = await getMatchDTO(prisma, m.id);
  console.log("TEST5 after 8-6:", dto.status, JSON.stringify(dto.state.completedSets));

  // --- Test 6: manual court reassignment swap ---
  await reseed("standard");
  snap = await getFullSnapshot(prisma);
  const onCourt1Current = snap.matches.find((x) => x.courtId === 1 && x.courtSlot === "current")!;
  const onCourt2Current = snap.matches.find((x) => x.courtId === 2 && x.courtSlot === "current")!;
  await manualAssignCourt(prisma, onCourt2Current.id, 1, "current");
  const after1 = await getMatchDTO(prisma, onCourt1Current.id);
  const after2 = await getMatchDTO(prisma, onCourt2Current.id);
  console.log("TEST6 swap: match that was on court2 now on court", after2.courtId, after2.courtSlot);
  console.log("TEST6 swap: match that was on court1 now on court", after1.courtId, after1.courtSlot, "(expect 2, current)");

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
