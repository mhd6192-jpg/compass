// The v2 copies of the modules that keep drifting.
//
// v2 is still linked from the front door, so a coach or a player can open it —
// and three of its library modules are copies of v3's that had quietly fallen
// behind. Each copy carried a defect v3 had already had fixed:
//
//  - `outbox.ts`: a transient server fault deleted a coach's queued points, a
//    refused PIN was re-posted every 2.5 seconds until the venue was locked out,
//    and a tap made while the queue was draining was discarded as a replay.
//  - `player.ts`: people were resolved through SIDE ids, so in an americano only
//    the first member of each pair could be found on the phone card at all, and
//    results were attributed to the pairing rather than the person.
//  - `swap.ts`: the same side-id mistake, plus rounds that had not been let out
//    yet were offered as substitutes.
//
// None of that was a decision. They are copies, and a copy that is edited on one
// side only is a defect waiting for somebody to open the other one. So the two
// are now kept identical, and this fails the moment they are not — which is far
// easier to act on than finding the same bug twice, months apart.
//
// The ONLY difference allowed is the "v2"/"v3" token itself, which is real: it
// namespaces the localStorage key the queue persists into, and the two versions
// must not share a queue.

export {};

import { readFileSync } from "node:fs";

let failures = 0;
function check(name: string, cond: boolean, extra = "") {
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${extra ? ` — ${extra}` : ""}`);
  if (!cond) failures++;
}

/** The file with its own version token blanked, so the two can be compared. */
function neutral(path: string, version: "v2" | "v3"): string {
  return readFileSync(path, "utf8").split(version).join("vX").replace(/\r\n/g, "\n");
}

const SHARED = ["outbox", "player", "swap"];

for (const mod of SHARED) {
  const a = neutral(`src/lib/v3/${mod}.ts`, "v3");
  const b = neutral(`src/lib/v2/${mod}.ts`, "v2");
  if (a === b) {
    check(`${mod}.ts is the same on v2 and v3`, true);
    continue;
  }
  // Say WHERE, so the failure is actionable rather than just true.
  const al = a.split("\n");
  const bl = b.split("\n");
  let i = 0;
  while (i < al.length && i < bl.length && al[i] === bl[i]) i++;
  check(`${mod}.ts is the same on v2 and v3`, false, `first difference at line ${i + 1}: v3 "${(al[i] ?? "(end)").trim().slice(0, 60)}" vs v2 "${(bl[i] ?? "(end)").trim().slice(0, 60)}"`);
}

// The queues must still be told apart, or v2 and v3 would drain each other's
// points into the wrong endpoints.
const k3 = /const KEY = "([^"]+)"/.exec(readFileSync("src/lib/v3/outbox.ts", "utf8"))?.[1];
const k2 = /const KEY = "([^"]+)"/.exec(readFileSync("src/lib/v2/outbox.ts", "utf8"))?.[1];
check("the two queues keep separate storage", !!k2 && !!k3 && k2 !== k3, `${k2} vs ${k3}`);

// --- and the screen-level fixes that were made on v3 first --------------------
// These are not copies of one file, so they are listed by the shape that was
// wrong rather than compared wholesale.

const v2coach = readFileSync("src/app/v2/coach/[courtId]/page.tsx", "utf8");
check("v2's scoring pad takes a definite height", /scoring \? "h-\[100svh\] overflow-hidden"/.test(v2coach));
check("...sheds its captions on a short screen", /max-height:620px/.test(v2coach) && /max-height:560px/.test(v2coach));
check("...and drops the navigation while scoring", /!scoring && footerLinks/.test(v2coach));

// Comments stripped first: the file EXPLAINS the contradiction, and the
// explanation must not be what trips the check.
const v2control = readFileSync("src/app/v2/control/page.tsx", "utf8")
  .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
  .replace(/\/\*[\s\S]*?\*\//g, "");
check("v2's control room has no truncate/shrink-0 contradiction", !/truncate shrink-0/.test(v2control));

console.log(failures ? `\n${failures} CHECK(S) FAILED` : "\nALL CHECKS PASSED");
process.exitCode = failures ? 1 : 0;
