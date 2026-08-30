// The king-of-the-court ladder, checked as pure logic: promotion and relegation,
// the boundaries that hold, court populations staying at four, and partners
// always being drawn from opposite ends of the ladder.
// Run: npx tsx scripts/checkKingCourt.ts
import {
  courtCount,
  courtLevelName,
  isValidKingCourtField,
  nextLadder,
  nextRoundOccupants,
  openingLadder,
  pairOccupants,
  type CourtResult,
} from "../src/lib/bracket/kingCourt";

let failures = 0;
function check(name: string, cond: boolean, extra = "") {
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${extra ? ` — ${extra}` : ""}`);
  if (!cond) failures++;
}

// --- field validation --------------------------------------------------------
check("8 players is a valid field", isValidKingCourtField(8));
check("16 players is a valid field", isValidKingCourtField(16));
check("4 players is refused (a ladder needs something to climb)", !isValidKingCourtField(4));
check("10 players is refused (does not divide into fours)", !isValidKingCourtField(10));
check("courtCount(16) is 4 rungs", courtCount(16) === 4);
check("level 0 is the king court", courtLevelName(0) === "King court", courtLevelName(0));
check("level 1 is court 2", courtLevelName(1) === "Court 2", courtLevelName(1));

// --- the opening ladder ------------------------------------------------------
const ids = ["p1", "p2", "p3", "p4", "p5", "p6", "p7", "p8", "p9", "p10", "p11", "p12"];
const opening = openingLadder(ids.length);
check("opening ladder has one match per rung", opening.length === 3, `${opening.length}`);
check(
  "the first four start on the king court, strongest with weakest",
  JSON.stringify(opening[0]) === JSON.stringify({ level: 0, team1: [0, 3], team2: [1, 2] }),
  JSON.stringify(opening[0])
);
check(
  "the next four start on court 2",
  JSON.stringify(opening[1].team1) === JSON.stringify([4, 7]),
  JSON.stringify(opening[1])
);

// --- movement ----------------------------------------------------------------
// Three courts. On each, the first-named pair wins.
const results: CourtResult[] = [
  { winners: ["A1", "A2"], losers: ["A3", "A4"] }, // king court
  { winners: ["B1", "B2"], losers: ["B3", "B4"] },
  { winners: ["C1", "C2"], losers: ["C3", "C4"] }, // bottom court
];
const next = nextRoundOccupants(results);

check("every court still holds four players", next.every((c) => c.length === 4), next.map((c) => c.length).join(","));
check("nobody is on two courts at once", new Set(next.flat()).size === 12);
check("the whole field is still on the ladder", next.flat().length === 12);

check("king court: winners stay and are joined by the promoted pair", new Set(next[0]).size === 4 && ["A1", "A2", "B1", "B2"].every((p) => next[0].includes(p)), JSON.stringify(next[0]));
check("middle court: relegated from above meet promoted from below", ["A3", "A4", "C1", "C2"].every((p) => next[1].includes(p)), JSON.stringify(next[1]));
check("bottom court: losers stay and are joined by the relegated pair", ["B3", "B4", "C3", "C4"].every((p) => next[2].includes(p)), JSON.stringify(next[2]));

// --- pairing across the boundary --------------------------------------------
const ladder = nextLadder(results);
for (const rung of ladder) {
  const fromAbove = new Set(next[rung.level].slice(0, 2));
  const mixed = [rung.team1, rung.team2].every((t) => (fromAbove.has(t[0]) ? 1 : 0) + (fromAbove.has(t[1]) ? 1 : 0) === 1);
  check(`${courtLevelName(rung.level)}: each team is one climber and one faller`, mixed, JSON.stringify(rung));
}
const kingTeams = [ladder[0].team1, ladder[0].team2].map((t) => t.join("+"));
check(
  "the pair that just won the king court is split up",
  !kingTeams.includes("A1+A2") && !kingTeams.includes("A2+A1"),
  kingTeams.join(" v ")
);

// --- a two-court ladder is all boundary --------------------------------------
const twoCourt: CourtResult[] = [
  { winners: ["K1", "K2"], losers: ["K3", "K4"] },
  { winners: ["L1", "L2"], losers: ["L3", "L4"] },
];
const twoNext = nextRoundOccupants(twoCourt);
check("two courts: king court keeps its winners, takes the promoted", JSON.stringify(twoNext[0].sort()) === JSON.stringify(["K1", "K2", "L1", "L2"].sort()), JSON.stringify(twoNext[0]));
check("two courts: bottom keeps its losers, takes the relegated", JSON.stringify(twoNext[1].sort()) === JSON.stringify(["K3", "K4", "L3", "L4"].sort()), JSON.stringify(twoNext[1]));

// --- a long run stays legal ---------------------------------------------------
// Play twenty rounds where the first-named team always wins, and confirm the
// ladder never loses, duplicates or strands a player.
let occupants = openingLadder(ids.length).map((r) => [...r.team1, ...r.team2].map((i) => ids[i]));
let broke = "";
for (let round = 0; round < 20; round++) {
  const rs: CourtResult[] = occupants.map((four) => {
    const { team1, team2 } = pairOccupants(four);
    return { winners: team1, losers: team2 };
  });
  occupants = nextRoundOccupants(rs);
  const flat = occupants.flat();
  if (flat.length !== ids.length) broke ||= `round ${round + 1}: ${flat.length} players`;
  if (new Set(flat).size !== ids.length) broke ||= `round ${round + 1}: duplicate or missing player`;
  if (occupants.some((c) => c.length !== 4)) broke ||= `round ${round + 1}: a court is not four`;
}
check("twenty rounds keep the ladder intact", broke === "", broke);

console.log(failures ? `\n${failures} CHECK(S) FAILED` : "\nALL CHECKS PASSED");
process.exit(failures ? 1 : 0);
