import { prisma } from "../src/lib/db";
import { seedTournament } from "../src/lib/bracket/seed";
import { scorePoint } from "../src/lib/bracket/routing";
import { getFullSnapshot } from "../src/lib/bracket/dto";
import { BRACKET_ROUND1_MATCHES, BRACKET_TOTAL_ROUNDS, BracketCode } from "../src/lib/types";

async function main() {
  const names = Array.from({ length: 16 }, (_, i) => `Player ${i + 1}`);
  await seedTournament(prisma, names, { bestOfSets: 3, tiebreakMode: "standard", pin: "1234" });

  let guard = 0;
  while (guard++ < 500) {
    const snap = await getFullSnapshot(prisma);
    const playable = snap.matches.filter(
      (m) => (m.status === "ready" || m.status === "scheduled" || m.status === "in_progress") && m.player1 && m.player2
    );
    if (playable.length === 0) break;
    const m = playable[0];
    let safety = 0;
    for (;;) {
      safety++;
      if (safety > 500) throw new Error("match never completed: " + m.id);
      const slot = Math.random() < 0.5 ? 1 : 2;
      const result = await scorePoint(prisma, m.id, slot as 1 | 2);
      if (result.completed) break;
    }
  }

  const final = await getFullSnapshot(prisma);
  const total = final.matches.length;
  const completed = final.matches.filter((x) => x.status === "completed").length;
  console.log("Total matches:", total, "(expect 32)");
  console.log("Completed:", completed, "(expect 32)");
  console.log("Progress object:", final.progress);

  const expectedCounts: Record<BracketCode, number> = {
    E: 15,
    W: 7,
    N: 3,
    S: 3,
    NE: 1,
    SE: 1,
    NW: 1,
    SW: 1,
    RR: 0,
    GA: 0,
    GB: 0,
    SF: 0,
    F: 0,
    AM: 0,
  };
  const counts: Record<string, number> = {};
  for (const m of final.matches) counts[m.bracket] = (counts[m.bracket] || 0) + 1;
  console.log("Per-bracket match counts:", counts);
  let bracketCountsOk = true;
  for (const b of Object.keys(expectedCounts) as BracketCode[]) {
    if (counts[b] !== expectedCounts[b]) {
      bracketCountsOk = false;
      console.error(`MISMATCH: bracket ${b} expected ${expectedCounts[b]} got ${counts[b]}`);
    }
  }
  console.log("Bracket counts OK:", bracketCountsOk);

  for (const b of Object.keys(BRACKET_ROUND1_MATCHES) as BracketCode[]) {
    const totalRounds = BRACKET_TOTAL_ROUNDS[b];
    const bm = final.matches.filter((m) => m.bracket === b);
    const maxRound = Math.max(...bm.map((m) => m.round));
    if (maxRound !== totalRounds) console.error(`MISMATCH: bracket ${b} max round ${maxRound} expected ${totalRounds}`);
  }

  const champFinal = final.matches.find((m) => m.isChampionshipFinal);
  const championName = champFinal?.winnerId
    ? champFinal.winnerId === champFinal.player1?.id
      ? champFinal.player1?.name
      : champFinal.player2?.name
    : "MISSING";
  console.log("Tournament champion (East Final winner):", championName);

  const badPairing = final.matches.filter((m) => m.player1 && m.player2 && m.player1.id === m.player2.id);
  console.log("Bad pairings (same player twice in one match):", badPairing.length, "(expect 0)");

  const eR16 = final.matches.filter((m) => m.bracket === "E" && m.round === 1);
  const r16PlayerIds = new Set(eR16.flatMap((m) => [m.player1?.id, m.player2?.id]));
  console.log("East R16 unique players:", r16PlayerIds.size, "(expect 16)");

  // every player should have a terminal outcome: appears as winner or loser of exactly
  // one "bracket final" match (their direction's champion/runner-up moment).
  const finals = final.matches.filter((m) => m.isBracketFinal);
  const terminalPlayerIds = new Set<string>();
  for (const m of finals) {
    if (m.winnerId) terminalPlayerIds.add(m.winnerId);
    if (m.loserId) terminalPlayerIds.add(m.loserId);
  }
  console.log("Players with a terminal bracket-final result:", terminalPlayerIds.size, "(expect 16)");
  console.log("Bracket finals completed:", finals.filter((f) => f.status === "completed").length, "/", finals.length, "(expect 8/8)");

  // no two matches should ever have simultaneously claimed the same court+slot as 'current' at any point
  // (can't check historically without an audit log; instead sanity check the final state has at most one
  // match per (courtId, slot) among non-completed matches)
  const activeByCourtSlot = new Map<string, string[]>();
  for (const m of final.matches) {
    if (m.courtId && m.courtSlot) {
      const k = `${m.courtId}-${m.courtSlot}`;
      activeByCourtSlot.set(k, [...(activeByCourtSlot.get(k) ?? []), m.id]);
    }
  }
  const collisions = [...activeByCourtSlot.entries()].filter(([, ids]) => ids.length > 1);
  console.log("Court slot collisions in final state:", collisions.length, "(expect 0)", collisions);

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
