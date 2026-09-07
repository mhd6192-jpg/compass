// The scoring pad must never be switched off by the network.
//
// This one is a source check rather than a behaviour check, and deliberately so.
// The bug was not in any function — it was one prop, `disabled={busy}`, wiring
// the tap buttons to the same flag as the administrative ones. A coach who
// scored the first point before pressing Go Live triggered a court call that
// retries for about thirty-seven seconds on dead wifi, and the pad went dead for
// all of it, under a message reading "keep scoring, it will catch up".
//
// The point queue exists precisely so that a tap survives no signal: it is a
// fact that already happened, written to localStorage and sent later. Anything
// that stops a coach recording it defeats the whole mechanism, so the shape of
// the component is worth asserting rather than trusting to review.

export {};

import { readFileSync } from "node:fs";

let failures = 0;
function check(name: string, cond: boolean, extra = "") {
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${extra ? ` — ${extra}` : ""}`);
  if (!cond) failures++;
}

const COACH = "src/app/v3/coach/[courtId]/page.tsx";
const RETRY = "src/lib/v3/retry.ts";

function main() {
  const coach = readFileSync(COACH, "utf8");
  const retry = readFileSync(RETRY, "utf8");

  // --- how long the thing that used to block it can actually take -------------
  const attempts = Number(/const ATTEMPTS = (\d+)/.exec(retry)?.[1] ?? 0);
  const delay = Number(/const DELAY_MS = (\d+)/.exec(retry)?.[1] ?? 0);
  const timeout = Number(/const REQUEST_TIMEOUT_MS = ([\d_]+)/.exec(retry)?.[1]?.replace(/_/g, "") ?? 0);
  const worstMs = attempts * timeout + (attempts - 1) * delay;
  check("the command retry budget is readable", attempts > 0 && delay > 0 && timeout > 0, `${attempts}x${timeout}ms +${delay}ms`);
  check(
    "a command can hold for tens of seconds on dead wifi",
    worstMs > 20_000,
    `${Math.round(worstMs / 1000)}s — which is why nothing may gate scoring on it`
  );

  // --- the pad itself ----------------------------------------------------------
  const scorePadUse = /<ScorePad\b[^/]*\/>/.exec(coach)?.[0] ?? "";
  check("the scoring pad is rendered", scorePadUse.length > 0, scorePadUse);
  check(
    "...and is not handed a disabled prop",
    !/\bdisabled=/.test(scorePadUse),
    scorePadUse
  );
  check(
    "...least of all the busy flag the network sets",
    !/disabled=\{\s*busy\s*\}/.test(scorePadUse),
    "this exact wiring is the bug"
  );

  const tapSide = coach.slice(coach.indexOf("function TapSide"), coach.indexOf("function ScorePad"));
  check("the tap buttons take no disabled prop", !/^\s*disabled: boolean;/m.test(tapSide));
  check("...and never render one", !/\n\s*disabled=\{/.test(tapSide), "a disabled <button> cannot be tapped at all");

  // `busy` must still guard the administrative actions — swapping a match,
  // retiring one, editing a score. Those are commands, and firing one twice is
  // a real hazard. Only scoring is exempt.
  check("busy still exists for the administrative buttons", /disabled=\{busy/.test(coach), "it guards commands, not points");

  // --- and the queue that makes all this safe ---------------------------------
  check("a tap still goes through the offline queue", /enqueue\(/.test(coach) || /scoreNow\(/.test(coach));

  console.log(failures ? `\n${failures} CHECK(S) FAILED` : "\nALL CHECKS PASSED");
  process.exitCode = failures ? 1 : 0;
}

main();
