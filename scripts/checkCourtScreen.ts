// Which match a court's screen is showing, and which one its console is scoring.
//
// `resolveCourtScreen` decides both: the court TV renders from it, and the coach
// console picks the match its tap zones write into from the same view. It used
// to resolve the live match purely from the court's stored `activeMatchId` and
// never check the match was still on that court.
//
// Moving a match — the control room's "Change", a stand-in swap, a rebalance —
// sends the displaced one somewhere else, or back to the queue, without touching
// the court's stage row. So a court whose TV had already gone live kept showing
// a match that had left it, and the console on that court kept SCORING it:
// points tapped on court 1 landing in a match being played on court 2.

export {};

import { resolveCourtScreen } from "../src/lib/v2/stage";
import type { MatchDTO } from "../src/lib/types";

let failures = 0;
function check(name: string, cond: boolean, extra = "") {
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${extra ? ` — ${extra}` : ""}`);
  if (!cond) failures++;
}

const p = (id: string, name: string) => ({ id, name, seed: 0 });

function match(id: string, courtId: number | null, status = "in_progress"): MatchDTO {
  return {
    id,
    bracket: "RR",
    round: 1,
    roundName: "Group Stage",
    posIndex: 0,
    player1: p("a", "Ana"),
    player2: p("b", "Ben"),
    player1Members: null,
    player2Members: null,
    winnerId: null,
    loserId: null,
    status,
    courtId,
    courtSlot: courtId === null ? null : "current",
    forcedEnd: false,
    forcedEndReason: null,
    comeback: null,
    longestPointMs: null,
    startedAt: null,
    completedAt: null,
    readyAt: null,
    calledAt: null,
    isChampionshipFinal: false,
    state: {
      config: { bestOfSets: 1, tiebreakMode: "race-to-16" as never, raceTarget: 16 },
      setsWon: [0, 0],
      completedSets: [],
      currentSet: { games: [0, 0] as [number, number] },
      currentGame: { points: [3, 1] as [number, number], display: ["3", "1"], isTiebreak: true },
      isMatchTiebreakSet: false,
      matchWinnerSlot: null,
      totalPoints: 4,
    },
  } as unknown as MatchDTO;
}

const idleCeremony = { stage: "idle", places: [3, 2, 1], cursor: -1, awards: [], soundOn: false, announced: false } as never;
const liveStage = (activeMatchId: string) => ({ courtId: 1, stage: "live", activeMatchId } as never);

// --- the match is where the stage says it is ---------------------------------

const onCourt = resolveCourtScreen({
  courtId: 1,
  stage: liveStage("m1"),
  matches: [match("m1", 1)],
  allPlayed: false,
  ceremony: idleCeremony,
});
check("a live match on this court is shown live", onCourt.screen === "live" && onCourt.match?.id === "m1", onCourt.screen);

// --- the match has been moved to another court -------------------------------

const moved = resolveCourtScreen({
  courtId: 1,
  stage: liveStage("m1"),
  matches: [match("m1", 2)],
  allPlayed: false,
  ceremony: idleCeremony,
});
check("a match moved to another court is no longer this court's", moved.screen !== "live", moved.screen);
check("...and this court is not scoring it", moved.match === null, String(moved.match?.id));

// --- the match has been pushed back into the queue ---------------------------

const queued = resolveCourtScreen({
  courtId: 1,
  stage: liveStage("m1"),
  matches: [match("m1", null, "ready")],
  allPlayed: false,
  ceremony: idleCeremony,
});
check("a match sent back to the queue is not shown live either", queued.screen !== "live", queued.screen);

// --- a stage pointing at a match that no longer exists -----------------------

const gone = resolveCourtScreen({
  courtId: 1,
  stage: liveStage("deleted"),
  matches: [match("m1", 1)],
  allPlayed: false,
  ceremony: idleCeremony,
});
check("a stage pointing at nothing falls back rather than throwing", gone.screen !== "live", gone.screen);

// --- a finished match still belongs to its court, for its celebration --------
// `completeMatch` clears the court SLOT but leaves the court, which is what lets
// the winner screen hold until the coach taps Finish.

const won = match("m1", 1, "completed");
(won as unknown as { winnerId: string }).winnerId = "a";
const winner = resolveCourtScreen({
  courtId: 1,
  stage: liveStage("m1"),
  matches: [won],
  allPlayed: false,
  ceremony: idleCeremony,
});
check("a match just won on this court still gets its winner screen", winner.screen === "winner", winner.screen);

console.log(failures ? `\n${failures} CHECK(S) FAILED` : "\nALL CHECKS PASSED");
process.exitCode = failures ? 1 : 0;
