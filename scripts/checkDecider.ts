// Verifies the tie-breaking play-off: when it gets created, who plays it, and how
// it reorders the table. Runs against an in-memory stand-in for the Prisma
// transaction client, so no database is needed.
// Run: npx tsx scripts/checkDecider.ts
import type { Prisma } from "@prisma/client";
import { ensureDecider, removeUnplayedDecider } from "../src/lib/bracket/decider";
import { buildMatchDTO } from "../src/lib/bracket/dto";
import { computeStandings } from "../src/lib/standings";
import type { ScoringConfig } from "../src/lib/scoring/engine";

let failures = 0;
function check(name: string, cond: boolean, extra = "") {
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${extra ? ` — ${extra}` : ""}`);
  if (!cond) failures++;
}

const CONFIG: ScoringConfig = { bestOfSets: 1, tiebreakMode: "race-to-16" };

/** Point sequence for a race-to-16 win by `winner` with the loser on `lo`. */
function race16(winner: 1 | 2, lo: number) {
  const l: 1 | 2 = winner === 1 ? 2 : 1;
  const s: { slot: number }[] = [];
  for (let i = 0; i < lo; i++) {
    s.push({ slot: winner }, { slot: l });
  }
  for (let i = 0; i < 16 - lo; i++) s.push({ slot: winner });
  return s;
}

type Row = Parameters<typeof buildMatchDTO>[0];

function player(id: string) {
  return { id, name: id, seed: 0, createdAt: new Date() };
}

let seq = 0;
/** A completed group match: `w` beat `l`, loser scored `lo`. */
function group(w: string, l: string, lo: number): Row {
  seq++;
  return {
    id: `g${seq}`,
    bracket: "RR",
    round: 1,
    posIndex: seq,
    player1Id: w,
    player2Id: l,
    player1: player(w),
    player2: player(l),
    winnerId: w,
    loserId: l,
    status: "completed",
    readyAt: new Date(),
    courtId: null,
    courtSlot: null,
    feedWinnerMatchId: null,
    feedWinnerSlot: null,
    feedLoserMatchId: null,
    feedLoserSlot: null,
    isBracketFinal: false,
    forcedEnd: false,
    forcedEndReason: null,
    startedAt: new Date(),
    completedAt: new Date(),
    createdAt: new Date(),
    points: race16(1, lo),
  } as unknown as Row;
}

/** Fake Prisma transaction client over an array of match rows. */
function fakeTx(rows: Row[], format = "round-robin") {
  const store = [...rows];
  const points = new Map<string, number>();
  const tx = {
    _rows: store,
    tournamentConfig: { findUnique: async () => ({ format }) },
    match: {
      findMany: async () => store,
      findFirst: async ({ where }: { where: { bracket: string; round: { gt: number } } }) =>
        store.find((m) => (m as never as { bracket: string }).bracket === where.bracket && (m as never as { round: number }).round > where.round.gt) ?? null,
      create: async ({ data }: { data: Record<string, unknown> }) => {
        seq++;
        const row = {
          ...data,
          id: `d${seq}`,
          player1: player(data.player1Id as string),
          player2: player(data.player2Id as string),
          winnerId: null,
          loserId: null,
          posIndex: 0,
          courtId: null,
          courtSlot: null,
          forcedEnd: false,
          forcedEndReason: null,
          startedAt: null,
          completedAt: null,
          points: [],
        } as unknown as Row;
        store.push(row);
        return row;
      },
      delete: async ({ where }: { where: { id: string } }) => {
        const i = store.findIndex((m) => (m as never as { id: string }).id === where.id);
        store.splice(i, 1);
        return {};
      },
    },
    pointEvent: { count: async ({ where }: { where: { matchId: string } }) => points.get(where.matchId) ?? 0 },
    _setPoints: (id: string, n: number) => points.set(id, n),
  };
  return tx as unknown as Prisma.TransactionClient & typeof tx;
}

function deciderOf(tx: ReturnType<typeof fakeTx>) {
  return tx._rows.find((m) => (m as never as { round: number }).round > 1) as never as
    | { id: string; player1Id: string; player2Id: string; status: string; isBracketFinal: boolean }
    | undefined;
}

async function main() {
  // --- two-way tie at the top --------------------------------------------------
  // A 2-1, B 2-1, C 1-2, D 1-2
  const twoWay = [group("A", "B", 5), group("A", "C", 5), group("D", "A", 5), group("B", "C", 5), group("B", "D", 5), group("C", "D", 5)];
  {
    const table = computeStandings(twoWay.map((r) => buildMatchDTO(r, CONFIG)));
    check("setup: A and B tie on 2 wins", table[0].won === 2 && table[1].won === 2, table.map((r) => `${r.name}:${r.won}`).join(" "));

    const tx = fakeTx(twoWay);
    const id = await ensureDecider(tx, CONFIG);
    const d = deciderOf(tx);
    check("two-way tie creates a play-off", !!id && !!d);
    check("play-off is between the two tied teams", !!d && [d.player1Id, d.player2Id].sort().join("") === "AB", d ? `${d.player1Id} v ${d.player2Id}` : "none");
    check("play-off is ready to be put on a court", d?.status === "ready");
    check("play-off is flagged as a final", d?.isBracketFinal === true);

    const again = await ensureDecider(tx, CONFIG);
    check("creating twice is a no-op", again === null && tx._rows.filter((m) => (m as never as { round: number }).round > 1).length === 1);
  }

  // --- outright winner ---------------------------------------------------------
  {
    const clear = [group("A", "B", 5), group("A", "C", 5), group("A", "D", 5), group("B", "C", 5), group("B", "D", 5), group("C", "D", 5)];
    const tx = fakeTx(clear);
    check("outright winner creates no play-off", (await ensureDecider(tx, CONFIG)) === null);
  }

  // --- group still running -----------------------------------------------------
  {
    const partial = twoWay.slice(0, 4).map((r) => ({ ...r }));
    const unfinished = { ...partial[3], status: "in_progress", winnerId: null, loserId: null } as unknown as Row;
    const tx = fakeTx([...partial.slice(0, 3), unfinished]);
    check("unfinished group creates no play-off", (await ensureDecider(tx, CONFIG)) === null);
  }

  // --- compass format ----------------------------------------------------------
  {
    const tx = fakeTx(twoWay, "compass");
    check("compass draw is untouched", (await ensureDecider(tx, CONFIG)) === null);
  }

  // --- three-way tie: top two on points scored play it -------------------------
  {
    // A, B, C all 2-1 (circular), D 0-3. Losing scores set so A(42) > C(40) > B(34).
    const threeWay = [
      group("A", "B", 2), // B scores 2
      group("B", "C", 8), // C scores 8
      group("C", "A", 10), // A scores 10
      group("A", "D", 0),
      group("B", "D", 0),
      group("C", "D", 0),
    ];
    const table = computeStandings(threeWay.map((r) => buildMatchDTO(r, CONFIG)));
    check(
      "setup: A, B, C all on 2 wins, ranked by points",
      table.slice(0, 3).every((r) => r.won === 2) && table[0].name === "A" && table[1].name === "C",
      table.map((r) => `${r.name}:${r.won}w/${r.pointsFor}p`).join(" ")
    );
    const tx = fakeTx(threeWay);
    await ensureDecider(tx, CONFIG);
    const d = deciderOf(tx);
    check("three-way tie: the top two on points play the final", !!d && [d.player1Id, d.player2Id].sort().join("") === "AC", d ? `${d.player1Id} v ${d.player2Id}` : "none");
  }

  // --- the play-off result reorders the table ----------------------------------
  {
    const playoff = {
      ...group("B", "A", 14), // B wins the decider
      id: "pf",
      round: 2,
      isBracketFinal: true,
    } as unknown as Row;
    const dtos = [...twoWay, playoff].map((r) => buildMatchDTO(r, CONFIG));
    const table = computeStandings(dtos);
    check("play-off winner takes first", table[0].name === "B", table.map((r) => r.name).join(","));
    check("play-off loser takes second", table[1].name === "A", table.map((r) => r.name).join(","));
    check("play-off is left out of the group record", table[0].won === 2 && table[0].played === 3, JSON.stringify(table[0]));
    check("runner-up keeps their group record too", table[1].won === 2 && table[1].lost === 1, JSON.stringify(table[1]));
    check("third and fourth are unchanged", table[2].won === 1 && table[3].won === 1);

    const unplayed = { ...playoff, status: "ready", winnerId: null, loserId: null, points: [] } as unknown as Row;
    const pending = computeStandings([...twoWay, unplayed].map((r) => buildMatchDTO(r, CONFIG)));
    check("an unplayed play-off does not reorder anything", pending[0].name === "A" && pending[1].name === "B", pending.map((r) => r.name).join(","));
  }

  // --- undo removes an unplayed play-off ---------------------------------------
  {
    const tx = fakeTx(twoWay);
    await ensureDecider(tx, CONFIG);
    const removed = await removeUnplayedDecider(tx);
    check("undo deletes the unplayed play-off", removed.length === 1 && !deciderOf(tx));

    const tx2 = fakeTx(twoWay);
    const id2 = await ensureDecider(tx2, CONFIG);
    tx2._setPoints(id2!, 3);
    let threw = "";
    try {
      await removeUnplayedDecider(tx2);
    } catch (e) {
      threw = (e as Error).message;
    }
    check("undo refuses once the play-off has started", threw.includes("deciding final has already started"), threw);
    check("the started play-off is still there", !!deciderOf(tx2));
  }
}

main().then(() => {
  console.log(failures === 0 ? "\nALL CHECKS PASSED" : `\n${failures} CHECK(S) FAILED`);
  process.exit(failures === 0 ? 0 : 1);
});
