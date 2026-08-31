// When a screen admits it has stopped updating.
//
// The thing being protected is a person standing in front of a television,
// reading a score and believing it. So the checks are mostly about the two ways
// that goes wrong: crying wolf over a blink, which trains everyone to ignore
// the warning, and staying quiet while the screen is genuinely wrong, which is
// the failure that matters.

export {};

let failures = 0;
function check(name: string, cond: boolean, extra = "") {
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${extra ? ` — ${extra}` : ""}`);
  if (!cond) failures++;
}

async function main() {
  const { freshnessOf, agoLabel, STALE_AFTER_MS, LOST_AFTER_MS } = await import("../src/lib/staleness");

  const T = 1_700_000_000_000;
  const at = (msAgo: number) => freshnessOf(T - msAgo, T);

  // --- nothing to say, most of the time -------------------------------------
  check("a fresh poll says nothing", at(0).level === "live");
  check("nor does one from a second ago", at(1000).level === "live");
  check("nor a short hiccup", at(STALE_AFTER_MS - 1).level === "live", `${STALE_AFTER_MS - 1}ms`);

  // --- the two thresholds, exactly -------------------------------------------
  check("silence past the threshold is stale", at(STALE_AFTER_MS).level === "stale");
  check("...and stays stale up to the next one", at(LOST_AFTER_MS - 1).level === "stale");
  check("prolonged silence is lost", at(LOST_AFTER_MS).level === "lost");
  check("...and stays lost", at(10 * 60_000).level === "lost");

  // The gap between the two has to be wide enough to be a real distinction: a
  // blink and a broken screen must not be the same event with different words.
  check("a blink and a dead screen are far apart", LOST_AFTER_MS >= 4 * STALE_AFTER_MS, `${STALE_AFTER_MS} vs ${LOST_AFTER_MS}`);

  // A point is scored every twenty or thirty seconds. Warning later than that
  // would mean the screen is reliably wrong before it admits anything.
  check("the warning comes before a point is likely missed", STALE_AFTER_MS <= 20_000, `${STALE_AFTER_MS}ms`);
  // ...and not so early that ordinary jitter sets it off.
  check("...but not on ordinary jitter", STALE_AFTER_MS >= 5_000, `${STALE_AFTER_MS}ms`);

  // --- states that are not staleness -----------------------------------------
  // Before the first poll lands the gate is showing "Connecting…"; a second
  // warning stacked on top of it would be noise about a screen that has never
  // claimed to know anything.
  check("nothing received yet is not stale", freshnessOf(null, T).level === "live");
  // And nothing is stale during server rendering, when there is no clock.
  check("no clock yet is not stale", freshnessOf(T - 60_000, null).level === "live");

  // A device correcting its clock, or a laptop waking, can put `now` behind the
  // last poll. That must read as fresh, not as a negative age.
  const backwards = freshnessOf(T + 5_000, T);
  check("a clock that jumped backwards does not panic", backwards.level === "live" && backwards.agoMs === 0, JSON.stringify(backwards));

  // --- what it actually says ---------------------------------------------------
  check("the age is reported in the message", at(12_000).ago === "12 seconds ago", at(12_000).ago);
  check("a minute reads as a minute", agoLabel(60_000) === "1 minute ago", agoLabel(60_000));
  check("...singular, not '1 minutes'", !agoLabel(60_000).includes("minutes"));
  check("and it never says '60 seconds'", !agoLabel(59_800).includes("60 second"), agoLabel(59_800));
  check("minutes read as minutes", agoLabel(3 * 60_000) === "3 minutes ago", agoLabel(3 * 60_000));
  check("an hour reads as an hour", agoLabel(60 * 60_000) === "1 hour ago", agoLabel(60 * 60_000));
  check("hours read as hours", agoLabel(150 * 60_000) === "3 hours ago", agoLabel(150 * 60_000));

  // Rounding must never flatter the screen: 100 seconds is nearer two minutes
  // than one, and the sentence is a warning, so it rounds towards worse.
  check("rounding does not understate the age", agoLabel(100_000) === "2 minutes ago", agoLabel(100_000));

  // --- the age keeps climbing while it is broken -------------------------------
  const a = at(20_000).agoMs;
  const b = at(30_000).agoMs;
  check("the reported age grows with the silence", b > a, `${a} then ${b}`);

  console.log(failures ? `\n${failures} CHECK(S) FAILED` : "\nALL CHECKS PASSED");
  process.exitCode = failures ? 1 : 0;
}

main().catch((e) => {
  console.error("ERR", e instanceof Error ? e.message : e);
  process.exitCode = 1;
});
