// What the point queue does when the server says "too many PIN attempts".
//
// Adding rate limiting introduced a way to lose data. The queue treats any
// rejection that is not a 401 as unrecoverable — out of sync, match already
// finished, and so on — and DELETES that match's saved points, because
// replaying them would write a wrong score. A 429 is not that. It is temporary,
// it says nothing about the points, and the coach's phone may be holding an
// evening of them.
//
// So this pins the distinction down: a lockout must leave every queued point
// exactly where it is, while a genuine rejection must still clear them.
//
// Runs in Node, so localStorage and fetch are stubbed. That is the point — the
// behaviour under test is the queue's, not the browser's.

export {};

let failures = 0;
function check(name: string, cond: boolean, extra = "") {
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${extra ? ` — ${extra}` : ""}`);
  if (!cond) failures++;
}

/** Just enough localStorage for the queue to persist into. */
class MemoryStorage {
  private data = new Map<string, string>();
  getItem(k: string) {
    return this.data.get(k) ?? null;
  }
  setItem(k: string, v: string) {
    this.data.set(k, v);
  }
  removeItem(k: string) {
    this.data.delete(k);
  }
  clear() {
    this.data.clear();
  }
  key(i: number) {
    return [...this.data.keys()][i] ?? null;
  }
  get length() {
    return this.data.size;
  }
}

type Reply = { status: number; body: unknown };

async function main() {
  const g = globalThis as unknown as {
    localStorage?: MemoryStorage;
    window?: unknown;
    fetch: typeof fetch;
    addEventListener?: () => void;
  };
  g.localStorage = new MemoryStorage();
  g.window = g;
  g.addEventListener = () => {};

  const { clearAll, enqueue, pendingFor, drain, clearMatch, forgetConfirmed } = await import("../src/lib/v3/outbox");

  let reply: Reply = { status: 200, body: { ok: true } };
  const calls: string[] = [];
  g.fetch = (async (url: string) => {
    calls.push(String(url));
    return {
      ok: reply.status >= 200 && reply.status < 300,
      status: reply.status,
      json: async () => reply.body,
    };
  }) as unknown as typeof fetch;

  const handlers = {
    pin: "1234",
    onUnauthorized: () => {},
    onDesync: () => {},
    onAccepted: () => {},
  };

  // --- a lockout must not cost a single point --------------------------------
  clearMatch("m1");
  for (let i = 0; i < 5; i++) enqueue("m1", 1, i);
  check("five points are queued", pendingFor("m1") === 5, `${pendingFor("m1")}`);

  reply = { status: 429, body: { error: "Too many incorrect PINs. Try again in 60 seconds." } };
  await drain(handlers);
  check("a 429 leaves every queued point alone", pendingFor("m1") === 5, `${pendingFor("m1")} left`);

  // ...and they go when the lock lifts.
  reply = { status: 200, body: { ok: true } };
  await drain(handlers);
  check("they send once the lock lifts", pendingFor("m1") === 0, `${pendingFor("m1")} left`);

  // --- a real rejection still clears, as it must -----------------------------
  // This is the behaviour the 429 branch must not break: replaying a point the
  // server refuses on its merits would either fail forever or write a wrong score.
  let desynced = "";
  clearMatch("m2");
  for (let i = 0; i < 3; i++) enqueue("m2", 1, i);
  reply = { status: 400, body: { error: "Out of step: this device recorded 9 points, the match has 4." } };
  await drain({ ...handlers, onDesync: (id: string) => { desynced = id; } });
  check("a genuine rejection still clears that match", pendingFor("m2") === 0, `${pendingFor("m2")} left`);
  check("...and reports the desync so the UI can resync", desynced === "m2", desynced || "(none)");

  // --- a 401 is its own case, and also keeps the points ----------------------
  let unauthorised = false;
  clearMatch("m3");
  for (let i = 0; i < 2; i++) enqueue("m3", 2, i);
  reply = { status: 401, body: { error: "Invalid PIN" } };
  await drain({ ...handlers, onUnauthorized: () => { unauthorised = true; } });
  check("a wrong PIN keeps the points too", pendingFor("m3") === 2, `${pendingFor("m3")} left`);
  check("...and asks the coach to fix the PIN", unauthorised);

  // The 401 above is still outstanding against that PIN, which is the whole
  // point of it — so the queue is reset before the next section rather than
  // every later drain being blocked by it.
  clearAll();

  // --- a fault the server SUFFERED is not a refusal it made ------------------
  // The point route wraps its whole body in one catch. A database blip, a
  // transaction timeout or a platform 502 used to come back as the same 400 as
  // "out of step", and the queue deleted the coach's backlog over it. Faults
  // are 5xx now and the points keep.
  clearMatch("m4");
  for (let i = 0; i < 4; i++) enqueue("m4", 1, i);
  for (const status of [500, 502, 503, 504]) {
    reply = { status, body: { error: "Server error" } };
    await drain(handlers);
    check(`a ${status} keeps every queued point`, pendingFor("m4") === 4, `${pendingFor("m4")} left`);
  }
  reply = { status: 200, body: { ok: true } };
  await drain(handlers);
  check("...and they send once the server recovers", pendingFor("m4") === 0, `${pendingFor("m4")} left`);

  // A refusal the server MEANT still clears, and now says so with a 409.
  clearMatch("m5");
  enqueue("m5", 1, 0);
  reply = { status: 409, body: { error: "Match already completed", refused: true } };
  await drain(handlers);
  check("a refusal on the merits still clears that match", pendingFor("m5") === 0, `${pendingFor("m5")} left`);

  // --- a refused PIN costs one attempt, not one every 2.5 seconds ------------
  // Failures are counted per address and a whole club sits behind one, so a
  // phone re-posting a rejected PIN twice a second locks every coach out.
  clearMatch("m6");
  for (let i = 0; i < 2; i++) enqueue("m6", 1, i);
  reply = { status: 401, body: { error: "Invalid PIN" } };
  calls.length = 0;
  const bad = { ...handlers, pin: "0000" };
  for (let i = 0; i < 10; i++) await drain(bad);
  check("ten retries with a refused PIN post it once", calls.length === 1, `${calls.length} requests`);
  check("...and the points are still there", pendingFor("m6") === 2, `${pendingFor("m6")} left`);

  reply = { status: 200, body: { ok: true } };
  calls.length = 0;
  await drain({ ...handlers, pin: "1234" });
  check("a different PIN is tried immediately", calls.length === 2, `${calls.length} requests`);
  check("...and the points go", pendingFor("m6") === 0, `${pendingFor("m6")} left`);

  // --- the sequence a tap claims --------------------------------------------
  // An entry leaves the queue the moment the server accepts it, but the polled
  // snapshot only catches up a round trip later. A tap made in that window used
  // to be numbered off the stale snapshot, be read as a replay of a point the
  // server already had, and be deleted as "recorded". The point never existed.
  clearMatch("m7");
  reply = { status: 200, body: { ok: true } };
  const first = enqueue("m7", 1, 0);
  check("the first tap claims sequence 1", first.expectedSeq === 1, `${first.expectedSeq}`);
  await drain(handlers);
  // The snapshot still says zero points: the poll has not come back yet.
  const second = enqueue("m7", 1, 0);
  check("a tap sent before the snapshot catches up claims 2, not 1", second.expectedSeq === 2, `${second.expectedSeq}`);
  await drain(handlers);
  const third = enqueue("m7", 1, 0);
  check("...and the one after that claims 3", third.expectedSeq === 3, `${third.expectedSeq}`);
  await drain(handlers);

  // Queued taps still stack on top of each other while offline.
  const a = enqueue("m7", 1, 3);
  const b = enqueue("m7", 2, 3);
  check("two taps queued together claim consecutive sequences", a.expectedSeq === 4 && b.expectedSeq === 5, `${a.expectedSeq}, ${b.expectedSeq}`);
  await drain(handlers);

  // An undo lowers the server's count, and the queue has to come down with it —
  // otherwise every later tap claims a sequence the match no longer has and is
  // refused as out of step. The undo says so explicitly, because from in here a
  // stale snapshot and a removed point look exactly the same.
  forgetConfirmed("m7");
  const afterUndo = enqueue("m7", 1, 2);
  check("after an undo the next tap follows the server, not the watermark", afterUndo.expectedSeq === 3, `${afterUndo.expectedSeq}`);

  console.log(failures ? `\n${failures} CHECK(S) FAILED` : "\nALL CHECKS PASSED");
  process.exitCode = failures ? 1 : 0;
}

main().catch((e) => {
  console.error("ERR", e instanceof Error ? e.message : e);
  process.exitCode = 1;
});
