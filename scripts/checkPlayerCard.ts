// Whose score is whose, on the card a player opens off the QR code.
//
// There is one trap in this codebase and it caught the player card twice.
// `match.player1` is a SIDE for drawing purposes — in an americano its `name`
// is "Ana & Ben" — but its `id` is only the FIRST member's. Comparing a person
// against it silently answers "no" for everybody listed second, which is a
// quarter of the people on court, every round.
//
// It went unnoticed because it is invisible from the outside: the card renders,
// the names are right, the layout is fine. Only the number is wrong, and only
// for one of the four, and the page is read-only so nobody can correct it.

export {};

let failures = 0;
function check(name: string, cond: boolean, extra = "") {
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${extra ? ` — ${extra}` : ""}`);
  if (!cond) failures++;
}

const p = (id: string, name: string) => ({ id, name, seed: 0 });

/** An americano match: two pairs, drawn as sides, scored as people. */
function americanoMatch(opts: { winnerId?: string | null } = {}) {
  return {
    id: "m1",
    bracket: "AM",
    round: 1,
    roundName: "Round 1",
    posIndex: 0,
    // `player1` is the SIDE: its name is the pairing, its id is Ana's.
    player1: p("ana", "Ana & Ben"),
    player2: p("cara", "Cara & Dan"),
    player1Members: [p("ana", "Ana"), p("ben", "Ben")],
    player2Members: [p("cara", "Cara"), p("dan", "Dan")],
    winnerId: opts.winnerId ?? null,
    loserId: null,
    status: opts.winnerId ? "completed" : "in_progress",
    courtId: 2,
    courtSlot: "current",
    isBracketFinal: false,
    isChampionshipFinal: false,
    forcedEnd: false,
    forcedEndReason: null,
    calledAt: null,
    startedAt: null,
    completedAt: null,
    state: { totalPoints: 11, setsWon: [0, 0], completedSets: [], currentSet: null, currentGame: null, isMatchTiebreakSet: false },
  } as never;
}

async function main() {
  const { sideOf } = await import("../src/lib/v3/player");

  const m = americanoMatch();

  // --- which side each of the four is on ---------------------------------------
  check("the first player of side 1 is on side 1", sideOf(m, "ana") === 1);
  check("...and so is the second, which is the whole point", sideOf(m, "ben") === 1, `got ${sideOf(m, "ben")}`);
  check("the first player of side 2 is on side 2", sideOf(m, "cara") === 2);
  check("...and so is the second", sideOf(m, "dan") === 2, `got ${sideOf(m, "dan")}`);
  check("somebody not in the match is on neither", sideOf(m, "eve") === null);

  // The bug in one line: this is what the card used to do.
  const theOldWay = (id: string) => (m as unknown as { player1: { id: string } }).player1.id === id;
  check("the old test was right for Ana", theOldWay("ana") === true);
  check("...and wrong for Ben, who is on the same side", theOldWay("ben") === false, "this is the bug it replaces");

  // --- the live score is attributed to the right pair ----------------------------
  // score.a is side 1, score.b is side 2, whatever the format.
  const score = { a: "8", b: "3" };
  const mineFor = (id: string) => (sideOf(m, id) === 1 ? score.a : score.b);
  check("Ana sees her pair's score", mineFor("ana") === "8");
  check("Ben sees the same score as his partner", mineFor("ben") === "8", `got ${mineFor("ben")}`);
  check("Cara sees hers", mineFor("cara") === "3");
  check("Dan sees the same as his partner", mineFor("dan") === "3", `got ${mineFor("dan")}`);
  check("partners never disagree about the score", mineFor("ana") === mineFor("ben") && mineFor("cara") === mineFor("dan"));
  check("opponents never see the same number as each other", mineFor("ana") !== mineFor("cara"));

  // --- won or lost, on the results list -------------------------------------------
  // `winnerId` names the winning SIDE, which is that side's first member.
  const won = americanoMatch({ winnerId: "ana" });
  const wonFor = (id: string) => {
    const side = sideOf(won, id);
    const w = (won as unknown as { winnerId: string; player1: { id: string } });
    return w.winnerId !== null && side !== null && side === (w.winnerId === w.player1.id ? 1 : 2);
  };
  check("the winning side's first player won", wonFor("ana") === true);
  check("...and so did their partner", wonFor("ben") === true, "a W, not an L, on a match they won");
  check("the losing side's first player lost", wonFor("cara") === false);
  check("...and so did their partner", wonFor("dan") === false);
  check("both winners agree, both losers agree", wonFor("ana") === wonFor("ben") && wonFor("cara") === wonFor("dan"));

  // Side 2 winning is the mirror case, and must not be decided by id ordering.
  const won2 = americanoMatch({ winnerId: "cara" });
  const wonFor2 = (id: string) => {
    const side = sideOf(won2, id);
    const w = (won2 as unknown as { winnerId: string; player1: { id: string } });
    return w.winnerId !== null && side !== null && side === (w.winnerId === w.player1.id ? 1 : 2);
  };
  check("when side 2 wins, both of them won", wonFor2("cara") === true && wonFor2("dan") === true);
  check("...and both of side 1 lost", wonFor2("ana") === false && wonFor2("ben") === false);

  // --- singles, where a side really is one person ------------------------------------
  const singles = {
    ...(americanoMatch() as unknown as Record<string, unknown>),
    player1: p("ana", "Ana"),
    player2: p("cara", "Cara"),
    player1Members: null,
    player2Members: null,
  } as never;
  check("singles still resolves without a member list", sideOf(singles, "ana") === 1 && sideOf(singles, "cara") === 2);
  check("...and a stranger is still on neither side", sideOf(singles, "ben") === null);

  console.log(failures ? `\n${failures} CHECK(S) FAILED` : "\nALL CHECKS PASSED");
  process.exitCode = failures ? 1 : 0;
}

main().catch((e) => {
  console.error("ERR", e instanceof Error ? e.message : e);
  process.exitCode = 1;
});
