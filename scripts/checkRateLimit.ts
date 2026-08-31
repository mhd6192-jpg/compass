// PIN rate limiting, against the real database.
//
// Two failure modes, pulling in opposite directions. Too loose and a four-digit
// coach PIN is guessable in an afternoon. Too tight and a whole club — which
// shares one public address — gets locked out of scoring because somebody
// mistyped twice. Most of what follows is about the second one, because that is
// the failure that happens on a Tuesday night rather than in a threat model.
//
// RESTART `npm run dev:db` BEFORE EACH RUN.
const DEV_DB = "postgresql://postgres:postgres@127.0.0.1:5433/postgres?connection_limit=1";
process.env.POSTGRES_PRISMA_URL = DEV_DB;
process.env.POSTGRES_URL_NON_POOLING = DEV_DB;
process.env.DATABASE_URL = DEV_DB;

export {};

let failures = 0;
function check(name: string, cond: boolean, extra = "") {
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${extra ? ` — ${extra}` : ""}`);
  if (!cond) failures++;
}

/** A request that looks like it came from a given address. */
function reqFrom(ip: string): Request {
  return new Request("http://localhost/api/whatever", { headers: { "x-forwarded-for": ip } });
}

async function main() {
  const { checkPin, RATE_LIMIT } = await import("../src/lib/rateLimit");
  const { prisma } = await import("../src/lib/db");

  await prisma.pinAttempt.deleteMany({});
  await prisma.appSettings.deleteMany({});
  await prisma.tournamentConfig.deleteMany({});
  await prisma.tournamentConfig.create({ data: { id: "default", pin: "1234", status: "active" } });
  await prisma.appSettings.create({ data: { id: "default", organiserPin: "9876543210" } });

  const club = reqFrom("203.0.113.7");

  // --- the ordinary case ------------------------------------------------------
  check("the right coach PIN is accepted", (await checkPin(club, "coach", "1234")).ok);
  check("a wrong one is refused", !(await checkPin(club, "coach", "0000")).ok);
  const wrong = await checkPin(club, "coach", "0000");
  check("...with 401, not a lockout", !wrong.ok && wrong.status === 401, JSON.stringify(wrong));

  // --- a coach who fumbles, then gets it right --------------------------------
  // This is the common case and it must cost nothing: the outbox retrying queued
  // points with a stale PIN could otherwise bank failures that bite later.
  await prisma.pinAttempt.deleteMany({}); // start this one from a clean slate
  for (let i = 0; i < RATE_LIMIT.MAX_FAILS - 1; i++) await checkPin(club, "coach", "nope");
  check("nine wrong tries still leave the door open", (await checkPin(club, "coach", "1234")).ok);
  check("...and a correct PIN wipes the record", (await prisma.pinAttempt.count({ where: { key: "203.0.113.7:coach" } })) === 0);
  const afterClear = await checkPin(club, "coach", "nope");
  check("...so the next wrong try starts from scratch", !afterClear.ok && afterClear.status === 401);

  // --- a determined guesser ---------------------------------------------------
  await prisma.pinAttempt.deleteMany({});
  let locked: Awaited<ReturnType<typeof checkPin>> | null = null;
  for (let i = 0; i < RATE_LIMIT.MAX_FAILS + 2; i++) {
    const r = await checkPin(club, "coach", `guess-${i}`);
    if (!r.ok && r.status === 429) { locked = r; break; }
  }
  check("enough wrong PINs lock the caller out", !!locked, locked ? "" : "never locked");
  check("...with 429 and a wait in seconds", !!locked && !locked.ok && typeof locked.retryAfter === "number" && locked.retryAfter > 0, JSON.stringify(locked));
  check("...and a message that says what to do", !!locked && !locked.ok && /try again in \d+ second/i.test(locked.error), locked && !locked.ok ? locked.error : "");

  // The lock must refuse the RIGHT PIN too. Checking the PIN first and the lock
  // second would record failures while still letting every guess be tested,
  // which is no limit at all.
  const whileLocked = await checkPin(club, "coach", "1234");
  check("a locked caller cannot test even the correct PIN", !whileLocked.ok && whileLocked.status === 429, JSON.stringify(whileLocked));

  // --- one club's mistake must not spread -------------------------------------
  const elsewhere = reqFrom("198.51.100.4");
  check("another address is unaffected", (await checkPin(elsewhere, "coach", "1234")).ok);

  // --- and a coach must not be able to lock the organiser out -----------------
  check("the organiser is unaffected by coach failures", (await checkPin(club, "organiser", "9876543210")).ok);
  for (let i = 0; i < RATE_LIMIT.MAX_FAILS + 2; i++) await checkPin(club, "organiser", "wrong");
  const orgLocked = await checkPin(club, "organiser", "9876543210");
  check("the organiser can be locked out separately", !orgLocked.ok && orgLocked.status === 429);
  await prisma.pinAttempt.deleteMany({ where: { key: "203.0.113.7:coach" } });
  check("...while coach scoring still works", (await checkPin(club, "coach", "1234")).ok);

  // --- the lock lifts, and escalates ------------------------------------------
  await prisma.pinAttempt.deleteMany({});
  const key = "203.0.113.7:coach";
  // Pretend a lock was set and has just expired, with one lock already served.
  await prisma.pinAttempt.create({
    data: { key, fails: 0, windowStart: new Date(), lockedUntil: new Date(Date.now() - 1000), lockCount: 1 },
  });
  check("an expired lock lets the caller back in", (await checkPin(club, "coach", "1234")).ok);

  await prisma.pinAttempt.create({
    data: { key, fails: 0, windowStart: new Date(), lockedUntil: new Date(Date.now() - 1000), lockCount: 1 },
  });
  let second: Awaited<ReturnType<typeof checkPin>> | null = null;
  for (let i = 0; i < RATE_LIMIT.MAX_FAILS + 2; i++) {
    const r = await checkPin(club, "coach", `x-${i}`);
    if (!r.ok && r.status === 429) { second = r; break; }
  }
  const firstLockSecs = Math.ceil(RATE_LIMIT.BASE_LOCK_MS / 1000);
  check(
    "a second lock lasts longer than the first",
    !!second && !second.ok && (second.retryAfter ?? 0) > firstLockSecs,
    `${second && !second.ok ? second.retryAfter : "?"}s vs ${firstLockSecs}s`
  );
  check("...and the escalation is capped", RATE_LIMIT.lockFor(99) === RATE_LIMIT.MAX_LOCK_MS);

  // --- the numbers themselves --------------------------------------------------
  // A four-digit PIN is 10,000 combinations. At MAX_FAILS per lock, with locks
  // doubling, an attacker gets nowhere near it in a night.
  const perHourEarly = (RATE_LIMIT.MAX_FAILS * 3600_000) / RATE_LIMIT.BASE_LOCK_MS;
  check("the cheapest sustained rate is well under a four-digit space", perHourEarly < 1000, `${perHourEarly}/hour at best`);

  await prisma.pinAttempt.deleteMany({});
  await prisma.appSettings.deleteMany({});
  await prisma.tournamentConfig.deleteMany({});
  await prisma.$disconnect();
  console.log(failures ? `\n${failures} CHECK(S) FAILED` : "\nALL CHECKS PASSED");
  process.exitCode = failures ? 1 : 0;
}

main().catch((e) => {
  console.error("ERR", e instanceof Error ? e.message : e);
  process.exitCode = 1;
});
