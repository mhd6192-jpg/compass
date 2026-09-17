// Courts an event can actually fill.
//
// A rotating format plays one round at a time and a round is floor(players / 4)
// matches, so ticking three courts for ten players leaves Court 3 empty from the
// first ball to the last. The engine is right to do that — there is nobody to
// put on it — but nothing said so, and a coach standing on Court 3 all evening
// could not tell a scheduling rule from a broken screen.
//
//   npx tsx scripts/checkCourtsInUse.ts
import { simultaneousMatches, surplusCourtNote, surplusCourts } from "../src/lib/bracket/courtLoad";
import { courtsUsedBy, FORMAT_IDS, formatSpec } from "../src/lib/bracket/formats";
import { generateAmericano, matchesPerRound } from "../src/lib/bracket/americano";
import { resolveCourtScreen, emptyCourtStage, IDLE_CEREMONY } from "../src/lib/v2/stage";
import type { MatchDTO } from "../src/lib/types";

let failures = 0;
function check(name: string, cond: boolean, extra = "") {
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${extra ? ` — ${extra}` : ""}`);
  if (!cond) failures++;
}

// --- the rule itself -------------------------------------------------------
check("all courts used when the field fills them", surplusCourts(3, [1, 2, 3]).length === 0);
check("the spare court is the highest-numbered one", surplusCourts(2, [1, 2, 3]).join() === "3");
check("court ids need not start at 1", surplusCourts(1, [2, 3]).join() === "3");
check("two spare courts are both named", surplusCourts(1, [1, 2, 3]).join() === "2,3");
check("court order does not matter", surplusCourts(1, [3, 2]).join() === "3");
check("an unbounded format spares nothing", surplusCourts(0, [1, 2, 3, 4]).length === 0);
check("more matches than courts spares nothing", surplusCourts(5, [2, 3]).length === 0);

// --- the sentence the organiser reads --------------------------------------
check("nothing to say when every court is used", surplusCourtNote(2, [2, 3], 8) === null);
const note = surplusCourtNote(2, [1, 2, 3], 10);
check("the note names the court", (note ?? "").includes("Court 3"), note ?? "");
check("the note gives the reason", (note ?? "").includes("10 players") && (note ?? "").includes("2 matches"), note ?? "");
const two = surplusCourtNote(1, [1, 2, 3], 6) ?? "";
check("two spare courts read as a list", two.includes("Court 2 and Court 3"), two);
check("a single match is not pluralised", two.includes("1 match at a time"), two);

// --- every format declares what it can fill --------------------------------
for (const id of FORMAT_IDS) {
  const spec = formatSpec(id);
  if (!spec.rotatingPartners) {
    check(`${id}: a fixed-entrant draw claims no limit`, courtsUsedBy(id, 16) === 0);
    continue;
  }
  check(`${id}: declares how many courts it fills`, spec.courtsUsed !== undefined);
}

// Declaring a number is not the same as declaring the RIGHT number: every one
// of these could be changed to something wrong and the check above would still
// pass, while the setup form told an organiser to untick a court that does get
// matches. So each is checked against the count the format actually produces.
// King of the court and winner court are stated separately below, because
// theirs are not a quarter of the field.
const QUARTER_OF_THE_FIELD = [
  "americano",
  "mexicano",
  "mixicano",
  "mixed-americano",
  "mixed-mexicano",
  "team-americano",
  "mixed-team-americano",
] as const;
for (const id of QUARTER_OF_THE_FIELD) {
  const wrong = [4, 8, 12, 16, 20, 24, 28, 32].filter((n) => courtsUsedBy(id, n) !== Math.floor(n / 4));
  check(`${id}: fills a court per four players`, wrong.length === 0, wrong.map((n) => `n=${n} says ${courtsUsedBy(id, n)}`).join(", "));
}
check("a winner court is one match however big the field", courtsUsedBy("winner-court", 24) === 1);
check("an americano is a quarter of the field", courtsUsedBy("americano", 10) === 2);
check("king of the court fills a court per rung", courtsUsedBy("king-court", 12) === 3);

// --- the registry and the draw must agree ----------------------------------
// The setup form asks from the player count; a court screen asks from the
// fixtures. They are different code paths to the same number, which is exactly
// how the two drift apart.
for (const n of [4, 6, 8, 9, 10, 11, 12, 13, 16, 20, 24, 31, 32]) {
  const drawn = generateAmericano(n, 6).matches.map((m) => ({ bracket: "AM", round: m.round }));
  check(
    `n=${n}: the draw fills as many courts as the registry promises`,
    simultaneousMatches(drawn) === courtsUsedBy("americano", n) && simultaneousMatches(drawn) === matchesPerRound(n),
    `${simultaneousMatches(drawn)} vs ${courtsUsedBy("americano", n)}`
  );
}

// --- a bracket draw is never called surplus --------------------------------
const bracketRows = [
  { bracket: "E", round: 1 },
  { bracket: "E", round: 1 },
  { bracket: "W", round: 1 },
];
check("a bracket draw claims no limit from its fixtures", simultaneousMatches(bracketRows) === 0);
check("no draw at all claims no limit", simultaneousMatches([]) === 0);

// --- the court screen says so ----------------------------------------------
const rows = generateAmericano(10, 4).matches.map(
  (m, i) => ({ id: `m${i}`, bracket: "AM", round: m.round, courtId: null, courtSlot: null, status: "pending" } as unknown as MatchDTO)
);
const view = (courtId: number, courtIds?: number[]) =>
  resolveCourtScreen({ courtId, stage: emptyCourtStage(courtId), matches: rows, allPlayed: false, ceremony: IDLE_CEREMONY, courtIds });

check("the spare court knows it is spare", view(3, [1, 2, 3]).unusedAllNight);
check("a working court does not", !view(1, [1, 2, 3]).unusedAllNight);
check("and nor does the last one that is used", !view(2, [1, 2, 3]).unusedAllNight);
check("two courts for ten players are both used", !view(2, [1, 2]).unusedAllNight);
check("without the court list nothing is called spare", !view(3).unusedAllNight);
check("the spare court still shows the idle screen", view(3, [1, 2, 3]).screen === "idle");

console.log(failures ? `\n${failures} CHECK(S) FAILED` : "\nALL CHECKS PASSED");
process.exit(failures ? 1 : 0);
