// Room at the bottom of a screen for the band that says it has stopped updating.
//
// `FreshnessNotice` pins a red band across the bottom of every v2 and v3 screen
// once a screen has been silent for 45 seconds. It is `pointer-events-none` by
// design, so a coach's tap is never swallowed — but that makes anything left
// underneath it both invisible AND still tappable. Measured on a 390x844 phone:
// the band covered 762-844 while the coach console's Undo / Edit score / Retire
// row sat 770-816, entirely beneath it, on a page that is `h-[100svh]
// overflow-hidden` and therefore cannot be scrolled to bring the row back. A
// coach reaching for the warning pressed whichever of the three was under their
// thumb, and the band was drawn over the result.
//
// The reason it went unnoticed is the part worth pinning down. Three screens
// had already been given `pb-28 safe-bottom` to clear the band — and it did
// nothing. `.safe-bottom` sets `padding-bottom` OUTRIGHT, so it wins over
// Tailwind's `pb-28` and every one of them computed to 0px on a phone. The two
// classes cannot share an element.
//
// So the clearance is one class carrying both the room and the inset, and this
// checks that nothing goes back to combining the two.

export {};

import { readFileSync } from "node:fs";

let failures = 0;
function check(name: string, cond: boolean, extra = "") {
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${extra ? ` — ${extra}` : ""}`);
  if (!cond) failures++;
}

const css = readFileSync("src/app/globals.css", "utf8");

check("there is a clearance class", /\.clear-band\s*\{/.test(css));
const at = css.search(/\.clear-band\s*\{/);
const rule = at >= 0 ? css.slice(at, css.indexOf("}", at) + 1) : "";
check("...it reserves real room", /padding-bottom:\s*calc\(/.test(rule), rule.split("\n")[1] ?? "");
check("...and carries the safe-area inset itself, so no second class can cancel it", /safe-area-inset-bottom/.test(rule));
check("the band is still the thing being cleared", /pointer-events-none[\s\S]{0,120}fixed[\s\S]{0,40}bottom-0/.test(readFileSync("src/components/shared/FreshnessNotice.tsx", "utf8")));

// --- the combination that silently does nothing -------------------------------

const SCREENS = [
  "src/app/v3/page.tsx",
  "src/app/v3/control/page.tsx",
  "src/app/v3/player/page.tsx",
  "src/app/v3/coach/[courtId]/page.tsx",
  "src/app/v2/page.tsx",
  "src/app/v2/control/page.tsx",
  "src/app/v2/player/page.tsx",
  "src/app/v2/coach/[courtId]/page.tsx",
];

for (const file of SCREENS) {
  const src = readFileSync(file, "utf8");
  // Every className string that mentions safe-bottom must not also set pb-*.
  const clashes = [...src.matchAll(/className=(?:"([^"]*)"|\{`([^`]*)`\})/g)]
    .map((m) => m[1] ?? m[2] ?? "")
    .filter((c) => /\bsafe-bottom\b/.test(c) && /\bpb-\S/.test(c));
  check(`${file} never pairs safe-bottom with a pb-`, clashes.length === 0, clashes.join(" | "));
}

// --- every screen that pins something to its bottom clears the band ----------
// Listed rather than inferred: what counts as "pinned to the bottom" is a
// judgement about the layout, and a check that guesses it would be argued with
// rather than fixed.

const MUST_CLEAR: Array<[string, string]> = [
  ["src/app/v3/page.tsx", "the v3 hub"],
  ["src/app/v3/control/page.tsx", "the control room's board and ceremony links"],
  ["src/app/v3/player/page.tsx", "the phone card's footer"],
  ["src/app/v3/coach/[courtId]/page.tsx", "the scoring pad's Undo / Edit score / Retire row"],
  ["src/app/v2/page.tsx", "the v2 hub"],
  ["src/app/v2/control/page.tsx", "v2's control room"],
  ["src/app/v2/player/page.tsx", "v2's phone card"],
  ["src/app/v2/coach/[courtId]/page.tsx", "v2's coach console"],
];

for (const [file, what] of MUST_CLEAR) {
  check(`${what} clears the band`, /clear-band/.test(readFileSync(file, "utf8")));
}

// --- and the scoring pad only pays for it while the band is up ---------------
// The pad spent a whole commit earning its height back on a 667px phone. A
// permanent 112px reserved against a warning that is almost never on screen
// would hand it straight over.

const coach = readFileSync("src/app/v3/coach/[courtId]/page.tsx", "utf8");
check("the scoring pad takes the clearance conditionally", /lost \? "clear-band" : ""/.test(coach));
check("...off the same signal the band itself uses", /freshnessOf\(/.test(coach) && /lastSyncAt/.test(coach));

// --- the top edge -------------------------------------------------------------
// An installed app has no browser chrome to hold the status bar off the page, so
// a `sticky top-0` header renders underneath it. `.safe-top` existed for exactly
// this and was applied to NOTHING — and pairing it with the `py-3` those headers
// already carried would have cancelled that padding, the same way
// `pb-28 safe-bottom` cancelled itself.

const atNotch = css.search(new RegExp("\\.clear-notch\\s*\\{"));
const notchRule = atNotch >= 0 ? css.slice(atNotch, css.indexOf("}", atNotch) + 1) : "";
check("there is a class for a header pinned to the top", atNotch >= 0);
check("...it reserves the header's own padding as well", /padding-top:\s*calc\(/.test(notchRule));
check("...and carries the inset itself", /safe-area-inset-top/.test(notchRule));

const PINNED = [
  "src/app/v3/coach/[courtId]/page.tsx",
  "src/app/v3/ceremony/page.tsx",
  "src/app/v2/coach/[courtId]/page.tsx",
  "src/app/v2/ceremony/page.tsx",
  "src/app/scorer/page.tsx",
  "src/app/standings/page.tsx",
  "src/app/bracket/page.tsx",
];

for (const file of PINNED) {
  const src = readFileSync(file, "utf8");
  const headers = [...src.matchAll(/className="([^"]*sticky top-0[^"]*)"/g)].map((m) => m[1]);
  check(`${file} pins a header`, headers.length > 0, `${headers.length}`);
  const bare = headers.filter((c) => !/clear-notch/.test(c));
  check("...and every one clears the notch", bare.length === 0, bare.join(" | "));
  const clash = headers.filter((c) => /safe-top/.test(c) && /p[ty]-\S/.test(c));
  check("...without pairing safe-top with a padding class", clash.length === 0, clash.join(" | "));
}

// --- and the one thing in a tap zone with no bound ---------------------------
// The zone has a fixed share of a phone; the entrant's name is the only thing in
// it that can grow. Measured at 320x568 with a 61-character americano pairing,
// the name pushed the SCORE 20px past the zone's own border and over the zone
// below it.

for (const file of ["src/app/v3/coach/[courtId]/page.tsx", "src/app/v2/coach/[courtId]/page.tsx"]) {
  const src = readFileSync(file, "utf8");
  check(`${file} bounds the name in its tap zone`, /line-clamp-2/.test(src));
}


console.log(failures ? `\n${failures} CHECK(S) FAILED` : "\nALL CHECKS PASSED");
process.exitCode = failures ? 1 : 0;
