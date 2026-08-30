// Verifies the two-group draw: how it is generated, who qualifies for the
// semifinals, and that undoing a group result un-qualifies them again.
// Runs against an in-memory stand-in for Prisma, so no database is needed.
// Run: npx tsx scripts/checkTwoGroup.ts
import type { Prisma } from "@prisma/client";
import { generateTwoGroup, splitGroups, twoGroupMatchCount, MIN_TWO_GROUP_TEAMS } from "../src/lib/bracket/twoGroup";
import { ensureSemifinals, retractSemifinals } from "../src/lib/bracket/qualify";
import { buildMatchDTO } from "../src/lib/bracket/dto";
import { computeStandings } from "../src/lib/standings";
import { computePodium } from "../src/lib/v2/podium";
import type { ScoringConfig } from "../src/lib/scoring/engine";

let failures = 0;
function check(name: string, cond: boolean, extra = "") {
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${extra ? ` - ${extra}` : ""}`);
  if (!cond) failures++;
}

const CONFIG: ScoringConfig = { bestOfSets: 1, tiebreakMode: "race-to-16" };
type Row = Parameters<typeof buildMatchDTO>[0];

function race16(lo: number) {
  // `createdAt` matters: buildMatchDTO measures the gap between points.
  const at = (n: number) => new Date(Date.UTC(2026, 0, 1, 0, 0, n));
  const s: { slot: number; createdAt: Date; tappedAt: Date | null }[] = [];
  for (let i = 0; i < lo; i++) s.push({ slot: 1, createdAt: at(s.length), tappedAt: null }, { slot: 2, createdAt: at(s.length + 1), tappedAt: null });
  for (let i = 0; i < 16 - lo; i++) s.push({ slot: 1, createdAt: at(s.length), tappedAt: null });
  return s;
}
const player = (id: string) => ({ id, name: id, seed: 0, createdAt: new Date() });

let seq = 0;
function row(bracket: string, p1: string | null, p2: string | null, winner: string | null, lo = 5): Row {
  seq++;
  return {
    id: `${bracket}${seq}`,
    bracket,
    round: 1,
    posIndex: seq,
    player1Id: p1,
    player2Id: p2,
    player1: p1 ? player(p1) : null,
    player2: p2 ? player(p2) : null,
    winnerId: winner,
    loserId: winner ? (winner === p1 ? p2 : p1) : null,
    status: winner ? "completed" : p1 && p2 ? "ready" : "pending",
    readyAt: new Date(),
    courtId: null,
    courtSlot: null,
    feedWinnerMatchId: null,
    feedWinnerSlot: null,
    feedLoserMatchId: null,
    feedLoserSlot: null,
    isBracketFinal: bracket === "F",
    forcedEnd: false,
    forcedEndReason: null,
    startedAt: winner ? new Date() : null,
    completedAt: winner ? new Date() : null,
    createdAt: new Date(),
    // Mirroring the winner must keep the timestamps, not just the slots.
    points: winner ? (winner === p1 ? race16(lo) : race16(lo).map((x) => ({ ...x, slot: 3 - x.slot }))) : [],
  } as unknown as Row;
}

function fakeTx(rows: Row[], format = "two-group") {
  const store = [...rows];
  const points = new Map<string, number>();
  const get = (id: string) => store.find((m) => (m as never as { id: string }).id === id) as never as Record<string, unknown>;
  const tx = {
    _rows: store,
    tournamentConfig: { findUnique: async () => ({ format }) },
    match: {
      findMany: async ({ where }: { where?: { bracket?: string } } = {}) =>
        where?.bracket ? store.filter((m) => (m as never as { bracket: string }).bracket === where.bracket) : store,
      update: async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
        const r = get(where.id);
        Object.assign(r, data);
        r.player1 = r.player1Id ? player(r.player1Id as string) : null;
        r.player2 = r.player2Id ? player(r.player2Id as string) : null;
        return r;
      },
    },
    pointEvent: { count: async ({ where }: { where: { matchId: string } }) => points.get(where.matchId) ?? 0 },
    _setPoints: (id: string, n: number) => points.set(id, n),
  };
  return tx as unknown as Prisma.TransactionClient & typeof tx;
}

const semisOf = (tx: ReturnType<typeof fakeTx>) =>
  tx._rows
    .filter((m) => (m as never as { bracket: string }).bracket === "SF")
    .sort((a, b) => (a as never as { posIndex: number }).posIndex - (b as never as { posIndex: number }).posIndex) as never as {
    id: string;
    player1Id: string | null;
    player2Id: string | null;
    status: string;
  }[];

// Group A: A1 3-0, A2 2-1, A3 1-2, A4 0-3. Same shape for Group B.
function groupRows(p: string) {
  const [t1, t2, t3, t4] = [`${p}1`, `${p}2`, `${p}3`, `${p}4`];
  const b = p === "A" ? "GA" : "GB";
  return [
    row(b, t1, t2, t1),
    row(b, t1, t3, t1),
    row(b, t1, t4, t1),
    row(b, t2, t3, t2),
    row(b, t2, t4, t2),
    row(b, t3, t4, t3),
  ];
}

async function main() {
  // --- draw generation -------------------------------------------------------
  {
    const nodes = generateTwoGroup(8);
    const ga = nodes.filter((n) => n.bracket === "GA");
    const gb = nodes.filter((n) => n.bracket === "GB");
    check("8 teams split 4 and 4", splitGroups(8)[0].length === 4 && splitGroups(8)[1].length === 4);
    check("each group is a full round robin (4 teams -> 6 matches)", ga.length === 6 && gb.length === 6, `${ga.length}/${gb.length}`);
    check(
      "everyone in a group plays everyone else exactly once",
      new Set(ga.map((n) => n.initialPlayerSeeds!.join("-"))).size === 6 && ga.every((n) => n.initialPlayerSeeds![0] !== n.initialPlayerSeeds![1])
    );
    check(
      "the two groups never share a team",
      (() => {
        const inA = new Set(ga.flatMap((n) => n.initialPlayerSeeds!));
        return gb.every((n) => n.initialPlayerSeeds!.every((s) => !inA.has(s)));
      })()
    );
    check("adds two semifinals and one final", nodes.filter((n) => n.bracket === "SF").length === 2 && nodes.filter((n) => n.bracket === "F").length === 1);
    check("both semifinals feed the final", nodes.filter((n) => n.feedWinnerKey === "F-0").length === 2);
    check("semifinals start empty (qualifiers unknown at seeding)", nodes.filter((n) => n.bracket === "SF").every((n) => !n.initialPlayerSeeds));
    check("match count helper agrees", twoGroupMatchCount(8) === nodes.length, `${twoGroupMatchCount(8)} vs ${nodes.length}`);
    check("odd entry lists still split", splitGroups(7)[0].length === 4 && splitGroups(7)[1].length === 3);
    let threw = "";
    try {
      generateTwoGroup(MIN_TWO_GROUP_TEAMS - 1);
    } catch (e) {
      threw = (e as Error).message;
    }
    check("too few teams is rejected", threw.includes("at least"), threw);
  }

  const groups = [...groupRows("A"), ...groupRows("B")];
  const mkKnockout = () => [row("SF", null, null, null), row("SF", null, null, null), row("F", null, null, null)];

  // --- qualification ---------------------------------------------------------
  {
    const tx = fakeTx([...groups, ...mkKnockout()]);
    const changed = await ensureSemifinals(tx, CONFIG);
    const semis = semisOf(tx);
    check("both semifinals get filled", changed.length === 2 && semis.every((s) => s.player1Id && s.player2Id));
    check("semifinal 1 is A1 v B2", semis[0].player1Id === "A1" && semis[0].player2Id === "B2", `${semis[0].player1Id} v ${semis[0].player2Id}`);
    check("semifinal 2 is B1 v A2", semis[1].player1Id === "B1" && semis[1].player2Id === "A2", `${semis[1].player1Id} v ${semis[1].player2Id}`);
    check("the two group winners are kept apart", semis[0].player1Id === "A1" && semis[1].player1Id === "B1");
    check("semifinals are ready for a court", semis.every((s) => s.status === "ready"));
    check("running it again changes nothing", (await ensureSemifinals(tx, CONFIG)).length === 0);
  }

  {
    const partial = [...groups.map((g) => ({ ...g })), ...mkKnockout()];
    Object.assign(partial[0] as never as Record<string, unknown>, { status: "in_progress", winnerId: null });
    const tx = fakeTx(partial);
    check("an unfinished group blocks qualification", (await ensureSemifinals(tx, CONFIG)).length === 0);
  }

  {
    const tx = fakeTx([...groups, ...mkKnockout()], "round-robin");
    check("other formats are untouched", (await ensureSemifinals(tx, CONFIG)).length === 0);
  }

  // --- undo ------------------------------------------------------------------
  {
    const tx = fakeTx([...groups, ...mkKnockout()]);
    await ensureSemifinals(tx, CONFIG);
    const back = await retractSemifinals(tx);
    check("undo empties the semifinals again", back.length === 2 && semisOf(tx).every((s) => !s.player1Id && !s.player2Id));

    const tx2 = fakeTx([...groups, ...mkKnockout()]);
    await ensureSemifinals(tx2, CONFIG);
    tx2._setPoints(semisOf(tx2)[0].id, 4);
    let threw = "";
    try {
      await retractSemifinals(tx2);
    } catch (e) {
      threw = (e as Error).message;
    }
    check("undo refuses once a semifinal has started", threw.includes("semifinal has already started"), threw);
  }

  // --- tables and podium -----------------------------------------------------
  {
    const dtos = [...groups, row("SF", "A1", "B2", "A1"), row("SF", "B1", "A2", "A2"), row("F", "A1", "A2", "A2")].map((r) =>
      buildMatchDTO(r, CONFIG)
    );

    const tableA = computeStandings(dtos.filter((m) => m.bracket === "GA"));
    check("group A table holds only its own four teams", tableA.length === 4 && tableA.every((r) => r.name.startsWith("A")), tableA.map((r) => r.name).join(","));
    check("group A is ranked by wins", tableA.map((r) => r.name).join(",") === "A1,A2,A3,A4", tableA.map((r) => r.name).join(","));
    check("knockout results stay out of the group record", tableA[0].played === 3 && tableA[0].won === 3, JSON.stringify(tableA[0]));

    const podium = computePodium(dtos, "two-group");
    check("podium 1st is the final winner", podium[0]?.name === "A2" && podium[0].detail === "Champion", JSON.stringify(podium[0]));
    check("podium 2nd is the beaten finalist", podium[1]?.name === "A1", JSON.stringify(podium[1]));
    check("beaten semifinalists come next", [podium[2]?.name, podium[3]?.name].sort().join(",") === "B1,B2", `${podium[2]?.name},${podium[3]?.name}`);
  }

  console.log(failures === 0 ? "\nALL CHECKS PASSED" : `\n${failures} CHECK(S) FAILED`);
  process.exit(failures === 0 ? 0 : 1);
}

main();
