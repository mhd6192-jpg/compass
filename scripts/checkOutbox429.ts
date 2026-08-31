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

  const { enqueue, pendingFor, drain, clearMatch } = await import("../src/lib/v3/outbox");

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

  console.log(failures ? `\n${failures} CHECK(S) FAILED` : "\nALL CHECKS PASSED");
  process.exitCode = failures ? 1 : 0;
}

main().catch((e) => {
  console.error("ERR", e instanceof Error ? e.message : e);
  process.exitCode = 1;
});
