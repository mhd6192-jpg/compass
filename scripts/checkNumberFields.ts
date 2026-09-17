// The number boxes on the setup form, and the one in the score editor.
//
// Three separate bugs, all in fields that look too simple to get wrong, and
// none of them visible to a type-checker:
//
//   The setup form's "Custom" boxes were bound to the CLAMPED model value
//   rather than to what was being typed. Typing 18 into the race target gave
//   "1", clamped instantly to 4, and the box then read "4" with nowhere to go.
//   Typing a number that happened to be a preset blanked the box mid-word. The
//   box could not be cleared at all.
//
//   The compass seed boxes turned every unparseable keystroke into seed 1 — a
//   letter, a space, a pasted name, or a deliberate 0 meaning "not seeded" —
//   which is the single most consequential value on the form.
//
//   The score editor capped every row at the set length, which is right for a
//   set and wrong for the 10-point decider that shares the same column: a 10-8
//   could not be entered, and an already-recorded one was snapped to 7-8 by the
//   first tap of either arrow.
//
// Each rule is now a pure function, and this is what holds them.
//
//   npx tsx scripts/checkNumberFields.ts
export {};

import {
  boxText,
  commitOnBlur,
  commitWhileTyping,
  parseSeedInput,
  sanitizeNumericText,
} from "../src/lib/numericInput";
import { rowCeiling } from "../src/lib/scoring/synth";
import type { ScoringConfig } from "../src/lib/scoring/engine";

let failures = 0;
function check(name: string, cond: boolean, extra = "") {
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${extra ? ` — ${extra}` : ""}`);
  if (!cond) failures++;
}

// =============================================================================
// Typing a number into the Custom box
// =============================================================================
const RACE = { min: 4, max: 99, presets: [9, 11, 16, 18, 21] };

// The exact keystrokes the organiser reported: 1, then 8.
check("typing '1' toward 18 commits nothing yet", commitWhileTyping("1", RACE.min, RACE.max) === null);
check("...and the box still shows what was typed", boxText("1", 16, RACE.presets) === "1");
check("...then '18' commits", commitWhileTyping("18", RACE.min, RACE.max) === 18);

// The other two failures of the old control.
check("typing a preset value commits it", commitWhileTyping("21", RACE.min, RACE.max) === 21);
check("...without blanking the box", boxText("21", 21, RACE.presets) === "21", boxText("21", 21, RACE.presets));
check("an empty box commits nothing", commitWhileTyping("", RACE.min, RACE.max) === null);
check("...and stays empty while being edited", boxText("", 18, RACE.presets) === "");
check("letters commit nothing", commitWhileTyping("abc", RACE.min, RACE.max) === null);
check("a value over the maximum is not committed while typing", commitWhileTyping("150", RACE.min, RACE.max) === null);
check("a value under the minimum is not committed while typing", commitWhileTyping("2", RACE.min, RACE.max) === null);

// =============================================================================
// Leaving the box
// =============================================================================
check("blur clamps above the maximum", commitOnBlur("150", RACE.min, RACE.max) === 99);
check("blur clamps below the minimum", commitOnBlur("2", RACE.min, RACE.max) === 4);
check("blur commits a legal value unchanged", commitOnBlur("18", RACE.min, RACE.max) === 18);
check("blur on an empty box keeps the committed value", commitOnBlur("", RACE.min, RACE.max) === null);
check("blur on letters keeps the committed value", commitOnBlur("abc", RACE.min, RACE.max) === null);

// =============================================================================
// What the box shows when nobody is editing it
// =============================================================================
check("a preset value leaves the box empty — the chip says it", boxText(null, 16, RACE.presets) === "");
// 14 is deliberately NOT one of the presets; 18 is, which is the whole point of
// the distinction.
check("a custom value is shown in the box", boxText(null, 14, RACE.presets) === "14", boxText(null, 14, RACE.presets));
check("a draft always wins over the committed value", boxText("7", 14, RACE.presets) === "7");

// =============================================================================
// What may be typed at all
// =============================================================================
check("letters are stripped", sanitizeNumericText("1a8") === "18");
check("a pasted name becomes nothing", sanitizeNumericText("Ahmed") === "");
check("signs and points are stripped", sanitizeNumericText("-3.5") === "35");
check("length is capped so a slip is not enormous", sanitizeNumericText("123456") === "123");
check("spaces are stripped", sanitizeNumericText(" 9 ") === "9");

// =============================================================================
// Every field the form uses, at its own bounds
// =============================================================================
const FIELDS = [
  { what: "race target", min: 4, max: 99 },
  { what: "serve change", min: 1, max: 10 },
  { what: "rounds", min: 1, max: 20 },
  { what: "games in a set", min: 2, max: 9 },
];
for (const f of FIELDS) {
  const below = commitOnBlur(String(f.min - 1), f.min, f.max);
  const above = commitOnBlur(String(f.max + 1), f.min, f.max);
  check(`${f.what}: blur never lands outside ${f.min}-${f.max}`, below === f.min && above === f.max, `${below}/${above}`);
  check(`${f.what}: the bounds themselves are legal`, commitWhileTyping(String(f.min), f.min, f.max) === f.min && commitWhileTyping(String(f.max), f.min, f.max) === f.max);
}

// =============================================================================
// The compass seed boxes
// =============================================================================
check("a real seed is taken", parseSeedInput("7") === 7);
check("an empty box means unseeded", parseSeedInput("") === "");
check("0 means unseeded, not seed 1", parseSeedInput("0") === "", String(parseSeedInput("0")));
check("a letter leaves the box alone", parseSeedInput("x") === null, String(parseSeedInput("x")));
check("a pasted name leaves the box alone", parseSeedInput("Ahmed") === null, String(parseSeedInput("Ahmed")));
check("a space means unseeded, not seed 1", parseSeedInput(" ") === "", String(parseSeedInput(" ")));
check("a negative means unseeded, not seed 1", parseSeedInput("-3") === "", String(parseSeedInput("-3")));
check("above the draw size is clamped to it", parseSeedInput("99") === 16);
check("...and nothing ever silently becomes seed 1", ["x", "Ahmed", " ", "-3", "0", "", "abc"].every((v) => parseSeedInput(v) !== 1));

// =============================================================================
// The score editor's per-row ceiling
// =============================================================================
const cfg = (over: Partial<ScoringConfig> = {}): ScoringConfig => ({
  bestOfSets: 3,
  tiebreakMode: "standard",
  ...over,
});

check("a six-game set stops one past the set length", rowCeiling(cfg(), [], 6) === 7);
check("a four-game set stops at five", rowCeiling(cfg(), [], 4) === 5);
check("an advantage set runs on", rowCeiling(cfg({ tiebreakMode: "advantage" }), [], 6) === 18);

{
  // Best of 3 with a fast deciding set: rows 0 and 1 are sets, row 2 is a
  // 10-point breaker and must reach at least 10-8.
  const mt = cfg({ tiebreakMode: "match-tiebreak", bestOfSets: 3 });
  check("decider match: the first row is a set", rowCeiling(mt, [], 6) === 7);
  check("...the second row is a set", rowCeiling(mt, [{ a: 6, b: 4 }], 6) === 7);
  const third = rowCeiling(mt, [{ a: 6, b: 4 }, { a: 4, b: 6 }], 6);
  check("...and the third row reaches a 10-point breaker", third >= 12, String(third));
  check("...comfortably past 10-8", third > 10, String(third));

  // Only at one set all. A 2-0 lead means the match is over, not a decider.
  check(
    "a row after a 2-0 lead is not treated as the decider",
    rowCeiling(mt, [{ a: 6, b: 4 }, { a: 6, b: 4 }], 6) === 7,
    String(rowCeiling(mt, [{ a: 6, b: 4 }, { a: 6, b: 4 }], 6))
  );

  // A short-set match still ends on a ten-point breaker.
  const shortMt = cfg({ tiebreakMode: "match-tiebreak", bestOfSets: 3, gamesPerSet: 4 });
  check("short sets: the set rows stop at five", rowCeiling(shortMt, [], 4) === 5);
  check(
    "short sets: the decider still reaches ten",
    rowCeiling(shortMt, [{ a: 4, b: 2 }, { a: 2, b: 4 }], 4) >= 12,
    String(rowCeiling(shortMt, [{ a: 4, b: 2 }, { a: 2, b: 4 }], 4))
  );

  // Best of 5 and 7: the decider is at 2-2 and 3-3.
  const five = cfg({ tiebreakMode: "match-tiebreak", bestOfSets: 5 });
  const at22 = [{ a: 6, b: 4 }, { a: 4, b: 6 }, { a: 6, b: 4 }, { a: 4, b: 6 }];
  check("best of 5: the decider is the fifth row", rowCeiling(five, at22, 6) >= 12, String(rowCeiling(five, at22, 6)));
  check("best of 5: the fourth row is still a set", rowCeiling(five, at22.slice(0, 3), 6) === 7);
}

// Without the fast-deciding-set mode there is no decider anywhere.
check(
  "standard tiebreak: no row is ever a breaker row",
  [[], [{ a: 6, b: 4 }], [{ a: 6, b: 4 }, { a: 4, b: 6 }]].every((prior) => rowCeiling(cfg(), prior, 6) === 7)
);
check(
  "best of 1 has no decider to replace",
  rowCeiling(cfg({ tiebreakMode: "match-tiebreak", bestOfSets: 1 }), [], 6) === 7
);

console.log(failures ? `\n${failures} CHECK(S) FAILED` : "\nALL CHECKS PASSED");
process.exit(failures ? 1 : 0);
