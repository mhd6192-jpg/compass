// Calling for players who have wandered off.
//
// The single biggest waste of time at a social night is a court standing empty
// while somebody is looked for, and none of the screens said so: a court card
// showing 0-0 looks exactly like a match about to start.
//
// Two failure modes pull against each other. Shout during an ordinary
// changeover and the room learns to ignore the shouting; stay quiet and the
// court sits empty. Most of what follows is about that line.

export {};

let failures = 0;
function check(name: string, cond: boolean, extra = "") {
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${extra ? ` — ${extra}` : ""}`);
  if (!cond) failures++;
}

const NOW = 1_700_000_000_000;
const ago = (ms: number) => new Date(NOW - ms).toISOString();

type Person = { id: string; name: string; seed: number };
const p = (id: string, name: string): Person => ({ id, name, seed: 0 });

/** A match on a court, with however many points have been scored on it. */
function match(opts: {
  id: string;
  courtId: number | null;
  calledAt: string | null;
  points: number;
  status?: string;
  pairs?: boolean;
  completedAt?: string | null;
}) {
  const { id, courtId, calledAt, points, status = "scheduled", pairs = true } = opts;
  return {
    id,
    bracket: "AM",
    round: 1,
    roundName: "Round 1",
    posIndex: 0,
    player1: p("a", "Ana"),
    player2: p("c", "Cara"),
    player1Members: pairs ? [p("a", "Ana"), p("b", "Ben")] : null,
    player2Members: pairs ? [p("c", "Cara"), p("d", "Dan")] : null,
    winnerId: null,
    loserId: null,
    status,
    courtId,
    courtSlot: courtId === null ? null : "current",
    isBracketFinal: false,
    isChampionshipFinal: false,
    forcedEnd: false,
    forcedEndReason: null,
    calledAt,
    startedAt: null,
    completedAt: opts.completedAt ?? null,
    state: { totalPoints: points, setsWon: [0, 0], completedSets: [], currentSet: null, currentGame: null, isMatchTiebreakSet: false },
  } as never;
}

function venue(matches: unknown[], courts = [{ id: 2, label: "Court 2" }]) {
  return {
    courts,
    matches: matches as never[],
    progress: { completed: 0, total: 4 },
    v2: {
      courts: courts.map((c) => ({ courtId: c.id, stage: "idle", activeMatchId: null, coachName: null, rev: 0 })),
      ceremony: { stage: "idle", places: [], cursor: 0, awards: [], announced: false, rev: 0 },
    },
  } as never;
}

async function main() {
  const { buildVenueView, OVERDUE_MS, formatDuration } = await import("../src/lib/v3/venue");

  // --- an ordinary changeover says nothing -------------------------------------
  const fresh = buildVenueView(venue([match({ id: "m", courtId: 2, calledAt: ago(10_000), points: 0 })]), NOW);
  check("a court just called is not shouted about", fresh.callouts.length === 0, `${fresh.callouts.length}`);
  check("...it just reads as ready", fresh.courts[0].alert?.level === "info", JSON.stringify(fresh.courts[0].alert));

  const nearly = buildVenueView(venue([match({ id: "m", courtId: 2, calledAt: ago(OVERDUE_MS - 1000), points: 0 })]), NOW);
  check("nor one a minute and a half in", nearly.callouts.length === 0);

  // --- past the changeover, somebody has wandered off --------------------------
  const late = buildVenueView(venue([match({ id: "m", courtId: 2, calledAt: ago(3 * 60_000), points: 0 })]), NOW);
  check("a court waiting three minutes is called out", late.callouts.length === 1, `${late.callouts.length}`);
  const call = late.callouts[0];
  check("...naming the court", call.courtLabel === "Court 2" && call.courtId === 2, JSON.stringify(call));
  check("...and everyone due on it", call.names.join(",") === "Ana,Ben,Cara,Dan", call.names.join(","));
  check("...with how long it has been", call.waitingMs >= 3 * 60_000, `${call.waitingMs}`);
  check("the court's own note escalates to a warning", late.courts[0].alert?.level === "warn", JSON.stringify(late.courts[0].alert));
  check("...saying the players are not there", /not on court/.test(late.courts[0].alert?.text ?? ""), late.courts[0].alert?.text);
  check("...and how long it has been", /3m/.test(late.courts[0].alert?.text ?? ""), late.courts[0].alert?.text);
  check("...so the control room counts it as needing attention", late.alertCount === 1, `${late.alertCount}`);

  // --- the first point is the proof they arrived --------------------------------
  // Whatever the clock says: somebody scored, so they are there.
  const started = buildVenueView(venue([match({ id: "m", courtId: 2, calledAt: ago(20 * 60_000), points: 1 })]), NOW);
  check("one point ends the callout", started.callouts.length === 0, `${started.callouts.length}`);
  check("...and clears the warning with it", started.courts[0].alert === null, JSON.stringify(started.courts[0].alert));

  const done = buildVenueView(
    venue([match({ id: "m", courtId: 2, calledAt: ago(30 * 60_000), points: 32, status: "completed", completedAt: ago(1000) })]),
    NOW
  );
  check("a finished match is never called out", done.callouts.length === 0);

  // --- the states where there is nobody to call ---------------------------------
  const empty = buildVenueView(venue([]), NOW);
  check("an empty court calls nobody", empty.callouts.length === 0);
  const uncalled = buildVenueView(venue([match({ id: "m", courtId: 2, calledAt: null, points: 0 })]), NOW);
  check("a match never called is not overdue", uncalled.callouts.length === 0, "no calledAt means no clock to run");
  check("...and still reads as ready", uncalled.courts[0].alert?.level === "info", JSON.stringify(uncalled.courts[0].alert));

  // A draw seeded before this existed has no stamps at all, and must behave
  // exactly as it did — quiet, not permanently overdue.
  const legacy = buildVenueView(
    venue(
      [match({ id: "m2", courtId: 2, calledAt: null, points: 0 }), match({ id: "m3", courtId: 3, calledAt: null, points: 0 })],
      [{ id: 2, label: "Court 2" }, { id: 3, label: "Court 3" }]
    ),
    NOW
  );
  check("an older draw with no stamps is silent", legacy.callouts.length === 0 && legacy.alertCount === 0);

  // --- more than one court stuck --------------------------------------------------
  const two = buildVenueView(
    venue(
      [
        match({ id: "m2", courtId: 2, calledAt: ago(4 * 60_000), points: 0 }),
        match({ id: "m3", courtId: 3, calledAt: ago(9 * 60_000), points: 0 }),
      ],
      [{ id: 2, label: "Court 2" }, { id: 3, label: "Court 3" }]
    ),
    NOW
  );
  check("both stuck courts are called", two.callouts.length === 2, `${two.callouts.length}`);
  check("...worst first, since that is the one to read out", two.callouts[0].courtId === 3, `court ${two.callouts[0].courtId} leads`);

  // --- singles, where a side is one person -----------------------------------------
  const singles = buildVenueView(
    venue([match({ id: "m", courtId: 2, calledAt: ago(5 * 60_000), points: 0, pairs: false })]),
    NOW
  );
  check("a singles match calls the two players", singles.callouts[0]?.names.join(",") === "Ana,Cara", singles.callouts[0]?.names.join(","));

  // --- the threshold itself ----------------------------------------------------------
  // Long enough that finishing a point, shaking hands and walking over is not an
  // offence; short enough that it is caught before it costs a round.
  check("the grace period is a real changeover", OVERDUE_MS >= 60_000, `${OVERDUE_MS}ms`);
  check("...but not long enough to lose a round to", OVERDUE_MS <= 5 * 60_000, `${OVERDUE_MS}ms`);
  check("the wait reads in minutes on screen", formatDuration(3 * 60_000) === "3m", formatDuration(3 * 60_000));

  console.log(failures ? `\n${failures} CHECK(S) FAILED` : "\nALL CHECKS PASSED");
  process.exitCode = failures ? 1 : 0;
}

main().catch((e) => {
  console.error("ERR", e instanceof Error ? e.message : e);
  process.exitCode = 1;
});
